#!/usr/bin/env node
/**
 * Intend MoonPay Integration
 * Generates hosted widget URLs for onramp (buy) and offramp (sell)
 * In sandbox: demonstrates the flow with MoonPay test environment
 * In production: real fiat <-> USDT conversions
 *
 * Usage:
 *   node moonpay.js onramp <userId> <amount>
 *   node moonpay.js offramp <userId> <amount>
 *   node moonpay.js quote <direction> <amount>
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TESTNET = process.env.INTEND_TESTNET === 'true';
const MOONPAY_API_KEY = process.env.MOONPAY_API_KEY || 'pk_test_oJtMwMWCRELGFhHpZWCBa3MiHLRPxWG';
const MOONPAY_SECRET_KEY = process.env.MOONPAY_SECRET_KEY || '';
const WALLET_DIR = path.join(process.env.HOME || '/home/thinkdecade', '.openclaw/workspace/wallets');

// MoonPay base URLs
const MOONPAY_BASE = TESTNET
  ? 'https://buy-staging.moonpay.com'
  : 'https://buy.moonpay.com';
const MOONPAY_SELL_BASE = TESTNET
  ? 'https://sell-staging.moonpay.com'
  : 'https://sell.moonpay.com';
const MOONPAY_API = 'https://api.moonpay.com';

function getWalletAddress(userId) {
  const walletPath = path.join(WALLET_DIR, `${userId}.json`);
  if (!fs.existsSync(walletPath)) throw new Error('Wallet not found for user ' + userId);
  const data = JSON.parse(fs.readFileSync(walletPath));
  return data.evmAddress || data.wallet_address;
}

function signMoonPayUrl(url) {
  if (!MOONPAY_SECRET_KEY) return url;
  const urlObj = new URL(url);
  const signature = crypto
    .createHmac('sha256', MOONPAY_SECRET_KEY)
    .update(urlObj.search)
    .digest('base64');
  return `${url}&signature=${encodeURIComponent(signature)}`;
}

function generateOnrampUrl(walletAddress, amount, currency = 'usd') {
  const params = new URLSearchParams({
    apiKey: MOONPAY_API_KEY,
    currencyCode: 'usdt_arbitrum',   // USDT on Arbitrum
    walletAddress,
    baseCurrencyAmount: amount,
    baseCurrencyCode: currency,
    colorCode: '%230a0a0a',
    language: 'en',
    showWalletAddressForm: 'false',
  });

  const url = `${MOONPAY_BASE}?${params.toString()}`;
  return MOONPAY_SECRET_KEY ? signMoonPayUrl(url) : url;
}

function generateOfframpUrl(walletAddress, amount) {
  const params = new URLSearchParams({
    apiKey: MOONPAY_API_KEY,
    baseCurrencyCode: 'usdt_arbitrum',
    baseCurrencyAmount: amount,
    walletAddress,
    language: 'en',
  });

  const url = `${MOONPAY_SELL_BASE}?${params.toString()}`;
  return MOONPAY_SECRET_KEY ? signMoonPayUrl(url) : url;
}

async function getQuote(direction, amount, currency = 'usd') {
  try {
    const endpoint = direction === 'buy'
      ? `${MOONPAY_API}/v3/currencies/usdt_arbitrum/buy_quote?apiKey=${MOONPAY_API_KEY}&baseCurrencyAmount=${amount}&baseCurrencyCode=${currency}&fixed=false`
      : `${MOONPAY_API}/v3/currencies/usdt_arbitrum/sell_quote?apiKey=${MOONPAY_API_KEY}&baseCurrencyAmount=${amount}&fixed=false`;

    const https = require('https');
    return new Promise((resolve, reject) => {
      https.get(endpoint, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          try { resolve(JSON.parse(data)); }
          catch(e) { resolve(null); }
        });
      }).on('error', reject);
    });
  } catch(e) {
    return null;
  }
}

async function main() {
  const [,, command, userId, amount] = process.argv;

  try {
    if (command === 'onramp') {
      const address = getWalletAddress(userId);
      const url = generateOnrampUrl(address, amount || '50');
      const quote = await getQuote('buy', amount || '50');

      const result = {
        success: true,
        type: 'onramp',
        url,
        walletAddress: address,
        amount: amount || '50',
        estimatedUsdt: quote?.quoteCurrencyAmount?.toFixed(2) || null,
        fee: quote?.feeAmount?.toFixed(2) || null,
        network: TESTNET ? 'Arbitrum Sepolia (sandbox)' : 'Arbitrum',
        message: buildOnrampMessage(address, amount || '50', quote, url),
      };
      console.log(JSON.stringify(result));

    } else if (command === 'offramp') {
      const address = getWalletAddress(userId);
      const url = generateOfframpUrl(address, amount || '50');
      const quote = await getQuote('sell', amount || '50');

      const result = {
        success: true,
        type: 'offramp',
        url,
        walletAddress: address,
        amount: amount || '50',
        estimatedFiat: quote?.quoteCurrencyAmount?.toFixed(2) || null,
        fee: quote?.feeAmount?.toFixed(2) || null,
        message: buildOfframpMessage(amount || '50', quote, url),
      };
      console.log(JSON.stringify(result));

    } else if (command === 'quote') {
      const direction = userId; // argv[3] is direction here
      const quote = await getQuote(direction, amount || '50');
      console.log(JSON.stringify({ success: true, quote }));

    } else {
      console.log(JSON.stringify({ success: false, message: 'Unknown command: ' + command }));
    }
  } catch(e) {
    console.log(JSON.stringify({ success: false, message: e.message }));
  }
}

function buildOnrampMessage(address, amount, quote, url) {
  const usdt = quote?.quoteCurrencyAmount?.toFixed(2);
  const fee = quote?.feeAmount?.toFixed(2);
  const network = TESTNET ? 'Arbitrum Sepolia' : 'Arbitrum';

  let msg = `💳 *MoonPay Onramp*\n\n`;
  msg += `Buy USDT with your card or bank.\n\n`;
  if (usdt) msg += `$${amount} USD → ~${usdt} USDT\n`;
  if (fee) msg += `Fee: ~$${fee}\n`;
  msg += `\nNetwork: ${network}\n`;
  msg += `Destination: \`${address}\`\n\n`;
  msg += `[Complete purchase via MoonPay →](${url})\n\n`;
  msg += `_USDT will arrive in your Intend wallet within minutes of payment._`;
  return msg;
}

function buildOfframpMessage(amount, quote, url) {
  const fiat = quote?.quoteCurrencyAmount?.toFixed(2);
  const fee = quote?.feeAmount?.toFixed(2);

  let msg = `💸 *MoonPay Offramp*\n\n`;
  msg += `Sell USDT for cash, direct to your bank or card.\n\n`;
  if (fiat) msg += `${amount} USDT → ~$${fiat} USD\n`;
  if (fee) msg += `Fee: ~$${fee}\n`;
  msg += `\n[Sell via MoonPay →](${url})\n\n`;
  msg += `_Funds arrive to your bank within 1-3 business days._`;
  return msg;
}

main();
