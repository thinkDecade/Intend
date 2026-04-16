import { type NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  // IMPORTANT: getUser() must be called on every request to refresh the session.
  // Do not remove — Supabase SSR requires this.
  const { data: { user } } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAppRoute    = path.startsWith('/app');
  const isLoginRoute  = path.startsWith('/login');
  const isAuthRoute   = path.startsWith('/auth'); // /auth/callback — always allow
  const isLanding     = path === '/';

  // Let /auth/* through unconditionally
  if (isAuthRoute) return supabaseResponse;

  // Redirect unauthenticated users away from /app
  if (isAppRoute && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', path);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from /login and landing page → /app
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
