import { getSupabase } from '../supabase.js';

export type PositionStatus = 'active' | 'withdrawing' | 'closed' | 'failed';

export interface PositionRow {
  position_id: string;
  user_id: string;
  intent_id: string | null;
  primitive: string;
  protocol: string;
  asset: string;
  chain: string;
  amount_deposited: number;
  amount_current: number;
  yield_earned: number;
  apy_at_entry: number | null;
  current_apy: number | null;
  protocol_address: string | null;
  protocol_position_id: string | null;
  receipt_token: string | null;
  goal_id: string | null;
  status: PositionStatus;
  opened_at: string;
  last_synced_at: string | null;
  closed_at: string | null;
  amount_withdrawn: number | null;
  close_tx_hash: string | null;
}

export async function getActivePositions(userId: string): Promise<PositionRow[]> {
  const { data, error } = await getSupabase()
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('opened_at', { ascending: false });

  if (error) throw new Error(`[positions] getActivePositions: ${error.message}`);
  return (data ?? []) as PositionRow[];
}

export async function insertPosition(
  position: Omit<PositionRow, 'position_id' | 'opened_at' | 'closed_at'>,
): Promise<PositionRow> {
  const { data, error } = await getSupabase()
    .from('positions')
    .insert(position)
    .select()
    .single();

  if (error) throw new Error(`[positions] insertPosition: ${error.message}`);
  return data as PositionRow;
}

export async function closePosition(positionId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('positions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('position_id', positionId);

  if (error) throw new Error(`[positions] closePosition: ${error.message}`);
}
