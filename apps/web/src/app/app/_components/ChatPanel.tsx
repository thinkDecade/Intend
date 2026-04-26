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

interface Milestone {
  id:        string;                          // unique key for de-dupe
  kind:      'wallet_ready' | 'transaction';  // future: 'allocation', 'goal_funded', etc.
  title:     string;
  address?:  string;
  network?:  string;
  provider?: string;
  amount?:   number;
  asset?:    string;
}

interface Message {
  id:         string;
  role:       'user' | 'assistant';
  content:    string;
  plan?:      PlanMeta;
  milestone?: Milestone;
  status?:    'streaming' | 'done' | 'error';
  confirmed?: boolean;
  /** ms epoch — used for time-gap separators (iMessage style). */
  ts?:        number;
}

// Suggestion chips aligned with the four Intend primitives (Store/Send/Convert/Allocate)
const ACTION_CHIPS = [
  {
    label: 'Store idle balance safely',
    message: 'I want to store my idle USDC safely',
    kind: 'store',
    icon: (
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3L20 6V13C20 17 16 20 12 21C8 20 4 17 4 13V6Z"/>
      </svg>
    ),
  },
  {
    label: 'Convert crypto to stable',
    message: 'I want to convert 1 ETH to USDC',
    kind: 'convert',
    icon: (
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 8H18L15 5M20 16H6L9 19"/>
      </svg>
    ),
  },
  {
    label: 'Send money to someone',
    message: 'I want to send $50 to someone',
    kind: 'send',
    icon: (
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 12L21 4L13 21L11 13Z"/>
      </svg>
    ),
  },
  {
    label: 'Allocate idle capital to yield',
    message: 'I want to put my idle money to work earning yield',
    kind: 'allocate',
    icon: (
      <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 17L8 10L12 14L16 7L21 12"/>
      </svg>
    ),
  },
];

const STORAGE_KEY            = 'intend:chat_messages';
const KNOWN_WALLET_KEY       = 'intend:known_wallet';
const KNOWN_MILESTONES_KEY   = 'intend:known_milestones';

function loadKnownWallet(): string | null {
  if (typeof window === 'undefined') return null;
  try { return localStorage.getItem(KNOWN_WALLET_KEY); } catch { return null; }
}

function loadKnownMilestones(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(KNOWN_MILESTONES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch { return []; }
}

function rememberMilestone(id: string, address?: string): void {
  if (typeof window === 'undefined') return;
  try {
    const ms = new Set(loadKnownMilestones());
    ms.add(id);
    localStorage.setItem(KNOWN_MILESTONES_KEY, JSON.stringify(Array.from(ms)));
    if (address) localStorage.setItem(KNOWN_WALLET_KEY, address);
  } catch { /* ignore */ }
}

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
        body: JSON.stringify({
          message:         actualMessage,
          userId,
          history,
          isOnboarding,
          knownWallet:     loadKnownWallet(),
          knownMilestones: loadKnownMilestones(),
        }),
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

          let event: {
            type:       string;
            content?:   string;
            plan?:      PlanMeta;
            milestone?: Milestone;
            error?:     string;
          };
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
          } else if (event.type === 'milestone' && event.milestone) {
            // Append a dedicated milestone message so the receipt-style card
            // gets its own bubble. De-duped server-side via knownMilestones.
            const ms = event.milestone;
            rememberMilestone(ms.id, ms.address);
            setMessages(prev => [
              ...prev,
              {
                id:        crypto.randomUUID(),
                role:      'assistant',
                content:   '',
                milestone: ms,
                status:    'done',
                ts:        Date.now(),
              },
            ]);
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

  const now = new Date();
  const sessionLabel = `Session · ${now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })} · ${now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} UTC`;

  return (
    <>
      {/* Concierge masthead header */}
      <div className="concierge-header">
        <div className="concierge-masthead-mark">i</div>
        <div>
          <div className="concierge-masthead-title">Intend <em>Concierge</em></div>
          <div className="concierge-masthead-sub">Your money, executing your intentions.</div>
        </div>
        <div className="concierge-header-meta">{sessionLabel}</div>
      </div>

      {/* Messages */}
      <div className="messages scrollbar-hide">
        {isEmpty ? (
          <EmptyState />
        ) : (
          messages.map((msg, i) => {
            const prev = messages[i - 1];
            const next = messages[i + 1];
            const TWO_MIN = 2 * 60 * 1000;
            const isFirstInGroup = !prev || prev.role !== msg.role
              || ((msg.ts ?? 0) - (prev.ts ?? 0) > TWO_MIN);
            const isLastInGroup  = !next || next.role !== msg.role
              || ((next.ts ?? 0) - (msg.ts ?? 0) > TWO_MIN);
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

      {/* Suggestion chips — shown always for quick actions */}
      <div className="concierge-chips">
        {ACTION_CHIPS.map(a => (
          <button
            key={a.label}
            className={`concierge-chip concierge-chip--${a.kind}`}
            disabled={isStreaming}
            onClick={() => void sendMessage(a.message)}
          >
            {a.icon}
            <span>{a.label}</span>
          </button>
        ))}
        {!isEmpty && (
          <button
            className="concierge-chip"
            disabled={isStreaming}
            onClick={() => {
              setMessages([]);
              sessionStorage.removeItem(STORAGE_KEY);
            }}
            title="Clear conversation"
            style={{ opacity: 0.65 }}
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>
            </svg>
            <span>Clear</span>
          </button>
        )}
      </div>

      {/* Composer */}
      <div className="concierge-composer-wrap">
        <div className="concierge-composer">
          <span className="concierge-prefix">Intent ↦</span>
          <textarea
            ref={inputRef}
            className="concierge-input"
            value={input}
            rows={1}
            placeholder={isStreaming ? 'Concierge is working…' : 'Tell me what you\'d like your money to do'}
            disabled={isStreaming || !userId}
            onChange={e => { setInput(e.target.value); autoResize(e.target); }}
            onKeyDown={handleKeyDown}
          />
          <button
            className="concierge-send"
            disabled={!canSend}
            onClick={() => void sendMessage()}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12L21 4L13 21L11 13Z"/>
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="concierge-empty">
      <div className="concierge-empty-mark">i</div>
      <div className="concierge-empty-title">Good day.</div>
      <div className="concierge-empty-sub">Your money, executing your intentions.</div>
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

  // Milestone-only messages render as a standalone card (no chat bubble).
  if (msg.milestone && !msg.content) {
    return (
      <div className={`${groupClasses} msg--milestone`}>
        <MilestoneCard milestone={msg.milestone} />
      </div>
    );
  }

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

// ── Milestone card ─────────────────────────────────────────────────────────
// Receipt-style card surfaced after major milestones (wallet creation,
// completed transactions, hit savings goals, etc.). Designed to feel like
// a proper artefact — not a chat bubble — so it lands with weight.

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const [copied, setCopied] = useState(false);

  const copyAddress = async () => {
    if (!milestone.address) return;
    try {
      await navigator.clipboard.writeText(milestone.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* ignore */ }
  };

  if (milestone.kind === 'wallet_ready') {
    return (
      <div className="milestone-card milestone-card--wallet">
        <div className="milestone-card-shine" aria-hidden="true" />
        <div className="milestone-card-header">
          <div className="milestone-card-eyebrow">
            <span className="milestone-card-dot" />
            <span>Account live</span>
          </div>
          <span className="milestone-card-net">{milestone.network ?? 'Base'}</span>
        </div>

        <div className="milestone-card-iconring" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>

        <div className="milestone-card-title">{milestone.title}</div>
        <div className="milestone-card-sub">
          You can now hold funds and send to anyone, anywhere.
        </div>

        {milestone.address && (
          <button className="milestone-card-addr" onClick={copyAddress} title="Copy address">
            <span className="milestone-card-addr-label">Wallet address</span>
            <span className="milestone-card-addr-val">{milestone.address}</span>
            <span className="milestone-card-addr-copy">{copied ? 'Copied ✓' : 'Tap to copy'}</span>
          </button>
        )}

        <div className="milestone-card-meta">
          <div className="milestone-card-meta-row">
            <span>Custody</span>
            <span>{milestone.provider ?? 'Coinbase secure enclave'}</span>
          </div>
          <div className="milestone-card-meta-row">
            <span>Network</span>
            <span>{milestone.network ?? 'Base'}</span>
          </div>
        </div>
      </div>
    );
  }

  if (milestone.kind === 'transaction') {
    return (
      <div className="milestone-card milestone-card--tx">
        <div className="milestone-card-shine" aria-hidden="true" />
        <div className="milestone-card-header">
          <div className="milestone-card-eyebrow">
            <span className="milestone-card-dot" />
            <span>Done</span>
          </div>
        </div>
        <div className="milestone-card-title">{milestone.title}</div>
        {milestone.amount !== undefined && (
          <div className="milestone-card-amount">
            <span className="milestone-card-amount-currency">$</span>
            {milestone.amount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            {milestone.asset && <span className="milestone-card-amount-asset">{milestone.asset}</span>}
          </div>
        )}
      </div>
    );
  }

  return null;
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

// ── Preview card (plan confirmation) — Concierge stamp + field grid style ──

function primitiveKind(primitive: string): string {
  const p = primitive.toLowerCase();
  if (p.includes('store') || p.includes('protect') || p.includes('hedge')) return 'store';
  if (p.includes('convert') || p.includes('swap'))  return 'convert';
  if (p.includes('send') || p.includes('move') || p.includes('transfer')) return 'send';
  if (p.includes('allocate') || p.includes('grow') || p.includes('yield') || p.includes('earn')) return 'allocate';
  return 'store';
}

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
  const kind = primitiveKind(plan.primitive);

  return (
    <div className="plan-card">
      <div className="plan-card-head">
        <span className={`stamp ${kind}`}>{kind}</span>
        <div className="plan-card-headline">
          {plan.description || `Execute ${plan.primitive}`}
        </div>
        <span className="plan-card-status">Draft</span>
      </div>

      <div className="plan-card-fields">
        <div className="plan-field">
          <div className="plan-field-k">Primitive</div>
          <div className="plan-field-v mono">{plan.primitive}</div>
        </div>
        <div className="plan-field">
          <div className="plan-field-k">Amount</div>
          <div className="plan-field-v mono">${plan.amount_usd.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
        </div>
        <div className="plan-field">
          <div className="plan-field-k">Fees</div>
          <div className="plan-field-v mono" style={{ color: 'var(--sage, var(--green))' }}>
            {plan.fees_total === 0 ? '$0.00' : `$${plan.fees_total.toFixed(2)}`}
          </div>
        </div>
        <div className="plan-field">
          <div className="plan-field-k">Network</div>
          <div className="plan-field-v mono">Base</div>
        </div>
      </div>

      <div className="plan-card-actions">
        {step === 'initial' ? (
          <>
            <button className="plan-btn primary" onClick={() => setStep('confirm')}>
              Review
              <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12H19M14 7L19 12L14 17"/>
              </svg>
            </button>
            <button className="plan-btn ghost" disabled={isBusy} onClick={() => onCancel(plan.intent_id, msgId)}>
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              className="plan-btn primary"
              disabled={isBusy}
              onClick={() => onConfirm(plan.intent_id, msgId)}
            >
              {isBusy ? 'Executing…' : isLarge ? `Execute $${plan.amount_usd.toLocaleString()}` : 'Execute'}
              {!isBusy && (
                <svg viewBox="0 0 24 24" width={11} height={11} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12H19M14 7L19 12L14 17"/>
                </svg>
              )}
            </button>
            <button className="plan-btn ghost" disabled={isBusy} onClick={() => onCancel(plan.intent_id, msgId)}>
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
