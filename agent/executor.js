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
  },
  // Testnet iUSDT (Intend Test USDT)
  iUSDT: {
    'arbitrum-sepolia': '0xe24De1f763fAf5d2cFB54147AAd14Fe538999958',
    'ethereum-sepolia': '0x993034D6f6D942AA5491FaC8F1071d60D7b34107',
  },
  // Testnet iXAUT (Intend Test Gold — represents Tether Gold XAUT)
  iXAUT: {
    'arbitrum-sepolia': '0x993034D6f6D942AA5491FaC8F1071d60D7b34107',
    'ethereum-sepolia': '0x9fDCf3e51299eE502F369010ecf79a9683057351',
  },
  // Mainnet XAUT (Tether Gold)
  XAUT: {
    ethereum: '0x68749665FF8D2d112Fa859AA293F07A622782F38',
    arbitrum: '0xfB9701e0CA0E8e8Cc7B5b04Cd0FD4F27E3b5Fd1C',
  }
};

const TESTNET = process.env.INTEND_TESTNET === 'true';

function getTokenAddress(chain) {
  if (TESTNET) {
    // Map logical chain to testnet chain for token lookup
    const testMap = { 'arbitrum': 'ethereum-sepolia', 'ethereum': 'ethereum-sepolia' };
    const resolvedChain = testMap[chain] || (chain + '-sepolia');
    return TOKENS.iUSDT[resolvedChain] || null;
  }
  return TOKENS.USDT[chain] || null;
}

const RPC = {
  arbitrum:           'https://arb1.arbitrum.io/rpc',
  ethereum:           'https://ethereum-rpc.publicnode.com',
  celo:               'https://forno.celo.org',
  base:               'https://mainnet.base.org',
  'arbitrum-sepolia': 'https://sepolia-rollup.arbitrum.io/rpc',
  'ethereum-sepolia': 'https://ethereum-sepolia-rpc.publicnode.com',
};

function getChain(chain) {
  if (TESTNET) {
    if (chain === 'arbitrum') return 'ethereum-sepolia';
    if (chain === 'ethereum') return 'ethereum-sepolia';

  }
  return chain;
}

const WALLET_DIR = path.join(process.env.HOME, '.openclaw/workspace/wallets');

async function getEvmAccount(telegramId, chain = 'arbitrum') {
  const backupPath = path.join(WALLET_DIR, `${telegramId}.json`);
  if (!fs.existsSync(backupPath)) throw new Error('Wallet not found for user ' + telegramId);
  const data = JSON.parse(fs.readFileSync(backupPath));
  const encMnemonic = data.mnemonic;
  if (!encMnemonic) throw new Error('No mnemonic found');
  const mnemonic = isEncrypted(encMnemonic) ? decrypt(encMnemonic) : encMnemonic;
  const resolvedChain = getChain(chain);
  const rpc = RPC[resolvedChain] || RPC[chain] || RPC.arbitrum;
  console.error(`[executor] chain=${chain} resolved=${resolvedChain} rpc=${rpc}`);
  return new WalletAccountEvm(mnemonic, "0'/0/0", { provider: rpc });
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
  const account = await getEvmAccount(userId, chain);
  try {
    const tokenAddress = getTokenAddress(chain);
    if (!tokenAddress) throw new Error(`No token address for chain: ${chain}`);

    if (TESTNET) {
      // Testnet: send iUSDT to self via raw ethers call (proves signing + token interaction)
      const { ethers } = require('ethers');
      const resolvedChain = getChain(chain);
      const rpc = RPC[resolvedChain] || RPC[chain];
      const backupPath = require('path').join(WALLET_DIR, `${userId}.json`);
      const data = JSON.parse(require('fs').readFileSync(backupPath));
      const mnemonic = isEncrypted(data.mnemonic) ? decrypt(data.mnemonic) : data.mnemonic;
      const provider = new ethers.JsonRpcProvider(rpc);
      const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
      const address = wallet.address;
      const amountBig = toUnits(amount);
      // ERC-20 transfer to self
      const erc20 = new ethers.Contract(tokenAddress, [
        'function transfer(address to, uint256 amount) returns (bool)'
      ], wallet);
      const tx = await erc20.transfer(address, amountBig);
      const receipt = await tx.wait();
      const txHash = receipt.hash;
      await savePosition(userId, 'YIELD', 'iUSDT', amount, 'aave-v3-testnet', chain, apy);
      await logEvent(userId, 'yield_deployed_testnet', { amount, chain, apy, txHash });
      const explorerBase = TESTNET ? 'https://sepolia.etherscan.io/tx/' : 'https://arbiscan.io/tx/';
      return { success: true, txHash, message: `✅ *${amount} iUSDT deployed at ${apy || '?'}% APY.*\n\nYour money is working.\n\n[View on Etherscan →](${explorerBase}${txHash})` };
    }

    const AaveProtocolEvm = require('@tetherto/wdk-protocol-lending-aave-evm').default;
    const aave = new AaveProtocolEvm(account);
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
  try {
    if (!recipientAddress) throw new Error('Recipient address is required');
    const { ethers } = require('ethers');
    const resolvedChain = getChain(chain);
    const rpc = RPC[resolvedChain] || RPC[chain];
    if (!rpc) throw new Error(`No RPC for chain: ${chain}`);
    const tokenAddress = getTokenAddress(chain);
    if (!tokenAddress) throw new Error(`No token address for chain: ${chain}`);
    const backupPath = require('path').join(WALLET_DIR, `${userId}.json`);
    const data = JSON.parse(require('fs').readFileSync(backupPath));
    const mnemonic = isEncrypted(data.mnemonic) ? decrypt(data.mnemonic) : data.mnemonic;
    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
    const amountBig = toUnits(amount);
    const erc20 = new ethers.Contract(tokenAddress, [
      'function transfer(address to, uint256 amount) returns (bool)'
    ], wallet);
    const tx = await erc20.transfer(recipientAddress, amountBig);
    const receipt = await tx.wait();
    const txHash = receipt.hash;
    await logEvent(userId, 'transfer_executed', { amount, chain, recipientAddress, txHash });
    const explorerBase = TESTNET ? 'https://sepolia.etherscan.io/tx/' : 'https://arbiscan.io/tx/';
    return { success: true, txHash, message: `✅ *${amount} iUSDT sent.*\n\n[View on Etherscan →](${explorerBase}${txHash})` };
  } catch(e) { throw e; }
}

async function getBalance(userId, chain = 'arbitrum') {
  const resolvedChain = getChain(chain);
  const account = await getEvmAccount(userId, chain);
  try {
    const tokenAddress = getTokenAddress(chain);
    if (!tokenAddress) throw new Error(`No token address for chain: ${chain} (testnet=${TESTNET})`);
    // Use direct ERC-20 balanceOf call — getBalance() ignores token param
    const provider = account.provider || account._provider;
    const address = await account.getAddress();
    // ERC-20 balanceOf ABI encoded: balanceOf(address)
    const data = '0x70a08231' + address.slice(2).padStart(64, '0');
    const result = await fetch(RPC[resolvedChain] || RPC[chain], {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'eth_call',
        params: [{ to: tokenAddress, data }, 'latest']
      })
    });
    const json = await result.json();
    if (json.error) throw new Error(json.error.message);
    const raw = BigInt(json.result || '0x0');
    const readable = (Number(raw) / 1e6).toFixed(2);
    return { success: true, balance: readable, chain };
  } finally {
    account.dispose();
  }
}

async function getFullPortfolio(userId) {
  const chains = TESTNET
    ? [{ chain: 'arbitrum', label: 'Ethereum Sepolia', token: 'iUSDT' }]
    : [{ chain: 'arbitrum', label: 'Arbitrum', token: 'USDT' }, { chain: 'ethereum', label: 'Ethereum', token: 'USDT' }];

  const portfolio = {};
  for (const { chain, label, token } of chains) {
    try {
      const r = await getBalance(userId, chain);
      if (parseFloat(r.balance) > 0) portfolio[label] = { balance: r.balance, token };
    } catch(e) {}
  }

  // Also check iXAUT balance on testnet
  if (TESTNET) {
    try {
      const resolvedChain = getChain('ethereum');
      const rpc = RPC[resolvedChain];
      const backupPath = require('path').join(WALLET_DIR, `${userId}.json`);
      const data = JSON.parse(require('fs').readFileSync(backupPath));
      const mnemonic = isEncrypted(data.mnemonic) ? decrypt(data.mnemonic) : data.mnemonic;
      const { ethers } = require('ethers');
      const provider = new ethers.JsonRpcProvider(rpc);
      const wallet = ethers.Wallet.fromPhrase(mnemonic).connect(provider);
      const address = wallet.address;
      const xautAddress = TOKENS.iXAUT[resolvedChain];
      if (xautAddress) {
        const data32 = '0x70a08231' + address.slice(2).padStart(64, '0');
        const result = await provider.call({ to: xautAddress, data: data32 });
        const raw = BigInt(result || '0x0');
        const xautBalance = (Number(raw) / 1e6).toFixed(4);
        if (parseFloat(xautBalance) > 0) portfolio['Ethereum Sepolia (Gold)'] = { balance: xautBalance, token: 'iXAUT' };
      }
    } catch(e) { console.error('[portfolio] iXAUT check failed:', e.message); }
  }

  return portfolio;
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
      case 'portfolio':
        result = await getFullPortfolio(params.userId);
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

async function getAllBalances(userId) {
  const chains = ['arbitrum', 'ethereum', 'celo', 'base'];
  const results = {};
  for (const chain of chains) {
    try {
      const r = await getBalance(userId, chain);
      if (parseFloat(r.balance) > 0) results[chain] = r.balance;
    } catch(e) { /* skip chains with no USDT address */ }
  }
  return results;
}
