import { getSupabase } from '../supabase.js';

export interface ClaimRow {
  claim_id:          string;
  sender_id:         string;
  intent_id:         string;
  amount:            string;
  asset:             string;
  source_chain:      string;
  escrow_tx_hash:    string | null;
  escrow_address:    string | null;
  recipient_contact: string;
  recipient_channel: string | null;
  sender_note:       string | null;
  claim_token:       string;
  claim_url:         string | null;
  status:            'pending' | 'claimed' | 'expired' | 'returned';
  claimed_by:        string | null;
  delivery_method:   string | null;
  delivery_address:  string | null;
  delivery_tx_hash:  string | null;
  expires_at:        string;
  created_at:        string;
  claimed_at:        string | null;
  returned_at:       string | null;
  return_tx_hash:    string | null;
}

/** Fetch a claim by its public token. Returns null if not found. */
export async function getClaimByToken(token: string): Promise<ClaimRow | null> {
  const { data, error } = await getSupabase()
    .from('claims')
    .select('*')
    .eq('claim_token', token)
    .single();

  if (error || !data) return null;
  return data as ClaimRow;
}

/** Mark a claim as claimed and record the delivery method. */
export async function markClaimClaimed(
  claimId: string,
  deliveryMethod: string,
  deliveryAddress: string,
  claimedBy?: string,
): Promise<boolean> {
  const update: Record<string, unknown> = {
    status:           'claimed',
    delivery_method:  deliveryMethod,
    delivery_address: deliveryAddress,
    claimed_at:       new Date().toISOString(),
  };
  if (claimedBy) update.claimed_by = claimedBy;

  const { error } = await getSupabase()
    .from('claims')
    .update(update)
    .eq('claim_id', claimId)
    .eq('status', 'pending'); // guard against double-claim

  return !error;
}
