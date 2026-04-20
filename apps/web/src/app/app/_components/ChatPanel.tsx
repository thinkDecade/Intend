'use client';

import { useState, useRef, useEffect, useCallback, useTransition, Fragment } from 'react';
import { completeOnboardingFromChat } from '../actions';

// ── Types ──────────────────────────────────────────────────────────────────

interface PlanMeta {
  intent_id:   string;
  plan_id:     string;
  primitive:   string;
  fees_total:  number;
  amount_usd:  number;
  description: string;
}

interface Message {
  id:        string;
  role:      'user' | 'assistant';
  content:   string;
  plan?:     PlanMeta;
  status?:   'streaming' | 'done' | 'error';
  confirmed?: boolean;
  /** ms epoch — used for time-gap separators (iMessage style). */
  ts?:       number;
}

// Empty-state suggestion cards. Ordered: deposit-first (how money enters
// the system), then SEND / CONVERT / ALLOCATE — matching the v0.5 spec
// primitive order.
const SUGGESTIONS = [
  { label: 'Add funds to my account',            primitive: 'STORE'    },
  { label: 'Send $50 to a friend',               primitive: 'SEND'     },
  { label: 'Swap my ETH for USDC',               primitive: 'CONVERT'  },
  { label: 'Grow my idle USDC',                  primitive: 'ALLOCATE' },
];

// Quick-action chips shown above the input once a conversation has started.
// Same ordering rule as SUGGESTIONS.
const ACTION_CHIPS = [
  { label: 'Add funds', message: 'I want to add funds to my account'              },
  { label: 'Send',      message: 'I want to send money to someone'                },
  { label: 'Convert',   message: 'I want to convert one asset into another'       },
  { label: 'Grow',      message: 'I want to put my idle money to work'            },
];

const STORAGE_KEY = 'intend:chat_messages';

// ── ChatPanel ──────────────────────────────────────────────────────────────

export default function ChatPanel({ userId, isOnboarding }: { userId: string | null; isOnboarding: boolean }) {
  const [messages, setMessages]       = useState<Message[]>(() => {
    // Restore conversation from sessionStorage on mount
    if (typeof window === 'undefined') return [];
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as Message[]) : [];
    } catch { return []; }
  });
  const [input, setInput]             = useState('');
  const [isStreaming, setStreaming]   = useState(false);
  const [confirmingId, setConfirming] = useState<string | null>(null);
  const [, startTransition]           = useTransition();
  const onboardingFiredRef            = useRef(false);
  const bottomRef   = useRef<HTMLDivElement>(null);
  const inputRef    = useRef<HTMLTextAreaElement>(null);
  // Keep a stable ref to messages so sendMessage can read current history
  const messagesRef = useRef<Message[]>([]);
  messagesRef.current = messages;

  // Persist messages to sessionStorage whenever they change
  useEffect(() => {
    try {
      // Only store completed messages (not streaming ones) to avoid partial state
      const toStore = messages.filter(m => m.status !== 'streaming');
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
    } catch { /* ignore quota errors */ }
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Re-focus the textarea every time streaming finishes. Doing this in the
  // sendMessage `finally` block doesn't always work because React re-enables
  // the textarea on the next render — focusing a still-disabled element is
  // a no-op. This effect runs AFTER the disabled flag flips back, so the
  // cursor lands back in the input every reply without the user clicking.
  useEffect(() => {
    if (!isStreaming) {
      // rAF lets the DOM commit the `disabled={false}` first.
      const id = requestAnimationFrame(() => inputRef.current?.focus());
      return () => cancelAnimationFrame(id);
    }
    return undefined;
  }, [isStreaming]);

  // Onboarding: fire greeting from agent on first load
  useEffect(() => {
    if (isOnboarding && !onboardingFiredRef.current && messages.length === 0) {
      onboardingFiredRef.current = true;
      const t = setTimeout(() => void sendMessage('__onboarding_start__'), 400);
      return () => clearTimeout(t);
    }
    // Legacy: pick up first_intent set during old onboarding wizard
    const pending = sessionStorage.getItem('intend:first_intent');
    if (pending && !isOnboarding) {
      sessionStorage.removeItem('intend:first_intent');
      const t = setTimeout(() => void sendMessage(pending), 600);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-resize textarea
  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim();
    if (!msg || isStreaming) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    setStreaming(true);

    // Build history from current messages (exclude in-flight entries)
    const history = messagesRef.current
      .filter(m => m.status !== 'streaming' && m.status !== 'error' && m.content)
      .map(m => ({ role: m.role, content: m.content }));

    // The __onboarding_start__ trigger is invisible — don't show it as a user message
    const isHiddenTrigger = msg === '__onboarding_start__';
    const now = Date.now();
    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: msg, ts: now };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', status: 'streaming', ts: now };

    if (isHiddenTrigger) {
      setMessages(prev => [...prev, assistantMsg]);
    } else {
      setMessages(prev => [...prev, userMsg, assistantMsg]);
    }

    try {
      const actualMessage = isHiddenTrigger ? 'Hello!' : msg;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: actualMessage, userId, history, isOnboarding }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw || raw === '[DONE]') continue;

          let event: { type: string; content?: string; plan?: PlanMeta; error?: string };
          try { event = JSON.parse(raw); } catch { continue; }

          if (event.type === 'text' && event.content) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: m.content + (event.content as string) }
                : m
            ));
          } else if (event.type === 'plan' && event.plan) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, plan: event.plan as PlanMeta, status: 'done' } : m
            ));
          } else if (event.type === 'onboarding_complete') {
            // Server has saved profile + marked onboarding done. Reload to get fresh layout.
            startTransition(() => {
              window.location.reload();
            });
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: (event as { error?: string }).error ?? 'Something went wrong.', status: 'error' }
                : m
            ));
          }
        }
      }

      setMessages(prev => prev.map(m =>
        m.id === assistantId && m.status === 'streaming' ? { ...m, status: 'done' } : m
      ));
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Connection error.';
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: errMsg, status: 'error' } : m
      ));
    } finally {
      setStreaming(false);
      inputRef.current?.focus();
    }
  }, [input, isStreaming, userId]);

  async function handleConfirm(intentId: string, msgId: string) {
    setConfirming(intentId);
    try {
      const res  = await fetch('/api/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intent_id: intentId, action: 'confirm' }),
      });
      const data = await res.json() as { success?: boolean; error?: string };

      setMessages(prev => prev.map(m => {
        if (m.id !== msgId) return m;
        if (data.success) return { ...m, confirmed: true };
        return { ...m, content: m.content + `\n\n⚠ ${data.error ?? 'Execution failed.'}` };
      }));
    } finally {
      setConfirming(null);
    }
  }

  async function handleCancel(intentId: string, msgId: string) {
    setConfirming(intentId);
    await fetch('/api/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ intent_id: intentId, action: 'cancel' }),
    });
    setMessages(prev => prev.map(m => {
      if (m.id !== msgId) return m;
      const { plan: _removed, ...rest } = m;
      return rest;
    }));
    setConfirming(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void sendMessage();
    }
  }

  const isEmpty = messages.length === 0;
  const canSend = !!input.trim() && !isStreaming && !!userId;

  return (
    <>
      {/* Background grid overlay */}
      <div className="chat-grid-overlay" aria-hidden="true" />

      {/* Messages */}
      <div className="messages scrollbar-hide">
        {isEmpty ? (
          <EmptyState onSuggest={label => void sendMessage(label)} />
        ) : (
          messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            // iMessage grouping: collapse the gap & hide tail when the next bubble
            // is from the same sender within ~2 minutes.
            const TWO_MIN = 2 * 60 * 1000;
            const isFirstInGroup = !prev || prev.role !== msg.role
              || ((msg.ts ?? 0) - (prev.ts ?? 0) > TWO_MIN);
            const isLastInGroup  = !next || next.role !== msg.role
              || ((next.ts ?? 0) - (msg.ts ?? 0) > TWO_MIN);
            // Show timestamp separator only when there's a meaningful break
            // (>5 min) between the previous bubble and this one.
            const FIVE_MIN = 5 * 60 * 1000;
            const showTimeSeparator = !prev
              || ((msg.ts ?? 0) - (prev.ts ?? 0) > FIVE_MIN);

            return (
              <Fragment key={msg.id}>
                {showTimeSeparator && msg.ts && (
                  <div className="msg-time-sep">
                    {new Date(msg.ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                <MessageRow
                  msg={msg}
                  isFirstInGroup={isFirstInGroup}
                  isLastInGroup={isLastInGroup}
                  confirmingId={confirmingId}
                  onConfirm={handleConfirm}
                  onCancel={handleCancel}
                />
              </Fragment>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="input-area">
        {isEmpty ? (
          <div className="suggestions">
            {SUGGESTIONS.map(s => (
              <button
                key={s.label}
                className="suggest-chip"
                onClick={() => void sendMessage(s.label)}
              >
                <span className="suggest-chip-primitive">{s.primitive}</span>
                {s.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="action-chips">
            {ACTION_CHIPS.map(a => (
              <button
                key={a.label}
                className="action-chip"
                disabled={isStreaming}
                onClick={() => void sendMessage(a.message)}
              >
                {a.label}
              </button>
            ))}
            <button
              className="action-chip action-chip--clear"
              disabled={isStreaming}
              onClick={() => {
                setMessages([]);
                sessionStorage.removeItem(STORAGE_KEY);
              }}
              title="Clear conversation"
            >
              Clear
            </button>
          </div>
        )}

        <div className="input-bar">
          {/* intend:// prefix */}
          <span className="input-prefix">
            <span className="input-prefix-intend">intend</span>
            <span className="input-prefix-sep">://</span>
          </span>
          <textarea
            ref={inputRef}
            className="input-field"
            value={input}
            rows={1}
            placeholder="What would you like your money to do?"
            disabled={isStreaming || !userId}
            onChange={e => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
          />
          <button
            className="send-btn"
            disabled={!canSend}
            onClick={() => void sendMessage()}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"/>
              <polygon points="22 2 15 22 11 13 2 9 22 2"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ onSuggest }: { onSuggest: (label: string) => void }) {
  void onSuggest;
  return (
    <div className="chat-empty">
      <div className="chat-empty-logo">i</div>
      <div className="chat-empty-heading">Intend Concierge</div>
      <div className="chat-empty-tagline">Your money, executing your intentions.</div>
    </div>
  );
}

// ── Message row ────────────────────────────────────────────────────────────

function MessageRow({
  msg,
  isFirstInGroup,
  isLastInGroup,
  confirmingId,
  onConfirm,
  onCancel,
}: {
  msg:            Message;
  isFirstInGroup: boolean;
  isLastInGroup:  boolean;
  confirmingId:   string | null;
  onConfirm:      (intentId: string, msgId: string) => void;
  onCancel:       (intentId: string, msgId: string) => void;
}) {
  const isUser = msg.role === 'user';
  const groupClasses = [
    'msg',
    isUser ? 'user' : 'system',
    isFirstInGroup ? 'msg--first' : '',
    isLastInGroup  ? 'msg--last'  : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={groupClasses}>
      <div
        className="msg-bubble"
        style={msg.status === 'error' ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
      >
        {/* While the request is in flight but no token has arrived yet,
            show the working-dots pulse so the user knows the agent is on it.
            Once tokens start streaming, fall back to the inline blinking
            cursor next to the live text. */}
        {msg.status === 'streaming' && msg.content.length === 0
          ? <WorkingDots />
          : (
            <>
              {msg.content}
              {msg.status === 'streaming' && <TypingCursor />}
            </>
          )}
      </div>

      {/* Confirmation preview card */}
      {!isUser && msg.status === 'done' && msg.plan && !msg.confirmed && (
        <PreviewCard
          plan={msg.plan}
          msgId={msg.id}
          isBusy={confirmingId === msg.plan.intent_id}
          onConfirm={onConfirm}
          onCancel={onCancel}
        />
      )}

      {/* Success state */}
      {!isUser && msg.confirmed && (
        <div className="success-card">
          <div className="success-icon">✓</div>
          <div className="success-title">Done</div>
          <div className="success-sub">Your intent has been executed.</div>
        </div>
      )}
    </div>
  );
}

// ── Working dots ───────────────────────────────────────────────────────────
// Three pulsing dots shown while the agent is "thinking" — i.e. between the
// user pressing Send and the first streamed token arriving. Without this
// the bubble looks empty and the user can't tell the agent is working.

function WorkingDots() {
  return (
    <span className="working-dots" aria-label="Intend is working" role="status">
      <span className="working-dot" />
      <span className="working-dot" />
      <span className="working-dot" />
      <style>{`
        .working-dots {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          height: 14px;
          padding: 2px 0;
        }
        .working-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.35;
          animation: workingPulse 1.2s ease-in-out infinite;
        }
        .working-dot:nth-child(2) { animation-delay: 0.18s; }
        .working-dot:nth-child(3) { animation-delay: 0.36s; }
        @keyframes workingPulse {
          0%, 80%, 100% { opacity: 0.25; transform: translateY(0) scale(0.85); }
          40%           { opacity: 0.95; transform: translateY(-1px) scale(1);   }
        }
      `}</style>
    </span>
  );
}

// ── Typing cursor ──────────────────────────────────────────────────────────

function TypingCursor() {
  return (
    <>
      <span
        style={{
          display: 'inline-block',
          width: 2,
          height: 14,
          background: 'var(--text)',
          marginLeft: 3,
          verticalAlign: 'text-bottom',
          animation: 'blink 0.8s step-end infinite',
        }}
      />
      <style>{`@keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }`}</style>
    </>
  );
}

// ── Preview card ───────────────────────────────────────────────────────────

function PreviewCard({
  plan,
  msgId,
  isBusy,
  onConfirm,
  onCancel,
}: {
  plan:      PlanMeta;
  msgId:     string;
  isBusy:    boolean;
  onConfirm: (intentId: string, msgId: string) => void;
  onCancel:  (intentId: string, msgId: string) => void;
}) {
  const isLarge = plan.amount_usd > 500;
  const [step, setStep] = useState<'initial' | 'confirm'>(isLarge ? 'initial' : 'confirm');

  return (
    <div className="preview-card">
      <div className="preview-header">
        <span className="preview-label">Execution plan</span>
        <span className="preview-status">Ready</span>
      </div>

      <div className="preview-body">
        <div className="preview-outcome">
          {plan.description || (
            <>Move <span>${plan.amount_usd.toLocaleString()}</span></>
          )}
        </div>

        <div className="preview-rows">
          <div className="preview-row">
            <span className="preview-row-label">Primitive</span>
            <span className="preview-row-val muted">{plan.primitive}</span>
          </div>
          <div className="preview-row">
            <span className="preview-row-label">Amount</span>
            <span className="preview-row-val">${plan.amount_usd.toLocaleString()}</span>
          </div>
          <div className="preview-row">
            <span className="preview-row-label">Fees</span>
            <span className="preview-row-val good">
              {plan.fees_total === 0 ? '$0 (none)' : `$${plan.fees_total.toFixed(2)}`}
            </span>
          </div>
        </div>
      </div>

      <div className="preview-actions">
        {step === 'initial' ? (
          <>
            <button className="btn-confirm" onClick={() => setStep('confirm')}>
              Review →
            </button>
            <button className="btn-cancel" disabled={isBusy} onClick={() => onCancel(plan.intent_id, msgId)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className="btn-confirm"
              disabled={isBusy}
              onClick={() => onConfirm(plan.intent_id, msgId)}
            >
              {isBusy ? 'Executing…' : isLarge ? `Confirm $${plan.amount_usd.toLocaleString()}` : 'Confirm'}
            </button>
            <button className="btn-cancel" disabled={isBusy} onClick={() => onCancel(plan.intent_id, msgId)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
