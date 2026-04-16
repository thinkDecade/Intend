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
    // PKCE flow — exchange authorization code for session
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      await ensureUserRecord(supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
    authError = error.message;
  }

  if (token_hash && type) {
    // OTP / magic link token flow
    const { error } = await supabase.auth.verifyOtp({ token_hash, type });
    if (!error) {
      await ensureUserRecord(supabase);
      return NextResponse.redirect(`${origin}${next}`);
    }
    authError = error.message;
  }

  // Exchange failed — redirect to login with error info
  const loginUrl = new URL('/login', origin);
  loginUrl.searchParams.set('error', 'auth_failed');
  if (authError) loginUrl.searchParams.set('message', authError);
  return NextResponse.redirect(loginUrl.toString());
}

/**
 * Ensure the internal `users` table has a row for this auth user.
 * Called after every successful auth exchange — idempotent.
 */
async function ensureUserRecord(supabase: ReturnType<typeof createClient>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return;

    const existing = await getUserByEmail(user.email).catch(() => null);
    if (existing) return; // already exists

    await createUser({
      email:      user.email,
      webapp_uid: user.id,
    });
  } catch (err) {
    // Non-fatal — layout will retry on next page load
    console.error('[auth/callback] ensureUserRecord failed:', err);
  }
}
