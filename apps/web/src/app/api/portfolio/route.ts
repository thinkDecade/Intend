import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, getActiveGoals, getActivePositions } from '@intend/data';

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Resolve userId from email (supports both explicit param and auto-resolve)
  let userId = req.nextUrl.searchParams.get('userId') ?? '';
  if (!userId || userId === 'me') {
    const dbUser = authUser.email
      ? await getUserByEmail(authUser.email).catch(() => null)
      : null;
    userId = dbUser?.user_id ?? '';
  }

  if (!userId) {
    return NextResponse.json({
      total_usd: 0,
      available_usd: 0,
      earning_usd: 0,
      protected_usd: 0,
      balances: [],
      goals: [],
      positions: [],
    });
  }

  const [goals, positions] = await Promise.all([
    getActiveGoals(userId).catch(() => []),
    getActivePositions(userId).catch(() => []),
  ]);

  // Compute totals from actual position data
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

  return NextResponse.json({
    total_usd:     totalDeployed,
    available_usd: 0,  // on-chain wallet balance requires AgentKit — Phase 2
    earning_usd:   earningUsd,
    protected_usd: protectedUsd,
    balances:      [],  // on-chain balances require AgentKit
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
