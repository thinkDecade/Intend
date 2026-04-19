'use client';

import { Suspense, useState, useTransition, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { startAuthentication } from '@simplewebauthn/browser';
import { signInWithOtp, verifyOtp } from './actions';

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const [step, setStep]     = useState<'email' | 'otp'>('email');
  const [email, setEmail]   = useState('');
  const [token, setToken]   = useState('');
  const [error, setError]   = useState('');
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();
  const router       = useRouter();

  async function handlePasskey() {
    setError('');
    if (!email.trim()) {
      setError('Enter your email first, then sign in with a passkey.');
      return;
    }
    setPasskeyBusy(true);
    try {
      const optsRes = await fetch('/api/auth/passkey/login/options', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body:   JSON.stringify({ email: email.trim() }),
      });
      if (!optsRes.ok) throw new Error('Could not start passkey sign-in.');
      const { options } = await optsRes.json();

      const assertion = await startAuthentication(options);

      const verifyRes = await fetch('/api/auth/passkey/login/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body:   JSON.stringify({ email: email.trim(), response: assertion }),
      });
      const json = await verifyRes.json();
      if (!verifyRes.ok || !json.ok) throw new Error(json.error ?? 'Passkey sign-in failed.');

      router.push('/app');
      router.refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Passkey sign-in failed.';
      // The browser surfaces a friendly cancellation; treat NotAllowedError as a no-op.
      if (!/NotAllowed|abort/i.test(msg)) setError(msg);
    } finally {
      setPasskeyBusy(false);
    }
  }

  useEffect(() => {
    if (searchParams.get('error') === 'auth_failed') {
      const msg = searchParams.get('message');
      setError(msg
        ? `Sign-in failed: ${msg}`
        : 'Sign-in link expired or already used. Request a new one.');
    }
  }, [searchParams]);

  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const result = await signInWithOtp(fd);
      if ('error' in result) {
        setError(result.error);
      } else {
        setEmail(fd.get('email') as string);
        setStep('otp');
      }
    });
  }

  async function handleOtpSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    const fd = new FormData(e.currentTarget);
    fd.set('email', email);
    startTransition(async () => {
      const result = await verifyOtp(fd);
      if (result && 'error' in result) setError(result.error);
    });
  }

  return (
    <>
      <div className="ambient" />
      <div className="login-page">
        <div className="login-card">

          {/* Logo */}
          <div className="login-logo">intend</div>

          {/* Heading */}
          <div className="login-heading">
            {step === 'email' ? 'Welcome to Intend' : 'Check your inbox'}
          </div>
          <div className="login-sub">
            {step === 'email'
              ? 'Your money, executing your intentions. Enter your email to get started.'
              : `We sent a 6-digit code to ${email}. Enter it below to sign in.`}
          </div>

          {/* Error */}
          {error && <div className="login-error">{error}</div>}

          {step === 'email' ? (
            <form onSubmit={handleEmailSubmit}>
              <label className="login-label" htmlFor="email">Email address</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoFocus
                placeholder="you@example.com"
                className="login-input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                type="submit"
                disabled={isPending || passkeyBusy}
                className="login-btn"
              >
                {isPending ? 'Sending…' : 'Email me a code →'}
              </button>

              {/* Equal-prominence second path. No "recommended" hierarchy. */}
              <div className="login-divider"><span>or</span></div>

              <button
                type="button"
                onClick={handlePasskey}
                disabled={isPending || passkeyBusy}
                className="login-btn"
                style={{ background: 'transparent', color: 'var(--text)', border: '1.5px solid var(--text)' }}
              >
                {passkeyBusy ? 'Waiting for passkey…' : 'Sign in with a passkey'}
              </button>
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--text3)', textAlign: 'center' }}>
                Both options sign you in. Pick whichever you prefer.
              </div>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} autoComplete="off">
              <label className="login-label" htmlFor="token">6-digit code</label>
              <input
                id="token"
                name="token"
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                autoComplete="one-time-code"
                autoCorrect="off"
                spellCheck={false}
                maxLength={6}
                required
                autoFocus
                placeholder="000000"
                className="login-input otp"
                value={token}
                onChange={(e) => setToken(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onPaste={(e) => {
                  e.preventDefault();
                  const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
                  setToken(pasted);
                }}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
              />
              <button
                type="submit"
                disabled={isPending}
                className="login-btn"
              >
                {isPending ? 'Verifying…' : 'Sign in'}
              </button>
              <button
                type="button"
                className="login-btn-ghost"
                onClick={() => { setStep('email'); setError(''); setToken(''); }}
              >
                Use a different email
              </button>
            </form>
          )}

        </div>
      </div>
    </>
  );
}
