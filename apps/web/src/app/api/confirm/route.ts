// Force dynamic rendering — this route dispatches transactions and must
// never be statically optimised or cached.
export const dynamic = 'force-dynamic';

/**
 * POST /api/confirm — Web confirmation + dispatch
 *
 * Phase 5 fix: after marking intent confirmed, dispatch it immediately.
 * Plan is retrieved from Redis cache (written by /api/chat when plan was generated).
 * If cache miss: returns confirmed-only response (execution will be picked up).
 *
 * Note: @intend/execution is loaded via dynamic import inside the handler to prevent
 * Next.js static analysis from attempting to bundle AgentKit / viem at build time.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSupabase, logEvent, cacheGet, cacheDel, keys } from '@intend/data';
import type { ExecutionPlan } from '@intend/core';

const NETWORK = (process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia') as 'base' | 'base-sepolia';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { intent_id?: string; action?: 'confirm' | 'cancel' };
  const { intent_id, action } = body;

  if (!intent_id || !action) {
    return NextResponse.json({ error: 'intent_id and action required' }, { status: 400 });
  }

  const db = getSupabase();

  // ── Cancel path ─────────────────────────────────────────────────────────
  if (action === 'cancel') {
    await db.from('intents').update({ status: 'cancelled' }).eq('intent_id', intent_id);
    await cacheDel(keys.planCache(intent_id));
    return NextResponse.json({ success: true });
  }

  // ── Confirm + dispatch path ──────────────────────────────────────────────

  // 1. Verify intent exists and is in pending state
  const { data: intentRow } = await db
    .from('intents')
    .select('user_id, status, intention_object')
    .eq('intent_id', intent_id)
    .single();

  if (!intentRow) {
    return NextResponse.json({ error: 'Intent not found' }, { status: 404 });
  }
  if (intentRow.status !== 'pending') {
    return NextResponse.json({ error: `Intent is already ${intentRow.status as string}` }, { status: 409 });
  }

  const dbUserId = intentRow.user_id as string;

  // 2. Mark confirmed
  await db
    .from('intents')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('intent_id', intent_id);

  await logEvent({
    user_id:    dbUserId,
    event_type: 'intent_confirmed',
    source:     'web',
    event_data: {},
    intent_id,
  });

  // 3. Retrieve cached plan
  const cached = await cacheGet<ExecutionPlan>(keys.planCache(intent_id));
  if (!cached) {
    // Cache miss — plan expired or was never stored.
    return NextResponse.json({
      success:  true,
      executed: false,
      message:  'Confirmed. Execution is in progress.',
    });
  }

  const plan = cached.data;

  // 4. Dispatch — dynamic import keeps AgentKit out of the webpack bundle
  let dispatchResult: { success: boolean; tx_hashes: string[]; error?: string };
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execution = await import('@intend/execution' as any);
    const { getOrCreateWallet, readBalances, dispatch } = execution as {
      getOrCreateWallet: (userId: string, network: string) => Promise<{ provider: unknown }>;
      readBalances: (provider: unknown, network: string) => Promise<Array<{ asset: string; amount: number }>>;
      dispatch: (plan: ExecutionPlan, provider: unknown, channel: string, snapshot: Record<string, number>) => Promise<{ success: boolean; tx_hashes: string[]; error?: string }>;
    };

    const { provider } = await getOrCreateWallet(dbUserId, NETWORK);
    const balances = await readBalances(provider, NETWORK);
    const snapshot = Object.fromEntries(balances.map((b) => [b.asset, b.amount]));
    dispatchResult = await dispatch(plan, provider, 'web', snapshot);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Execution error';
    return NextResponse.json({ success: false, error: errMsg }, { status: 500 });
  }

  // 5. Clean up plan cache
  await cacheDel(keys.planCache(intent_id)).catch(() => {/* non-fatal */});

  if (dispatchResult.success) {
    return NextResponse.json({
      success:   true,
      executed:  true,
      tx_hashes: dispatchResult.tx_hashes,
    });
  }

  return NextResponse.json({
    success: false,
    error:   dispatchResult.error ?? 'Execution failed',
  }, { status: 500 });
}
