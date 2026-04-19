/**
 * Economic Reality Profile (ERP) repository.
 *
 * The ERP holds the durable economic context of a user. It is loaded once
 * per session by the intelligence layer (erp-loader.ts) and injected into
 * the system prompt ahead of the live UFM.
 *
 * Writes go through the service-role client (RLS bypass). End-user reads
 * are governed by the erp_select_own RLS policy in migration 005.
 */

import { getSupabase } from '../supabase.js';
import type {
  EconomicRealityProfile,
  EconomicRealityProfileInput,
} from '@intend/core';

const TABLE = 'economic_reality_profile';

/** Fetch the ERP for a given user. Returns null when none exists yet. */
export async function getERP(userId: string): Promise<EconomicRealityProfile | null> {
  const { data, error } = await getSupabase()
    .from(TABLE)
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[erp] getERP: ${error.message}`);
  }
  return data as EconomicRealityProfile;
}

/**
 * Upsert an ERP row. Pass any subset of fields — defaults from migration 005
 * fill the rest on insert. On update only the provided fields change.
 */
export async function upsertERP(
  userId: string,
  partial: EconomicRealityProfileInput,
): Promise<EconomicRealityProfile> {
  const payload = {
    user_id: userId,
    ...partial,
    last_seeded_at: partial.last_seeded_at ?? new Date().toISOString(),
  };

  const { data, error } = await getSupabase()
    .from(TABLE)
    .upsert(payload, { onConflict: 'user_id' })
    .select('*')
    .single();

  if (error) throw new Error(`[erp] upsertERP: ${error.message}`);
  return data as EconomicRealityProfile;
}

/**
 * Seed an ERP row from onboarding answers. Marks seed_source = 'onboarding'
 * so we can distinguish hand-collected profiles from inferred backfills.
 */
export async function seedERPFromOnboarding(
  userId: string,
  answers: Omit<EconomicRealityProfileInput, 'seed_source'>,
): Promise<EconomicRealityProfile> {
  return upsertERP(userId, {
    ...answers,
    seed_source: 'onboarding',
    last_seeded_at: new Date().toISOString(),
  });
}

/**
 * Mark an ERP row as freshly enriched (called by background enrichment jobs
 * that update inflation_context_pct or risk levels from external signals).
 */
export async function markERPEnriched(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from(TABLE)
    .update({ last_enriched_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw new Error(`[erp] markERPEnriched: ${error.message}`);
}

/**
 * Delete an ERP row. Used only by tests and admin tooling — production
 * deletes cascade automatically when the user row is removed.
 */
export async function deleteERP(userId: string): Promise<void> {
  const { error } = await getSupabase().from(TABLE).delete().eq('user_id', userId);
  if (error) throw new Error(`[erp] deleteERP: ${error.message}`);
}
