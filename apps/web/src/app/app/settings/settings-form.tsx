'use client';

import { useState, useTransition } from 'react';
import {
  signOut,
  updateExecutionMode,
  updateProfile,
  updateLimits,
  updatePreferredChannel,
  linkTelegram,
  unlinkTelegram,
} from '../actions';

type ExecutionMode = 'autonomous' | 'semi_autonomous';
type Channel      = 'telegram' | 'whatsapp' | 'web';

export interface SettingsInitial {
  email: string;
  display_name: string | null;
  region: string;
  local_currency: string;
  timezone: string;
  execution_mode: ExecutionMode;
  max_auto_tx_usd: number;
  require_confirm_new_recipient: boolean;
  preferred_channel: Channel | null;
  telegram_linked: boolean;
  whatsapp_linked: boolean;
}

const CURRENCIES = ['USD', 'EUR', 'GBP', 'GHS', 'NGN', 'KES', 'ZAR', 'CAD'];
const REGIONS    = ['US', 'GB', 'GH', 'NG', 'KE', 'ZA', 'CA', 'EU'];

function StatusLine({ status }: { status: 'idle' | 'saving' | 'saved' | 'error'; }) {
  if (status === 'saving') return <span className="settings-status">Saving…</span>;
  if (status === 'saved')  return <span className="settings-status ok">Saved ✓</span>;
  if (status === 'error')  return <span className="settings-status err">Something went wrong</span>;
  return null;
}

export function SettingsForm({ initial }: { initial: SettingsInitial }) {
  const [mode, setMode]                 = useState<ExecutionMode>(initial.execution_mode);
  const [modeStatus, setModeStatus]     = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  const [displayName, setDisplayName]   = useState(initial.display_name ?? '');
  const [currency, setCurrency]         = useState(initial.local_currency);
  const [region, setRegion]             = useState(initial.region);
  const [timezone, setTimezone]         = useState(initial.timezone);
  const [profileStatus, setProfileStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [profileError, setProfileError]   = useState('');

  const [maxAuto, setMaxAuto]           = useState(String(initial.max_auto_tx_usd));
  const [confirmNew, setConfirmNew]     = useState(initial.require_confirm_new_recipient);
  const [limitsStatus, setLimitsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [limitsError, setLimitsError]     = useState('');

  const [channel, setChannel]           = useState<Channel | ''>(initial.preferred_channel ?? '');
  const [channelStatus, setChannelStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // ── Telegram link state ──────────────────────────────────────────────────
  const [tgLinked, setTgLinked]         = useState(initial.telegram_linked);
  const [tgCode, setTgCode]             = useState('');
  const [tgStatus, setTgStatus]         = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [tgError, setTgError]           = useState('');

  function handleLinkTelegram(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setTgError('');
    setTgStatus('saving');
    const fd = new FormData();
    fd.set('link_code', tgCode.trim());
    startTransition(async () => {
      const r = await linkTelegram(fd);
      if ('error' in r) {
        setTgError(r.error);
        setTgStatus('error');
        setTimeout(() => setTgStatus('idle'), 3000);
      } else {
        setTgLinked(true);
        setTgCode('');
        flash(setTgStatus as never, true);
      }
    });
  }

  function handleUnlinkTelegram() {
    if (!confirm('Disconnect Telegram from this Intend account?')) return;
    setTgStatus('saving');
    startTransition(async () => {
      const r = await unlinkTelegram();
      if ('error' in r) {
        setTgError(r.error);
        setTgStatus('error');
        setTimeout(() => setTgStatus('idle'), 3000);
      } else {
        setTgLinked(false);
        flash(setTgStatus as never, true);
      }
    });
  }

  const [pending, startTransition] = useTransition();

  function flash(setter: (v: 'idle' | 'saved' | 'error') => void, ok: boolean) {
    setter(ok ? 'saved' : 'error');
    setTimeout(() => setter('idle'), 2500);
  }

  function handleToggleMode() {
    const next: ExecutionMode = mode === 'autonomous' ? 'semi_autonomous' : 'autonomous';
    setMode(next);
    setModeStatus('saving');
    const fd = new FormData();
    fd.set('execution_mode', next);
    startTransition(async () => {
      const r = await updateExecutionMode(fd);
      flash(setModeStatus as never, !!(r as { success?: true }).success);
    });
  }

  function handleProfileSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProfileError('');
    setProfileStatus('saving');
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await updateProfile(fd);
      if ('error' in r) {
        setProfileError(r.error);
        setProfileStatus('error');
        setTimeout(() => setProfileStatus('idle'), 2500);
      } else {
        flash(setProfileStatus as never, true);
      }
    });
  }

  function handleLimitsSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLimitsError('');
    setLimitsStatus('saving');
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const r = await updateLimits(fd);
      if ('error' in r) {
        setLimitsError(r.error);
        setLimitsStatus('error');
        setTimeout(() => setLimitsStatus('idle'), 2500);
      } else {
        flash(setLimitsStatus as never, true);
      }
    });
  }

  function handleChannelChange(next: Channel | '') {
    setChannel(next);
    setChannelStatus('saving');
    const fd = new FormData();
    if (next) fd.set('preferred_channel', next);
    startTransition(async () => {
      const r = await updatePreferredChannel(fd);
      flash(setChannelStatus as never, !!(r as { success?: true }).success);
    });
  }

  const modeLabel = mode === 'autonomous'
    ? 'Autonomous — executes immediately, receipt after'
    : 'Semi-autonomous — shows plan, you confirm';

  return (
    <div className="page">
      <div className="page-title">Settings</div>
      <div className="page-sub">Your preferences, simply.</div>

      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 0 }}>

        {/* ── Profile ─────────────────────────── */}
        <form className="settings-group" onSubmit={handleProfileSubmit}>
          <div className="settings-group-label">Profile</div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">Email</div>
              <div className="settings-row-sub">Your sign-in address</div>
            </div>
            <div className="settings-row-val">{initial.email}</div>
          </div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label className="settings-row-title" htmlFor="display_name">Display name</label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="How Intend addresses you"
              className="login-input"
              maxLength={80}
            />
          </div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label className="settings-row-title" htmlFor="local_currency">Reference currency</label>
            <select
              id="local_currency"
              name="local_currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="login-input"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label className="settings-row-title" htmlFor="region">Region</label>
            <select
              id="region"
              name="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="login-input"
            >
              {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label className="settings-row-title" htmlFor="timezone">Timezone</label>
            <input
              id="timezone"
              name="timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Africa/Accra"
              className="login-input"
            />
          </div>

          <div className="settings-row" style={{ justifyContent: 'space-between' }}>
            <StatusLine status={profileStatus} />
            {profileError && <span className="settings-status err">{profileError}</span>}
            <button type="submit" disabled={pending} className="login-btn" style={{ width: 'auto', padding: '8px 18px' }}>
              Save profile
            </button>
          </div>
        </form>

        {/* ── Execution ───────────────────────── */}
        <div className="settings-group" style={{ marginTop: 12 }}>
          <div className="settings-group-label">Execution</div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">Execution mode</div>
              <div className="settings-row-sub">
                {modeStatus === 'saving' ? 'Saving…' : modeStatus === 'saved' ? 'Saved ✓' : modeLabel}
              </div>
            </div>
            <button
              className={`toggle ${mode === 'autonomous' ? 'on' : 'off'}`}
              onClick={handleToggleMode}
              disabled={pending}
              aria-label="Toggle execution mode"
              type="button"
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

        {/* ── Limits ──────────────────────────── */}
        <form className="settings-group" style={{ marginTop: 12 }} onSubmit={handleLimitsSubmit}>
          <div className="settings-group-label">Limits & safety</div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label className="settings-row-title" htmlFor="max_auto_tx_usd">Max auto-execution (USD)</label>
            <div className="settings-row-sub" style={{ fontSize: 12, color: 'var(--text3)' }}>
              In autonomous mode, transactions larger than this still require your confirmation.
            </div>
            <input
              id="max_auto_tx_usd"
              name="max_auto_tx_usd"
              type="number"
              min={0}
              max={1000000}
              step={50}
              value={maxAuto}
              onChange={(e) => setMaxAuto(e.target.value)}
              className="login-input"
            />
          </div>

          <div className="settings-row">
            <div>
              <div className="settings-row-title">Confirm new recipients</div>
              <div className="settings-row-sub">
                Always ask before sending to an address you've never used before.
              </div>
            </div>
            <label className="toggle-label" style={{ cursor: 'pointer' }}>
              <input
                name="require_confirm_new_recipient"
                type="checkbox"
                checked={confirmNew}
                onChange={(e) => setConfirmNew(e.target.checked)}
                style={{ display: 'none' }}
              />
              <span className={`toggle ${confirmNew ? 'on' : 'off'}`} aria-hidden>
                <span className="toggle-knob" />
              </span>
            </label>
          </div>

          <div className="settings-row" style={{ justifyContent: 'space-between' }}>
            <StatusLine status={limitsStatus} />
            {limitsError && <span className="settings-status err">{limitsError}</span>}
            <button type="submit" disabled={pending} className="login-btn" style={{ width: 'auto', padding: '8px 18px' }}>
              Save limits
            </button>
          </div>
        </form>

        {/* ── Channels ─────────────────────────── */}
        <div className="settings-group" style={{ marginTop: 12 }}>
          <div className="settings-group-label">Channels</div>

          <div className="channel-grid">
            <div className={`channel-card ${tgLinked ? 'connected' : ''}`}>
              <div className="channel-card-icon">💬</div>
              <div className="channel-card-name">Telegram</div>
              <div className="channel-card-state">{tgLinked ? 'Connected' : 'Not linked'}</div>

              {!tgLinked && (
                <form onSubmit={handleLinkTelegram} style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="6-digit code"
                    value={tgCode}
                    onChange={(e) => setTgCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    className="login-input"
                    style={{ textAlign: 'center', letterSpacing: 4, fontFamily: 'var(--font-mono, monospace)' }}
                  />
                  <button
                    type="submit"
                    disabled={pending || tgCode.length !== 6}
                    className="login-btn"
                    style={{ padding: '6px 10px' }}
                  >
                    {tgStatus === 'saving' ? 'Linking…' : 'Link Telegram'}
                  </button>
                  <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center' }}>
                    Run <code>/connect</code> in @intend_bot to get a code.
                  </div>
                </form>
              )}

              {tgLinked && (
                <button
                  type="button"
                  onClick={handleUnlinkTelegram}
                  disabled={pending}
                  style={{
                    marginTop: 10, fontSize: 12, color: 'var(--red)',
                    background: 'transparent', border: '1px solid var(--red-dim)',
                    borderRadius: 6, padding: '4px 10px', cursor: 'pointer',
                  }}
                >
                  {tgStatus === 'saving' ? 'Working…' : 'Disconnect'}
                </button>
              )}

              <div style={{ minHeight: 16, marginTop: 4 }}>
                {tgStatus === 'saved' && <span className="settings-status ok">Saved ✓</span>}
                {tgError && <span className="settings-status err">{tgError}</span>}
              </div>
            </div>
            <div className="channel-card connected">
              <div className="channel-card-icon">🌐</div>
              <div className="channel-card-name">Web</div>
              <div className="channel-card-state">Active</div>
            </div>
            <div className={`channel-card ${initial.whatsapp_linked ? 'connected' : ''}`}>
              <div className="channel-card-icon">📱</div>
              <div className="channel-card-name">WhatsApp</div>
              <div className="channel-card-state">{initial.whatsapp_linked ? 'Connected' : 'Coming soon'}</div>
            </div>
          </div>

          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
            <label className="settings-row-title" htmlFor="preferred_channel">Preferred channel for notifications</label>
            <div className="settings-row-sub" style={{ fontSize: 12, color: 'var(--text3)' }}>
              Where Intend reaches you first for confirmations and receipts.
            </div>
            <select
              id="preferred_channel"
              name="preferred_channel"
              value={channel}
              onChange={(e) => handleChannelChange(e.target.value as Channel | '')}
              className="login-input"
            >
              <option value="">(auto — whichever is active)</option>
              <option value="telegram" disabled={!initial.telegram_linked}>Telegram{!initial.telegram_linked ? ' (link first)' : ''}</option>
              <option value="web">Web</option>
              <option value="whatsapp" disabled={!initial.whatsapp_linked}>WhatsApp{!initial.whatsapp_linked ? ' (coming soon)' : ''}</option>
            </select>
            <StatusLine status={channelStatus} />
          </div>
        </div>

        {/* ── Session ─────────────────────────── */}
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
