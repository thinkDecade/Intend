'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { saveOnboardingProfile, completeOnboarding, provisionWallet } from './actions';

/* ── motion ───────────────────────────────────────────────────────────── */
const ease = [0.16, 1, 0.3, 1] as const;
const slide = {
  enter: (dir: number) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.45, ease } },
  exit: (dir: number) => ({
    opacity: 0,
    x: dir > 0 ? -40 : 40,
    transition: { duration: 0.3, ease },
  }),
};

/* ── types ────────────────────────────────────────────────────────────── */
interface Profile {
  display_name: string;
  local_currency: string;
  region: string;
  timezone: string;
  execution_mode: 'semi_autonomous' | 'autonomous';
}

interface Props {
  email: string;
  displayName: string | null;
  localCurrency: string;
  region: string;
}

/* ── constants ────────────────────────────────────────────────────────── */
const TOTAL_STEPS = 6;

const CURRENCIES = [
  { code: 'USD', label: 'US Dollar' },
  { code: 'GBP', label: 'British Pound' },
  { code: 'EUR', label: 'Euro' },
  { code: 'GHS', label: 'Ghanaian Cedi' },
  { code: 'NGN', label: 'Nigerian Naira' },
  { code: 'KES', label: 'Kenyan Shilling' },
  { code: 'ZAR', label: 'South African Rand' },
  { code: 'AED', label: 'UAE Dirham' },
  { code: 'CAD', label: 'Canadian Dollar' },
  { code: 'AUD', label: 'Australian Dollar' },
];

const FIRST_INTENTS = [
  'Protect my savings from inflation',
  'Put $500 to work earning yield',
  'Send $100 to a friend',
  'Save $2,000 for a trip',
  'Convert my dollars to cedis',
  'Invest in what I believe in',
];

/* ── step components ───────────────────────────────────────────────────── */

function StepWelcome({ onNext }: { onNext: () => void }) {
  const capabilities = [
    { label: 'Protect', body: 'Shield your money from inflation and currency risk automatically.' },
    { label: 'Grow', body: 'Earn yield on idle capital — no dashboards, no protocols to learn.' },
    { label: 'Move', body: 'Send money to anyone, anywhere. They receive it in their currency.' },
    { label: 'Save', body: 'Name a goal. Intend funds it and tells you when you arrive.' },
    { label: 'Convert', body: 'Exchange any currency at the best available rate, instantly.' },
    { label: 'Spend', body: 'Pay for anything — online or in person — from your Intend balance.' },
  ];

  return (
    <div className="ob-step">
      <div className="ob-eyebrow">Welcome to Intend</div>
      <h1 className="ob-heading">
        Your money,<br />
        <em>executing your intentions.</em>
      </h1>
      <p className="ob-sub">
        Tell Intend what you want to happen with your money. It figures out
        how — routing through the best available paths, invisibly, in the
        background.
      </p>

      <div className="ob-cap-grid">
        {capabilities.map((c) => (
          <div key={c.label} className="ob-cap-card">
            <span className="ob-cap-label">{c.label}</span>
            <p className="ob-cap-body">{c.body}</p>
          </div>
        ))}
      </div>

      <button className="ob-btn-primary" onClick={onNext}>
        Let&apos;s begin
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

function StepProfile({
  initial,
  onNext,
}: {
  initial: Profile;
  onNext: (p: Partial<Profile>) => void;
}) {
  const [name, setName]     = useState(initial.display_name);
  const [currency, setCurrency] = useState(initial.local_currency || 'USD');
  const [region, setRegion] = useState(initial.region || 'US');
  const [tz, setTz]         = useState(initial.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [mode, setMode]     = useState<'semi_autonomous' | 'autonomous'>(initial.execution_mode);

  function handleNext() {
    onNext({
      display_name:   name.trim(),
      local_currency: currency,
      region,
      timezone:       tz,
      execution_mode: mode,
    });
  }

  const selectedCurrency = CURRENCIES.find((c) => c.code === currency);

  return (
    <div className="ob-step">
      <div className="ob-eyebrow">A little about you</div>
      <h2 className="ob-heading ob-heading--sm">Help Intend personalise your experience.</h2>

      <div className="ob-form">
        {/* Name */}
        <div className="ob-field">
          <label className="ob-label">What should I call you?</label>
          <input
            className="ob-input"
            type="text"
            placeholder="Your first name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="given-name"
          />
        </div>

        {/* Currency */}
        <div className="ob-field">
          <label className="ob-label">Your day-to-day currency</label>
          <div className="ob-select-wrap">
            <select
              className="ob-select"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.label}
                </option>
              ))}
              <option value="OTHER">Other</option>
            </select>
            <svg className="ob-select-icon" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          {selectedCurrency && (
            <span className="ob-hint">
              Intend will show balances and summaries in {selectedCurrency.label}.
            </span>
          )}
        </div>

        {/* Execution mode */}
        <div className="ob-field">
          <label className="ob-label">How should Intend act?</label>
          <div className="ob-mode-grid">
            <button
              type="button"
              className={`ob-mode-card ${mode === 'semi_autonomous' ? 'ob-mode-card--active' : ''}`}
              onClick={() => setMode('semi_autonomous')}
            >
              <span className="ob-mode-title">Guide me</span>
              <p className="ob-mode-body">
                Intend shows you a plan before every action. You approve. Nothing
                happens without your confirmation.
              </p>
              <span className="ob-mode-badge">Recommended</span>
            </button>
            <button
              type="button"
              className={`ob-mode-card ${mode === 'autonomous' ? 'ob-mode-card--active' : ''}`}
              onClick={() => setMode('autonomous')}
            >
              <span className="ob-mode-title">Handle it</span>
              <p className="ob-mode-body">
                Intend acts within the limits you set, then sends you a
                summary. Maximum efficiency, minimum friction.
              </p>
              <span className="ob-mode-badge ob-mode-badge--au">Autonomous</span>
            </button>
          </div>
          {mode === 'autonomous' && (
            <p className="ob-hint ob-hint--em">
              You stay in control — you set the per-transaction limit and can
              switch back to guided mode at any time in Settings.
            </p>
          )}
        </div>

        {/* Hidden timezone — auto-detect */}
        <input type="hidden" value={tz} readOnly />
      </div>

      <button className="ob-btn-primary" onClick={handleNext}>
        Continue
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  );
}

function StepAccount({
  email,
  profile,
  onNext,
}: {
  email: string;
  profile: Profile;
  onNext: () => void;
}) {
  const [copiedEmail,  setCopiedEmail]  = useState(false);
  const [copiedWallet, setCopiedWallet] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletError,   setWalletError]   = useState<string | null>(null);
  const [provisioning,  setProvisioning]  = useState(true);

  // Provision wallet as soon as this step mounts
  useEffect(() => {
    let cancelled = false;
    provisionWallet().then((result) => {
      if (cancelled) return;
      if ('address' in result) {
        setWalletAddress(result.address);
      } else {
        setWalletError(result.error);
      }
      setProvisioning(false);
    });
    return () => { cancelled = true; };
  }, []);

  function copyEmail() {
    navigator.clipboard.writeText(email).then(() => {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    });
  }

  function copyWallet() {
    if (!walletAddress) return;
    navigator.clipboard.writeText(walletAddress).then(() => {
      setCopiedWallet(true);
      setTimeout(() => setCopiedWallet(false), 2000);
    });
  }

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <div className="ob-step">
      <div className="ob-eyebrow">Your account is live</div>
      <h2 className="ob-heading ob-heading--sm">
        {profile.display_name
          ? `Welcome, ${profile.display_name}.`
          : 'Your financial command center is ready.'}
      </h2>
      <p className="ob-sub">
        Intend has set up your secure account and provisioned your wallet.
        Your private keys are held in Coinbase&apos;s secure enclave — never on Intend&apos;s servers.
      </p>

      <div className="ob-account-card">
        <div className="ob-account-row">
          <span className="ob-account-label">Account</span>
          <span className="ob-account-value">{email}</span>
          <button className="ob-copy-btn" onClick={copyEmail} title="Copy email">
            {copiedEmail ? (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2 7l3.5 3.5L12 3" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
            )}
          </button>
        </div>
        <div className="ob-account-row">
          <span className="ob-account-label">Currency</span>
          <span className="ob-account-value">{profile.local_currency}</span>
        </div>
        <div className="ob-account-row">
          <span className="ob-account-label">Mode</span>
          <span className="ob-account-value">
            {profile.execution_mode === 'autonomous' ? 'Autonomous' : 'Guided'}
          </span>
        </div>
        <div className="ob-account-row ob-account-row--last">
          <span className="ob-account-label">Wallet</span>
          {provisioning ? (
            <span className="ob-account-value ob-account-value--muted" style={{ fontStyle: 'italic' }}>
              Provisioning…
            </span>
          ) : walletAddress ? (
            <>
              <span
                className="ob-account-value"
                style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                title={walletAddress}
              >
                {shortWallet}
              </span>
              <button className="ob-copy-btn" onClick={copyWallet} title="Copy wallet address">
                {copiedWallet ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path d="M2 7l3.5 3.5L12 3" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <rect x="4" y="4" width="8" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M2 10V2h8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                  </svg>
                )}
              </button>
            </>
          ) : (
            <span className="ob-account-value ob-account-value--muted" style={{ fontSize: 11 }}>
              {walletError ?? 'Will be created on first use'}
            </span>
          )}
        </div>
      </div>

      <p className="ob-security-note">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1.5 2 3.5v4c0 3 2 5 5 5.5 3-.5 5-2.5 5-5.5v-4L7 1.5z" stroke="var(--accent)" strokeWidth="1.2"/>
        </svg>
        Your private keys never touch Intend&apos;s servers. Custody is yours.
      </p>

      <button className="ob-btn-primary" onClick={onNext}>
        Fund my account
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button className="ob-btn-ghost" onClick={onNext}>
        Skip for now
      </button>
    </div>
  );
}

function StepFund({ onNext }: { onNext: () => void }) {
  const [tab, setTab] = useState<'crypto' | 'fiat'>('crypto');

  return (
    <div className="ob-step">
      <div className="ob-eyebrow">Add funds</div>
      <h2 className="ob-heading ob-heading--sm">Put your money to work.</h2>
      <p className="ob-sub">
        Fund your Intend account to start executing intentions. Choose the
        method that works for you.
      </p>

      <div className="ob-tab-row">
        <button
          className={`ob-tab ${tab === 'crypto' ? 'ob-tab--active' : ''}`}
          onClick={() => setTab('crypto')}
        >
          Crypto deposit
        </button>
        <button
          className={`ob-tab ${tab === 'fiat' ? 'ob-tab--active' : ''}`}
          onClick={() => setTab('fiat')}
        >
          Bank / card
        </button>
      </div>

      <AnimatePresence mode="wait">
        {tab === 'crypto' ? (
          <motion.div
            key="crypto"
            className="ob-fund-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <p className="ob-fund-body">
              Send USDC, ETH, or any supported asset to your Intend wallet.
              Your deposit address is generated when you make your first
              transaction — Intend routes it automatically.
            </p>
            <div className="ob-fund-steps">
              <div className="ob-fund-step">
                <span className="ob-step-num">01</span>
                <span>Complete your first intention in the next step</span>
              </div>
              <div className="ob-fund-step">
                <span className="ob-step-num">02</span>
                <span>Intend creates your custody wallet instantly</span>
              </div>
              <div className="ob-fund-step">
                <span className="ob-step-num">03</span>
                <span>Your deposit address appears in your dashboard</span>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="fiat"
            className="ob-fund-card"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25 }}
          >
            <p className="ob-fund-body">
              Bank transfers and card deposits are coming shortly. You can
              start using Intend with crypto now and connect your bank when
              fiat rails go live.
            </p>
            <div className="ob-coming-badge">Coming soon</div>
          </motion.div>
        )}
      </AnimatePresence>

      <button className="ob-btn-primary" onClick={onNext}>
        Try my first intention
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button className="ob-btn-ghost" onClick={onNext}>
        Skip for now
      </button>
    </div>
  );
}

function StepFirstIntent({
  profile,
  onNext,
}: {
  profile: Profile;
  onNext: () => void;
}) {
  const [intent, setIntent] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function pickChip(text: string) {
    setIntent(text);
    inputRef.current?.focus();
  }

  function handleTry() {
    // Store intent in sessionStorage so ChatPanel can pick it up on /app load
    if (intent.trim()) {
      sessionStorage.setItem('intend:first_intent', intent.trim());
    }
    onNext();
  }

  return (
    <div className="ob-step">
      <div className="ob-eyebrow">Your first intention</div>
      <h2 className="ob-heading ob-heading--sm">
        {profile.display_name
          ? `What's first, ${profile.display_name}?`
          : 'What do you want your money to do?'}
      </h2>
      <p className="ob-sub">
        Just say what you want to happen — in plain words. No commands, no
        menus.
      </p>

      <div className="ob-chips">
        {FIRST_INTENTS.map((t) => (
          <button
            key={t}
            className={`ob-chip ${intent === t ? 'ob-chip--active' : ''}`}
            onClick={() => pickChip(t)}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="ob-intent-wrap">
        <textarea
          ref={inputRef}
          className="ob-intent-input"
          placeholder="Or type your intention here…"
          rows={3}
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && intent.trim()) {
              e.preventDefault();
              handleTry();
            }
          }}
        />
      </div>

      <button
        className="ob-btn-primary"
        onClick={handleTry}
        disabled={!intent.trim()}
      >
        Try it now
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      <button className="ob-btn-ghost" onClick={onNext}>
        Skip for now
      </button>
    </div>
  );
}

function StepChannels({ onFinish }: { onFinish: () => void }) {
  const [finishing, setFinishing] = useState(false);

  async function handleFinish() {
    setFinishing(true);
    await completeOnboarding(); // server action → redirects to /app
  }

  return (
    <div className="ob-step">
      <div className="ob-eyebrow">Take Intend everywhere</div>
      <h2 className="ob-heading ob-heading--sm">
        Intend works wherever you are.
      </h2>
      <p className="ob-sub">
        Connect a channel and execute intentions from your phone — no app
        download needed.
      </p>

      <div className="ob-channel-grid">
        <a
          className="ob-channel-card"
          href="https://t.me/intend_auto_bot"
          target="_blank"
          rel="noopener noreferrer"
        >
          <div className="ob-channel-icon ob-channel-icon--tg">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221-1.97 9.28c-.145.658-.537.818-1.084.508l-3-2.21-1.447 1.394c-.16.16-.295.295-.605.295l.213-3.053 5.56-5.023c.242-.213-.054-.333-.373-.12L7.54 13.56l-2.96-.924c-.643-.204-.657-.643.136-.953l11.57-4.461c.537-.194 1.006.131.608.999z"/>
            </svg>
          </div>
          <div className="ob-channel-text">
            <span className="ob-channel-name">Telegram</span>
            <span className="ob-channel-handle">@intend_auto_bot</span>
          </div>
          <svg className="ob-channel-arrow" width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </a>

        <div className="ob-channel-card ob-channel-card--soon">
          <div className="ob-channel-icon ob-channel-icon--wa">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
          </div>
          <div className="ob-channel-text">
            <span className="ob-channel-name">WhatsApp</span>
            <span className="ob-channel-handle">Coming soon</span>
          </div>
          <span className="ob-soon-badge">Soon</span>
        </div>
      </div>

      <p className="ob-hint" style={{ textAlign: 'center', marginBottom: '2rem' }}>
        You can connect channels anytime from Settings.
      </p>

      <button
        className="ob-btn-primary"
        onClick={handleFinish}
        disabled={finishing}
      >
        {finishing ? 'Opening your dashboard…' : 'Open my dashboard'}
        {!finishing && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </button>
    </div>
  );
}

/* ── main orchestrator ─────────────────────────────────────────────────── */
export function OnboardFlow({ email, displayName, localCurrency, region }: Props) {
  const [step, setStep]     = useState(0);
  const [dir, setDir]       = useState(1);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState<Profile>({
    display_name:   displayName ?? '',
    local_currency: localCurrency || 'USD',
    region:         region || 'US',
    timezone:       Intl.DateTimeFormat().resolvedOptions().timeZone,
    execution_mode: 'semi_autonomous',
  });

  const advance = useCallback(() => {
    setDir(1);
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
  }, []);

  async function handleProfileNext(patch: Partial<Profile>) {
    const merged = { ...profile, ...patch };
    setProfile(merged);

    setSaving(true);
    try {
      const fd = new FormData();
      fd.append('display_name',   merged.display_name);
      fd.append('local_currency', merged.local_currency);
      fd.append('region',         merged.region);
      fd.append('timezone',       merged.timezone);
      fd.append('execution_mode', merged.execution_mode);
      await saveOnboardingProfile(fd);
    } finally {
      setSaving(false);
    }
    advance();
  }

  const steps = [
    <StepWelcome key="welcome" onNext={advance} />,
    <StepProfile key="profile" initial={profile} onNext={handleProfileNext} />,
    <StepAccount key="account" email={email} profile={profile} onNext={advance} />,
    <StepFund key="fund" onNext={advance} />,
    <StepFirstIntent key="intent" profile={profile} onNext={advance} />,
    <StepChannels key="channels" onFinish={advance} />,
  ];

  const stepLabels = ['Welcome', 'Profile', 'Account', 'Fund', 'First intention', 'Channels'];

  return (
    <div className="ob-root">
      {/* Background orbs */}
      <div className="ob-orb ob-orb-1" aria-hidden />
      <div className="ob-orb ob-orb-2" aria-hidden />

      {/* Progress */}
      <div className="ob-progress-bar">
        <div className="ob-progress-inner" style={{ width: `${((step) / (TOTAL_STEPS - 1)) * 100}%` }} />
      </div>
      <div className="ob-step-label">{stepLabels[step]}</div>
      <div className="ob-dots" aria-label={`Step ${step + 1} of ${TOTAL_STEPS}`}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <span key={i} className={`ob-dot ${i === step ? 'ob-dot--active' : i < step ? 'ob-dot--done' : ''}`} />
        ))}
      </div>

      {/* Step panel */}
      <div className="ob-panel">
        {saving && (
          <div className="ob-saving">
            <span className="ob-saving-spinner" />
            Saving…
          </div>
        )}
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slide}
            initial="enter"
            animate="center"
            exit="exit"
            className="ob-step-wrap"
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
