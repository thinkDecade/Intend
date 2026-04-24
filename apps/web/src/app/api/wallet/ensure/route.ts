/**
 * POST /api/wallet/ensure
 *
 * Idempotent wallet pre-warm. Called from the AppShell on mount so that
 * by the time the user actually types something, the CDP wallet provisioning
 * is already done (or in-flight). This keeps the first-message latency low
 * and lets us render the wallet milestone card the moment the user lands.
 *
 * Returns the wallet address if known, or `null` if provisioning is still
 * pending (the chat route's on-demand path will retry).
 *
 * Bounded by a 6s timeout — slightly longer than the chat-route timeout
 * because this endpoint isn't blocking anything visible to the user.
 */

import { NextResponse } from 'next/server';
import { cookies }      from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, getUserPrimaryWallet } from '@intend/data';

const CHAIN   = process.env['NODE_ENV'] === 'production' ? 'base'      : 'base_sepolia';
const NETWORK = process.env['NODE_ENV'] === 'production' ? 'base'      : 'base-sepolia';

export async function POST() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const dbUser = await getUserByEmail(user.email).catch(() => null);
  if (!dbUser) return NextResponse.json({ error: 'no_user' }, { status: 404 });

  // Fast path: already provisioned.
  const existing = await getUserPrimaryWallet(dbUser.user_id, CHAIN as 'base' | 'base_sepolia').catch(() => null);
  if (existing) {
    return NextResponse.json({
      address:  existing.address,
      network:  CHAIN,
      pending:  false,
      provider: existing.provider ?? 'agentkit_cdp',
    });
  }

  // Provision with a generous timeout — but never block longer than 6s
  // so the AppShell prefetch can't stall the page.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execution = await import('@intend/execution' as any);
    const wallet = await Promise.race([
      (execution as {
        getOrCreateWallet: (id: string, net: string) => Promise<{ info: { address: string; wallet_id: string } }>
      }).getOrCreateWallet(dbUser.user_id, NETWORK),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('wallet provisioning timed out after 6s')), 6000),
      ),
    ]);
    return NextResponse.json({
      address:  wallet.info.address,
      network:  CHAIN,
      pending:  false,
      provider: 'agentkit_cdp',
    });
  } catch (err) {
    // Non-fatal — chat route's self-heal will retry on next message.
    console.warn('[wallet/ensure] provisioning failed (non-fatal):', err instanceof Error ? err.message : err);
    return NextResponse.json({
      address:  null,
      network:  CHAIN,
      pending:  true,
      provider: 'agentkit_cdp',
    });
  }
}
