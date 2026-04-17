'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, updateUserSettings } from '@intend/data';

export async function signOut() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/login');
}

/** Resolve the internal users row for the authed caller, or null if none. */
async function getAuthedUser() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const dbUser = await getUserByEmail(user.email).catch(() => null);
  return dbUser;
}

export async function updateExecutionMode(formData: FormData) {
  const mode = formData.get('execution_mode') as 'autonomous' | 'semi_autonomous';
  if (mode !== 'autonomous' && mode !== 'semi_autonomous') {
    return { error: 'Invalid mode' };
  }
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  await updateUserSettings(dbUser.user_id, { execution_mode: mode });
  revalidatePath('/app/settings');
  return { success: true };
}

export async function updateProfile(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const display_name    = (formData.get('display_name') as string | null)?.trim() || null;
  const local_currency  = (formData.get('local_currency') as string | null)?.trim().toUpperCase();
  const region          = (formData.get('region') as string | null)?.trim().toUpperCase();
  const timezone        = (formData.get('timezone') as string | null)?.trim();

  const patch: Parameters<typeof updateUserSettings>[1] = {};
  if (display_name !== undefined)   patch.display_name   = display_name;
  if (local_currency)               patch.local_currency = local_currency;
  if (region)                       patch.region         = region;
  if (timezone)                     patch.timezone       = timezone;

  if (local_currency && !/^[A-Z]{3}$/.test(local_currency)) {
    return { error: 'Currency must be a 3-letter code (e.g. USD, GHS)' };
  }
  if (region && !/^[A-Z]{2}$/.test(region)) {
    return { error: 'Region must be a 2-letter country code (e.g. US, GH)' };
  }

  await updateUserSettings(dbUser.user_id, patch);
  revalidatePath('/app/settings');
  return { success: true };
}

export async function updateLimits(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const raw = formData.get('max_auto_tx_usd') as string | null;
  const confirmNew = formData.get('require_confirm_new_recipient') === 'on';

  const patch: Parameters<typeof updateUserSettings>[1] = {
    require_confirm_new_recipient: confirmNew,
  };

  if (raw && raw.trim() !== '') {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000) {
      return { error: 'Amount must be between 0 and 1,000,000' };
    }
    patch.max_auto_tx_usd = n;
  }

  await updateUserSettings(dbUser.user_id, patch);
  revalidatePath('/app/settings');
  return { success: true };
}

export async function updatePreferredChannel(formData: FormData) {
  const dbUser = await getAuthedUser();
  if (!dbUser) return { error: 'Not authenticated' };

  const ch = formData.get('preferred_channel') as string | null;
  if (ch && !['telegram', 'whatsapp', 'web'].includes(ch)) {
    return { error: 'Invalid channel' };
  }

  await updateUserSettings(dbUser.user_id, {
    preferred_channel: (ch || null) as 'telegram' | 'whatsapp' | 'web' | null,
  });
  revalidatePath('/app/settings');
  return { success: true };
}
