'use client';

import { useEffect, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface Signal {
  id:   string;
  kind: 'alarm' | 'opp';
  tag:  string;
  time: string;
  body: string;
  spark: number[];
}

interface Metric {
  k:     string;
  v:     string;
  hot?:  boolean;
  good?: boolean;
  sub:   string;
}

// ── Sparkline ──────────────────────────────────────────────────────────────

function Spark({ data, color }: { data: number[]; color: string }) {
  const w = 72, h = 28, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} style={{ color, flexShrink: 0 }}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Static data ────────────────────────────────────────────────────────────

const SIGNAL_POOL: Omit<Signal, 'id' | 'time'>[] = [
  { kind: 'alarm', tag: 'RISK',        body: 'Forward Signal: Economic trajectory reflects gradual deterioration.',  spark: [4,5,6,5,7,8,7,9,10,11] },
  { kind: 'opp',   tag: 'OPPORTUNITY', body: 'Gold parity eyes $3,425, providing superior inflation hedge.',         spark: [2,3,2,4,4,5,6,7,7,8]   },
  { kind: 'opp',   tag: 'OPPORTUNITY', body: 'Idle USDC yield opportunity: Aerodrome V3 at 7.2% APR.',              spark: [5,5,6,7,6,7,8,8,9,9]   },
  { kind: 'alarm', tag: 'RISK',        body: 'Global debt-to-GDP alert: Portfolio de-risking initiated.',            spark: [9,8,8,7,7,6,5,5,4,3]   },
  { kind: 'opp',   tag: 'OPPORTUNITY', body: 'CPI data: inflation sticky at 3.4%. Purchasing power decaying.',      spark: [3,4,4,5,6,6,7,7,8,9]   },
];

const METRICS: Metric[] = [
  { k: 'Avg inflation', v: '3.42%', hot: true,  sub: '12-mo' },
  { k: 'Aegide score',  v: '0.72',              sub: '0–1 healthy' },
  { k: 'Real yield',    v: '+1.8%', good: true, sub: 'annualised' },
  { k: 'FX trend',      v: 'STABLE',            sub: 'DXY basket' },
];

export const MOBILE_SIGNALS = SIGNAL_POOL.slice(0, 5).map((s, i) => ({
  ...s,
  id: `m${i}`,
  time: ['02:14', '02:07', '01:58', '01:41', '01:22'][i] ?? '00:00',
}));

// ── Shared inner content (used by both desktop panel and mobile drawer) ────

export function SignalsContent({
  signals,
  onDismiss,
}: {
  signals:    Signal[];
  onDismiss?: () => void;
}) {
  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: 20, color: 'var(--ink, #2a2418)', lineHeight: 1.2 }}>
            Your <em>Reality</em>
          </div>
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-3, #8a7658)', marginTop: 4 }}>
            Signals your concierge is listening to
          </div>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3, #8a7658)', padding: '2px 4px', borderRadius: 6, lineHeight: 1, marginTop: 2 }}
            aria-label="Close intelligence panel"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, flexShrink: 0 }}>
        {METRICS.map(m => (
          <div key={m.k} style={{
            background: 'var(--paper-2, #efe3c8)',
            borderRadius: 'var(--r-sm, 8px)',
            padding: '11px 13px',
            boxShadow: 'var(--shadow-soft)',
          }}>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 8, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-3, #8a7658)' }}>{m.k}</div>
            <div style={{
              fontFamily: 'var(--font-serif, Georgia, serif)',
              fontSize: 22,
              fontWeight: 500,
              marginTop: 5,
              lineHeight: 1,
              color: m.hot ? 'var(--terra, #bf7a5a)' : m.good ? 'var(--sage, #7aab8a)' : 'var(--ink, #2a2418)',
            }}>{m.v}</div>
            <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: 'var(--ink-3, #8a7658)', marginTop: 3 }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Signals section label */}
      <div>
        <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: 16, color: 'var(--ink, #2a2418)' }}>All signals today</div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 8.5, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3, #8a7658)', marginTop: 2 }}>Stamped and timestamped</div>
      </div>

      {/* Signals list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.map(s => (
          <div key={s.id} style={{
            background: 'var(--paper-2, #efe3c8)',
            borderRadius: 'var(--r-sm, 8px)',
            padding: '10px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            boxShadow: 'var(--shadow-soft)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{
                fontFamily: 'var(--font-mono, monospace)',
                fontSize: 7,
                letterSpacing: '.18em',
                textTransform: 'uppercase',
                padding: '2px 7px',
                borderRadius: 'var(--r-pill, 100px)',
                color: s.kind === 'alarm' ? 'var(--terra, #bf7a5a)' : 'var(--sage, #7aab8a)',
                background: s.kind === 'alarm'
                  ? 'color-mix(in oklch, var(--terra, #bf7a5a) 14%, transparent)'
                  : 'color-mix(in oklch, var(--sage, #7aab8a) 14%, transparent)',
              }}>{s.tag}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: 'var(--ink-4, #b8a582)' }}>{s.time}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 12, lineHeight: 1.35, flex: 1, color: 'var(--ink, #2a2418)' }}>{s.body}</div>
              <Spark data={s.spark} color={s.kind === 'alarm' ? 'var(--terra, #bf7a5a)' : 'var(--sage, #7aab8a)'} />
            </div>
          </div>
        ))}
      </div>

      {/* Purchasing power retention */}
      <div style={{
        background: 'var(--paper-2, #efe3c8)',
        borderRadius: 'var(--r-sm, 8px)',
        padding: '12px 14px',
        boxShadow: 'var(--shadow-soft)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
          <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: 13, color: 'var(--ink, #2a2418)' }}>Purchasing power retention</span>
          <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12, fontVariantNumeric: 'tabular-nums', color: 'var(--ink, #2a2418)' }}>98.73%</span>
        </div>
        <div style={{ height: 5, background: 'var(--paper-3, #e7d8b6)', borderRadius: 'var(--r-pill, 100px)', overflow: 'hidden' }}>
          <div style={{ width: '98.73%', height: '100%', background: 'var(--terra, #bf7a5a)', borderRadius: 'var(--r-pill, 100px)' }} />
        </div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 8, color: 'var(--ink-3, #8a7658)', marginTop: 6, lineHeight: 1.4 }}>
          Neutralising inflationary decay via yield vectors. Recalculated hourly.
        </div>
      </div>
    </>
  );
}

// ── Desktop panel component ────────────────────────────────────────────────

export default function RightPanel({
  open,
  peek,
  onOpen,
  onDismiss,
  onPeekEnd,
  onNewSignal,
}: {
  open:        boolean;
  peek:        boolean;
  onOpen:      () => void;
  onDismiss:   () => void;
  onPeekEnd:   () => void;
  onNewSignal: () => void;
}) {
  const [signals, setSignals] = useState<Signal[]>(
    SIGNAL_POOL.slice(0, 5).map((s, i) => ({
      ...s,
      id: `init-${i}`,
      time: ['02:14', '02:07', '01:58', '01:41', '01:22'][i] ?? '00:00',
    }))
  );

  useEffect(() => {
    const t = setInterval(() => {
      const src  = SIGNAL_POOL[Math.floor(Math.random() * SIGNAL_POOL.length)]!;
      const now  = new Date();
      const hh   = String(now.getHours()).padStart(2, '0');
      const mm   = String(now.getMinutes()).padStart(2, '0');
      setSignals(prev => [{ ...src, id: Math.random().toString(36).slice(2), time: `${hh}:${mm}` }, ...prev].slice(0, 8));
      onNewSignal();
    }, 24_000);
    return () => clearInterval(t);
  }, [onNewSignal]);

  const panelClass = ['signals', open ? 'open' : '', peek ? 'peek' : ''].filter(Boolean).join(' ');
  const handleClass = ['handle', open ? 'hidden' : ''].filter(Boolean).join(' ');

  return (
    <>
      {/* 24px invisible hotzone on right edge — hover to open */}
      <div className="hotzone" onMouseEnter={onOpen} />

      {/* Vertical handle tab */}
      <div
        className={handleClass}
        onClick={onOpen}
        role="button"
        tabIndex={0}
        aria-label="Open intelligence panel"
        onKeyDown={e => e.key === 'Enter' && onOpen()}
      >
        <div className="dot" />
        Intelligence
      </div>

      {/* Main signals panel */}
      <div
        className={panelClass}
        onAnimationEnd={peek ? onPeekEnd : undefined}
      >
        <SignalsContent signals={signals} onDismiss={onDismiss} />
      </div>
    </>
  );
}
