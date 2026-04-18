import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  // IMPORTANT: getUser() must be called on every request to refresh the session.
  // Do not remove — Supabase SSR requires this.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAppRoute     = path.startsWith('/app');
  const isOnboardRoute = path.startsWith('/onboard');
  const isLoginRoute   = path.startsWith('/login');
  const isAuthRoute    = path.startsWith('/auth'); // /auth/callback, /auth/exchange — always allow
  const isLanding      = path === '/';

  // Let /auth/* through unconditionally
  if (isAuthRoute) return supabaseResponse;

  // Redirect unauthenticated users away from /app and /onboard
  if ((isAppRoute || isOnboardRoute) && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from /login and landing → /app
  // /onboard is excluded: auth'd users are allowed there until onboarding completes
  if ((isLoginRoute || isLanding) && user) {
    return NextResponse.redirect(new URL('/app', request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
