// Force dynamic — live wallet data, never statically cached.
export const dynamic = 'force-dynamic';

/**
 * GET /api/portfolio
 *
 * Returns a unified portfolio summary for the authenticated user:
 *   - On-chain wallet balances (read via AgentKit CDP)
 *   - Active positions from the DB (GROW, PROTECT, INVEST, SAVE)
 *   - Active goals from the DB
 *   - Computed totals: total_usd, available_usd, earning_usd, protected_usd
 *
 * Balance reads are cached in Redis for 2 minutes (TTL.BALANCES) to avoid
 * hammering the chain on every page load. The cache is keyed per userId.
 *
 * AgentKit is loaded via dynamic import to keep it out of the webpack bundle.
 * Same pattern as /api/confirm.
 */

import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  getUserByEmail,
  getActiveGoals,
  getActivePositions,
  cacheGet,
  cacheSet,
  TTL,
  keys,
} from '@intend/data';
import type { Balance } from '@intend/core';

const NETWORK = (process.env['NODE_ENV'] === 'production'
  ? 'base'
  : 'base-sepolia') as 'base' | 'base-sepolia';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve userId
  let userId = req.nextUrl.searchParams.get('userId') ?? '';
  if (!userId || userId === 'me') {
    const dbUser = authUser.email
      ? await getUserByEmail(authUser.email).catch(() => null)
      : null;
    userId = dbUser?.user_id ?? '';
  }

  if (!userId) {
    return NextResponse.json({
      total_usd:     0,
      available_usd: 0,
      earning_usd:   0,
      protected_usd: 0,
      balances:      [],
      goals:         [],
      positions:     [],
    });
  }

  // ── Fetch DB data + on-chain balances in parallel ────────────────────────

  const [goals, positions, balances] = await Promise.all([
    getActiveGoals(userId).catch(() => []),
    getActivePositions(userId).catch(() => []),
    loadBalances(userId),
  ]);

  // ── Compute totals ───────────────────────────────────────────────────────

  const availableUsd = balances.reduce((sum, b) => sum + b.usd_value, 0);

  const earningUsd = positions
    .filter(p => p.primitive === 'GROW' || p.primitive === 'SAVE')
    .reduce((sum, p) => sum + Number(p.amount_current), 0);

  const protectedUsd = positions
    .filter(p => p.primitive === 'PROTECT')
    .reduce((sum, p) => sum + Number(p.amount_current), 0);

  const investedUsd = positions
    .filter(p => p.primitive === 'INVEST')
    .reduce((sum, p) => sum + Number(p.amount_current), 0);

  const totalDeployed = earningUsd + protectedUsd + investedUsd;
  const totalUsd = availableUsd + totalDeployed;

  return NextResponse.json({
    total_usd:     totalUsd,
    available_usd: availableUsd,
    earning_usd:   earningUsd,
    protected_usd: protectedUsd,
    balances:      balances.map(b => ({
      asset:     b.asset,
      chain:     b.chain,
      amount:    b.amount,
      usd_value: b.usd_value,
    })),
    goals: goals.map(g => ({
      id:          g.horizon_id,
      name:        g.goal_name,
      current_usd: Number(g.current_amount),
      target_usd:  Number(g.target_amount),
      apy:         null,
    })),
    positions: positions.map(p => ({
      id:           p.position_id,
      asset:        p.asset,
      protocol:     p.protocol,
      primitive:    p.primitive,
      amount:       Number(p.amount_deposited),
      usd_value:    Number(p.amount_current),
      yield_earned: Number(p.yield_earned),
      apy_at_entry: Number(p.apy_at_entry ?? 0),
    })),
  });
}

// ── Balance loader (with 2-min Redis cache) ──────────────────────────────────

async function loadBalances(userId: string): Promise<Balance[]> {
  // 1. Try Redis cache first
  try {
    const cached = await cacheGet<Balance[]>(keys.userBalances(userId));
    if (cached) return cached.data;
  } catch {
    // Redis miss or error — fall through to chain read
  }

  // 2. Read from chain via AgentKit (dynamic import keeps it out of webpack bundle)
  let balances: Balance[] = [];
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execution = await import('@intend/execution' as any);
    const { getOrCreateWallet, readBalances } = execution as {
      getOrCreateWallet: (userId: string, network: string) => Promise<{ provider: unknown }>;
      readBalances:      (provider: unknown, network: string) => Promise<Balance[]>;
    };

    const { provider } = await getOrCreateWallet(userId, NETWORK);
    balances = await readBalances(provider, NETWORK);

    // 3. Write to Redis cache (non-fatal if it fails)
    cacheSet(keys.userBalances(userId), balances, TTL.BALANCES).catch(() => {/* non-fatal */});
  } catch (err) {
    // AgentKit read failed — wallet may not exist yet, or CDP keys unavailable.
    // Return empty balances rather than erroring the whole portfolio response.
    console.warn('[portfolio] balance read failed:', err instanceof Error ? err.message : err);
  }

  return balances;
}
