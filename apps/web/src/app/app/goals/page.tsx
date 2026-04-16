import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, getActiveGoals, getActivePositions } from '@intend/data';

export default async function GoalsPage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let goals:     Awaited<ReturnType<typeof getActiveGoals>>     = [];
  let positions: Awaited<ReturnType<typeof getActivePositions>> = [];

  if (user?.email) {
    const dbUser = await getUserByEmail(user.email).catch(() => null);
    if (dbUser) {
      [goals, positions] = await Promise.all([
        getActiveGoals(dbUser.user_id).catch(() => []),
        getActivePositions(dbUser.user_id).catch(() => []),
      ]);
    }
  }

  const totalGoals     = goals.reduce((s, g) => s + Number(g.current_amount), 0);
  const totalPositions = positions.reduce((s, p) => s + Number(p.amount_current), 0);
  const totalEarning   = positions.reduce((s, p) => s + Number(p.amount_current), 0);
  const grandTotal     = totalGoals + totalPositions;

  const isEmpty = goals.length === 0 && positions.length === 0;

  return (
    <div className="page">
      <div className="page-title">Portfolio</div>
      <div className="page-sub">A clear view of your money.</div>

      {isEmpty ? (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <div className="empty-title">Nothing deployed yet</div>
          <div className="empty-sub">
            Tell Intend to grow your savings or set a goal — your portfolio appears here.
          </div>
        </div>
      ) : (
        <>
          {/* Hero total */}
          <div className="portfolio-hero">
            <div className="port-total-label">Total value</div>
            <div className="port-total">
              <span className="currency">$</span>
              {Math.floor(grandTotal).toLocaleString('en-US')}
              <span style={{ fontSize: 24, color: 'var(--text3)', fontWeight: 300 }}>
                .{String(Math.round((grandTotal % 1) * 100)).padStart(2, '0')}
              </span>
            </div>
            {totalEarning > 0 && (
              <div className="port-change">
                <span className="port-change-val">↑ Earning</span>
                <span className="port-change-label">
                  · ${totalEarning.toLocaleString('en-US', { maximumFractionDigits: 0 })} deployed to yield
                </span>
              </div>
            )}
          </div>

          {/* Summary grid */}
          <div className="port-grid">
            <div className="port-card">
              <div className="port-card-label">Goals</div>
              <div className="port-card-val">
                ${totalGoals.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div className="port-card-sub">{goals.length} active</div>
            </div>
            <div className="port-card accent-card">
              <div className="port-card-label">Earning</div>
              <div className="port-card-val">
                ${totalPositions.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </div>
              <div className="port-card-sub">{positions.length} position{positions.length !== 1 ? 's' : ''}</div>
            </div>
          </div>

          {/* Allocation bars */}
          {grandTotal > 0 && (
            <div className="port-section">
              <div className="port-section-label">Where your money is</div>
              <div className="port-bars">
                {totalGoals > 0 && (
                  <div className="port-bar-row">
                    <div className="port-bar-meta">
                      <span className="port-bar-name">Goals</span>
                      <span className="port-bar-val">
                        ${totalGoals.toLocaleString('en-US', { maximumFractionDigits: 0 })} · {Math.round((totalGoals / grandTotal) * 100)}%
                      </span>
                    </div>
                    <div className="port-bar-track">
                      <div className="port-bar-fill" style={{ width: `${(totalGoals / grandTotal) * 100}%`, background: 'var(--accent)' }} />
                    </div>
                  </div>
                )}
                {totalPositions > 0 && (
                  <div className="port-bar-row">
                    <div className="port-bar-meta">
                      <span className="port-bar-name">Earning</span>
                      <span className="port-bar-val">
                        ${totalPositions.toLocaleString('en-US', { maximumFractionDigits: 0 })} · {Math.round((totalPositions / grandTotal) * 100)}%
                      </span>
                    </div>
                    <div className="port-bar-track">
                      <div className="port-bar-fill" style={{ width: `${(totalPositions / grandTotal) * 100}%`, background: 'var(--gold)' }} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Goals list */}
          {goals.length > 0 && (
            <div className="port-section">
              <div className="port-section-label">Savings goals</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {goals.map(g => {
                  const pct = Number(g.target_amount) > 0
                    ? Math.min(1, Number(g.current_amount) / Number(g.target_amount))
                    : 0;
                  return (
                    <div key={g.horizon_id}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{g.goal_name}</span>
                        <span style={{ fontSize: 13, color: 'var(--text2)', fontFamily: 'var(--font-mono)' }}>
                          ${Number(g.current_amount).toLocaleString('en-US', { maximumFractionDigits: 0 })} / ${Number(g.target_amount).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                        </span>
                      </div>
                      <div className="port-bar-track">
                        <div className="port-bar-fill" style={{ width: `${(pct * 100).toFixed(1)}%`, background: 'var(--accent)' }} />
                      </div>
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)', display: 'flex', gap: 12 }}>
                        <span>{(pct * 100).toFixed(0)}% complete</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Positions list */}
          {positions.length > 0 && (
            <div className="port-section">
              <div className="port-section-label">Earning positions</div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {positions.map((p, i) => (
                  <div
                    key={p.position_id}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '14px 0',
                      borderBottom: i < positions.length - 1 ? '1px solid var(--border)' : 'none',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>{p.asset}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                        {(Number(p.apy_at_entry) * 100).toFixed(1)}% APY
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)', fontWeight: 600, color: 'var(--text)' }}>
                        ${Number(p.amount_current).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--accent)', marginTop: 2, fontWeight: 500 }}>
                        Earning
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
