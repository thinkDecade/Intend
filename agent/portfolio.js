#!/usr/bin/env node

const db = require('./db');
const https = require('https');

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Intend/1.0' } }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { resolve(null); } });
    }).on('error', reject);
  });
}

async function getBalance(address) {
  try {
    // Check USDT balance on Arbitrum via Arbiscan API
    const url = `https://api.arbiscan.io/api?module=account&action=tokenbalance&contractaddress=0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9&address=${address}&tag=latest&apikey=YourApiKeyToken`;
    const res = await fetchJSON(url);
    if (res && res.status === '1') {
      return (parseInt(res.result) / 1_000_000).toFixed(2); // USDT has 6 decimals
    }
    return '0.00';
  } catch(e) { return '0.00'; }
}

async function getPortfolio(telegramId) {
  const { user, positions, activeOrders } = await db.getPortfolio(telegramId);
  if (!user) return { error: 'User not found' };

  const usdtBalance = user.wallet_address ? await getBalance(user.wallet_address) : '0.00';

  const activePositions = positions.filter(p => p.status === 'active');
  const totalDeployed = activePositions.reduce((sum, p) => sum + parseFloat(p.amount || 0), 0);

  return {
    wallet: user.wallet_address,
    usdtBalance,
    totalDeployed: totalDeployed.toFixed(2),
    positions: activePositions,
    activeOrders,
    region: user.region
  };
}

async function formatPortfolio(telegramId) {
  const p = await getPortfolio(telegramId);
  if (p.error) return p.error;

  let msg = `💼 *Your Intend Portfolio*\n\n`;
  msg += `📬 Wallet: \`${p.wallet ? p.wallet.slice(0,6) + '...' + p.wallet.slice(-4) : 'none'}\`\n`;
  msg += `💵 USDT Balance: $${p.usdtBalance}\n`;

  if (p.positions.length > 0) {
    msg += `\n📈 *Active Positions*\n`;
    p.positions.forEach(pos => {
      msg += `• ${pos.protocol} on ${pos.chain} — $${pos.amount} at ${pos.apy}% APY\n`;
    });
    msg += `Total deployed: $${p.totalDeployed}\n`;
  }

  if (p.activeOrders.length > 0) {
    msg += `\n🔄 *Pending Orders*\n`;
    p.activeOrders.forEach(o => {
      msg += `• ${o.type.toUpperCase()} $${o.amount_usd} — ${o.status}\n`;
    });
  }

  if (p.positions.length === 0 && parseFloat(p.usdtBalance) === 0) {
    msg += `\n_No capital deployed yet. Say "grow my money" to start earning._`;
  }

  return msg;
}

async function main() {
  const telegramId = process.argv[3];
  if (process.argv[2] === 'get' && telegramId) {
    const result = await formatPortfolio(telegramId);
    console.log(result);
    process.exit(0);
  }
}

main().catch(e => { console.error('[portfolio]', e.message); process.exit(1); });
module.exports = { getPortfolio, formatPortfolio };
