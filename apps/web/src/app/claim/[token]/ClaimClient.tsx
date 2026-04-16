'use client';

import { useState } from 'react';

interface Props {
  claimId:          string;
  token:            string;
  amount:           string;
  asset:            string;
  senderNote?:      string;
  recipientContact: string;
  hoursLeft:        number;
  minutesLeft:      number;
}

type Step = 'choose' | 'wallet' | 'bank' | 'submitting' | 'success' | 'error';

export default function ClaimClient({
  claimId,
  token,
  amount,
  asset,
  senderNote,
  recipientContact,
  hoursLeft,
  minutesLeft,
}: Props) {
  const [step, setStep] = useState<Step>('choose');
  const [walletAddress, setWalletAddress] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [error, setError] = useState('');

  const displayAmount = Number(amount).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const timeLabel =
    hoursLeft > 0
      ? `${hoursLeft}h ${minutesLeft}m remaining`
      : `${minutesLeft} minutes remaining`;

  async function submit(method: string, address: string) {
    setStep('submitting');
    setError('');

    try {
      const res = await fetch('/api/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, method, address }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error((json as { error?: string }).error ?? 'Something went wrong');
      }

      setStep('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStep('error');
    }
  }

  // ── Success ──────────────────────────────────────────────────────────────

  if (step === 'success') {
    return (
      <div className="claim-page">
        <div className="claim-card">
          <div className="claim-logo">i</div>
          <div className="claim-success-icon">✓</div>
          <div className="claim-success-title">Funds on their way</div>
          <div className="claim-success-body">
            Your <strong>${displayAmount} {asset}</strong> is being processed.
            You'll receive confirmation at <strong>{recipientContact}</strong>.
          </div>
        </div>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (step === 'error') {
    return (
      <div className="claim-page">
        <div className="claim-card">
          <div className="claim-logo">i</div>
          <div className="claim-terminal-icon" style={{ color: 'var(--red)' }}>!</div>
          <div className="claim-terminal-title">Something went wrong</div>
          <div className="claim-terminal-body">{error}</div>
          <button className="claim-btn" onClick={() => setStep('choose')}>
            Try again
          </button>
        </div>
      </div>
    );
  }

  // ── Submitting ────────────────────────────────────────────────────────────

  if (step === 'submitting') {
    return (
      <div className="claim-page">
        <div className="claim-card">
          <div className="claim-logo">i</div>
          <div className="claim-loading">
            <div className="claim-spinner" />
          </div>
          <div className="claim-terminal-title" style={{ marginTop: 16 }}>Processing…</div>
          <div className="claim-terminal-body">Setting up your transfer</div>
        </div>
      </div>
    );
  }

  // ── Wallet form ───────────────────────────────────────────────────────────

  if (step === 'wallet') {
    return (
      <div className="claim-page">
        <div className="claim-card">
          <div className="claim-logo">i</div>
          <div className="claim-amount">
            <span className="claim-currency">$</span>
            {displayAmount}
            <span className="claim-asset">{asset}</span>
          </div>
          <div className="claim-field-label">Your wallet address</div>
          <input
            className="claim-input"
            placeholder="0x… or ENS name"
            value={walletAddress}
            onChange={e => setWalletAddress(e.target.value)}
            autoFocus
          />
          <div className="claim-hint">
            We'll send to this address on Base. Double-check it — blockchain transfers are irreversible.
          </div>
          <button
            className="claim-btn"
            disabled={walletAddress.trim().length < 10}
            onClick={() => submit('crypto_wallet', walletAddress.trim())}
          >
            Receive ${displayAmount} →
          </button>
          <button className="claim-back" onClick={() => setStep('choose')}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Bank form ─────────────────────────────────────────────────────────────

  if (step === 'bank') {
    return (
      <div className="claim-page">
        <div className="claim-card">
          <div className="claim-logo">i</div>
          <div className="claim-amount">
            <span className="claim-currency">$</span>
            {displayAmount}
            <span className="claim-asset">{asset}</span>
          </div>
          <div className="claim-field-label">Bank name</div>
          <input
            className="claim-input"
            placeholder="e.g. Access Bank"
            value={bankName}
            onChange={e => setBankName(e.target.value)}
            autoFocus
          />
          <div className="claim-field-label" style={{ marginTop: 14 }}>Account number</div>
          <input
            className="claim-input"
            placeholder="Account number"
            value={bankAccount}
            onChange={e => setBankAccount(e.target.value)}
          />
          <div className="claim-hint">
            We'll initiate a transfer to this account. Processing typically takes 1–2 business days.
          </div>
          <button
            className="claim-btn"
            disabled={bankAccount.trim().length < 6 || bankName.trim().length < 2}
            onClick={() => submit('bank', `${bankName.trim()}:${bankAccount.trim()}`)}
          >
            Receive ${displayAmount} →
          </button>
          <button className="claim-back" onClick={() => setStep('choose')}>
            ← Back
          </button>
        </div>
      </div>
    );
  }

  // ── Choose method ─────────────────────────────────────────────────────────

  return (
    <div className="claim-page">
      <div className="claim-card">
        <div className="claim-logo">i</div>

        {/* Amount hero */}
        <div className="claim-amount">
          <span className="claim-currency">$</span>
          {displayAmount}
          <span className="claim-asset">{asset}</span>
        </div>

        {/* Sender note */}
        {senderNote && (
          <div className="claim-note">
            <span className="claim-note-label">Message</span>
            <span className="claim-note-text">"{senderNote}"</span>
          </div>
        )}

        <div className="claim-expiry">
          <span className="claim-expiry-dot" />
          {timeLabel}
        </div>

        <div className="claim-section-label">How would you like to receive it?</div>

        {/* Method cards */}
        <div className="claim-methods">
          <button className="claim-method" onClick={() => setStep('wallet')}>
            <div className="claim-method-icon">◈</div>
            <div className="claim-method-body">
              <div className="claim-method-title">Crypto wallet</div>
              <div className="claim-method-sub">Receive to any Base-compatible wallet</div>
            </div>
            <div className="claim-method-arrow">→</div>
          </button>

          <button className="claim-method" onClick={() => setStep('bank')}>
            <div className="claim-method-icon">⬡</div>
            <div className="claim-method-body">
              <div className="claim-method-title">Bank account</div>
              <div className="claim-method-sub">Transfer to your local bank · 1–2 days</div>
            </div>
            <div className="claim-method-arrow">→</div>
          </button>

          <a className="claim-method" href={`/login?redirect=claim&token=${token}`}>
            <div className="claim-method-icon">i</div>
            <div className="claim-method-body">
              <div className="claim-method-title">Create an Intend account</div>
              <div className="claim-method-sub">Keep earning on your money after you receive it</div>
            </div>
            <div className="claim-method-arrow">→</div>
          </a>
        </div>

        <div className="claim-footer">
          Funds secured in escrow · Powered by Intend
        </div>
      </div>
    </div>
  );
}
