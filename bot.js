/**
 * INTEND TELEGRAM BOT v2.1
 * Primary user interface for the Intend agent.
 * Start: node ~/intend/bot.js
 */

const { Telegraf, Markup } = require('telegraf');
const { Pool }             = require('pg');
const fs                   = require('fs');
const path                 = require('path');
const executor             = require('./executor');

const cfg       = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));
const BOT_TOKEN = cfg.TELEGRAM_BOT_TOKEN;
const WORKSPACE = path.join(process.env.HOME, '.openclaw/workspace');

if (!BOT_TOKEN) { console.error('TELEGRAM_BOT_TOKEN missing from config.json'); process.exit(1); }

const db = new Pool({
  host: cfg.DB_HOST || 'localhost', port: 5432,
  database: cfg.DB_NAME || 'intend',
  user: cfg.DB_USER || 'intend_user',
  password: cfg.DB_PASSWORD || 'intend_pass_2026',
});

const bot     = new Telegraf(BOT_TOKEN);
const pending = new Map(); // chatId → { userId, intentionId, action }

// ── OpenClaw client (lazy import — already running as gateway)
let _openclaw = null;
function getOpenclaw() {
  if (!_openclaw) {
    const { OpenClaw } = require('@openclaw/sdk');
    _openclaw = new OpenClaw({ gateway: 'ws://127.0.0.1:18789' });
  }
  return _openclaw;
}

// ── Helpers
function readFile(filename) {
  try { return fs.readFileSync(path.join(WORKSPACE, filename), 'utf8'); }
  catch { return ''; }
}

async function getOrCreateUser(telegramId, username) {
  let r = await db.query('SELECT * FROM users WHERE telegram_id=$1', [telegramId]);
  if (r.rows.length) return r.rows[0];
  r = await db.query(
    `INSERT INTO users (telegram_id, username, permission_level) VALUES ($1,$2,1) RETURNING *`,
    [telegramId, username || null]
  );
  return r.rows[0];
}

async function createIntention(userId, rawText, objective) {
  const r = await db.query(
    `INSERT INTO intentions (user_id, raw_text, objective, status) VALUES ($1,$2,$3,'pending') RETURNING id`,
    [userId, rawText, objective]
  );
  return r.rows[0].id;
}

function parseAction(text) {
  const obj    = (text.match(/⚡\s*(HEDGE|YIELD|TRANSFER|ONRAMP)/i) || [])[1]?.toUpperCase();
  const amount = parseFloat((text.match(/(\d[\d,]*\.?\d*)\s*USDT/i) || [])[1]?.replace(',','')) || null;
  const apy    = parseFloat((text.match(/([\d.]+)%\s*APY/i) || [])[1]) || null;
  const chain  = ((text.match(/\bon\s+(Base|Arbitrum|Celo|Ethereum)\b/i) || [])[1] || 'base').toLowerCase();
  const hasActivate = /\[\s*Activate\s*\]/i.test(text);
  return { obj, amount, apy, chain, hasActivate };
}

function activateKeyboard() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('⚡ [ Activate ]', 'activate')],
    [Markup.button.callback('✗ Cancel',        'cancel')],
  ]);
}

// ── Commands
bot.command('start', async ctx => {
  await getOrCreateUser(ctx.from.id, ctx.from.username);
  await ctx.reply(
    `*Welcome to Intend.*\n\nYour money, executing your intentions.\n\nWhat do you want your money to do?`,
    {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🛡️ Protect my savings', 'intent_hedge')],
        [Markup.button.callback('🌍 Grow my capital',    'intent_yield')],
        [Markup.button.callback('💱 Send money',         'intent_transfer')],
      ])
    }
  );
});

bot.command('status', async ctx => {
  const user = await getOrCreateUser(ctx.from.id, ctx.from.username);
  const r    = await db.query(
    `SELECT * FROM positions WHERE user_id=$1 AND status='active' ORDER BY deployed_at DESC`,
    [user.id]
  );
  if (!r.rows.length) return ctx.reply('No active positions. Tell me what you want to do with your money.');
  const lines = r.rows.map(p =>
    `• ${p.objective}: ${p.amount} ${p.asset}${p.apy_at_entry ? ` @ ${p.apy_at_entry}% APY` : ''} on ${p.chain}`
  );
  await ctx.reply(`*Active positions:*\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
});

bot.command('signals', async ctx => {
  const ctx_text = readFile('LIVE_CONTEXT.md');
  const preview  = ctx_text.split('\n').slice(0, 20).join('\n');
  await ctx.reply(`\`\`\`\n${preview}\n\`\`\``, { parse_mode: 'Markdown' });
});

bot.command('fund', async ctx => {
  await ctx.reply(
    `*Add funds to your wallet*\n\nMinimum $20 via card (MoonPay).\n\nHow much would you like to add?`,
    { parse_mode: 'Markdown' }
  );
});

// ── Quick intent buttons
bot.action('intent_hedge',    ctx => { ctx.answerCbQuery(); handleMessage(ctx, 'Protect my savings from inflation and currency risk'); });
bot.action('intent_yield',    ctx => { ctx.answerCbQuery(); handleMessage(ctx, 'Grow my idle capital and beat inflation'); });
bot.action('intent_transfer', ctx => { ctx.answerCbQuery(); handleMessage(ctx, 'I want to send money'); });

// ── Activate
bot.action('activate', async ctx => {
  await ctx.answerCbQuery('Executing…');
  const p = pending.get(ctx.chat.id);
  if (!p) return ctx.reply('Nothing to activate. Send me an intention first.');
  pending.delete(ctx.chat.id);

  const loading = await ctx.reply('⚡ Executing on-chain…');
  const result  = await executor.execute(p.userId, p.intentionId, p.action, getOpenclaw());
  await ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => {});

  let msg = result.message;
  if (result.success && result.txHash && result.txHash !== 'pending') {
    msg += `\n\n🔗 \`${result.txHash}\``;
  }
  if (result.moonpayUrl) msg += `\n\n[Complete payment →](${result.moonpayUrl})`;
  await ctx.reply(msg, { parse_mode: 'Markdown' });
});

// ── Cancel
bot.action('cancel', async ctx => {
  await ctx.answerCbQuery('Cancelled');
  const p = pending.get(ctx.chat.id);
  if (p) {
    pending.delete(ctx.chat.id);
    await db.query(`UPDATE intentions SET status='cancelled' WHERE id=$1`, [p.intentionId]).catch(() => {});
  }
  await ctx.reply('Cancelled. What else do you want to do?');
});

// ── Main message handler
async function handleMessage(ctx, overrideText) {
  const telegramId = ctx.from?.id;
  const rawText    = overrideText || ctx.message?.text || '';
  if (!telegramId || !rawText) return;

  const user = await getOrCreateUser(telegramId, ctx.from?.username);
  await ctx.sendChatAction('typing').catch(() => {});

  const system = [readFile('WORKSPACE.md'), '---', readFile('LIVE_CONTEXT.md')].join('\n\n');

  let responseText;
  try {
    const openclaw = getOpenclaw();
    const resp = await openclaw.chat({
      system,
      messages: [{ role: 'user', content: rawText }],
    });
    responseText = resp?.content || resp?.message || String(resp);
  } catch(e) {
    console.error('[bot] OpenClaw error:', e.message);
    return ctx.reply('Something went wrong. Please try again.');
  }

  const parsed    = parseAction(responseText);
  const objMap    = { HEDGE:'HEDGE', YIELD:'YIELD', TRANSFER:'TRANSFER', ONRAMP:'ONRAMP' };
  const objective = objMap[parsed.obj] || 'UNKNOWN';
  const intentionId = await createIntention(user.id, rawText, objective);

  if (parsed.hasActivate && parsed.obj && parsed.amount) {
    pending.set(ctx.chat.id, {
      userId: user.id,
      intentionId,
      action: {
        type:   parsed.obj.toLowerCase(),
        amount: parsed.amount,
        chain:  parsed.chain,
        apy:    parsed.apy,
      },
    });
    await ctx.reply(responseText, { parse_mode: 'Markdown', ...activateKeyboard() });
  } else {
    await ctx.reply(responseText, { parse_mode: 'Markdown' });
  }
}

bot.on('text', handleMessage);

bot.catch((err, ctx) => console.error('[bot] Error:', err.message, ctx.updateType));

process.once('SIGINT',  () => { bot.stop('SIGINT');  db.end(); });
process.once('SIGTERM', () => { bot.stop('SIGTERM'); db.end(); });

bot.launch().then(() => console.log('[bot] Intend bot running')).catch(e => {
  console.error('[bot] Launch failed:', e.message);
  process.exit(1);
});
