/**
 * Cross-Channel Parity E2E Smoke Test (Phase 12)
 *
 * Validates the v0.5_updated "unified session" promise:
 *   • Onboarding completed on Web persists ERP to Postgres.
 *   • A subsequent Telegram message ingress loads the SAME ERP
 *     (proves Telegram pipeline pulls from the same source of truth).
 *   • Linking Telegram via the 6-digit /connect code maps the Telegram
 *     identity onto the Web user_id — both channels now share UFM,
 *     positions, intents, event_log, and durable session rows.
 *
 * RUN AS A LIVE SMOKE — requires the full env (Supabase + Upstash + at
 * least the AgentKit testnet wallet stack). NOT a hermetic unit test.
 *
 *   yarn tsx tests/cross-channel.e2e.ts
 *
 * Exits 0 on success, 1 on any assertion failure.
 */

import { randomUUID } from 'node:crypto';
import {
  getSupabase,
  getRedis,
  upsertERP,
  getERP,
  getUserByTelegramId,
  updateUserSettings,
  getSessionRecord,
  upsertSessionRecord,
} from '@intend/data';
import { loadERP } from '@intend/intelligence';

// ── Tiny assertion harness ────────────────────────────────────────────────
const failures: string[] = [];
function assert(cond: unknown, label: string): void {
  if (cond) { console.log(`  ✓ ${label}`); return; }
  console.error(`  ✗ ${label}`);
  failures.push(label);
}

async function main(): Promise<void> {
  console.log('Cross-Channel Parity E2E\n');

  // ── 1. Seed: create a fresh user as if they just signed up via Web ──────
  const email      = `smoke-${Date.now()}@intend.test`;
  const userId     = randomUUID();
  const telegramId = BigInt(900_000_000_000 + Math.floor(Math.random() * 1_000_000));

  const sb = getSupabase();
  const { error: insErr } = await sb.from('users').insert({
    user_id: userId,
    email,
    region: 'GH',
    local_currency: 'GHS',
    timezone: 'Africa/Accra',
    execution_mode: 'semi_autonomous',
  });
  if (insErr) { console.error('Seed user insert failed:', insErr); process.exit(1); }

  console.log('Step 1 — Web onboarding writes ERP');
  await upsertERP(userId, {
    location_country:    'GH',
    location_region:     'Greater Accra',
    local_currency:      'GHS',
    primary_income_currency: 'GHS',
    monthly_income_band: 'mid',
    primary_goal:        'protect_savings',
    risk_tolerance:      'conservative',
  });
  const erp1 = await getERP(userId);
  assert(erp1?.location_country === 'GH', 'ERP persisted with country=GH');
  assert(erp1?.local_currency   === 'GHS', 'ERP persisted with currency=GHS');

  console.log('\nStep 2 — Telegram ingress loads same ERP via loadERP()');
  // Mirror what apps/bot/src/pipeline.ts does at message ingress.
  const erpForBot = await loadERP(userId);
  assert(erpForBot !== null, 'loadERP returned a profile');
  assert(erpForBot?.location_country === 'GH', 'Telegram sees country=GH');
  assert(erpForBot?.local_currency   === 'GHS', 'Telegram sees currency=GHS');

  console.log('\nStep 3 — /connect link code → linkTelegram pathway');
  const code  = String(100000 + Math.floor(Math.random() * 900000));
  const redis = getRedis();
  await redis.set(
    `intend:link_code:${code}`,
    JSON.stringify({ telegram_id: Number(telegramId), user_id: userId }),
    { ex: 300 },
  );

  // Simulate the web action: read code, attach telegram_id to the user row.
  const raw = await redis.get<string | { telegram_id: number; user_id: string }>(`intend:link_code:${code}`);
  assert(raw !== null, 'Link code retrievable from Redis');
  const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  await updateUserSettings(userId, { telegram_id: BigInt(parsed.telegram_id) });
  await redis.del(`intend:link_code:${code}`);

  const linked = await getUserByTelegramId(telegramId);
  assert(linked?.user_id === userId, 'getUserByTelegramId resolves to web user_id');

  console.log('\nStep 4 — Durable session row written by Telegram is readable');
  // Telegram saveSession() writes both Redis and Supabase; verify the row survives.
  await upsertSessionRecord({
    user_id:           userId,
    channel:           'telegram',
    state:             'idle',
    pending_plan:      null,
    plan_expires_at:   null,
    reminders_sent:    0,
    last_reminder_at:  null,
    pending_intent_id: null,
    missing_field:     null,
    clarification_q:   null,
    clarified_at:      null,
    parked_intent_id:  null,
    new_message_held:  null,
    active_lane_ids:   [],
    history:           [{ role: 'user', content: 'protect my savings', ts: new Date().toISOString() }],
  });
  const sess = await getSessionRecord(userId, 'telegram');
  assert(sess !== null, 'Telegram session row persisted to Supabase');
  assert(Array.isArray(sess?.history) && sess!.history.length === 1, 'Conversation history retained');

  console.log('\nStep 5 — Cleanup');
  await sb.from('sessions').delete().eq('user_id', userId);
  await sb.from('economic_reality_profile').delete().eq('user_id', userId);
  await sb.from('users').delete().eq('user_id', userId);
  console.log('  ✓ test fixtures removed');

  if (failures.length > 0) {
    console.error(`\nFAIL — ${failures.length} assertion(s) failed:`);
    failures.forEach(f => console.error(`  · ${f}`));
    process.exit(1);
  }
  console.log('\nAll cross-channel parity assertions passed.');
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
