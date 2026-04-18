import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, getActivePositions } from '@intend/data';

export default async function PositionsPage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let positions: Awaited<ReturnType<typeof getActivePositions>> = [];
  if (user?.email) {
    const dbUser = await getUserByEmail(user.email).catch(() => null);
    if (dbUser) positions = await getActivePositions(dbUser.user_id).catch(() => []);
  }

  const totalUsd = positions.reduce((s, p) => s + Number(p.amount_current), 0);

  return (
    <div className="page">
      <p className="tech-label" style={{ color: 'var(--accent)', marginBottom: 10 }}>
        INTELLIGENCE CONSOLE // POSITIONS_SURFACE
      </p>
      <div className="page-title font-heading">Positions</div>
      <div className="page-sub">Your active yield and investment positions.</div>

      {positions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">↑</div>
          <div className="empty-title">Nothing earning yet</div>
          <div className="empty-sub">
            Tell Intend to grow your money and your positions appear here.
          </div>
        </div>
      ) : (
        <>
          {/* Total */}
          <div className="port-section" style={{ marginBottom: 16 }}>
            <div className="port-section-label">Total deployed</div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 32, fontWeight: 600, color: 'var(--accent)', letterSpacing: -1 }}>
              ${totalUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}
            </div>
          </div>

          {/* Positions list */}
          <div className="port-section">
            <div className="port-section-label">{positions.length} position{positions.length !== 1 ? 's' : ''}</div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {positions.map((p, i) => (
                <div
                  key={p.position_id}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '16px 0',
                    borderBottom: i < positions.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
                      {p.asset}
                    </div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--text3)' }}>
                      <span style={{ color: 'var(--green)', fontWeight: 500 }}>
                        {(Number(p.apy_at_entry) * 100).toFixed(1)}% APY
                      </span>
                      <span>
                        {Number(p.amount_deposited).toLocaleString(undefined, { maximumFractionDigits: 6 })} {p.asset}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
                      ${Number(p.amount_current).toLocaleString('en-US', { maximumFractionDigits: 0 })}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 3, fontWeight: 500 }}>
                      Earning
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
