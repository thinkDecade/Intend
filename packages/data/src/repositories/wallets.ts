import { getSupabase } from '../supabase.js';

export interface WalletRow {
  wallet_id:    string;
  user_id:      string;
  chain:        string;
  address:      string;
  provider:     string;
  is_primary:   boolean;
  created_at:   string;
}

/**
 * Return the primary wallet for a user on a given chain.
 * Returns null if the user hasn't had a wallet provisioned yet.
 */
export async function getUserPrimaryWallet(
  userId: string,
  chain: 'base_sepolia' | 'base' = 'base_sepolia',
): Promise<WalletRow | null> {
  const { data, error } = await getSupabase()
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('chain', chain)
    .eq('is_primary', true)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`[wallets] getUserPrimaryWallet: ${error.message}`);
  }
  return data as WalletRow;
}

/**
 * Return all wallets for a user across chains.
 */
export async function getAllWalletsForUser(userId: string): Promise<WalletRow[]> {
  const { data, error } = await getSupabase()
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`[wallets] getAllWalletsForUser: ${error.message}`);
  return (data ?? []) as WalletRow[];
}
