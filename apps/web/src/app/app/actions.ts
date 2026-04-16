'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, updateUserSettings } from '@intend/data';

export async function signOut() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/login');
}

export async function updateExecutionMode(formData: FormData) {
  const mode = formData.get('execution_mode') as 'autonomous' | 'semi_autonomous';
  if (mode !== 'autonomous' && mode !== 'semi_autonomous') {
    return { error: 'Invalid mode' };
  }

  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { error: 'Not authenticated' };

  const dbUser = await getUserByEmail(user.email).catch(() => null);
  if (!dbUser) return { error: 'User not found' };

  await updateUserSettings(dbUser.user_id, { execution_mode: mode });
  return { success: true };
}
