import { getSupabase } from '../supabase.js';
import type { IntentionObject } from '@intend/core';

export type IntentStatus =
  | 'pending' | 'confirmed' | 'executing'
  | 'complete' | 'failed' | 'cancelled' | 'parked';

export interface IntentRow {
  intent_id: string;
  user_id: string;
  channel: 'telegram' | 'whatsapp' | 'web';
  primitive: string;
  raw_input: string;
  intention_object: IntentionObject;
  status: IntentStatus;
  rollback_state: Record<string, unknown> | null;
  tx_hash: string | null;
  created_at: string;
  confirmed_at: string | null;
  executed_at: string | null;
}

export async function createIntent(
  userId: string,
  channel: 'telegram' | 'whatsapp' | 'web',
  intention: IntentionObject,
): Promise<IntentRow> {
  const { data, error } = await getSupabase()
    .from('intents')
    .insert({
      user_id:           userId,
      channel,
      primitive:         intention.primitive,
      raw_input:         intention.raw_input,
      intention_object:  intention,
      intent_confidence: intention.intent_confidence,
      status:            'pending',
    })
    .select()
    .single();

  if (error) throw new Error(`[intents] createIntent: ${error.message}`);
  return data as IntentRow;
}

export async function updateIntentStatus(
  intentId: string,
  status: IntentStatus,
  extra?: { tx_hash?: string; rollback_state?: Record<string, unknown> },
): Promise<void> {
  const updates: Record<string, unknown> = { status };
  if (extra?.tx_hash)        updates['tx_hash']        = extra.tx_hash;
  if (extra?.rollback_state) updates['rollback_state'] = extra.rollback_state;
  if (status === 'confirmed') updates['confirmed_at'] = new Date().toISOString();
  if (status === 'complete')  updates['executed_at']  = new Date().toISOString();

  const { error } = await getSupabase()
    .from('intents')
    .update(updates)
    .eq('intent_id', intentId);

  if (error) throw new Error(`[intents] updateIntentStatus: ${error.message}`);
}

export async function getPendingConfirmations(userId: string): Promise<IntentRow[]> {
  const { data, error } = await getSupabase()
    .from('intents')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'confirmed'])
    .order('created_at', { ascending: false });

  if (error) throw new Error(`[intents] getPendingConfirmations: ${error.message}`);
  return (data ?? []) as IntentRow[];
}
