'use client';

import { useState, useEffect, useCallback } from 'react';

interface Goal {
  id:          string;
  name:        string;
  current_usd: number;
  target_usd:  number;
  apy:         number;
}

interface Position {
  id:           string;
  asset:        string;
  protocol:     string;
  amount:       number;
  usd_value:    number;
  apy_at_entry: number;
}

interface PortfolioData {
  balances: Array<{ asset: string; amount: number; usd_value: number }>;
  total_usd: number;
  goals:     Goal[];
  positions: Position[];
}

interface InitialData {
  goals:     Goal[];
  positions: Position[];
}

export default function PortfolioPanel({
  initial,
  userId,
}: {
  initial: InitialData;
  userId:  string | null;
}) {
  const [data, setData] = useState<PortfolioData>({
    balances:  [],
    total_usd: 0,
    goals:     initial.goals,
    positions: initial.positions,
  });
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/portfolio?userId=${encodeURIComponent(userId)}`);
      if (res.ok) {
        const d = await res.json() as PortfolioData;
        setData(d);
      }
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totalGoalUsd = data.goals.reduce((s, g) => s + g.current_usd, 0);
  const totalPositionUsd = data.positions.reduce((s, p) => s + p.usd_value, 0);

  return (
    <div style={{
      width: 300,
      flexShrink: 0,
      display: 'flex',
      flexDirection: 'column',
      overflowY: 'auto',
      background: 'var(--surface)',
      padding: '20px 16px',
      gap: 20,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Portfolio
        </span>
        <button
          onClick={() => void refresh()}
          disabled={loading}
          style={{
            fontSize: 11,
            color: loading ? 'var(--text-dim)' : 'var(--amber)',
            background: 'transparent',
            padding: 0,
          }}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {/* Total balance */}
      <div style={{
        padding: '16px',
        background: 'var(--surface-2)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
      }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Total value</div>
        <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.5px', color: 'var(--text)' }}>
          ${(data.total_usd + totalGoalUsd + totalPositionUsd).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </div>
      </div>

      {/* Wallet balances */}
      {data.balances.length > 0 && (
        <Section label="Wallet">
          {data.balances.map(b => (
            <Row
              key={b.asset}
              left={b.asset}
              right={`$${b.usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={`${b.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${b.asset}`}
            />
          ))}
        </Section>
      )}

      {/* Positions */}
      {data.positions.length > 0 && (
        <Section label="Earning">
          {data.positions.map(p => (
            <Row
              key={p.id}
              left={p.asset}
              right={`$${p.usd_value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={`${(p.apy_at_entry * 100).toFixed(1)}% APY`}
              accent
            />
          ))}
        </Section>
      )}

      {/* Goals */}
      {data.goals.length > 0 && (
        <Section label="Goals">
          {data.goals.map(g => {
            const pct = g.target_usd > 0 ? Math.min(1, g.current_usd / g.target_usd) : 0;
            return (
              <div key={g.id} style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: 'var(--text)' }}>{g.name}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    ${g.current_usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} / ${g.target_usd.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </span>
                </div>
                {/* Progress bar */}
                <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%',
                    width: `${(pct * 100).toFixed(1)}%`,
                    background: 'var(--amber)',
                    borderRadius: 2,
                    transition: 'width 0.4s',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-dim)', marginTop: 3 }}>
                  {(g.apy * 100).toFixed(1)}% APY · {(pct * 100).toFixed(0)}% complete
                </div>
              </div>
            );
          })}
        </Section>
      )}

      {/* Empty state */}
      {data.balances.length === 0 && data.positions.length === 0 && data.goals.length === 0 && !loading && (
        <div style={{ fontSize: 13, color: 'var(--text-dim)', textAlign: 'center', paddingTop: 20 }}>
          No assets yet.
          <br />
          Tell Intend your first intention.
        </div>
      )}
    </div>
  );
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--text-dim)',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        marginBottom: 10,
      }}>
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ left, right, sub, accent }: { left: string; right: string; sub?: string; accent?: boolean }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      padding: '8px 0',
      borderBottom: '1px solid var(--border)',
    }}>
      <div>
        <div style={{ fontSize: 13, color: 'var(--text)' }}>{left}</div>
        {sub && <div style={{ fontSize: 11, color: accent ? 'var(--green)' : 'var(--text-muted)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{right}</div>
    </div>
  );
}
