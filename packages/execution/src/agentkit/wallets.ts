/**
 * AgentKit CDP Wallet Management
 *
 * v0.5 scope: Base mainnet + Base Sepolia only. No other chains.
 *
 * Env vars (AgentKit 0.10.x naming):
 *   CDP_API_KEY_ID      — CDP API key identifier
 *   CDP_API_KEY_SECRET  — CDP API key secret
 *   CDP_WALLET_SECRET   — per-project wallet encryption secret
 *
 * Wallet lifecycle:
 *   1. New user → createWallet() → address stored in wallets table
 *   2. Returning user → loadWallet(address) → provider ready for signing
 *
 * Private keys never touch Intend's servers.
 * AgentKit CDP manages keys in Coinbase TEE.
 */

import { CdpEvmWalletProvider } from '@coinbase/agentkit';
import { getSupabase } from '@intend/data';

export type IntendNetwork = 'base' | 'base-sepolia';

export interface WalletInfo {
  address: string;
  network: IntendNetwork;
  wallet_id: string;     // Supabase wallets.wallet_id (UUID)
}

function requireEnv(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`[wallets] Missing required env var: ${name}`);
  return val;
}

function getCdpConfig(network: IntendNetwork, address?: string) {
  const rpcUrl = network === 'base-sepolia'
    ? process.env['BASE_SEPOLIA_RPC_URL']
    : process.env['BASE_RPC_URL'];

  return {
    apiKeyId:     requireEnv('CDP_API_KEY_ID'),
    apiKeySecret: requireEnv('CDP_API_KEY_SECRET'),
    walletSecret: requireEnv('CDP_WALLET_SECRET'),
    networkId:    network,
    ...(rpcUrl  ? { rpcUrl }                          : {}),
    ...(address ? { address: address as `0x${string}` } : {}),
  };
}

/**
 * Create a new CDP EVM wallet for a user on the given network.
 * Stores the address in the wallets table and returns the provider.
 */
export async function createWallet(
  userId: string,
  network: IntendNetwork = 'base-sepolia',
): Promise<{ provider: CdpEvmWalletProvider; info: WalletInfo }> {
  const provider = await CdpEvmWalletProvider.configureWithWallet(
    getCdpConfig(network)
  );

  const address = provider.getAddress();

  // Persist to wallets table
  const { data, error } = await getSupabase()
    .from('wallets')
    .insert({
      user_id:    userId,
      chain:      network === 'base-sepolia' ? 'base_sepolia' : 'base',
      address,
      provider:   'agentkit_cdp',
      cdp_wallet_id: address, // In 0.10.x, wallet identity = address
      is_primary: true,
    })
    .select('wallet_id')
    .single();

  if (error) throw new Error(`[wallets] Failed to persist wallet: ${error.message}`);

  const info: WalletInfo = {
    address,
    network,
    wallet_id: (data as { wallet_id: string }).wallet_id,
  };

  return { provider, info };
}

/**
 * Load an existing CDP wallet by address.
 * Used on every pipeline call for a returning user.
 */
export async function loadWallet(
  address: string,
  network: IntendNetwork = 'base-sepolia',
): Promise<CdpEvmWalletProvider> {
  return CdpEvmWalletProvider.configureWithWallet(
    getCdpConfig(network, address)
  );
}

/**
 * Get or create a wallet for a user. Returns the provider and stored info.
 * This is the main entry point for the pipeline.
 */
export async function getOrCreateWallet(
  userId: string,
  network: IntendNetwork = 'base-sepolia',
): Promise<{ provider: CdpEvmWalletProvider; info: WalletInfo }> {
  const chainEnum = network === 'base-sepolia' ? 'base_sepolia' : 'base';

  const { data } = await getSupabase()
    .from('wallets')
    .select('wallet_id, address')
    .eq('user_id', userId)
    .eq('chain', chainEnum)
    .eq('is_primary', true)
    .single();

  if (data) {
    const { wallet_id, address } = data as { wallet_id: string; address: string };
    const provider = await loadWallet(address, network);
    return { provider, info: { address, network, wallet_id } };
  }

  return createWallet(userId, network);
}
