'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { onboardingTurn, completeOnboarding } from './actions';
import type { OnboardingState, OnboardingHistoryEntry } from '@intend/intelligence';

/* ── motion ───────────────────────────────────────────────────────────── */
const ease = [0.16, 1, 0.3, 1] as const;

interface Props {
  email:         string;
  displayName:   string | null;
  localCurrency: string;
  region:        string;
}

interface ChatMessage {
  role:    'user' | 'assistant';
  content: string;
  ts:      number;
}

/* ── component ────────────────────────────────────────────────────────── */
export function OnboardFlow({ email }: Props) {
  const [state,    setState]    = useState<OnboardingState>('greeting');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input,    setInput]    = useState('');
  const [thinking, setThinking] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletRevealed, setWalletRevealed] = useState(false);
  const [finishing, setFinishing] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  const greetedRef = useRef(false);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, thinking]);

  const runTurn = useCallback(async (userText: string) => {
    setThinking(true);

    const history: OnboardingHistoryEntry[] = messages.map((m) => ({
      role:    m.role,
      content: m.content,
    }));

    try {
      const res = await onboardingTurn({
        state,
        history,
        user_message: userText,
      });

      if (res.error) {
        setMessages((m) => [...m, { role: 'assistant', content: res.message || 'Something went wrong. Try again.', ts: Date.now() }]);
        setThinking(false);
        return;
      }

      setMessages((m) => [...m, { role: 'assistant', content: res.message, ts: Date.now() }]);
      setState(res.next_state);

      if (res.wallet_address) {
        setWalletAddress(res.wallet_address);
      }
      if (res.reveal_wallet) {
        // small delay so the message renders first, then the card slides in
        setTimeout(() => setWalletRevealed(true), 600);
      }

      if (res.finished) {
        // Save first intent if the user typed one in the wallet/intent state
        if ((state === 'wallet' || state === 'intent') && userText.trim()) {
          sessionStorage.setItem('intend:first_intent', userText.trim());
        }
        setFinishing(true);
        // Small pause so the user reads the final agent message before redirect
        setTimeout(() => { void completeOnboarding(); }, 1800);
      }
    } catch (err) {
      console.error('[onboard] turn failed:', err);
      setMessages((m) => [...m, {
        role: 'assistant',
        content: "I'm having trouble thinking right now. Give me a moment.",
        ts: Date.now(),
      }]);
    } finally {
      setThinking(false);
      // Refocus input
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [messages, state]);

  // Fire the greeting once on mount
  useEffect(() => {
    if (greetedRef.current) return;
    greetedRef.current = true;
    void runTurn('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || thinking || finishing) return;
    setMessages((m) => [...m, { role: 'user', content: text, ts: Date.now() }]);
    setInput('');
    void runTurn(text);
  }

  const shortWallet = walletAddress
    ? `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`
    : null;

  return (
    <div className="ob-chat-root">
      <div className="ob-orb ob-orb-1" aria-hidden />
      <div className="ob-orb ob-orb-2" aria-hidden />

      {/* ── Header ─────────────────────────────────────────────────── */}
      <header className="ob-chat-header">
        <div className="ob-chat-brand">
          <span className="ob-chat-mark">i</span>
          <span className="ob-chat-name">Intend</span>
        </div>
        <span className="ob-chat-email" title={email}>{email}</span>
      </header>

      {/* ── Two-column layout ──────────────────────────────────────── */}
      <div className="ob-chat-layout">
        {/* Chat column */}
        <div className="ob-chat-col">
          <div className="ob-chat-stream" ref={scrollRef}>
            <AnimatePresence initial={false}>
              {messages.map((m, i) => (
                <motion.div
                  key={`${m.ts}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease }}
                  className={`ob-bubble ob-bubble--${m.role}`}
                >
                  {m.content}
                </motion.div>
              ))}
              {thinking && (
                <motion.div
                  key="thinking"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="ob-bubble ob-bubble--assistant ob-bubble--thinking"
                >
                  <span className="ob-dot-pulse" />
                  <span className="ob-dot-pulse" />
                  <span className="ob-dot-pulse" />
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <form className="ob-chat-input-row" onSubmit={handleSubmit}>
            <textarea
              ref={inputRef}
              className="ob-chat-input"
              placeholder={
                finishing ? 'Opening your dashboard…' :
                thinking ? '' :
                state === 'wallet' || state === 'intent'
                  ? 'Tell Intend what you want your money to do first…'
                  : 'Type your reply…'
              }
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit();
                }
              }}
              disabled={thinking || finishing}
            />
            <button
              type="submit"
              className="ob-chat-send"
              disabled={!input.trim() || thinking || finishing}
              aria-label="Send"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </form>
        </div>

        {/* Side column — wallet / progress reveal */}
        <aside className="ob-side-col">
          <AnimatePresence mode="wait">
            {!walletRevealed ? (
              <motion.div
                key="setup"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.4, ease }}
                className="ob-side-card ob-side-card--setup"
              >
                <div className="ob-side-eyebrow">Working in the background</div>
                <h3 className="ob-side-heading">Spinning up your account</h3>

                <div className="ob-bg-work" aria-live="polite">
                  <div className="ob-bg-orb">
                    <div className="ob-bg-orbit">
                      <span className="ob-bg-particle ob-bg-particle--1" />
                      <span className="ob-bg-particle ob-bg-particle--2" />
                      <span className="ob-bg-particle ob-bg-particle--3" />
                    </div>
                  </div>

                  <div className="ob-bg-status">{statusLine(state)}</div>

                  <ul className="ob-bg-steps">
                    <li className={bgStepClass(state, 'greeting', 'location')}>
                      <span className="ob-bg-step-bullet" />
                      Reading your context
                    </li>
                    <li className={bgStepClass(state, 'location', 'income')}>
                      <span className="ob-bg-step-bullet" />
                      Tuning to your currency &amp; region
                    </li>
                    <li className={bgStepClass(state, 'income', 'risk')}>
                      <span className="ob-bg-step-bullet" />
                      Calibrating to your comfort
                    </li>
                    <li className={bgStepClass(state, 'risk', 'wallet')}>
                      <span className="ob-bg-step-bullet" />
                      Provisioning a secure account
                    </li>
                  </ul>
                </div>

                <p className="ob-side-foot">
                  Your secure account is being created in a hardware enclave —
                  no keys ever touch Intend&apos;s servers.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="wallet"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5, ease }}
                className="ob-side-card ob-side-card--wallet"
              >
                <div className="ob-side-eyebrow">Live</div>
                <h3 className="ob-side-heading">Your account is ready</h3>
                <div className="ob-wallet-row">
                  <span className="ob-wallet-label">Address</span>
                  <code className="ob-wallet-addr" title={walletAddress ?? ''}>
                    {shortWallet ?? 'Provisioning…'}
                  </code>
                </div>
                <div className="ob-wallet-row">
                  <span className="ob-wallet-label">Custody</span>
                  <span className="ob-wallet-val">Hardware enclave</span>
                </div>
                <p className="ob-side-foot">
                  Private keys are held by Coinbase&apos;s secure enclave —
                  never on Intend&apos;s servers.
                </p>
                <div className="ob-side-nudge">
                  <span className="ob-nudge-icon">↓</span>
                  Add funds anytime from the dashboard once you&apos;re in.
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </aside>
      </div>
    </div>
  );
}

function progressClass(current: OnboardingState, mineEnter: OnboardingState, mineDone: OnboardingState): string {
  const order: OnboardingState[] = ['greeting', 'location', 'income', 'risk', 'wallet', 'intent', 'done'];
  const ci = order.indexOf(current);
  const di = order.indexOf(mineDone);
  if (ci >= di) return 'ob-progress-li ob-progress-li--done';
  if (ci >= order.indexOf(mineEnter)) return 'ob-progress-li ob-progress-li--current';
  return 'ob-progress-li';
}

function bgStepClass(current: OnboardingState, enter: OnboardingState, done: OnboardingState): string {
  const order: OnboardingState[] = ['greeting', 'location', 'income', 'risk', 'wallet', 'intent', 'done'];
  const ci = order.indexOf(current);
  if (ci >= order.indexOf(done))  return 'ob-bg-step ob-bg-step--done';
  if (ci >= order.indexOf(enter)) return 'ob-bg-step ob-bg-step--active';
  return 'ob-bg-step';
}

function statusLine(state: OnboardingState): string {
  switch (state) {
    case 'greeting': return 'Listening…';
    case 'location': return 'Tuning to your region…';
    case 'income':   return 'Calibrating to your comfort…';
    case 'risk':     return 'Building your secure account…';
    case 'wallet':   return 'Almost ready…';
    case 'intent':   return 'All set — what would you like to do first?';
    case 'done':     return 'Welcome.';
    default:         return 'Working…';
  }
}
