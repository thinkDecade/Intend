'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, updateUserSettings, markOnboardingComplete } from '@intend/data';

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

/** Mark onboarding complete and redirect to /app. */
export async function completeOnboarding() {
  const dbUser = await getAuthedUser();
  if (!dbUser) redirect('/login');

  await markOnboardingComplete(dbUser.user_id);
  redirect('/app');
}
