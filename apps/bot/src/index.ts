/**
 * Intend Telegram Bot — entry point
 *
 * Mode: webhook (production) or polling (development)
 * HMAC verification active on all webhook requests.
 *
 * PM2 process name: intend-bot
 */

import TelegramBot from 'node-telegram-bot-api';
import * as http from 'http';
import { getUserByTelegramId } from '@intend/data';
import { verifyTelegramWebhook } from '@intend/core';
import { runPipeline } from './pipeline.js';
import { handleCallback } from './handlers/callbacks.js';
import {
  handleStart, handleBalance, handlePortfolio,
  handleHelp, handleHistory, handleConnect,
  handleCancel, handleSettings,
} from './handlers/commands.js';

const TOKEN   = process.env['TELEGRAM_BOT_TOKEN'];
const SECRET  = process.env['TELEGRAM_WEBHOOK_SECRET'];
const WEBHOOK = process.env['TELEGRAM_WEBHOOK_URL'];    // e.g. https://your-domain.com/bot
const PORT    = parseInt(process.env['BOT_PORT'] ?? '3001', 10);
const IS_DEV  = process.env['NODE_ENV'] !== 'production';

if (!TOKEN) throw new Error('[bot] TELEGRAM_BOT_TOKEN is required');

// ── Bot instance ────────────────────────────────────────────────────────
const bot = new TelegramBot(TOKEN, { polling: IS_DEV });

// ── HMAC verification (webhook mode only) ────────────────────────────────
function verifyHmac(signature: string | undefined): boolean {
  if (!SECRET) return true; // skip in dev if not configured
  return verifyTelegramWebhook(SECRET, signature);
}

// ── Webhook HTTP server ──────────────────────────────────────────────────
if (!IS_DEV) {
  if (!WEBHOOK) throw new Error('[bot] TELEGRAM_WEBHOOK_URL is required in production');

  const server = http.createServer((req, res) => {
    if (req.method !== 'POST') { res.writeHead(405).end(); return; }

    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      const sig = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
      if (!verifyHmac(sig)) {
        res.writeHead(403).end('Forbidden');
        return;
      }

      try {
        const update = JSON.parse(body) as TelegramBot.Update;
        bot.processUpdate(update);
        res.writeHead(200).end('OK');
      } catch {
        res.writeHead(400).end('Bad Request');
      }
    });
  });

  server.listen(PORT, () => {
    console.log(`[intend-bot] Webhook server listening on port ${PORT}`);
  });

  bot.setWebHook(`${WEBHOOK}`, {
    secret_token: SECRET ?? undefined,
  }).then(() => {
    console.log(`[intend-bot] Webhook set → ${WEBHOOK}`);
  });
}

// ── Command registration ─────────────────────────────────────────────────
bot.onText(/\/start/,    (msg) => handleStart(bot, msg).catch(console.error));
bot.onText(/\/balance/,  (msg) => handleBalance(bot, msg).catch(console.error));
bot.onText(/\/portfolio/,(msg) => handlePortfolio(bot, msg).catch(console.error));
bot.onText(/\/help/,     (msg) => handleHelp(bot, msg).catch(console.error));
bot.onText(/\/history/,  (msg) => handleHistory(bot, msg).catch(console.error));
bot.onText(/\/connect/,  (msg) => handleConnect(bot, msg).catch(console.error));
bot.onText(/\/cancel/,   (msg) => handleCancel(bot, msg).catch(console.error));
bot.onText(/\/settings/, (msg) => handleSettings(bot, msg).catch(console.error));

// ── Message handler ──────────────────────────────────────────────────────
bot.on('message', async (msg) => {
  // Skip commands — handled above
  if (msg.text?.startsWith('/')) return;
  if (!msg.text || !msg.from) return;

  try {
    const user = await getUserByTelegramId(BigInt(msg.from.id));
    if (!user) {
      await bot.sendMessage(msg.chat.id, 'Please /start first to set up your account.');
      return;
    }
    await runPipeline(bot, msg, user.user_id);
  } catch (err) {
    console.error('[bot] Pipeline error:', err);
    await bot.sendMessage(msg.chat.id, 'Something went wrong. Please try again.').catch(() => {});
  }
});

// ── Callback query handler ────────────────────────────────────────────────
bot.on('callback_query', (query) => {
  handleCallback(bot, query).catch(console.error);
});

// ── Error handler ─────────────────────────────────────────────────────────
bot.on('polling_error', (err) => console.error('[bot] Polling error:', err));
bot.on('error',         (err) => console.error('[bot] Error:', err));

console.log(`[intend-bot] Starting in ${IS_DEV ? 'polling' : 'webhook'} mode…`);
