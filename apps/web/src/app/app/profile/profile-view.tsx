'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { updateProfile } from '../actions';

export interface ProfileData {
  email:           string;
  display_name:    string | null;
  intend_handle:   string | null;
  kyc_tier:        'tier_0' | 'tier_1' | 'tier_2' | 'tier_3';
  created_at:      string;
  region:          string;
  local_currency:  string;
  telegram_linked: boolean;
  whatsapp_linked: boolean;
  execution_mode:  'semi_autonomous' | 'autonomous';
}

const KYC_LABELS: Record<string, string> = {
  tier_0: 'Unverified',
  tier_1: 'Verified',
  tier_2: 'Advanced',
  tier_3: 'Pro',
};

function getInitials(name: string | null, email: string): string {
  if (name?.trim()) {
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? '')
      .join('');
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year:  'numeric',
      month: 'long',
      day:   'numeric',
    });
  } catch {
    return iso;
  }
}

export default function ProfileView({ profile }: { profile: ProfileData }) {
  const [editing, setEditing]     = useState(false);
  const [name, setName]           = useState(profile.display_name ?? '');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [pending, startTransition] = useTransition();

  const initials = getInitials(profile.display_name, profile.email);

  function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaveStatus('saving');
    const fd = new FormData();
    fd.set('display_name', name);
    startTransition(async () => {
      const r = await updateProfile(fd);
      if ('error' in r) {
        setSaveStatus('error');
        setTimeout(() => setSaveStatus('idle'), 2500);
      } else {
        setSaveStatus('saved');
        setEditing(false);
        setTimeout(() => setSaveStatus('idle'), 2500);
      }
    });
  }

  return (
    <div className="page">
      <div className="page-title">Profile</div>
      <div className="page-sub">Your identity on Intend.</div>

      <div style={{ maxWidth: 520, display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Hero card ─────────────────────────── */}
        <div className="settings-group" style={{ padding: '28px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 20 }}>
            {/* Avatar */}
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'linear-gradient(135deg, var(--accent) 0%, #b8872e 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
              color: '#1A1612', flexShrink: 0, letterSpacing: '-0.02em',
            }}>
              {initials}
            </div>

            {/* Name + email */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {editing ? (
                <form onSubmit={handleSave} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    maxLength={80}
                    autoFocus
                    className="login-input"
                    style={{ flex: 1, fontSize: 14, padding: '6px 10px' }}
                  />
                  <button
                    type="submit"
                    disabled={pending}
                    className="login-btn"
                    style={{ width: 'auto', padding: '6px 14px', fontSize: 13 }}
                  >
                    {saveStatus === 'saving' ? '…' : 'Save'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditing(false); setName(profile.display_name ?? ''); }}
                    style={{
                      background: 'transparent', border: 'none', color: 'var(--text3)',
                      cursor: 'pointer', fontSize: 13, padding: '6px 8px',
                    }}
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600,
                    color: 'var(--text)', letterSpacing: '-0.02em',
                  }}>
                    {profile.display_name || 'No name set'}
                  </span>
                  <button
                    onClick={() => setEditing(true)}
                    style={{
                      background: 'transparent', border: 'none',
                      color: 'var(--accent-ink)', cursor: 'pointer',
                      fontSize: 12, padding: 0, fontFamily: 'var(--font-body)',
                    }}
                  >
                    Edit
                  </button>
                </div>
              )}

              {saveStatus === 'saved' && (
                <span style={{ fontSize: 12, color: 'var(--green)', marginTop: 4, display: 'block' }}>
                  Saved ✓
                </span>
              )}
              {saveStatus === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--red)', marginTop: 4, display: 'block' }}>
                  Something went wrong
                </span>
              )}

              <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>
                {profile.email}
              </div>

              {profile.intend_handle && (
                <div style={{ fontSize: 12, color: 'var(--accent-ink)', marginTop: 3 }}>
                  @{profile.intend_handle}
                </div>
              )}
            </div>
          </div>

          {/* Meta row */}
          <div style={{
            display: 'flex', gap: 16, flexWrap: 'wrap',
            paddingTop: 16, borderTop: '1px solid var(--stroke-1)',
          }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Member since</span>
              <span style={{ fontSize: 13, color: 'var(--text2)' }}>{formatDate(profile.created_at)}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Verification</span>
              <span style={{
                fontSize: 12, fontWeight: 600,
                color: profile.kyc_tier === 'tier_0' ? 'var(--text3)' : 'var(--accent-ink)',
              }}>
                {KYC_LABELS[profile.kyc_tier] ?? profile.kyc_tier}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Currency</span>
              <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                {profile.local_currency} · {profile.region}
              </span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Mode</span>
              <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                {profile.execution_mode === 'autonomous' ? 'Autonomous' : 'Semi-autonomous'}
              </span>
            </div>
          </div>
        </div>

        {/* ── Connected channels ─────────────────── */}
        <div className="settings-group">
          <div className="settings-group-label">Connected channels</div>
          <div className="channel-grid">
            <div className={`channel-card${profile.telegram_linked ? ' connected' : ''}`}>
              <div className="channel-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ color: profile.telegram_linked ? 'var(--accent-ink)' : 'var(--text3)' }}>
                  <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
                </svg>
              </div>
              <div className="channel-card-name">Telegram</div>
              <div className="channel-card-state">
                {profile.telegram_linked ? 'Connected' : (
                  <a href="https://t.me/intend_auto_bot" target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent-ink)', textDecoration: 'none', fontSize: 10.5 }}>
                    Connect →
                  </a>
                )}
              </div>
            </div>

            <div className="channel-card connected">
              <div className="channel-card-icon">🌐</div>
              <div className="channel-card-name">Web</div>
              <div className="channel-card-state">Active</div>
            </div>

            <div className={`channel-card${profile.whatsapp_linked ? ' connected' : ''}`}>
              <div className="channel-card-icon">
                <svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20" style={{ color: 'var(--text3)' }}>
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 0 0-3.48-8.413z"/>
                </svg>
              </div>
              <div className="channel-card-name">WhatsApp</div>
              <div className="channel-card-state">Coming soon</div>
            </div>
          </div>
        </div>

        {/* ── Footer link to Settings ─────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 4px',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text3)' }}>
            Execution mode, limits, notifications and more →
          </span>
          <Link
            href="/app/settings"
            style={{
              fontSize: 13, fontWeight: 600, color: 'var(--accent-ink)',
              textDecoration: 'none', padding: '6px 14px',
              border: '1.5px solid var(--stroke-2)', borderRadius: 8,
              transition: 'all 0.15s',
            }}
          >
            Settings
          </Link>
        </div>

      </div>
    </div>
  );
}
