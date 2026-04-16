'use client';

import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';

interface PortfolioSummary {
  total_usd:     number;
  available_usd: number;
  earning_usd:   number;
  protected_usd: number;
}

export default function RightPanel({
  userId,
  open,
}: {
  userId: string | null;
  open:   boolean;
}) {
  const pathname  = usePathname();
  const [portfolio, setPortfolio] = useState<PortfolioSummary | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/portfolio?userId=${encodeURIComponent(userId)}`);
      if (res.ok) setPortfolio(await res.json() as PortfolioSummary);
    } catch { /* non-critical */ }
  }, [userId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <aside
      className="right-panel"
      style={{
        width:      open ? 280 : 0,
        flexShrink: 0,
        overflow:   'hidden',
        borderLeft: open ? '1px solid var(--border)' : 'none',
        transition: 'width 0.28s cubic-bezier(0.4,0,0.2,1)',
        background: 'var(--bg3)',
        display:    'flex',
        flexDirection: 'column',
      }}
    >
      {/* Only render inner content when open (avoids layout flash) */}
      {open && (
        <>
          <div className="panel-header">
            <div className="panel-label">{panelLabel(pathname)}</div>
          </div>
          <div className="panel-blocks">
            {renderBlocks(pathname, portfolio)}
          </div>
        </>
      )}
    </aside>
  );
}

function panelLabel(pathname: string): string {
  if (pathname.startsWith('/app/history'))  return 'Summary';
  if (pathname.startsWith('/app/goals'))    return 'Allocations';
  if (pathname.startsWith('/app/settings')) return 'Account';
  return 'Overview';
}

function renderBlocks(pathname: string, p: PortfolioSummary | null) {
  const total     = p?.total_usd     ?? 0;
  const available = p?.available_usd ?? 0;
  const earning   = p?.earning_usd   ?? 0;
  const availPct  = total > 0 ? Math.round((available / total) * 100) : 0;

  if (pathname.startsWith('/app/history')) {
    return (
      <>
        <div className="panel-block">
          <div className="panel-block-label">This month</div>
          <div className="panel-block-val">—</div>
          <div className="panel-block-sub">Intents executed</div>
        </div>
        <div className="panel-block highlight">
          <div className="panel-block-label">Total moved</div>
          <div className="panel-block-val">—</div>
          <div className="panel-block-sub">Across all transfers</div>
        </div>
      </>
    );
  }

  if (pathname.startsWith('/app/goals')) {
    return (
      <>
        <div className="panel-block">
          <div className="panel-block-label">Total</div>
          <div className="panel-block-val">{total > 0 ? `$${fmt(total)}` : '—'}</div>
          <div className="panel-block-sub">Net worth in Intend</div>
        </div>
        <div className="panel-block highlight">
          <div className="panel-block-label">Earning</div>
          <div className="panel-block-val">{earning > 0 ? `$${fmt(earning)}` : '—'}</div>
          <div className="panel-block-sub">Deployed to yield</div>
        </div>
        {earning > 0 && (
          <div className="insight-card">
            <div className="insight-icon">✦</div>
            <div className="insight-text">
              Your money is working. Keep growing it with Intend.
            </div>
          </div>
        )}
      </>
    );
  }

  if (pathname.startsWith('/app/settings')) {
    return (
      <div className="panel-block">
        <div className="panel-block-label">Status</div>
        <div className="panel-block-val" style={{ fontSize: 14, fontFamily: 'var(--font-sans)' }}>Active</div>
        <div className="panel-block-sub">All systems operational</div>
      </div>
    );
  }

  // Default overview
  return (
    <>
      <div className="panel-block">
        <div className="panel-block-label">Total balance</div>
        <div className="panel-block-val">{total > 0 ? `$${fmt(total)}` : '—'}</div>
        <div className="panel-block-sub">Across all allocations</div>
      </div>

      <div className="panel-block highlight">
        <div className="panel-block-label">Available</div>
        <div className="panel-block-val">{available > 0 ? `$${fmt(available)}` : '—'}</div>
        <div className="panel-block-sub">Ready to use now</div>
        {total > 0 && (
          <div className="panel-change">
            <div className="change-bar">
              <div className="change-fill" style={{ width: `${availPct}%` }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>
              {availPct}%
            </span>
          </div>
        )}
      </div>

      {earning > 0 && (
        <div className="insight-card">
          <div className="insight-icon">✦</div>
          <div className="insight-text">
            <strong>${fmt(earning)}</strong> is actively earning yield for you right now.
          </div>
        </div>
      )}
    </>
  );
}

function fmt(n: number): string {
  return n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}
