'use client';

/**
 * /auth/exchange — Client-side handler for hash-based Supabase auth tokens.
 *
 * When Supabase uses the implicit flow (hash fragment), the access_token is
 * in the URL hash which the server never sees. This page runs client-side,
 * extracts the session from the hash via the Supabase browser client,
 * and redirects to /app once the session is set.
 *
 * This is a fallback for magic links sent via Supabase's own SMTP/templates
 * that may not use the PKCE code flow.
 */

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';

export default function AuthExchangePage() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env['NEXT_PUBLIC_SUPABASE_URL']!,
      process.env['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']!,
    );

    // getSession() processes hash fragment tokens automatically in the browser client
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        router.replace('/app');
      } else {
        // No session established — try subscribing to auth state change
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, sess) => {
          if (event === 'SIGNED_IN' && sess) {
            subscription.unsubscribe();
            router.replace('/app');
          }
        });

        // Timeout fallback — if nothing happens in 5s, go to login
        const timeout = setTimeout(() => {
          subscription.unsubscribe();
          router.replace('/login?error=auth_failed');
        }, 5000);

        return () => {
          clearTimeout(timeout);
          subscription.unsubscribe();
        };
      }
    });
  }, [router]);

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', flexDirection: 'column', gap: 12,
      background: 'var(--bg)', color: 'var(--text)',
      fontFamily: 'var(--font-body)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        background: 'linear-gradient(135deg, var(--accent) 0%, #b8872e 100%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18,
        color: '#1A1612',
      }}>
        i
      </div>
      <p style={{ fontSize: 14, color: 'var(--text3)' }}>Signing you in…</p>
    </div>
  );
}
