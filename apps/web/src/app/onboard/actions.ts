'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import {
  getUserByEmail,
  updateUserSettings,
  markOnboardingComplete,
  getUserPrimaryWallet,
  seedERPFromOnboarding,
} from '@intend/data';
import {
  runOnboardingTurn,
  type OnboardingState,
  type OnboardingHistoryEntry,
  type OnboardingTurnResult,
} from '@intend/intelligence';

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

/**
 * Run one turn of the conversational onboarding flow.
 *
 * The client sends the current state, the conversation history so far, and
 * the user's latest message. We:
 *   1. Persist any extracted ERP slots from the previous turn (incremental seed).
 *   2. Silently kick off wallet provisioning after the location turn.
 *   3. Return the agent's reply, the next state, and (when ready) the wallet
 *      address so the UI can reveal it inline.
 */
export interface OnboardingTurnResponse extends OnboardingTurnResult {
  wallet_address?: string | null;
  error?:          string;
}

export async function onboardingTurn(args: {
  state:        OnboardingState;
  history:      OnboardingHistoryEntry[];
  user_message: string;
}): Promise<OnboardingTurnResponse> {
  const dbUser = await getAuthedUser();
  if (!dbUser) return {
    message: '', extracted: {}, next_state: 'greeting', error: 'Not authenticated',
  };

  let turn: OnboardingTurnResult;
  try {
    turn = await runOnboardingTurn(args);
  } catch (err) {
    console.error('[onboardingTurn] agent failed:', err);
    return {
      message:    "I'm having trouble thinking right now. Give me a moment and try again.",
      extracted:  {},
      next_state: args.state,
      error:      'agent_failed',
    };
  }

  // Persist any ERP slots the agent extracted this turn (incremental seed).
  const slots = turn.extracted;
  const hasSlots = Object.values(slots).some((v) => v !== undefined && v !== null);
  if (hasSlots) {
    try {
      await seedERPFromOnboarding(dbUser.user_id, {
        ...(slots.location_country && { location_country: slots.location_country }),
        ...(slots.location_region !== undefined && { location_region: slots.location_region }),
        ...(slots.local_currency && { local_currency: slots.local_currency }),
        ...(slots.income_range   && { income_range:   slots.income_range   }),
        ...(slots.risk_tolerance && { risk_tolerance: slots.risk_tolerance }),
        ...(slots.time_horizon   && { time_horizon:   slots.time_horizon   }),
      });
      // Mirror location into users table so existing UFM/region-based code keeps working.
      if (slots.location_country || slots.local_currency) {
        await updateUserSettings(dbUser.user_id, {
          ...(slots.location_country && { region:         slots.location_country }),
          ...(slots.local_currency   && { local_currency: slots.local_currency   }),
        });
      }
    } catch (err) {
      console.warn('[onboardingTurn] ERP persist failed (non-fatal):', err);
    }
  }

  // Silently kick off wallet provisioning the moment we have location.
  // Don't block the turn response on it — UI polls / reveal step waits for ready.
  if (slots.location_country) {
    void provisionWallet().catch(() => { /* non-fatal */ });
  }

  // When entering the wallet-reveal state, include the address (or null if not ready).
  let wallet_address: string | null = null;
  let includeWallet = false;
  if (turn.reveal_wallet || turn.next_state === 'wallet') {
    includeWallet = true;
    const wallet = await provisionWallet();
    wallet_address = 'address' in wallet ? wallet.address : null;
  }

  // When finished, mark the user complete.
  if (turn.finished) {
    try {
      await markOnboardingComplete(dbUser.user_id);
    } catch (err) {
      console.warn('[onboardingTurn] markOnboardingComplete failed:', err);
    }
  }

  return includeWallet ? { ...turn, wallet_address } : { ...turn };
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
