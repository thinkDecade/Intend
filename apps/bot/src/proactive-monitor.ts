/**
 * Proactive PROTECT Monitor
 *
 * Runs every 6 hours alongside the confirmation reminder cron.
 * Implements the core PROTECT intelligence hypothesis:
 *   Intend knows the user's financial reality better than they do —
 *   it acts before the user knows they need protection.
 *
 * Logic:
 *   1. Load all active Telegram users
 *   2. Group by region (deduplicate signal fetches)
 *   3. For each region, compute hedge signal
 *   4. For each user in a high-risk region, check cooldown
 *   5. Fire proactive PROTECT alert if threshold exceeded and no recent alert
 *
 * PROTECT is always semi-autonomous (hardcoded invariant).
 * Alerts always show what Intend observed and why — trust through transparency.
 */

import TelegramBot from 'node-telegram-bot-api';
import {
  getAllActiveUsersWithTelegram,
  logEvent,
  getRedis,
  keys,
  TTL,
} from '@intend/data';
import { getHedgeSignal, getFxSignal } from '@intend/signals';
import type { UserRow } from '@intend/data';
import type { HedgeSignal } from '@intend/signals';

// ── Configuration ──────────────────────────────────────────────────────────

/** Hedge score threshold — above this, Intend proactively alerts. */
const PROTECT_THRESHOLD = 0.65;

// ── Alert message builder ─────────────────────────────────────────────────

interface AlertContext {
  region:         string;
  localCurrency:  string;
  fxChange30d:    number;     // negative = weakening
  inflationRate:  number;
  hedgeScore:     number;
}

/**
 * Build the proactive PROTECT alert message.
 *
 * Design rules (invariants):
 *   - Show exactly what Intend observed (FX change, inflation, score)
 *   - Outcome language — no protocol names, no chain names
 *   - Always propose a specific action with fee estimate
 *   - Show "Protect →" and "Not now" as inline keyboard buttons
 *   - If we don't know exact savings, express the risk in rate terms only
 */
function buildAlertMessage(ctx: AlertContext): string {
  const fxPct    = Math.abs(ctx.fxChange30d).toFixed(1);
  const infRate  = ctx.inflationRate.toFixed(1);
  const currency = ctx.localCurrency;

  // Risk framing: either FX-dominant or inflation-dominant
  const riskLine =
    ctx.fxChange30d < -5
      ? `The ${currency} has lost *${fxPct}%* against the dollar this month.`
      : `Inflation in your region is running at *${infRate}%* annually.`;

  const urgency =
    ctx.hedgeScore > 0.85
      ? 'Your savings are at significant risk right now.'
      : 'Your savings are exposed to purchasing-power loss.';

  return (
    `⚡ *intend noticed something.*\n\n` +
    `${riskLine} ${urgency}\n\n` +
    `Here's what I can do:\n\n` +
    `  *Action:* Move savings to a stable asset\n` +
    `  *Protection:* From ~${infRate}% annual purchasing-power loss\n` +
    `  *Estimated fee:* < $0.20\n\n` +
    `Tell me to *protect my savings* and I'll build the plan.`
  );
}

// ── Per-user alert logic ───────────────────────────────────────────────────

async function maybeAlertUser(
  bot:    TelegramBot,
  user:   UserRow,
  hedge:  HedgeSignal,
  ctx:    AlertContext,
): Promise<void> {
  if (!user.telegram_id) return;

  const redis      = getRedis();
  const cooldownKey = keys.protectAlertCooldown(user.user_id);

  // Check 24h cooldown — don't spam the user
  const inCooldown = await redis.get(cooldownKey);
  if (inCooldown) {
    console.log(`[protect-monitor] User ${user.user_id} in cooldown — skipping`);
    return;
  }

  const message = buildAlertMessage(ctx);

  try {
    await bot.sendMessage(
      user.telegram_id.toString(),
      message,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [[
            { text: 'Protect my savings →', callback_data: 'protect_alert:accept' },
            { text: 'Not now',              callback_data: 'protect_alert:dismiss' },
          ]],
        },
      },
    );

    // Set 24h cooldown
    await redis.set(cooldownKey, '1', { ex: TTL.PROTECT_ALERT_COOLDOWN });

    // Log event
    await logEvent({
      user_id:    user.user_id,
      event_type: 'protect_alert_triggered',
      source:     'system',
      event_data: {
        region:       ctx.region,
        hedge_score:  hedge.score,
        hedge_tier:   hedge.tier,
        fx_change_30d: ctx.fxChange30d,
        inflation_rate: ctx.inflationRate,
      },
    });

    console.log(
      `[protect-monitor] Alert sent → user ${user.user_id} ` +
      `(region ${ctx.region}, score ${hedge.score.toFixed(2)})`
    );
  } catch (err) {
    console.error(`[protect-monitor] Failed to alert user ${user.user_id}:`, err);
    // Non-fatal — continue to next user
  }
}

// ── Main scan loop ─────────────────────────────────────────────────────────

export async function runProtectMonitor(bot: TelegramBot): Promise<void> {
  console.log('[protect-monitor] Starting scan');

  // 1. Load all active Telegram users
  let users: UserRow[];
  try {
    users = await getAllActiveUsersWithTelegram();
  } catch (err) {
    console.error('[protect-monitor] Failed to load users:', err);
    return;
  }

  if (users.length === 0) {
    console.log('[protect-monitor] No active users — scan complete');
    return;
  }

  console.log(`[protect-monitor] Scanning ${users.length} user(s)`);

  // 2. Group users by region to deduplicate signal fetches
  const byRegion = new Map<string, UserRow[]>();
  for (const user of users) {
    const existing = byRegion.get(user.region) ?? [];
    existing.push(user);
    byRegion.set(user.region, existing);
  }

  // 3. For each region, fetch signals and alert if threshold exceeded
  for (const [region, regionUsers] of byRegion) {
    let hedge: HedgeSignal;
    let fxSignal: Awaited<ReturnType<typeof getFxSignal>>;

    try {
      [hedge, fxSignal] = await Promise.all([
        getHedgeSignal(region),
        getFxSignal(region),
      ]);
    } catch (err) {
      console.error(`[protect-monitor] Failed to get signals for ${region}:`, err);
      continue;
    }

    console.log(
      `[protect-monitor] Region ${region}: score=${hedge.score.toFixed(2)} tier=${hedge.tier}`
    );

    if (hedge.score < PROTECT_THRESHOLD) {
      console.log(`[protect-monitor] Region ${region} below threshold — skipping`);
      continue;
    }

    // 4. Alert each user in this region (with 24h cooldown per user)
    const ctx: AlertContext = {
      region,
      localCurrency:  fxSignal.local_currency,
      fxChange30d:    fxSignal.fx_change_30d,
      inflationRate:  fxSignal.inflation_rate,
      hedgeScore:     hedge.score,
    };

    for (const user of regionUsers) {
      await maybeAlertUser(bot, user, hedge, ctx);
    }
  }

  console.log('[protect-monitor] Scan complete');
}
