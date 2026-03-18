/**
 * INTEND EXECUTION ENGINE v2.1
 * Handles HEDGE, YIELD, TRANSFER via Tether WDK.
 * Called by bot.js when user taps [ Activate ].
 */

const { Pool } = require('pg');
const fs       = require('fs');
const path     = require('path');
const cfg      = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const db = new Pool({
  host:     cfg.DB_HOST     || 'localhost',
  port:     5432,
  database: cfg.DB_NAME     || 'intend',
  user:     cfg.DB_USER     || 'intend_user',
  password: cfg.DB_PASSWORD || 'intend_pass_2026',
});

async function logEvent(userId, type, payload) {
  try {
    await db.query(
      'INSERT INTO events (user_id, type, payload) VALUES ($1, $2, $3)',
      [userId, type, JSON.stringify(payload)]
    );
  } catch(e) { console.error('[executor] logEvent failed:', e.message); }
}

async function updateIntention(intentionId, status, txHash = null) {
  try {
    await db.query(
      `UPDATE intentions SET status=$1, tx_hash=$2, completed_at=NOW() WHERE id=$3`,
      [status, txHash, intentionId]
    );
  } catch(e) { console.error('[executor] updateIntention failed:', e.message); }
}

async function savePosition(userId, objective, asset, amount, protocol, chain, apy = null) {
  try {
    const r = await db.query(
      `INSERT INTO positions (user_id, objective, asset, amount, protocol, chain, apy_at_entry, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'active') RETURNING id`,
      [userId, objective, asset, amount, protocol, chain, apy]
    );
    return r.rows[0]?.id;
  } catch(e) { console.error('[executor] savePosition failed:', e.message); return null; }
}

async function execute(userId, intentionId, action, openclaw) {
  console.log(`[executor] ${action.type} for user ${userId}`);
  await updateIntention(intentionId, 'executing');

  try {
    let result;

    switch (action.type) {

      // ── HEDGE — Protect purchasing power
      case 'hedge': {
        const { mode = 'protect', amount, fromAsset = 'USDT', chain = 'base', apy, safeChain = 'celo' } = action;

        if (mode === 'exit') {
          // Emergency: withdraw all YIELD positions to USDT
          const positions = await db.query(
            `SELECT * FROM positions WHERE user_id=$1 AND status='active' AND objective='YIELD'`,
            [userId]
          );
          let totalWithdrawn = 0;
          const txHashes = [];
          for (const pos of positions.rows) {
            result = await openclaw.skill('wdk-agent-skills', 'aave_withdraw', {
              asset: pos.asset, amount: String(pos.amount), chain: pos.chain,
            });
            if (result?.success) {
              totalWithdrawn += pos.amount;
              txHashes.push(result?.tx_hash || 'pending');
              await db.query(`UPDATE positions SET status='hedged' WHERE id=$1`, [pos.id]);
            }
          }
          if (totalWithdrawn > 0) {
            result = await openclaw.skill('wdk-agent-skills', 'usdt0_bridge', {
              from_chain: 'base', to_chain: safeChain, amount: String(totalWithdrawn),
            });
            if (result?.success) txHashes.push(result?.tx_hash || 'pending');
          }
          await updateIntention(intentionId, 'complete', txHashes[0] || 'pending');
          await logEvent(userId, 'hedge_exit', { totalWithdrawn, safeChain, txHashes });
          return {
            success: true,
            message: `✅ HEDGE complete. ${totalWithdrawn} USDT withdrawn to safety on ${safeChain}.`,
            txHash: txHashes[0] || 'pending', fee: '~$0.05',
          };

        } else {
          // Protect mode: swap to USDT if needed, then deploy to yield
          if (fromAsset !== 'USDT') {
            result = await openclaw.skill('wdk-agent-skills', 'velora_swap', {
              from_token: fromAsset, to_token: 'USDT', amount: String(amount), chain,
            });
            if (!result?.success) throw new Error(`Swap failed: ${result?.error}`);
          }
          if (apy && amount) {
            result = await openclaw.skill('wdk-agent-skills', 'aave_deposit', {
              asset: 'USDT', amount: String(amount), chain,
            });
            if (!result?.success) throw new Error(`Deposit failed: ${result?.error}`);
          }
          const txHash = result?.tx_hash || result?.txHash || 'pending';
          await savePosition(userId, 'HEDGE', 'USDT', amount, 'aave-v3', chain, apy);
          await updateIntention(intentionId, 'complete', txHash);
          await logEvent(userId, 'hedge_protect', { amount, chain, apy, txHash });
          return {
            success: true,
            message: `✅ HEDGE active. ${amount} USDT protected${apy ? ` at ${apy}% APY` : ''}.`,
            txHash, fee: result?.fee || '~$0.02',
          };
        }
      }

      // ── YIELD — Deploy idle capital
      case 'yield': {
        const { amount, protocol = 'aave-v3', chain = 'base', apy } = action;
        result = await openclaw.skill('wdk-agent-skills', 'aave_deposit', {
          asset: 'USDT', amount: String(amount), chain,
        });
        if (!result?.success) throw new Error(`Deposit failed: ${result?.error}`);
        const txHash = result?.tx_hash || result?.txHash || 'pending';
        await savePosition(userId, 'YIELD', 'USDT', amount, protocol, chain, apy);
        await updateIntention(intentionId, 'complete', txHash);
        await logEvent(userId, 'yield_deployed', { amount, protocol, chain, apy, txHash });
        return {
          success: true,
          message: `✅ ${amount} USDT deployed at ${apy || '?'}% APY.`,
          txHash, fee: result?.fee || '~$0.02',
        };
      }

      // ── TRANSFER — Cross-border to local currency
      case 'transfer': {
        const { amount, recipientPhone, recipientCountry = 'NG', recipientBank } = action;
        // Bridge to Celo (only chain with Fonbnk)
        result = await openclaw.skill('wdk-agent-skills', 'usdt0_bridge', {
          from_chain: 'base', to_chain: 'celo', amount: String(amount),
        });
        if (!result?.success) throw new Error(`Bridge failed: ${result?.error}`);
        // Fonbnk offramp
        const fonbnkResult = await triggerFonbnkOfframp({
          amount, currency: COUNTRY_CURRENCY[recipientCountry] || 'NGN',
          phone: recipientPhone, bank: recipientBank,
        });
        const txHash = fonbnkResult?.orderId || result?.tx_hash || 'pending';
        await updateIntention(intentionId, 'complete', txHash);
        await logEvent(userId, 'transfer_executed', { amount, recipientCountry, recipientPhone, txHash });
        return {
          success: true,
          message: `✅ Transfer complete. ${fonbnkResult?.localAmount || amount + ' USDT'} delivered to ${recipientPhone}.`,
          txHash, fee: `~${(amount * 0.015).toFixed(2)} USDT`,
        };
      }

      // ── ONRAMP — Buy crypto via MoonPay
      case 'onramp': {
        const { amount, currency = 'USD' } = action;
        result = await openclaw.skill('wdk-agent-skills', 'moonpay_onramp', {
          fiat_amount: String(amount), fiat_currency: currency, crypto_currency: 'USDT',
        });
        if (!result?.success) throw new Error(`MoonPay failed: ${result?.error}`);
        const txHash = result?.tx_hash || 'pending';
        await updateIntention(intentionId, 'complete', txHash);
        await logEvent(userId, 'onramp_executed', { amount, currency, txHash });
        return {
          success: true,
          message: `✅ Onramp initiated. ${amount} ${currency} → USDT. Check your wallet in ~5 minutes.`,
          txHash, fee: `~${(amount * 0.025 + 3.99).toFixed(2)} ${currency}`,
          moonpayUrl: result?.url,
        };
      }

      default:
        throw new Error(`Unknown action type: ${action.type}`);
    }

  } catch(err) {
    console.error('[executor] Failed:', err.message);
    await updateIntention(intentionId, 'failed');
    await logEvent(userId, 'execution_failed', { action, error: err.message });
    return { success: false, message: `❌ Execution failed: ${err.message}` };
  }
}

const COUNTRY_CURRENCY = { NG:'NGN', KE:'KES', GH:'GHS', ZA:'ZAR' };

async function triggerFonbnkOfframp({ amount, currency, phone, bank }) {
  const FONBNK_API_KEY = cfg.FONBNK_API_KEY;
  if (!FONBNK_API_KEY) {
    const rates = { NGN:1660, KES:130, GHS:15.5, ZAR:19 };
    console.warn('[executor] FONBNK_API_KEY not set — mock mode');
    return {
      orderId: 'mock_' + Date.now(),
      localAmount: `${currency} ${Math.round(amount * (rates[currency]||1)).toLocaleString()}`,
      status: 'mock',
    };
  }
  const r = await fetch('https://api.fonbnk.com/v1/offramp/order', {
    method: 'POST',
    headers: { 'Content-Type':'application/json', 'Authorization':`Bearer ${FONBNK_API_KEY}` },
    body: JSON.stringify({ amount, currency, phone, bank: bank || null }),
  });
  if (!r.ok) throw new Error(`Fonbnk HTTP ${r.status}`);
  return await r.json();
}

module.exports = { execute, logEvent };
