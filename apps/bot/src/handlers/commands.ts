/**
 * Telegram command handlers
 * Commands: /start /balance /portfolio /history /help /settings /connect /cancel
 */

import type TelegramBot from 'node-telegram-bot-api';
import { getUserByTelegramId, getSupabase, logEvent, getActivePositions, getActiveGoals } from '@intend/data';
import { getOrCreateWallet, readBalances } from '@intend/execution';
import { getSession, saveSession } from '../session.js';
import { bold, formatBalances, formatUsd, formatApy } from '../formatter.js';
import { getRedis } from '@intend/data';

const NETWORK = (process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia') as 'base' | 'base-sepolia';

async function resolveUser(telegramId: number): Promise<string | null> {
  const user = await getUserByTelegramId(BigInt(telegramId));
  return user?.user_id ?? null;
}

// ── /start ────────────────────────────────────────────────────────────────
export async function handleStart(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const telegramId = msg.from!.id;
  const name = msg.from!.first_name ?? 'there';

  let userId: string;

  const existing = await getUserByTelegramId(BigInt(telegramId));
  if (existing) {
    userId = existing.user_id;
  } else {
    // Create user record
    const { data, error } = await getSupabase()
      .from('users')
      .insert({
        telegram_id: telegramId.toString(),
        display_name: name,
        region: 'US',
        local_currency: 'USD',
      })
      .select('user_id')
      .single();

    if (error || !data) {
      await bot.sendMessage(chatId, "Couldn't create your account. Please try again.");
      return;
    }
    userId = (data as { user_id: string }).user_id;

    await logEvent({
      user_id: userId, event_type: 'user_created', source: 'telegram',
      event_data: { telegram_id: telegramId, name },
    });
  }

  // Create wallet if needed
  try {
    const { info } = await getOrCreateWallet(userId, NETWORK);
    await logEvent({
      user_id: userId, event_type: 'wallet_created', source: 'telegram',
      event_data: { address: info.address, network: info.network },
    });
  } catch {
    // Wallet creation failure is non-fatal at /start — user can retry
  }

  const welcome = [
    `Welcome, ${bold(name)}. I'm Intend.`,
    '',
    'Tell me what you want to do with your money.',
    '',
    'Examples:',
    '· "Protect my savings from inflation"',
    '· "Send $200 to my sister"',
    '· "Put my idle USDC to work"',
    '',
    'I\'ll build a plan, show you the details, and wait for your confirmation.',
  ].join('\n');

  await bot.sendMessage(chatId, welcome, { parse_mode: 'Markdown' });
}

// ── /balance ──────────────────────────────────────────────────────────────
export async function handleBalance(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = await resolveUser(msg.from!.id);
  if (!userId) { await bot.sendMessage(chatId, 'Please /start first.'); return; }

  await bot.sendChatAction(chatId, 'typing');

  try {
    const { provider } = await getOrCreateWallet(userId, NETWORK);
    const balances = await readBalances(provider, NETWORK);
    await bot.sendMessage(chatId, `${bold('Your wallet')}\n\n${formatBalances(balances)}`, { parse_mode: 'Markdown' });
  } catch (err) {
    await bot.sendMessage(chatId, 'Could not fetch balances right now. Try again in a moment.');
  }
}

// ── /portfolio ────────────────────────────────────────────────────────────
export async function handlePortfolio(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = await resolveUser(msg.from!.id);
  if (!userId) { await bot.sendMessage(chatId, 'Please /start first.'); return; }

  await bot.sendChatAction(chatId, 'typing');

  const [positions, goals] = await Promise.all([
    getActivePositions(userId),
    getActiveGoals(userId),
  ]);

  const lines: string[] = [bold('Portfolio')];

  if (positions.length > 0) {
    lines.push('\n' + bold('Earning'));
    for (const p of positions) {
      lines.push(`· ${p.asset}: ${formatUsd(p.amount_current)} at ${formatApy(p.apy_at_entry ?? 0)} APY`);
    }
  }

  if (goals.length > 0) {
    lines.push('\n' + bold('Goals'));
    for (const g of goals) {
      const pct = g.target_amount > 0 ? Math.round((g.current_amount / g.target_amount) * 100) : 0;
      lines.push(`· ${g.goal_name}: ${formatUsd(g.current_amount)} / ${formatUsd(g.target_amount)} (${pct}%)`);
    }
  }

  if (positions.length === 0 && goals.length === 0) {
    lines.push('\nNothing deployed yet. Tell me what you want to do with your money.');
  }

  await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

// ── /help ─────────────────────────────────────────────────────────────────
export async function handleHelp(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const text = [
    bold('What Intend can do'),
    '',
    '· "Protect my savings from inflation"',
    '· "Swap my ETH for USDC"',
    '· "Send $200 to my brother"',
    '· "Pay for this with my wallet"',
    '',
    'Just tell me what you want your money to do. I\'ll figure out the rest.',
    '',
    bold('Execution mode'),
    '· Say "go autonomous" to execute without asking',
    '· Say "ask me first" to always confirm before anything moves',
    '',
    bold('Commands'),
    '/balance · /portfolio · /history · /settings · /connect · /cancel',
  ].join('\n');

  await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
}

// ── /history ──────────────────────────────────────────────────────────────
export async function handleHistory(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = await resolveUser(msg.from!.id);
  if (!userId) { await bot.sendMessage(chatId, 'Please /start first.'); return; }

  const { data } = await getSupabase()
    .from('intents')
    .select('primitive, raw_input, status, created_at, tx_hash')
    .eq('user_id', userId)
    .in('status', ['complete', 'failed', 'cancelled'])
    .order('created_at', { ascending: false })
    .limit(10);

  const intents = (data ?? []) as Array<{
    primitive: string; raw_input: string; status: string; created_at: string; tx_hash: string | null;
  }>;

  if (intents.length === 0) {
    await bot.sendMessage(chatId, 'No completed transactions yet.');
    return;
  }

  const lines = [bold('Recent activity'), ''];
  for (const i of intents) {
    const date = new Date(i.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const status = i.status === 'complete' ? '✓' : i.status === 'failed' ? '✗' : '–';
    lines.push(`${status} ${bold(i.primitive)} · ${i.raw_input.slice(0, 40)} · ${date}`);
  }

  await bot.sendMessage(chatId, lines.join('\n'), { parse_mode: 'Markdown' });
}

// ── /connect ──────────────────────────────────────────────────────────────
export async function handleConnect(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = await resolveUser(msg.from!.id);
  if (!userId) { await bot.sendMessage(chatId, 'Please /start first.'); return; }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  await getRedis().set(`intend:link_code:${code}`, JSON.stringify({ telegram_id: msg.from!.id, user_id: userId }), { ex: 300 });

  await bot.sendMessage(chatId,
    `Your link code: ${bold(code)}\n\nEnter this in the Intend web app settings to connect your account. Expires in 5 minutes.`,
    { parse_mode: 'Markdown' }
  );
}

// ── /cancel ───────────────────────────────────────────────────────────────
export async function handleCancel(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = await resolveUser(msg.from!.id);
  if (!userId) { await bot.sendMessage(chatId, 'Nothing to cancel.'); return; }

  const session = await getSession(BigInt(msg.from!.id), userId);

  if (session.state === 'idle') {
    await bot.sendMessage(chatId, 'Nothing is pending.');
    return;
  }

  const intentId = session.pending_plan?.plan_id;
  session.state = 'idle';
  session.pending_plan = null;
  session.parked_intent_id = null;
  session.new_message_held = null;
  await saveSession(BigInt(msg.from!.id), session);

  if (intentId) {
    await logEvent({
      user_id: userId, event_type: 'intent_cancelled', source: 'telegram',
      event_data: { reason: 'user_command' }, intent_id: intentId,
    });
  }

  await bot.sendMessage(chatId, 'Cancelled. What would you like to do?');
}

// ── /settings ─────────────────────────────────────────────────────────────
export async function handleSettings(bot: TelegramBot, msg: TelegramBot.Message): Promise<void> {
  const chatId = msg.chat.id;
  const userId = await resolveUser(msg.from!.id);
  if (!userId) { await bot.sendMessage(chatId, 'Please /start first.'); return; }

  const user = await getUserByTelegramId(BigInt(msg.from!.id));
  if (!user) { await bot.sendMessage(chatId, 'Please /start first.'); return; }

  const modeLabel = user.execution_mode === 'autonomous'
    ? 'Autonomous — executes immediately, receipt sent after'
    : 'Semi-autonomous — shows plan, waits for your confirmation';

  const text = [
    bold('Settings'),
    '',
    `Mode: ${modeLabel}`,
    `Spend limit: ${formatUsd(Number(user.max_auto_tx_usd))}`,
    `Region: ${user.region}`,
    `Currency: ${user.local_currency}`,
    '',
    'Say "go autonomous" or "ask me first" to switch mode.',
    'To change other settings, visit the Intend web app.',
  ].join('\n');

  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}
