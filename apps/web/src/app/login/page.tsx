'use client';

import { Suspense, useState, useTransition, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
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
  const [isPending, startTransition] = useTransition();
  const searchParams = useSearchParams();

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
              />
              <button
                type="submit"
                disabled={isPending}
                className="login-btn"
              >
                {isPending ? 'Sending…' : 'Continue →'}
              </button>
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
