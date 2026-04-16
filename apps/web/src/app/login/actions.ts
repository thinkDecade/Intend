'use server';

import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser } from '@intend/data';

export async function signInWithOtp(formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email is required.' };

  const siteUrl = process.env['NEXT_PUBLIC_SITE_URL']
    || (process.env['VERCEL_URL'] ? `https://${process.env['VERCEL_URL']}` : null)
    || 'http://localhost:3002';

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      // Magic-link clicks land at /auth/callback which exchanges the session.
      // The email also contains a 6-digit code — both paths work.
      emailRedirectTo: `${siteUrl}/auth/callback?next=/app`,
    },
  });

  if (error) return { error: error.message };
  return { success: true };
}

export async function verifyOtp(formData: FormData) {
  const email = formData.get('email') as string;
  const token = formData.get('token') as string;

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);

  const { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  });

  if (error) return { error: error.message };

  // Ensure internal users table row exists after first OTP verification
  if (data.user?.email) {
    try {
      const existing = await getUserByEmail(data.user.email).catch(() => null);
      if (!existing) {
        await createUser({
          email: data.user.email,
          webapp_uid: data.user.id,
        });
      }
    } catch (err) {
      console.error('[verifyOtp] auto-create user failed:', err);
      // Non-fatal — layout fallback will retry
    }
  }

  redirect('/app');
}

export async function signOut() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  await supabase.auth.signOut();
  redirect('/login');
}
