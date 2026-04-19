'use client';

/**
 * Passkey nudge — shown to OTP-only users who have completed onboarding
 * but haven't yet registered an authenticator. Dismissed locally
 * (localStorage) so we don't pester users on every page load. The next
 * meaningful prompt point is "first deposit" — wired up via the
 * `data-passkey-nudge` flag on the success message in ChatPanel
 * (Phase-2 hook; for v0.5 the dashboard banner is the surface).
 */
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const DISMISS_KEY = 'intend:passkey_nudge_dismissed_at';
const SUPPRESS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export function PasskeyNudge({ show }: { show: boolean }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) { setVisible(false); return; }
    try {
      const dismissed = localStorage.getItem(DISMISS_KEY);
      if (dismissed && Date.now() - Number(dismissed) < SUPPRESS_MS) { setVisible(false); return; }
    } catch { /* private mode — show anyway */ }
    setVisible(true);
  }, [show]);

  if (!visible) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch { /* ignore */ }
    setVisible(false);
  }

  return (
    <div style={{
      margin: '12px 16px 0',
      padding: '12px 16px',
      borderRadius: 12,
      background: 'var(--accent-dim, rgba(212, 162, 74, 0.1))',
      border: '1px solid var(--accent, #D4A24A)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      gap: 12, flexWrap: 'wrap',
    }}>
      <div style={{ flex: 1, minWidth: 220 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
          Skip the email codes
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)' }}>
          Add a passkey — Face ID, Touch ID, or your security key. Sign in instantly next time.
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          type="button"
          onClick={() => router.push('/app/settings#passkeys')}
          style={{
            padding: '7px 14px', fontSize: 13, fontWeight: 600,
            background: 'var(--ink-0, #1A1612)', color: 'var(--pearl-0, #F5F0E6)',
            border: 'none', borderRadius: 999, cursor: 'pointer',
          }}
        >Add passkey</button>
        <button
          type="button"
          onClick={dismiss}
          style={{
            padding: '7px 12px', fontSize: 13,
            background: 'transparent', color: 'var(--text3)',
            border: 'none', cursor: 'pointer',
          }}
        >Not now</button>
      </div>
    </div>
  );
}
