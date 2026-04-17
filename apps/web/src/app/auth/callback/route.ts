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
 * New users (onboarding_completed = false) are sent to /onboard first.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  const code       = searchParams.get('code');
  const token_hash = searchParams.get('token_hash');
  const type       = searchParams.get('type') as 'email' | 'magiclink' | null;
  const next       = searchParams.get('next') ?? '/app';

  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);

  let authError: string | null = null;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const destination = await ensureUserRecord(supabase, next);
      return NextResponse.redirect(`${origin}${destination}`);
    }
    authError = error.message;
  }

  if (token_hash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      const destination = await ensureUserRecord(supabase, next);
      return NextResponse.redirect(`${origin}${destination}`);
    }
    authError = error.message;
  }

  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'auth_failed');
  if (authError) loginUrl.searchParams.set('message', authError);
  return NextResponse.redirect(loginUrl.toString());
}

/**
 * Ensure the internal `users` table has a row for this auth user.
 * Returns the destination path — new users go to /onboard, returning users
 * go to the requested `next` path.
 */
async function ensureUserRecord(
  supabase: ReturnType<typeof createClient>,
  next: string,
): Promise<string> {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return next;

    const existing = await getUserByEmail(user.email).catch(() => null);

    if (existing) {
      // Returning user — resume requested destination
      // If they never finished onboarding, send them back there
      if (!existing.onboarding_completed) return '/onboard';
      return next;
    }

    // Brand-new user — create record and send to onboarding
    await createUser({
      email:      user.email,
      webapp_uid: user.id,
    });
    return '/onboard';
  } catch (err) {
    console.error('[auth/callback] ensureUserRecord failed:', err);
    return next;
  }
}
