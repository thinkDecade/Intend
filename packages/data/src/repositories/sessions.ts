import { getSupabase } from '../supabase.js';
import type { ExecutionPlan } from '@intend/core';

// ── Types ──────────────────────────────────────────────────────────────────

export type ChannelType = 'telegram' | 'whatsapp' | 'web';

export type ConversationState =
  | 'idle'
  | 'clarifying'
  | 'confirming'
  | 'executing'
  | 'conflict'
  | 'parallel';

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface SessionRow {
  session_id: string;
  user_id: string;
  channel: ChannelType;
  state: ConversationState;

  // CLARIFYING state
  pending_intent_id: string | null;
  missing_field: string | null;
  clarification_q: string | null;
  clarified_at: string | null;

  // CONFIRMING state
  pending_plan: ExecutionPlan | null;
  plan_expires_at: string | null;
  reminders_sent: number;
  last_reminder_at: string | null;

  // CONFLICT state
  parked_intent_id: string | null;
  new_message_held: string | null;

  // Parallel lanes
  active_lane_ids: string[];

  // Conversation history
  history: HistoryEntry[];

  last_active: string;
  created_at: string;
}

export type SessionUpsert = Omit<SessionRow, 'session_id' | 'created_at' | 'last_active'> & {
  last_active?: string;
};

// ── Repository functions ───────────────────────────────────────────────────

/**
 * Load a session record for a given user + channel.
 * Returns null if no record exists (new user or first message on this channel).
 */
export async function getSessionRecord(
  userId: string,
  channel: ChannelType,
): Promise<SessionRow | null> {
  const { data, error } = await getSupabase()
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('channel', channel)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`[sessions] getSessionRecord: ${error.message}`);
  }
  return data as SessionRow;
}

/**
 * Upsert a session record. Conflicts on (user_id, channel) — updates all fields.
 * Always sets last_active to NOW().
 */
export async function upsertSessionRecord(payload: SessionUpsert): Promise<void> {
  const { error } = await getSupabase()
    .from('sessions')
    .upsert(
      {
        ...payload,
        last_active: new Date().toISOString(),
      },
      { onConflict: 'user_id,channel' },
    );

  if (error) throw new Error(`[sessions] upsertSessionRecord: ${error.message}`);
}

/**
 * Get all active sessions for a user across channels.
 * Used for cross-channel state handoff (e.g. Telegram → WebApp).
 */
export async function getAllUserSessions(userId: string): Promise<SessionRow[]> {
  const { data, error } = await getSupabase()
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('last_active', { ascending: false });

  if (error) throw new Error(`[sessions] getAllUserSessions: ${error.message}`);
  return (data ?? []) as SessionRow[];
}

/**
 * Find the most recent non-idle session for a user, across any channel.
 * Used when a user switches channels mid-conversation.
 */
export async function getMostRecentActiveSession(userId: string): Promise<SessionRow | null> {
  const { data, error } = await getSupabase()
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .neq('state', 'idle')
    .order('last_active', { ascending: false })
    .limit(1)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[sessions] getMostRecentActiveSession: ${error.message}`);
  }
  return data as SessionRow;
}

/**
 * Clear the pending plan on a session (after confirmation or cancellation).
 */
export async function clearSessionPlan(userId: string, channel: ChannelType): Promise<void> {
  const { error } = await getSupabase()
    .from('sessions')
    .update({
      pending_plan: null,
      plan_expires_at: null,
      state: 'idle',
      last_active: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('channel', channel);

  if (error) throw new Error(`[sessions] clearSessionPlan: ${error.message}`);
}

/**
 * Reset a session to idle state. Clears all transient fields.
 */
export async function resetSession(userId: string, channel: ChannelType): Promise<void> {
  const { error } = await getSupabase()
    .from('sessions')
    .update({
      state: 'idle',
      pending_intent_id: null,
      missing_field: null,
      clarification_q: null,
      clarified_at: null,
      pending_plan: null,
      plan_expires_at: null,
      parked_intent_id: null,
      new_message_held: null,
      active_lane_ids: [],
      last_active: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('channel', channel);

  if (error) throw new Error(`[sessions] resetSession: ${error.message}`);
}
