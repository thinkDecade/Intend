import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser } from '@intend/data';

/**
 * Supabase auth callback — handles magic link clicks.
 *
 * When the user clicks the link in their email, Supabase redirects here
 * with ?code=... (PKCE flow) or ?token_hash=...&type=email (OTP flow).
 * We exchange the code/token for a session, ensure a users table row
 * exists, and redirect to /app.
 *
 * Onboarding is now handled conversationally inside the chat — no /onboard
 * page redirect needed. New users go straight to /app where the ChatPanel
 * detects onboarding_completed = false and starts the onboarding flow.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code       = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type       = searchParams.get('type') as 'email' | 'magiclink' | null;

  // Always redirect to /app after successful auth
  const destination = '/app';

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);

  let authError: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await ensureUserRecord(supabase);
      return NextResponse.redirect(`${origin}${destination}`);
    }
    authError = error.message;
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      await ensureUserRecord(supabase);
      return NextResponse.redirect(`${origin}${destination}`);
    }
    authError = error.message;
  }

  // Neither code nor token_hash — possibly a hash-based redirect (implicit flow).
  // Send the user to /auth/exchange which handles client-side hash extraction.
  if (!code && !token_hash) {
    return NextResponse.redirect(`${origin}/auth/exchange`);
  }

  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'auth_failed');
  if (authError) loginUrl.searchParams.set('message', authError);
  return NextResponse.redirect(loginUrl.toString());
}

/**
 * Ensure the internal `users` table has a row for this auth user.
 * New users go to /app where the chat handles onboarding.
 */
async function ensureUserRecord(
  supabase: ReturnType<typeof createClient>,
): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const existing = await getUserByEmail(user.email).catch(() => null);
    if (!existing) {
      await createUser({ email: user.email, webapp_uid: user.id });
    }
  } catch (err) {
    console.error('[auth/callback] ensureUserRecord failed:', err);
  }
}
