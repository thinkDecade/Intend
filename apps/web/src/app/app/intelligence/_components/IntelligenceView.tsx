'use client';

import type { Signal, Metric } from '../_data';
import { CPI_SERIES, CPI_LABELS } from '../_data';

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

function AreaChart({ data, labels }: { data: number[]; labels: string[] }) {
  const W = 640, H = 200, PL = 40, PR = 16, PT = 16, PB = 28;
  const min = Math.min(...data) - 0.2;
  const max = Math.max(...data) + 0.2;
  const range = max - min;
  const w = W - PL - PR, h = H - PT - PB;
  const pts = data.map((v, i) => {
    const x = PL + (i / (data.length - 1)) * w;
    const y = PT + h - ((v - min) / range) * h;
    return [x, y] as [number, number];
  });
  const line  = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
  const lastPt = pts[pts.length - 1] ?? [PL, PT + h];
  const firstPt = pts[0] ?? [PL, PT + h];
  const area  = line + ` L${lastPt[0]},${PT + h} L${firstPt[0]},${PT + h} Z`;
  const ticks = Array.from({ length: 5 }, (_, i) => min + (range * i / 4));

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 200 }}>
      <defs>
        <pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="6" stroke="var(--terra, #bf7a5a)" strokeWidth="1.2" opacity="0.22" />
        </pattern>
      </defs>
      {ticks.map((t, i) => {
        const y = PT + h - ((t - min) / range) * h;
        return (
          <g key={i}>
            <line x1={PL} x2={W - PR} y1={y} y2={y} stroke="var(--rule, #d8c8a2)" strokeDasharray="2 4" />
            <text x={PL - 6} y={y + 4} textAnchor="end" fontSize="9" fontFamily="var(--font-mono, monospace)" fill="var(--ink-3, #8a7658)">{t.toFixed(1)}%</text>
          </g>
        );
      })}
      <line x1={PL} x2={W - PR}
        y1={PT + h - ((2.0 - min) / range) * h}
        y2={PT + h - ((2.0 - min) / range) * h}
        stroke="var(--sage, #7aab8a)" strokeWidth="1" />
      <text x={W - PR} y={PT + h - ((2.0 - min) / range) * h - 4}
        textAnchor="end" fontSize="8" fontFamily="var(--font-mono, monospace)" fill="var(--sage, #7aab8a)" letterSpacing="1">FED TARGET · 2.0%</text>
      <path d={area} fill="url(#hatch)" />
      <path d={line} fill="none" stroke="var(--terra, #bf7a5a)" strokeWidth="1.8" />
      {pts.map((p, i) => (
        <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill="var(--paper, #f6ecd8)" stroke="var(--terra, #bf7a5a)" strokeWidth="1.2" />
      ))}
      {labels.map((l, i) => {
        const x = PL + (i / (labels.length - 1)) * w;
        return <text key={i} x={x} y={H - 8} textAnchor="middle" fontSize="8" fontFamily="var(--font-mono, monospace)" fill="var(--ink-3, #8a7658)">{l.toUpperCase()}</text>;
      })}
    </svg>
  );
}

export default function IntelligenceView({ signals, metrics }: { signals: Signal[]; metrics: Metric[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0, height: '100%', overflow: 'hidden' }}>
      {/* Header */}
      <div className="concierge-header">
        <div className="concierge-masthead-mark" style={{ background: 'var(--ink-blue, oklch(0.45 0.09 240))', color: 'var(--paper, #f6ecd8)' }}>S</div>
        <div>
          <div className="concierge-masthead-title">Your <em>Reality</em></div>
          <div className="concierge-masthead-sub">Signals your concierge is listening to</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Metrics grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
          {metrics.map(m => (
            <div key={m.k} style={{ background: 'var(--paper-2, var(--pearl-1))', borderRadius: 'var(--r-sm)', padding: '14px 16px', boxShadow: 'var(--shadow-soft, var(--shadow-sm))' }}>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, letterSpacing: '.18em', textTransform: 'uppercase', color: 'var(--ink-3, var(--text3))' }}>{m.k}</div>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 26, fontWeight: 500, marginTop: 6, lineHeight: 1, color: m.hot ? 'var(--terra, #bf7a5a)' : m.good ? 'var(--sage, #7aab8a)' : 'var(--ink, var(--text))' }}>{m.v}</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'var(--ink-3, var(--text3))', marginTop: 4 }}>{m.sub}</div>
            </div>
          ))}
        </div>

        {/* CPI chart */}
        <div style={{ background: 'var(--paper-2, var(--pearl-1))', borderRadius: 'var(--r-lg)', padding: '22px 24px', boxShadow: 'var(--shadow-soft, var(--shadow-sm))' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 16 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: 22 }}>US CPI, year-over-year</div>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3, var(--text3))', marginTop: 4 }}>12 months · sticky at 3.42%</div>
            </div>
            <span className="stamp convert" style={{ marginLeft: 'auto' }}>elevated</span>
          </div>
          <AreaChart data={CPI_SERIES} labels={CPI_LABELS} />
        </div>

        {/* Signals list */}
        <div style={{ background: 'var(--paper-2, var(--pearl-1))', borderRadius: 'var(--r-lg)', padding: '22px 24px', boxShadow: 'var(--shadow-soft, var(--shadow-sm))' }}>
          <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: 22, marginBottom: 4 }}>All signals today</div>
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, letterSpacing: '.16em', textTransform: 'uppercase', color: 'var(--ink-3, var(--text3))', marginBottom: 16 }}>Stamped and timestamped</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {signals.map((s, i) => (
              <div key={i} style={{ background: 'var(--paper, var(--pearl-0))', borderRadius: 'var(--r-sm)', padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{
                    fontFamily: 'var(--font-mono, monospace)', fontSize: 8, letterSpacing: '.18em', textTransform: 'uppercase',
                    padding: '2px 8px', borderRadius: 'var(--r-pill)',
                    color: s.kind === 'alarm' ? 'var(--terra, #bf7a5a)' : 'var(--sage, #7aab8a)',
                    background: s.kind === 'alarm' ? 'color-mix(in oklch, var(--terra, #bf7a5a) 14%, transparent)' : 'color-mix(in oklch, var(--sage, #7aab8a) 14%, transparent)',
                  }}>{s.tag}</span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono, monospace)', fontSize: 9, color: 'var(--ink-4, var(--text4))' }}>{s.time}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10 }}>
                  <div style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 14, lineHeight: 1.35, flex: 1 }}>{s.body}</div>
                  <Spark data={s.spark} color={s.kind === 'alarm' ? 'var(--terra, #bf7a5a)' : 'var(--sage, #7aab8a)'} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Purchasing power */}
        <div style={{ background: 'var(--paper-2, var(--pearl-1))', borderRadius: 'var(--r-md)', padding: '14px 18px', boxShadow: 'var(--shadow-soft, var(--shadow-sm))' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic', fontSize: 16 }}>Purchasing power retention</span>
            <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>98.73%</span>
          </div>
          <div style={{ height: 6, background: 'var(--paper-3, var(--pearl-2))', borderRadius: 'var(--r-pill)', overflow: 'hidden' }}>
            <div style={{ width: '98.73%', height: '100%', background: 'var(--terra, #bf7a5a)', borderRadius: 'var(--r-pill)' }} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 9.5, color: 'var(--ink-3, var(--text3))', marginTop: 8, lineHeight: 1.4 }}>
            Neutralising inflationary decay via yield vectors. Recalculated hourly.
          </div>
        </div>
      </div>
    </div>
  );
}
