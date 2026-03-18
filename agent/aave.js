#!/usr/bin/env node

const db = require('./db');

const ARB_RPC = 'https://arb1.arbitrum.io/rpc';
const USDT_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const CANDIDE_BUNDLER = 'https://api.candide.dev/public/v3/arbitrum';
const CANDIDE_PAYMASTER = 'https://api.candide.dev/public/v3/arbitrum';
const PAYMASTER_ADDRESS = '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba';
const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';

async function getWDKAccount(mnemonic) {
  const WDKModule = require('@tetherto/wdk');
  const WDK = WDKModule.default || WDKModule;
  const WalletManagerEvmErc4337Module = require('@tetherto/wdk-wallet-evm-erc-4337');
  const WalletManagerEvmErc4337 = WalletManagerEvmErc4337Module.default || WalletManagerEvmErc4337Module;
  const AaveProtocolEvmModule = require('@tetherto/wdk-protocol-lending-aave-evm');
  const AaveProtocolEvm = AaveProtocolEvmModule.default || AaveProtocolEvmModule;

  const wdk = new WDK(mnemonic);
  wdk.registerWallet('arbitrum', WalletManagerEvmErc4337, {
    provider: ARB_RPC,
    chainId: 42161,
    bundlerUrl: CANDIDE_BUNDLER,
    paymasterUrl: CANDIDE_PAYMASTER,
    paymasterAddress: PAYMASTER_ADDRESS,
    entrypointAddress: ENTRYPOINT_ADDRESS,
    paymasterToken: { address: USDT_ARBITRUM },
    transferMaxFee: 5000000
  });

  const account = await wdk.getAccount('arbitrum', 0);
  return { wdk, account, AaveProtocolEvm };
}

async function supplyAave(telegramId, amountUsdt) {
  const wallet = await db.getWallet(telegramId);
  if (!wallet || !wallet.wallet_mnemonic) throw new Error('No wallet found');
  const amountUnits = BigInt(Math.floor(amountUsdt * 1_000_000));
  const { account, AaveProtocolEvm } = await getWDKAccount(wallet.wallet_mnemonic);
  try {
    const aave = new AaveProtocolEvm(account);
    console.log('[aave] Supplying', amountUsdt, 'USDT to Aave V3 on Arbitrum...');
    const result = await aave.supply({ token: USDT_ARBITRUM, amount: amountUnits });
    await db.pool.query(
      'INSERT INTO positions (user_id, protocol, chain, asset, amount, apy, status, objective) VALUES ((SELECT id FROM users WHERE telegram_id = $1), $2, $3, $4, $5, $6, $7, $8)',
      [telegramId, 'Aave V3', 'Arbitrum', 'USDT', amountUsdt, 1.55, 'active', 'YIELD']
    );
    return { success: true, txHash: result.hash || result.txHash || 'pending', amount: amountUsdt };
  } finally {
    account.dispose();
  }
}

async function withdrawAave(telegramId, amountUsdt) {
  const wallet = await db.getWallet(telegramId);
  if (!wallet || !wallet.wallet_mnemonic) throw new Error('No wallet found');
  const amountUnits = BigInt(Math.floor(amountUsdt * 1_000_000));
  const { account, AaveProtocolEvm } = await getWDKAccount(wallet.wallet_mnemonic);
  try {
    const aave = new AaveProtocolEvm(account);
    const result = await aave.withdraw({ token: USDT_ARBITRUM, amount: amountUnits });
    await db.pool.query(
      'UPDATE positions SET status = $1 WHERE user_id = (SELECT id FROM users WHERE telegram_id = $2) AND protocol = $3 AND status = $4',
      ['closed', telegramId, 'Aave V3', 'active']
    );
    return { success: true, txHash: result.hash || result.txHash, amount: amountUsdt };
  } finally {
    account.dispose();
  }
}

async function getStatus(telegramId) {
  const wallet = await db.getWallet(telegramId);
  if (!wallet || !wallet.wallet_mnemonic) throw new Error('No wallet found');
  const { account, AaveProtocolEvm } = await getWDKAccount(wallet.wallet_mnemonic);
  try {
    const aave = new AaveProtocolEvm(account);
    const data = await aave.getAccountData();
    // Convert BigInt values to strings for serialization
    return JSON.parse(JSON.stringify(data, (_, v) => typeof v === 'bigint' ? v.toString() : v));
  } finally {
    account.dispose();
  }
}

async function main() {
  const cmd = process.argv[2];
  const telegramId = process.argv[3];
  const amount = parseFloat(process.argv[4]);

  if (cmd === 'supply') {
    const result = await supplyAave(telegramId, amount);
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  if (cmd === 'withdraw') {
    const result = await withdrawAave(telegramId, amount);
    console.log(JSON.stringify(result));
    process.exit(0);
  }
  if (cmd === 'status') {
    const data = await getStatus(telegramId);
    console.log(JSON.stringify(data));
    process.exit(0);
  }
}

main().catch(e => { console.error('[aave]', e.message); process.exit(1); });
module.exports = { supplyAave, withdrawAave, getStatus };
