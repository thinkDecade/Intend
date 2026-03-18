#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { ethers } = require('ethers');
const db = require('./db');

const WALLETS_DIR = path.join(process.env.HOME, 'intend/wallets');
if (!fs.existsSync(WALLETS_DIR)) fs.mkdirSync(WALLETS_DIR, { recursive: true });

const CANDIDE_BUNDLER = 'https://api.candide.dev/public/v3/arbitrum';
const CANDIDE_PAYMASTER = 'https://api.candide.dev/public/v3/arbitrum';
const PAYMASTER_ADDRESS = '0x8b1f6cb5d062aa2ce8d581942bbb960420d875ba';
const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032';
const USDT_ARBITRUM = '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9';
const ARB_RPC = 'https://arb1.arbitrum.io/rpc';

async function createAAWallet(telegramId, firstName) {
  try {
    const WDKModule = require('@tetherto/wdk');
  const WDK = WDKModule.default || WDKModule;
    const WalletManagerEvmErc4337Module = require('@tetherto/wdk-wallet-evm-erc-4337');
    const WalletManagerEvmErc4337 = WalletManagerEvmErc4337Module.default || WalletManagerEvmErc4337Module;
    const bip39 = require('bip39');

    const mnemonic = bip39.generateMnemonic();
    const wdk = new WDK(mnemonic)
      .registerWallet('arbitrum', WalletManagerEvmErc4337, {
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
    const address = await account.getAddress();
    account.dispose();

    return { address, mnemonic };
  } catch (e) {
    // Fallback to ethers if WDK AA not available
    console.error('[wallet] AA failed, using ethers fallback:', e.message);
    const wallet = ethers.Wallet.createRandom();
    return { address: wallet.address, mnemonic: wallet.mnemonic.phrase };
  }
}

async function getOrCreateWallet(telegramId, firstName) {
  // Check DB first
  const existing = await db.getWallet(telegramId);
  if (existing && existing.wallet_address) {
    return { address: existing.wallet_address, isNew: false };
  }

  // Create new AA wallet
  const { address, mnemonic } = await createAAWallet(telegramId, firstName);

  // Save to DB (encrypted in production — plaintext for MVP)
  await db.saveWallet(telegramId, address, mnemonic);

  // Backup to file
  const walletFile = path.join(WALLETS_DIR, `${telegramId}.json`);
  fs.writeFileSync(walletFile, JSON.stringify({
    telegramId, address,
    mnemonic, // never expose this to user
    createdAt: new Date().toISOString(),
    type: 'erc4337',
    network: 'arbitrum'
  }, null, 2));
  fs.chmodSync(walletFile, 0o600);

  return { address, mnemonic, isNew: true };
}

async function main() {
  const cmd = process.argv[2];
  const telegramId = process.argv[3];
  const firstName = process.argv[4];

  if (cmd === 'get') {
    const wallet = await db.getWallet(telegramId);
    if (wallet && wallet.wallet_address) {
      console.log(JSON.stringify({ address: wallet.wallet_address, exists: true }));
    } else {
      console.log(JSON.stringify({ exists: false }));
    }
    process.exit(0);
  }

  if (cmd === 'create') {
    await db.getOrCreateUser(telegramId, firstName);
    const wallet = await getOrCreateWallet(telegramId, firstName);
    console.log(JSON.stringify({ address: wallet.address, isNew: wallet.isNew }));
    process.exit(0);
  }
}

main().catch(e => { console.error('[wallet-manager]', e.message); process.exit(1); });
module.exports = { getOrCreateWallet };
