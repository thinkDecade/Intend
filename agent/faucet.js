#!/usr/bin/env node
/**
 * Intend Sandbox Faucet
 * Auto-credits new users with test tokens on testnet
 * Usage: node faucet.js <telegramId> <walletAddress>
 */
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const TESTNET_CONFIG = JSON.parse(fs.readFileSync(path.join(__dirname, 'testnet-config.json')));

const FAUCET_AMOUNTS = {
  iUSDT: 1000,  // 1,000 test USDT
  iXAUT: 1,     // 1 test gold (= ~$2,600 value simulation)
};

const NETWORKS = {
  'ethereum-sepolia': {
    rpc: 'https://ethereum-sepolia-rpc.publicnode.com',
    name: 'Ethereum Sepolia'
  },
  'arbitrum-sepolia': {
    rpc: 'https://sepolia-rollup.arbitrum.io/rpc',
    name: 'Arbitrum Sepolia'
  }
};

const ERC20_ABI = [
  'function mint(address to, uint256 amount) public',
  'function balanceOf(address) view returns (uint256)'
];

async function fundWallet(recipientAddress, deployerPrivKey) {
  const results = [];

  for (const [network, config] of Object.entries(TESTNET_CONFIG)) {
    const net = NETWORKS[network];
    if (!net) continue;

    const provider = new ethers.JsonRpcProvider(net.rpc);
    const deployer = new ethers.Wallet(deployerPrivKey, provider);

    // Mint iUSDT
    if (config.iUSDT) {
      try {
        const token = new ethers.Contract(config.iUSDT, ERC20_ABI, deployer);
        const amount = BigInt(FAUCET_AMOUNTS.iUSDT) * 1_000_000n;
        const tx = await token.mint(recipientAddress, amount);
        await tx.wait();
        results.push({ network, token: 'iUSDT', amount: FAUCET_AMOUNTS.iUSDT, tx: tx.hash });
        console.log(`✅ Minted ${FAUCET_AMOUNTS.iUSDT} iUSDT on ${net.name}: ${tx.hash}`);
      } catch(e) { console.error(`iUSDT mint failed on ${network}:`, e.message); }
    }

    // Mint iXAUT
    if (config.iXAUT) {
      try {
        const token = new ethers.Contract(config.iXAUT, ERC20_ABI, deployer);
        const amount = BigInt(FAUCET_AMOUNTS.iXAUT) * 1_000_000n;
        const tx = await token.mint(recipientAddress, amount);
        await tx.wait();
        results.push({ network, token: 'iXAUT', amount: FAUCET_AMOUNTS.iXAUT, tx: tx.hash });
        console.log(`✅ Minted ${FAUCET_AMOUNTS.iXAUT} iXAUT on ${net.name}: ${tx.hash}`);
      } catch(e) { console.error(`iXAUT mint failed on ${network}:`, e.message); }
    }
  }

  return results;
}

const [,, recipientAddress, deployerKey] = process.argv;
if (!recipientAddress || !deployerKey) {
  console.error('Usage: node faucet.js <walletAddress> <deployerPrivKey>');
  process.exit(1);
}

fundWallet(recipientAddress, deployerKey)
  .then(results => {
    console.log('\nFaucet complete:', JSON.stringify(results, null, 2));
    process.exit(0);
  })
  .catch(e => { console.error('Faucet failed:', e.message); process.exit(1); });
