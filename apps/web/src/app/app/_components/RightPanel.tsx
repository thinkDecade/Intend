'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface InsightItem {
  id:        string;
  type:      'risk' | 'opportunity' | 'market';
  text:      string;
  timestamp: string;
}

interface PortfolioSummary {
  total_usd:     number;
  available_usd: number;
  earning_usd:   number;
  protected_usd: number;
}

// ── Mini SVG chart ─────────────────────────────────────────────────────────

function MiniChart({ type }: { type: InsightItem['type'] }) {
  const points = useMemo(() => Array.from({ length: 12 }, () => Math.random() * 20), []);
  const pathParts = points.slice(1).map((p, i) => `${(i + 1) * 6},${20 - p}`).join(' L ');
  const firstPt  = points[0] ?? 10;
  const lastPt   = points[11] ?? 10;
  const color =
    type === 'risk'        ? '#ef4444' :
    type === 'opportunity' ? '#D4A24A' :
                             '#a1a1aa';
  return (
    <svg width="70" height="25" style={{ opacity: 0.45, flexShrink: 0 }}>
      <path
        d={`M 0,${20 - firstPt} L ${pathParts}`}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="66" cy={20 - lastPt} r="2" fill={color} />
    </svg>
  );
}

// ── Inline icon helpers ────────────────────────────────────────────────────

function GlobeIcon({ size = 13, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="12" cy="12" r="10"/>
      <line x1="2" y1="12" x2="22" y2="12"/>
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

function ZapIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
    </svg>
  );
}

function ShieldAlertIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
      <line x1="12" y1="8" x2="12" y2="12"/>
      <line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  );
}

function TrendingUpIcon({ size = 11, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/>
      <polyline points="17 6 23 6 23 12"/>
    </svg>
  );
}

function ActivityIcon({ size = 11, color = 'var(--accent)' }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
    </svg>
  );
}

function XIcon({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

// ── RightPanel / RealityPanel ──────────────────────────────────────────────

export default function RightPanel({
  userId,
  open,
  onDismiss,
}: {
  userId:     string | null;
  open:       boolean;
  onDismiss?: () => void;
}) {
  const [insights, setInsights]       = useState<InsightItem[]>([]);
  const [inflationRate, setInflation] = useState(3.42);
  const [portfolio, setPortfolio]     = useState<PortfolioSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch portfolio summary
  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/portfolio?userId=${encodeURIComponent(userId)}`);
      if (res.ok) setPortfolio(await res.json() as PortfolioSummary);
    } catch { /* non-critical */ }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  // Generate insight feed
  useEffect(() => {
    const pool = [
      'CPI Data: Inflation sticky at 3.4%. Purchasing power decaying.',
      'USD liquidity tightening. Yield spreads expanding on Base.',
      'Real yields in legacy banking remain negative.',
      'PROTECT Logic: Shifting idle USDC to Aave V3 yield vectors.',
      'Gold parity sync: PAXG providing superior inflation hedge.',
      'Global debt-to-GDP alert: Portfolio de-risking initiated.',
      'Forward Signal: Economic trajectory reflects gradual deterioration.',
      'Base network gas: 0.08 gwei — optimal execution window.',
    ];

    const make = (text?: string): InsightItem => ({
      id:        Math.random().toString(36).slice(2, 9),
      type:      Math.random() > 0.7 ? 'risk' : Math.random() > 0.4 ? 'opportunity' : 'market',
      text:      text ?? pool[Math.floor(Math.random() * pool.length)] ?? '',
      timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }),
    });

    setInsights(pool.slice(0, 4).map(t => make(t)));

    const interval = setInterval(() => {
      setInsights(prev => [make(), ...prev].slice(0, 10));
      setInflation(prev => parseFloat((prev + (Math.random() - 0.5) * 0.05).toFixed(2)));
    }, 8000);

    return () => clearInterval(interval);
  }, []);

  if (!open) return null;

  const retentionPct = portfolio?.earning_usd && portfolio?.total_usd
    ? Math.min(100, Math.round((portfolio.earning_usd / portfolio.total_usd) * 100))
    : 98.2;

  const macros: Array<{
    label: string;
    value: string;
    sub: string;
    color: string;
    icon: React.ReactNode;
  }> = [
    { label: 'Avg Inflation', value: `${inflationRate}%`, sub: 'CPI', color: 'var(--red)',   icon: <ShieldAlertIcon color="var(--red)" /> },
    { label: 'Hedge Score',   value: '0.72',              sub: 'LVL', color: 'var(--text)',   icon: <ZapIcon color="var(--text)" /> },
    { label: 'Real Yield',    value: '+1.8%',             sub: 'NET', color: 'var(--accent)', icon: <TrendingUpIcon color="var(--accent)" /> },
    { label: 'FX Trend',      value: 'STABLE',            sub: 'SYS', color: 'var(--text)',   icon: <GlobeIcon size={11} color="var(--text)" /> },
  ];

  return (
    <div className="reality-panel">
      {/* Header */}
      <div className="reality-header">
        <div className="reality-header-left">
          <GlobeIcon />
          <span className="reality-title">Economic Reality</span>
        </div>
        {onDismiss && (
          <button className="reality-dismiss" onClick={onDismiss} aria-label="Dismiss">
            <XIcon />
          </button>
        )}
      </div>

      {/* Macro indicators grid */}
      <div className="reality-macros">
        {macros.map(m => (
          <div key={m.label} className="reality-macro-card">
            <div className="reality-macro-top">
              <span className="tech-label" style={{ opacity: 0.6 }}>{m.label}</span>
              <span style={{ opacity: 0.5 }}>{m.icon}</span>
            </div>
            <div className="reality-macro-val-row">
              <span className="reality-macro-val font-heading" style={{ color: m.color }}>{m.value}</span>
              <span className="reality-macro-sub">{m.sub}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Signals feed */}
      <div className="reality-feed-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <ActivityIcon />
          <span className="tech-label" style={{ opacity: 0.7 }}>Execution Signals</span>
        </div>
        <div className="reality-synced">
          <span className="reality-synced-dot" />
          <span className="tech-label" style={{ opacity: 0.4 }}>SYNCED</span>
        </div>
      </div>

      <div ref={scrollRef} className="reality-feed scrollbar-hide">
        {insights.map(insight => (
          <div key={insight.id} className="reality-insight-card">
            <div className="reality-insight-top">
              <div className="reality-insight-type-row">
                <span
                  className="reality-type-dot"
                  style={{
                    background:
                      insight.type === 'risk'        ? '#ef4444' :
                      insight.type === 'opportunity' ? 'var(--accent)' :
                      'var(--text4)',
                  }}
                />
                <span
                  className="tech-label"
                  style={{
                    color:
                      insight.type === 'risk'        ? '#ef4444' :
                      insight.type === 'opportunity' ? 'var(--accent)' :
                      'var(--text4)',
                  }}
                >
                  {insight.type}
                </span>
              </div>
              <span className="reality-insight-time">{insight.timestamp}</span>
            </div>
            <div className="reality-insight-body">
              <p className="reality-insight-text">{insight.text}</p>
              <MiniChart type={insight.type} />
            </div>
          </div>
        ))}
      </div>

      {/* Purchasing power footer */}
      <div className="reality-footer">
        <div className="reality-footer-header">
          <span className="reality-footer-label font-heading">Purchasing Power Retention</span>
          <span className="reality-footer-pct">{retentionPct}%</span>
        </div>
        <div className="reality-footer-bar-track">
          <div
            className="reality-footer-bar-fill"
            style={{ width: `${retentionPct}%` }}
          />
        </div>
        <p className="reality-footer-note">
          Neutralizing inflationary decay via automated yield vectors.
        </p>
      </div>
    </div>
  );
}
