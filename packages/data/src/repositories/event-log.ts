/**
 * event_log — append-only audit trail.
 * NEVER UPDATE or DELETE rows in this table (DB trigger enforces this).
 * INSERT only.
 */
import { getSupabase } from '../supabase.js';

export type EventType =
  | 'intent_created'    | 'intent_clarified' | 'intent_confirmed'
  | 'intent_cancelled'  | 'intent_parked'    | 'intent_resumed'
  | 'execution_started' | 'execution_step_complete' | 'execution_step_failed'
  | 'execution_complete'| 'execution_rolled_back'
  | 'position_opened'   | 'position_updated' | 'position_closed'
  | 'user_created'      | 'wallet_created'   | 'channel_linked'
  | 'kyc_updated'       | 'automation_level_changed' | 'execution_mode_changed'
  | 'inbound_detected'  | 'claim_created'    | 'claim_claimed'
  | 'claim_expired'     | 'claim_returned'   | 'fee_charged'
  | 'hedge_score_updated'| 'protect_alert_triggered'
  | 'confirmation_sent' | 'reminder_sent'    | 'plan_expired'
  | 'model_fallback_used'
  | 'x402_payment_sent' | 'x402_payment_received';

export interface EventLogInsert {
  user_id: string;
  event_type: EventType;
  source: 'telegram' | 'whatsapp' | 'web' | 'system';
  event_data: Record<string, unknown>;
  intent_id?: string;
}

export async function logEvent(entry: EventLogInsert): Promise<void> {
  const { error } = await getSupabase()
    .from('event_log')
    .insert({
      user_id:    entry.user_id,
      event_type: entry.event_type,
      source:     entry.source,
      event_data: entry.event_data,
      intent_id:  entry.intent_id ?? null,
    });

  if (error) throw new Error(`[event-log] logEvent: ${error.message}`);
}
