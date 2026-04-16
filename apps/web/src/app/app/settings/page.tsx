'use client';

import { useState, useEffect, useTransition } from 'react';
import { createClient } from '@/utils/supabase/client';
import { signOut, updateExecutionMode } from '../actions';

type ExecutionMode = 'autonomous' | 'semi_autonomous';

export default function SettingsPage() {
  const [email, setEmail]             = useState('');
  const [mode, setMode]               = useState<ExecutionMode>('semi_autonomous');
  const [saved, setSaved]             = useState(false);
  const [isPending, startTransition]  = useTransition();

  useEffect(() => {
    const sb = createClient();
    void sb.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? '');
    });
  }, []);

  function handleToggle() {
    const next: ExecutionMode = mode === 'autonomous' ? 'semi_autonomous' : 'autonomous';
    setMode(next);
    setSaved(false);

    const fd = new FormData();
    fd.set('execution_mode', next);

    startTransition(async () => {
      const result = await updateExecutionMode(fd);
      if (result?.success) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    });
  }

  const modeLabel = mode === 'autonomous'
    ? 'Autonomous — executes immediately, receipt after'
    : 'Semi-autonomous — shows plan, you confirm';

  return (
    <div className="page">
      <div className="page-title">Settings</div>
      <div className="page-sub">Your preferences, simply.</div>

      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* Account group */}
        <div className="settings-group">
          <div className="settings-group-label">Account</div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">Email</div>
              <div className="settings-row-sub">Your sign-in address</div>
            </div>
            <div className="settings-row-val">{email || '—'}</div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">Currency</div>
              <div className="settings-row-sub">Your reference currency</div>
            </div>
            <div className="settings-row-val">USD</div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">KYC Tier</div>
              <div className="settings-row-sub">Identity verification level</div>
            </div>
            <div className="settings-badge">Tier 1</div>
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">Execution mode</div>
              <div className="settings-row-sub">
                {isPending ? 'Saving…' : saved ? 'Saved ✓' : modeLabel}
              </div>
            </div>
            <button
              className={`toggle ${mode === 'autonomous' ? 'on' : 'off'}`}
              onClick={handleToggle}
              disabled={isPending}
              aria-label="Toggle execution mode"
            >
              <div className="toggle-knob" />
            </button>
          </div>

          <div className="settings-row" style={{ borderTop: 'none', paddingTop: 0 }}>
            <div className="settings-row-sub" style={{ fontSize: 12, color: 'var(--text3)', lineHeight: 1.5 }}>
              {mode === 'autonomous'
                ? 'Intend executes your intents immediately. You receive a receipt after each action. Say "ask me first" in chat to switch.'
                : 'Intend shows you the plan before anything moves. Say "go autonomous" in chat to switch.'}
            </div>
          </div>
        </div>

        {/* Channels group */}
        <div className="settings-group" style={{ marginTop: 12 }}>
          <div className="settings-group-label">Channels</div>
          <div className="channel-grid">
            <div className="channel-card connected">
              <div className="channel-card-icon">💬</div>
              <div className="channel-card-name">Telegram</div>
              <div className="channel-card-state">Connected</div>
            </div>
            <div className="channel-card">
              <div className="channel-card-icon">🌐</div>
              <div className="channel-card-name">Web</div>
              <div className="channel-card-state">Active</div>
            </div>
            <div className="channel-card">
              <div className="channel-card-icon">📱</div>
              <div className="channel-card-name">WhatsApp</div>
              <div className="channel-card-state">Coming soon</div>
            </div>
          </div>
        </div>

        {/* Session group */}
        <div className="settings-group" style={{ marginTop: 12 }}>
          <div className="settings-group-label">Session</div>
          <div className="settings-row">
            <div>
              <div className="settings-row-title">Sign out</div>
              <div className="settings-row-sub">End your current session</div>
            </div>
            <form action={signOut}>
              <button
                type="submit"
                style={{
                  fontSize: 13, color: 'var(--red)', background: 'transparent',
                  border: '1.5px solid var(--red-dim)', borderRadius: 8,
                  padding: '6px 14px', cursor: 'pointer', transition: 'all 0.18s',
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  );
}
