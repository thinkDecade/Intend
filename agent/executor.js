#!/usr/bin/env node
/**
 * INTEND EXECUTION ENGINE v3.0
 * Direct WDK module calls. No openclaw.skill() wrapper.
 * Called by agent via: node executor.js <action_json>
 */
'use strict';

const { WalletAccountEvm } = require('@tetherto/wdk-wallet-evm');
const db = require('./db');
const { decrypt, isEncrypted } = require('./crypto');
const fs = require('fs');
const path = require('path');

// Token addresses
const TOKENS = {
  USDT: {
    arbitrum:  '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9',
    ethereum:  '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    celo:      '0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e',
  }
};

const RPC = {
  arbitrum:  'https://arb1.arbitrum.io/rpc',
  ethereum:  'https://ethereum-rpc.publicnode.com',
  celo:      'https://forno.celo.org',
  base:      'https://mainnet.base.org',
};

const WALLET_DIR = path.join(process.env.HOME, '.openclaw/workspace/wallets');

async function getEvmAccount(telegramId, chain = 'arbitrum') {
  const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
  if (!fs.existsSync(backupPath)) throw new Error('Wallet not found for user ' + telegramId);
  const data = JSON.parse(fs.readFileSync(backupPath));
  const encMnemonic = data.mnemonic;
  if (!encMnemonic) throw new Error('No mnemonic found');
  const mnemonic = isEncrypted(encMnemonic) ? decrypt(encMnemonic) : encMnemonic;
  return new WalletAccountEvm(mnemonic, "0'/0/0", { provider: RPC[chain] || RPC.arbitrum });
}

async function logEvent(userId, type, payload) {
  try {
    await db.pool.query(
      'INSERT INTO events (user_id, type, payload) VALUES ($1, $2, $3)',
      [userId, type, JSON.stringify(payload)]
    );
  } catch(e) { console.error('[executor] logEvent failed:', e.message); }
}

async function savePosition(userId, objective, asset, amount, protocol, chain, apy) {
  try {
    const r = await db.pool.query(
      `INSERT INTO positions (user_id, objective, asset, amount, protocol, chain, apy_at_entry, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id`,
      [userId, objective, asset, amount, protocol, chain, apy || null]
    );
    return r.rows[0]?.id;
  } catch(e) { console.error('[executor] savePosition failed:', e.message); return null; }
}

function toUnits(amount, decimals = 6) {
  return BigInt(Math.round(parseFloat(amount) * 10 ** decimals));
}

async function executeYield(userId, amount, chain = 'arbitrum', apy) {
  const AaveProtocolEvm = require('@tetherto/wdk-protocol-lending-aave-evm').default;
  const account = await getEvmAccount(userId, chain);
  try {
    const aave = new AaveProtocolEvm(account);
    const tokenAddress = TOKENS.USDT[chain];
    if (!tokenAddress) throw new Error(`No USDT address for chain: ${chain}`);
    const amountBig = toUnits(amount);
    const result = await aave.supply({ token: tokenAddress, amount: amountBig });
    const txHash = result?.hash || result?.txHash || 'pending';
    await savePosition(userId, 'YIELD', 'USDT', amount, 'aave-v3', chain, apy);
    await logEvent(userId, 'yield_deployed', { amount, chain, apy, txHash });
    return { success: true, txHash, message: `✅ *${amount} USDT deployed at ${apy || '?'}% APY.*\n\nYour money is working.` };
  } finally {
    account.dispose();
  }
}

async function executeHedge(userId, amount, chain = 'arbitrum') {
  const account = await getEvmAccount(userId, chain);
  try {
    // HEDGE = hold in USDT (already stable). Log the intention.
    const txHash = 'hold_' + Date.now();
    await savePosition(userId, 'HEDGE', 'USDT', amount, 'self-custody', chain, null);
    await logEvent(userId, 'hedge_activated', { amount, chain, txHash });
    return { success: true, txHash, message: `✅ *${amount} USDT secured.*\n\nPurchasing power protected.` };
  } finally {
    account.dispose();
  }
}

async function executeTransfer(userId, amount, recipientAddress, chain = 'celo') {
  const account = await getEvmAccount(userId, chain);
  try {
    const tokenAddress = TOKENS.USDT[chain];
    if (!tokenAddress) throw new Error(`No USDT address for chain: ${chain}`);
    const amountBig = toUnits(amount);
    const result = await account.transfer({ token: tokenAddress, to: recipientAddress, amount: amountBig });
    const txHash = result?.hash || result?.txHash || 'pending';
    await logEvent(userId, 'transfer_executed', { amount, chain, recipientAddress, txHash });
    return { success: true, txHash, message: `✅ *${amount} USDT sent.*\n\nTransaction: \`${txHash}\`` };
  } finally {
    account.dispose();
  }
}

async function getBalance(userId, chain = 'arbitrum') {
  const account = await getEvmAccount(userId, chain);
  try {
    const tokenAddress = TOKENS.USDT[chain];
    if (!tokenAddress) throw new Error(`No USDT address for chain: ${chain}`);
    const balance = await account.getBalance({ token: tokenAddress });
    const readable = (Number(balance) / 1e6).toFixed(2);
    return { success: true, balance: readable, chain };
  } finally {
    account.dispose();
  }
}

async function main() {
  const cmd = process.argv[2];
  const arg = process.argv[3];

  if (!cmd) {
    console.error('Usage: node executor.js <yield|hedge|transfer|balance> <json_params>');
    process.exit(1);
  }

  const params = arg ? JSON.parse(arg) : {};

  try {
    let result;
    switch(cmd) {
      case 'yield':
        result = await executeYield(params.userId, params.amount, params.chain || 'arbitrum', params.apy);
        break;
      case 'hedge':
        result = await executeHedge(params.userId, params.amount, params.chain || 'arbitrum');
        break;
      case 'transfer':
        result = await executeTransfer(params.userId, params.amount, params.recipientAddress, params.chain || 'celo');
        break;
      case 'balance':
        result = await getBalance(params.userId, params.chain || 'arbitrum');
        break;
      default:
        throw new Error('Unknown command: ' + cmd);
    }
    console.log(JSON.stringify(result, (k,v) => typeof v === "bigint" ? v.toString() : v));
    process.exit(0);
  } catch(e) {
    console.log(JSON.stringify({ success: false, message: '❌ ' + e.message }));
    process.exit(1);
  }
}

main().catch(e => { console.error(e.message); process.exit(1); });
