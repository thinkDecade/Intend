const { Pool } = require('pg');

const pool = new Pool({
  user: 'intend_user',
  host: 'localhost',
  database: 'intend',
  password: 'intend_secure_2026',
  port: 5432,
});

// Get or create user by telegram ID
async function getOrCreateUser(telegramId, firstName) {
  const existing = await pool.query(
    'SELECT * FROM users WHERE telegram_id = $1', [telegramId]
  );
  if (existing.rows.length > 0) return existing.rows[0];

  const created = await pool.query(
    `INSERT INTO users (telegram_id, first_name, region) 
     VALUES ($1, $2, $3) RETURNING *`,
    [telegramId, firstName || null, 'GH']
  );
  return created.rows[0];
}

// Save wallet to user
async function saveWallet(telegramId, address, mnemonic) {
  await pool.query(
    `UPDATE users SET wallet_address = $1, wallet_mnemonic = $2 WHERE telegram_id = $3`,
    [address, mnemonic, telegramId]
  );
}

// Get user wallet
async function getWallet(telegramId) {
  const res = await pool.query(
    'SELECT wallet_address, wallet_mnemonic FROM users WHERE telegram_id = $1',
    [telegramId]
  );
  return res.rows[0] || null;
}

// Save OTC order
async function saveOrder(order) {
  await pool.query(
    `INSERT INTO orders (order_id, telegram_id, type, amount_usd, wallet_address, momo_number, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (order_id) DO UPDATE SET
       status = $7, amount_ghs = $8, rate = $9, completed_at = $10`,
    [order.orderId, order.userId, order.type, order.amountUsd,
     order.walletAddress, order.momoNumber || null, order.status,
     order.amountGhs || null, order.rate || null,
     order.status === 'complete' ? new Date() : null]
  );
}

// Get user portfolio summary
async function getPortfolio(telegramId) {
  const user = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  const positions = await pool.query(
    `SELECT * FROM positions WHERE user_id = (SELECT id FROM users WHERE telegram_id = $1) AND status = 'active'`,
    [telegramId]
  );
  const orders = await pool.query(
    `SELECT * FROM orders WHERE telegram_id = $1 AND status NOT IN ('complete', 'cancelled') ORDER BY created_at DESC LIMIT 5`,
    [telegramId]
  );
  return {
    user: user.rows[0] || null,
    positions: positions.rows,
    activeOrders: orders.rows
  };
}

module.exports = { getOrCreateUser, saveWallet, getWallet, saveOrder, getPortfolio, pool };
