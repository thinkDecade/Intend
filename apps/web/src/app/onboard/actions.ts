'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, updateUserSettings, markOnboardingComplete, getUserPrimaryWallet } from '@intend/data';

const NETWORK = (process.env['NODE_ENV'] === 'production'
  ? 'base'
  : 'base-sepolia') as 'base' | 'base-sepolia';

const CHAIN = NETWORK === 'base' ? 'base' : 'base_sepolia' as 'base' | 'base_sepolia';

async function getAuthedUser() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  return getUserByEmail(user.email).catch(() => null);
}

/** Save profile answers collected during onboarding steps 2. */
export async function saveOnboardingProfile(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const display_name   = (formData.get('display_name') as string | null)?.trim() || null;
  const local_currency = (formData.get('local_currency') as string | null)?.trim().toUpperCase() || 'USD';
  const region         = (formData.get('region') as string | null)?.trim().toUpperCase() || 'US';
  const timezone       = (formData.get('timezone') as string | null)?.trim() || 'UTC';
  const execution_mode = (formData.get('execution_mode') as string | null) === 'autonomous'
    ? 'autonomous' as const
    : 'semi_autonomous' as const;

  if (local_currency && !/^[A-Z]{3}$/.test(local_currency)) {
    return { error: 'Currency must be a 3-letter code (e.g. USD, GHS)' };
  }

  await updateUserSettings(dbUser.user_id, {
    display_name,
    local_currency,
    region,
    timezone,
    execution_mode,
  });

  return { success: true };
}

/**
 * Provision the user's wallet if they don't have one yet.
 * Called from the Account step in the onboarding flow so the user
 * sees their real address before completing onboarding.
 * Returns the wallet address on success.
 */
export async function provisionWallet(): Promise<{ address: string } | { error: string }> {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  // Check if wallet already exists — return it immediately if so
  const existing = await getUserPrimaryWallet(dbUser.user_id, CHAIN).catch(() => null);
  if (existing) return { address: existing.address };

  // Create via AgentKit (dynamic import keeps it out of the webpack bundle)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execution = await import('@intend/execution' as any);
    const { getOrCreateWallet } = execution as {
      getOrCreateWallet: (userId: string, network: string) => Promise<{ info: { address: string } }>;
    };
    const { info } = await getOrCreateWallet(dbUser.user_id, NETWORK);
    return { address: info.address };
  } catch (err) {
    console.error('[provisionWallet] failed:', err instanceof Error ? err.message : err);
    return { error: 'Wallet provisioning failed. You can continue — it will be created automatically.' };
  }
}

/** Mark onboarding complete and redirect to /app. */
export async function completeOnboarding() {
  const dbUser = await getAuthedUser();
  if (!dbUser) redirect('/login');

  await markOnboardingComplete(dbUser.user_id);

  // Ensure wallet exists before landing on /app (non-fatal if it fails)
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execution = await import('@intend/execution' as any);
    const { getOrCreateWallet } = execution as {
      getOrCreateWallet: (userId: string, network: string) => Promise<unknown>;
    };
    await getOrCreateWallet(dbUser.user_id, NETWORK);
  } catch {
    // Non-fatal — portfolio route will retry on first load
  }

  redirect('/app');
}
