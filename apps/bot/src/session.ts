/**
 * Session Manager — Telegram channel
 *
 * Redis is primary (30-min TTL, fast reads).
 * Supabase sessions table is durable backup (survives Redis eviction, enables
 * cross-channel handoff when user switches to WhatsApp or WebApp).
 *
 * State machine: idle → clarifying → confirming → executing → idle
 *                     ↘ conflict ↗
 */

import { getRedis, getSessionRecord, upsertSessionRecord } from '@intend/data';
import type { ExecutionPlan } from '@intend/core';

export type SessionState = 'idle' | 'clarifying' | 'confirming' | 'executing' | 'conflict' | 'parallel';

export interface HistoryEntry {
  role: 'user' | 'assistant';
  content: string;
  ts: string;
}

export interface BotSession {
  user_id: string;
  state: SessionState;
  pending_plan: ExecutionPlan | null;
  parked_intent_id: string | null;
  new_message_held: string | null;
  history: HistoryEntry[];
  active_lane_ids: string[];
}

const SESSION_TTL = 1800; // 30 minutes in seconds
const MAX_HISTORY = 20;

function redisKey(telegramId: bigint): string {
  return `intend:session:telegram:${telegramId}`;
}

function emptySession(userId: string): BotSession {
  return {
    user_id:          userId,
    state:            'idle',
    pending_plan:     null,
    parked_intent_id: null,
    new_message_held: null,
    history:          [],
    active_lane_ids:  [],
  };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Load session for a Telegram user.
 * Checks Redis first (fast path). Falls back to Supabase (eviction recovery,
 * cross-channel restore). Returns a fresh empty session if neither has data.
 */
export async function getSession(telegramId: bigint, userId: string): Promise<BotSession> {
  const redis = getRedis();

  // Fast path: Redis
  const raw = await redis.get<string>(redisKey(telegramId));
  if (raw) {
    try {
      return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) as BotSession;
    } catch {
      // Corrupt entry — fall through
    }
  }

  // Fallback: Supabase durable record
  const record = await getSessionRecord(userId, 'telegram');
  if (record) {
    const session: BotSession = {
      user_id:          record.user_id,
      state:            record.state as SessionState,
      pending_plan:     record.pending_plan as ExecutionPlan | null,
      parked_intent_id: record.parked_intent_id,
      new_message_held: record.new_message_held,
      history:          record.history,
      active_lane_ids:  record.active_lane_ids,
    };
    // Warm Redis back up
    await redis.set(redisKey(telegramId), JSON.stringify(session), { ex: SESSION_TTL });
    return session;
  }

  return emptySession(userId);
}

/**
 * Persist session state.
 * Writes to Redis (primary) and Supabase (durable) in parallel.
 * History is capped at MAX_HISTORY entries before writing.
 */
export async function saveSession(telegramId: bigint, session: BotSession): Promise<void> {
  const redis = getRedis();

  if (session.history.length > MAX_HISTORY) {
    session.history = session.history.slice(-MAX_HISTORY);
  }

  await Promise.all([
    // Redis — fast primary
    redis.set(redisKey(telegramId), JSON.stringify(session), { ex: SESSION_TTL }),

    // Supabase — durable backup + cross-channel sync
    upsertSessionRecord({
      user_id:          session.user_id,
      channel:          'telegram',
      state:            session.state,
      pending_plan:     session.pending_plan ?? null,
      plan_expires_at:  null,
      reminders_sent:   0,
      last_reminder_at: null,
      pending_intent_id: null,
      missing_field:    null,
      clarification_q:  null,
      clarified_at:     null,
      parked_intent_id: session.parked_intent_id,
      new_message_held: session.new_message_held,
      active_lane_ids:  session.active_lane_ids,
      history:          session.history,
    }),
  ]);
}

/**
 * Append a message to conversation history (mutates session in-place).
 * Call saveSession() afterward to persist.
 */
export function addToHistory(
  session: BotSession,
  role: 'user' | 'assistant',
  content: string,
): void {
  session.history.push({ role, content, ts: new Date().toISOString() });
}
