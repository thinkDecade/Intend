/**
 * Preview route — renders the full app shell with mock data.
 * Used for visual QA only. No auth required.
 * DELETE before shipping to production.
 */

import NavPanel from '../app/_components/NavPanel';
import TopBar from '../app/_components/TopBar';
import ChatPanel from '../app/_components/ChatPanel';

export default function PreviewPage() {
  return (
    <>
      <div className="ambient" />
      <div className="shell">
        <NavPanel />
        <div className="main">
          <TopBar greeting="Good afternoon" initials="KA" />
          <div className="content">
            <div className="chat-col">
              <ChatPanel userId={null} />
            </div>

            {/* Right panel — static mock */}
            <aside className="right-panel" style={{ width: 280, flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg3)', display: 'flex', flexDirection: 'column' }}>
              <div className="panel-header">
                <div className="panel-label">Overview</div>
              </div>
              <div className="panel-blocks">
                <div className="panel-block">
                  <div className="panel-block-label">Total balance</div>
                  <div className="panel-block-val">$1,740</div>
                  <div className="panel-block-sub">Across all allocations</div>
                </div>
                <div className="panel-block highlight">
                  <div className="panel-block-label">Available</div>
                  <div className="panel-block-val">$1,240</div>
                  <div className="panel-block-sub">Ready to use now</div>
                  <div className="panel-change">
                    <div className="change-bar">
                      <div className="change-fill" style={{ width: '71%' }} />
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text3)', fontFamily: 'var(--font-mono)' }}>71%</span>
                  </div>
                </div>
                <div className="insight-card">
                  <div className="insight-icon">✦</div>
                  <div className="insight-text">
                    Your <strong>$500</strong> is earning <strong>$2.40/week</strong> at 5.8%.
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </>
  );
}
