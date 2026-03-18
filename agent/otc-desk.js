#!/usr/bin/env node

const https = require('https');
const fs = require('fs');
const path = require('path');

const USER_BOT_TOKEN = '8689838168:AAHsxKsbvQQ8hhpTtULdt7SCqSxK2TAL5vw';
const DESK_BOT_TOKEN = '8765104347:AAH-8Jlc90G2grv0Wyln6LeoWohpln7W5Uo';
const TRADE_DESK_GROUP = '-1003883356232';
const ORDERS_FILE = path.join(process.env.HOME, 'intend/orders.json');
const db = require('./db');

function loadOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE)); }
  catch { return {}; }
}

function saveOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

function generateOrderId() {
  return 'ORD-' + Date.now().toString(36).toUpperCase();
}

function telegramPost(token, method, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${token}/${method}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': data.length }
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch (e) { console.error('[telegram] parse error:', raw.substring(0, 200)); resolve({ ok: false, result: [] }); }
      });
    });
    req.on('error', (e) => { console.error('[telegram] error:', e.message); resolve({ ok: false, result: [] }); });
    req.write(data);
    req.end();
  });
}

function sendUser(chatId, text) {
  return telegramPost(USER_BOT_TOKEN, 'sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown' });
}

function sendDesk(text) {
  return telegramPost(DESK_BOT_TOKEN, 'sendMessage', { chat_id: TRADE_DESK_GROUP, text, parse_mode: 'Markdown' });
}

async function createOrder(userId, type, amountUsd, walletAddress, momoNumber) {
  const orders = loadOrders();
  const orderId = generateOrderId();
  orders[orderId] = {
    orderId, userId, type, amountUsd, walletAddress,
    status: 'pending_quote',
    createdAt: new Date().toISOString(),
    momoNumber: momoNumber || null,
    rate: null, amountGhs: null
  };
  saveOrders(orders);
  db.saveOrder(orders[orderId]).catch(e => console.error('[db] saveOrder:', e.message));

  await sendDesk(
    `🔔 *New ${type.toUpperCase()} Order*\n\n` +
    `Order: \`${orderId}\`\n` +
    `Type: ${type === 'buy' ? '🟢 User buying USDT (we receive GHS)' : '🔴 User selling USDT (we send GHS)'}\n` +
    `Amount: $${amountUsd} USDT\n` +
    `Wallet: \`${walletAddress}\`\n` +
    (momoNumber ? `MoMo: ${momoNumber}\n` : '') +
    `\nSet rate: \`/quote ${orderId} <GHS per USD>\`\n` +
    `Example: \`/quote ${orderId} 15.20\``
  );

  await sendUser(userId,
    `⏳ *Order Received*\n\n` +
    `Order ID: \`${orderId}\`\n` +
    `Amount: $${amountUsd} USDT\n\n` +
    `Our trade desk is preparing your quote. Usually under 5 minutes.`
  );

  return orderId;
}

async function handlePaid(orderId) {
  const orders = loadOrders();
  const order = orders[orderId];
  if (!order) { console.log('Order not found'); return; }
  order.status = 'payment_claimed';
  saveOrders(orders);
  await sendDesk(
    `💰 *Payment Claimed*\n\n` +
    `Order: \`${orderId}\`\n` +
    `User says GHS ${order.amountGhs} sent via MoMo.\n` +
    `Verify and confirm: \`/confirm ${orderId}\`\n` +
    `Or cancel: \`/cancel ${orderId}\``
  );
  console.log('Trade desk notified');
}

async function handleSent(orderId) {
  const orders = loadOrders();
  const order = orders[orderId];
  if (!order) { console.log('Order not found'); return; }
  order.status = 'usdt_claimed';
  saveOrders(orders);
  await sendDesk(
    `🔄 *USDT Sent Claimed*\n\n` +
    `Order: \`${orderId}\`\n` +
    `User says $${order.amountUsd} USDT sent.\n` +
    `Verify on-chain, then send GHS ${order.amountGhs} to MoMo: ${order.momoNumber}.\n` +
    `Confirm when done: \`/confirm ${orderId}\``
  );
  console.log('Trade desk notified');
}

async function handleDeskCommand(text) {
  const orders = loadOrders();

  if (text.startsWith('/quote ')) {
    const parts = text.split(' ');
    const orderId = parts[1];
    const rate = parseFloat(parts[2]);
    const order = orders[orderId];
    if (!order) return sendDesk(`❌ Order ${orderId} not found.`);
    if (isNaN(rate)) return sendDesk(`❌ Invalid rate. Example: /quote ${orderId} 15.20`);
    const amountGhs = (order.amountUsd * rate).toFixed(2);
    order.rate = rate;
    order.amountGhs = amountGhs;
    order.status = order.type === 'buy' ? 'pending_payment' : 'pending_usdt';
    saveOrders(orders);
    if (order.type === 'buy') {
      await sendUser(order.userId,
        `💱 *Your Quote is Ready*\n\n` +
        `Order: \`${orderId}\`\n` +
        `You send: *GHS ${amountGhs}*\n` +
        `You receive: *$${order.amountUsd} USDT*\n` +
        `Rate: 1 USD = GHS ${rate}\n\n` +
        `Send GHS ${amountGhs} via Mobile Money to:\n` +
        `📱 *MTN MoMo: 024 351 9953* (Ideasflip Enterprise)\n\n` +
        `Once sent, reply: \`/paid ${orderId}\``
      );
    } else {
      await sendUser(order.userId,
        `💱 *Your Quote is Ready*\n\n` +
        `Order: \`${orderId}\`\n` +
        `You send: *$${order.amountUsd} USDT*\n` +
        `You receive: *GHS ${amountGhs}*\n` +
        `Rate: 1 USD = GHS ${rate}\n\n` +
        `Send USDT to this address on Arbitrum:\n` +
        `\`${order.walletAddress}\`\n\n` +
        `Once sent, reply: \`/sent ${orderId}\``
      );
    }
    await sendDesk(`✅ Quote sent for ${orderId} at GHS ${rate}/USD`);
  }

  else if (text.startsWith('/confirm ')) {
    const orderId = text.split(' ')[1];
    const order = orders[orderId];
    if (!order) return sendDesk(`❌ Order ${orderId} not found.`);
    order.status = 'complete';
    order.completedAt = new Date().toISOString();
    saveOrders(orders);
    if (order.type === 'buy') {
      await sendUser(order.userId,
        `✅ *Payment Confirmed*\n\n` +
        `Order: \`${orderId}\`\n` +
        `$${order.amountUsd} USDT is being released to your wallet.\n` +
        `Wallet: \`${order.walletAddress}\`\n\n` +
        `Funds will arrive within minutes.`
      );
    } else {
      await sendUser(order.userId,
        `✅ *Order Complete*\n\n` +
        `Order: \`${orderId}\`\n` +
        `GHS ${order.amountGhs} has been sent to your Mobile Money.\n\n` +
        `Thank you for using Intend.`
      );
    }
    await sendDesk(`✅ Order ${orderId} marked complete.`);
  }

  else if (text.startsWith('/cancel ')) {
    const orderId = text.split(' ')[1];
    const order = orders[orderId];
    if (!order) return sendDesk(`❌ Order ${orderId} not found.`);
    order.status = 'cancelled';
    saveOrders(orders);
    await sendUser(order.userId,
      `❌ *Order Cancelled*\n\nOrder \`${orderId}\` has been cancelled.\nReply "buy USDT" or "sell USDT" to start a new order.`
    );
    await sendDesk(`Order ${orderId} cancelled.`);
  }

  else if (text === '/orders') {
    const active = Object.values(orders).filter(o => o.status !== 'complete' && o.status !== 'cancelled');
    if (active.length === 0) return sendDesk('No active orders.');
    const list = active.map(o => `• \`${o.orderId}\` | ${o.type.toUpperCase()} $${o.amountUsd} | ${o.status}`).join('\n');
    await sendDesk(`*Active Orders (${active.length}):*\n\n${list}`);
  }
}

let deskOffset = 0;

async function pollDeskBot() {
  try {
    const res = await telegramPost(DESK_BOT_TOKEN, 'getUpdates', { offset: deskOffset, timeout: 10 });
    for (const update of (res.result || [])) {
      deskOffset = update.update_id + 1;
      const msg = update.message;
      if (!msg || !msg.text) continue;
      await handleDeskCommand(msg.text.trim());
    }
  } catch (e) { console.error('[desk-bot]', e.message); }
}

async function main() {
  const cmd = process.argv[2];

  if (cmd === 'create') {
    const [,, , userId, type, amountUsd, walletAddress, momoNumber] = process.argv;
    await createOrder(userId, type, parseFloat(amountUsd), walletAddress, momoNumber);
    console.log('Order created');
    process.exit(0);
  }

  if (cmd === 'paid') {
    await handlePaid(process.argv[3]);
    process.exit(0);
  }

  if (cmd === 'sent') {
    await handleSent(process.argv[3]);
    process.exit(0);
  }

  console.log('[otc-desk] Polling for desk commands...');
  setInterval(pollDeskBot, 2000);
}

main().catch(e => { console.error('[otc-desk] Fatal:', e.message); process.exit(1); });
