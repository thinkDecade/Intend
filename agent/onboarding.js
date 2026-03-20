#!/usr/bin/env node
const { WalletAccountEvm } = require("@tetherto/wdk-wallet-evm");
const { WalletAccountBtc } = require("@tetherto/wdk-wallet-btc");
const bip39 = require("bip39");
const fs = require("fs");
const path = require("path");
const db = require("./db");
const { encrypt, decrypt, isEncrypted } = require("./crypto");

const WALLET_DIR = path.join(process.env.HOME, ".openclaw/workspace/wallets");

async function createMultiChainWallet(mnemonic) {
  const evm = new WalletAccountEvm(mnemonic, "0'/0/0", {
    provider: "https://ethereum-rpc.publicnode.com"
  });
  const btc = new WalletAccountBtc(mnemonic, "0'/0/0");
  const [evmAddress, btcAddress] = await Promise.all([evm.getAddress(), btc.getAddress()]);
  evm.dispose();
  return { evmAddress, btcAddress };
}

async function createWallet(telegramId, name, region, automationLevel) {
  if (!fs.existsSync(WALLET_DIR)) fs.mkdirSync(WALLET_DIR, { recursive: true });

  const existingDb = await db.getWallet(String(telegramId));
  if (existingDb && existingDb.wallet_address) {
    if (name) await db.pool.query(
      "UPDATE users SET first_name = $1, region = $2, automation_level = $3 WHERE telegram_id = $4",
      [name, region || null, automationLevel || "suggest", String(telegramId)]
    );
    const backup = path.join(WALLET_DIR, `${telegramId}.json`);
    const extra = fs.existsSync(backup) ? JSON.parse(fs.readFileSync(backup)) : {};
    return { evmAddress: existingDb.wallet_address, btcAddress: extra.btcAddress || null, existed: true };
  }

  const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
  if (fs.existsSync(backupPath)) {
    const data = JSON.parse(fs.readFileSync(backupPath));
    if (data.address || data.evmAddress) {
      const evmAddr = data.evmAddress || data.address;
      const rawMnemonic = data.mnemonic && isEncrypted(data.mnemonic)
        ? decrypt(data.mnemonic) : data.mnemonic;
      await db.getOrCreateUser(String(telegramId), name || data.name);
      await db.saveWallet(String(telegramId), evmAddr, encrypt(rawMnemonic));
      await db.pool.query(
        "UPDATE users SET region = $1, automation_level = $2, first_name = $3 WHERE telegram_id = $4",
        [region || data.region || null, automationLevel || "suggest", name || data.name || null, String(telegramId)]
      );
      if (rawMnemonic && !data.btcAddress) {
        try {
          const chains = await createMultiChainWallet(rawMnemonic);
          data.evmAddress = chains.evmAddress;
          data.btcAddress = chains.btcAddress;
        } catch(e) { console.error("BTC upgrade failed:", e.message); }
      }
      // Save with encrypted mnemonic
      data.mnemonic = encrypt(rawMnemonic);
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
      return { evmAddress: evmAddr, btcAddress: data.btcAddress || null, existed: true };
    }
  }

  // Create new
  const mnemonic = bip39.generateMnemonic();
  const { evmAddress, btcAddress } = await createMultiChainWallet(mnemonic);
  const encryptedMnemonic = encrypt(mnemonic);

  await db.getOrCreateUser(String(telegramId), name);
  await db.saveWallet(String(telegramId), evmAddress, encryptedMnemonic);
  await db.pool.query(
    "UPDATE users SET region = $1, automation_level = $2, first_name = $3 WHERE telegram_id = $4",
    [region || null, automationLevel || "suggest", name || null, String(telegramId)]
  );

  fs.writeFileSync(backupPath, JSON.stringify({
    userId: String(telegramId), name, region, automationLevel,
    mnemonic: encryptedMnemonic, evmAddress, btcAddress,
    createdAt: new Date().toISOString()
  }, null, 2));

  return { evmAddress, btcAddress, existed: false };
}

async function getWallet(telegramId) {
  try {
    const dbWallet = await db.getWallet(String(telegramId));
    if (dbWallet && dbWallet.wallet_address) {
      const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
      const extra = fs.existsSync(backupPath) ? JSON.parse(fs.readFileSync(backupPath)) : {};
      const rawMnemonic = dbWallet.wallet_mnemonic
        ? (isEncrypted(dbWallet.wallet_mnemonic) ? decrypt(dbWallet.wallet_mnemonic) : dbWallet.wallet_mnemonic)
        : null;
      return {
        wallet_address: dbWallet.wallet_address,
        wallet_mnemonic: rawMnemonic,
        btcAddress: extra.btcAddress || null
      };
    }
  } catch(e) {}
  const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
  if (fs.existsSync(backupPath)) {
    const data = JSON.parse(fs.readFileSync(backupPath));
    const rawMnemonic = data.mnemonic
      ? (isEncrypted(data.mnemonic) ? decrypt(data.mnemonic) : data.mnemonic)
      : null;
    return {
      wallet_address: data.evmAddress || data.address,
      wallet_mnemonic: rawMnemonic,
      btcAddress: data.btcAddress || null
    };
  }
  return null;
}

async function isNewUser(telegramId) {
  const wallet = await getWallet(telegramId);
  return !wallet;
}

async function getProfile(telegramId) {
  try {
    const res = await db.pool.query("SELECT * FROM users WHERE telegram_id = $1", [String(telegramId)]);
    if (res.rows.length > 0) {
      const profile = res.rows[0];
      // Never expose mnemonic in profile
      delete profile.wallet_mnemonic;
      const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
      if (fs.existsSync(backupPath)) {
        const extra = JSON.parse(fs.readFileSync(backupPath));
        profile.btcAddress = extra.btcAddress || null;
      }
      return profile;
    }
  } catch(e) {}
  const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
  if (fs.existsSync(backupPath)) {
    const data = JSON.parse(fs.readFileSync(backupPath));
    // Never expose mnemonic in profile
    return {
      userId: data.userId, name: data.name, region: data.region,
      evmAddress: data.evmAddress || data.address,
      btcAddress: data.btcAddress || null,
      automationLevel: data.automationLevel,
      createdAt: data.createdAt
    };
  }
  return null;
}

const cmd = process.argv[2];
if (cmd === "create") {
  const [,,,telegramId, name, region, automationLevel] = process.argv;
  createWallet(telegramId, name, region, automationLevel)
    .then(r => { console.log(JSON.stringify(r)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
} else if (cmd === "get") {
  getWallet(process.argv[3])
    .then(r => {
      // Never log mnemonic to stdout
      const safe = { wallet_address: r?.wallet_address, btcAddress: r?.btcAddress };
      console.log(JSON.stringify(safe));
      process.exit(0);
    })
    .catch(e => { console.error(e.message); process.exit(1); });
} else if (cmd === "check") {
  isNewUser(process.argv[3])
    .then(r => { console.log(JSON.stringify({ isNew: r })); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
} else if (cmd === "profile") {
  getProfile(process.argv[3])
    .then(r => { console.log(JSON.stringify(r)); process.exit(0); })
    .catch(e => { console.error(e.message); process.exit(1); });
}

module.exports = { createWallet, getWallet, isNewUser, getProfile };
