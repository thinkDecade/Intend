'use client';

import { useState, useTransition } from 'react';
import { startRegistration } from '@simplewebauthn/browser';

export interface PasskeyListItem {
  credential_id_pk: string;
  device_label:     string | null;
  created_at:       string;
  last_used_at:     string | null;
}

export function PasskeySection({ initial }: { initial: PasskeyListItem[] }) {
  const [list, setList]       = useState(initial);
  const [label, setLabel]     = useState('');
  const [error, setError]     = useState('');
  const [busy, setBusy]       = useState(false);
  const [pending, startT]     = useTransition();

  async function handleRegister() {
    setError('');
    setBusy(true);
    try {
      const optsRes = await fetch('/api/auth/passkey/register/options', { method: 'POST' });
      if (!optsRes.ok) throw new Error('Could not start registration.');
      const options = await optsRes.json();

      const attestation = await startRegistration(options);

      const verifyRes = await fetch('/api/auth/passkey/register/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body:   JSON.stringify({ response: attestation, device_label: label.trim() || null }),
      });
      const json = await verifyRes.json();
      if (!verifyRes.ok || !json.verified) throw new Error(json.error ?? 'Registration failed.');

      // Refresh the list from server.
      const listRes = await fetch('/api/auth/passkey/list', { method: 'GET' });
      if (listRes.ok) {
        const next = await listRes.json();
        setList(next.passkeys ?? []);
      }
      setLabel('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not register passkey.';
      if (!/NotAllowed|abort/i.test(msg)) setError(msg);
    } finally {
      setBusy(false);
    }
  }

  function handleRemove(id: string) {
    if (!confirm('Remove this passkey? You can always register another one.')) return;
    startT(async () => {
      const res = await fetch('/api/auth/passkey/list', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body:   JSON.stringify({ credential_id_pk: id }),
      });
      if (res.ok) setList(list.filter(p => p.credential_id_pk !== id));
    });
  }

  return (
    <div
      className="settings-group"
      style={{ marginTop: 12, minWidth: 0, overflow: 'hidden' }}
    >
      <div className="settings-group-label" style={{ color: 'var(--text)' }}>
        Passkeys
      </div>
      <div
        className="settings-row-sub"
        style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12 }}
      >
        Sign in with Face ID, Touch ID, or a hardware security key — no email codes needed.
      </div>

      {list.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {list.map(p => (
            <div
              key={p.credential_id_pk}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '10px 14px',
                border: '1px solid var(--stroke-2)',
                borderRadius: 8,
                background: 'var(--surface2)',
                minWidth: 0,
              }}
            >
              <div style={{ minWidth: 0, flex: 1 }}>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 600,
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {p.device_label ?? 'Unnamed device'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                  Added {new Date(p.created_at).toLocaleDateString()}
                  {p.last_used_at
                    ? ` · Last used ${new Date(p.last_used_at).toLocaleDateString()}`
                    : ' · Never used'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(p.credential_id_pk)}
                disabled={pending}
                style={{
                  flexShrink: 0,
                  fontSize: 12,
                  color: 'var(--red)',
                  background: 'transparent',
                  border: '1px solid var(--red-dim)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  cursor: 'pointer',
                }}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'stretch',
          flexWrap: 'wrap',
          minWidth: 0,
        }}
      >
        <input
          type="text"
          placeholder="Device name (e.g. MacBook Touch ID)"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={40}
          className="login-input"
          style={{
            flex: '1 1 180px',
            minWidth: 0,
            background: 'var(--bg)',
            color: 'var(--text)',
            border: '1px solid var(--stroke-2)',
          }}
        />
        <button
          type="button"
          onClick={handleRegister}
          disabled={busy}
          className="login-btn"
          style={{
            flexShrink: 0,
            width: 'auto',
            padding: '8px 18px',
            whiteSpace: 'nowrap',
          }}
        >
          {busy ? 'Registering…' : list.length === 0 ? 'Add passkey' : 'Add another'}
        </button>
      </div>
      {error && (
        <div className="login-error" style={{ marginTop: 10 }}>
          {error}
        </div>
      )}
    </div>
  );
}
