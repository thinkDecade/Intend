#!/usr/bin/env node
// Intend Buttons — reply keyboards only. No polling. No conflict.
const https = require("https");
const BOT_TOKEN = "8689838168:AAHsxKsbvQQ8hhpTtULdt7SCqSxK2TAL5vw";

function telegramPost(method, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body);
    const req = https.request({
      hostname: "api.telegram.org",
      path: `/bot${BOT_TOKEN}/${method}`,
      method: "POST",
      headers: { "Content-Type": "application/json", "Content-Length": data.length }
    }, (res) => {
      let raw = "";
      res.on("data", c => raw += c);
      res.on("end", () => { try { resolve(JSON.parse(raw)); } catch(e) { resolve({ ok: false }); } });
    });
    req.on("error", () => resolve({ ok: false }));
    req.write(data);
    req.end();
  });
}

const templates = {
  create_wallet: {
    text: "I'll create your Intend wallet.\nIt's where your money starts working for you.",
    keyboard: [["⚡ Create Wallet", "Not now"]]
  },
  capabilities: {
    text: "You can now:",
    keyboard: [["🛡 Protect", "📈 Grow", "🌍 Send"]]
  },
  automation: {
    text: "Do you want me to act automatically when needed?\nThis helps protect and grow your money without waiting.",
    keyboard: [["⚡ Yes, automate", "👀 Just suggest"]]
  },
  funding: {
    text: "Let's get your money working.",
    keyboard: [["💳 Buy crypto", "🔁 Transfer funds"], ["⏭ Skip for now"]]
  },
  confirm: {
    text: "Ready to execute.",
    keyboard: [["✅ Activate", "❌ Cancel"]]
  },
  wallet_details: {
    text: "Your wallet:",
    keyboard: [["🔐 View wallet details", "⬅ Back"]]
  },
  hide: {
    text: "​",
    keyboard: null
  }
};

async function send(chatId, template) {
  const t = templates[template];
  if (!t) { console.error("Unknown template:", template); process.exit(1); }

  const payload = {
    chat_id: chatId,
    text: t.text,
    parse_mode: "Markdown"
  };

  if (t.keyboard) {
    payload.reply_markup = {
      keyboard: t.keyboard.map(row => row.map(text => ({ text }))),
      resize_keyboard: true,
      one_time_keyboard: true
    };
  } else {
    payload.reply_markup = { remove_keyboard: true };
  }

  const res = await telegramPost("sendMessage", payload);
  console.log(JSON.stringify(res.ok ? { ok: true, message_id: res.result?.message_id } : res));
}

async function custom(chatId, text, keyboardJson) {
  const rows = JSON.parse(keyboardJson);
  const res = await telegramPost("sendMessage", {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
    reply_markup: {
      keyboard: rows.map(row => row.map(text => ({ text }))),
      resize_keyboard: true,
      one_time_keyboard: true
    }
  });
  console.log(JSON.stringify(res.ok ? { ok: true, message_id: res.result?.message_id } : res));
}

const cmd = process.argv[2];
if (cmd === "send") {
  send(process.argv[3], process.argv[4])
    .then(() => process.exit(0))
    .catch(e => { console.error(e.message); process.exit(1); });
} else if (cmd === "custom") {
  custom(process.argv[3], process.argv[4], process.argv[5])
    .then(() => process.exit(0))
    .catch(e => { console.error(e.message); process.exit(1); });
} else {
  console.log("Usage: node buttons.js send <chatId> <template>");
  process.exit(0);
}
