'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

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
}

const SUGGESTIONS = [
  { label: 'Send $300 to Kwame',                primitive: 'MOVE' },
  { label: 'Grow $500 at best rate',            primitive: 'GROW' },
  { label: 'Protect my savings from inflation', primitive: 'PROTECT' },
  { label: 'Convert 1 ETH to USDC',             primitive: 'CONVERT' },
];

const ACTION_CHIPS = [
  { label: 'Add funds',  message: 'I want to add funds to my account' },
  { label: 'Pay',        message: 'I want to make a payment' },
  { label: 'Transfer',   message: 'I want to transfer money' },
];

const STORAGE_KEY = 'intend:chat_messages';

// ── ChatPanel ──────────────────────────────────────────────────────────────

export default function ChatPanel({ userId }: { userId: string | null }) {
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

  // Pick up intent pre-filled during onboarding
  useEffect(() => {
    const pending = sessionStorage.getItem('intend:first_intent');
    if (pending) {
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

    const userMsg: Message = { id: crypto.randomUUID(), role: 'user', content: msg };
    const assistantId = crypto.randomUUID();
    const assistantMsg: Message = { id: assistantId, role: 'assistant', content: '', status: 'streaming' };

    setMessages(prev => [...prev, userMsg, assistantMsg]);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: msg, userId, history }),
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
                ? { ...m, content: m.content + event.content! }
                : m
            ));
          } else if (event.type === 'plan' && event.plan) {
            setMessages(prev => prev.map(m =>
              m.id === assistantId ? { ...m, plan: event.plan!, status: 'done' } : m
            ));
          } else if (event.type === 'error') {
            setMessages(prev => prev.map(m =>
              m.id === assistantId
                ? { ...m, content: event.error ?? 'Something went wrong.', status: 'error' }
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
          messages.map(msg => (
            <MessageRow
              key={msg.id}
              msg={msg}
              confirmingId={confirmingId}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          ))
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
  confirmingId,
  onConfirm,
  onCancel,
}: {
  msg:          Message;
  confirmingId: string | null;
  onConfirm:    (intentId: string, msgId: string) => void;
  onCancel:     (intentId: string, msgId: string) => void;
}) {
  const isUser = msg.role === 'user';

  return (
    <div className={`msg ${isUser ? 'user' : 'system'}`}>
      {/* Role label */}
      <div className="msg-role-row">
        <span className="tech-label msg-role-label">
          {isUser ? 'REQUEST_TX' : 'INTEND_AGENT'}
        </span>
        <span className="msg-time">
          {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>

      <div
        className="msg-bubble"
        style={msg.status === 'error' ? { borderColor: 'var(--red)', color: 'var(--red)' } : undefined}
      >
        {msg.content}
        {msg.status === 'streaming' && <TypingCursor />}
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
