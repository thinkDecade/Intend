import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, getSupabase } from '@intend/data';

interface IntentRow {
  intent_id:  string;
  primitive:  string;
  raw_input:  string;
  status:     string;
  amount_usd: string | null;
  created_at: string;
}

export default async function HistoryPage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let intents: IntentRow[] = [];
  if (user?.email) {
    const dbUser = await getUserByEmail(user.email).catch(() => null);
    if (dbUser) {
      const { data } = await getSupabase()
        .from('intents')
        .select('intent_id, primitive, raw_input, status, amount_usd, created_at')
        .eq('user_id', dbUser.user_id)
        .order('created_at', { ascending: false })
        .limit(50);
      intents = (data ?? []) as IntentRow[];
    }
  }

  return (
    <div className="page">
      <div className="page-title">Activity</div>
      <div className="page-sub">Everything you&apos;ve done, clearly.</div>

      {intents.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">◎</div>
          <div className="empty-title">Nothing yet</div>
          <div className="empty-sub">Your executed intents will appear here.</div>
        </div>
      ) : (
        <div className="timeline">
          {intents.map((intent, i) => {
            const cfg    = primitiveConfig(intent.primitive, intent.status);
            const amount = intent.amount_usd
              ? `$${Number(intent.amount_usd).toLocaleString('en-US', { maximumFractionDigits: 0 })}`
              : '—';

            return (
              <div
                key={intent.intent_id}
                className="timeline-item"
                style={{ animationDelay: `${i * 0.04}s` }}
              >
                <div className={`tl-icon ${intent.primitive.toLowerCase()}`}>
                  {cfg.icon}
                </div>
                <div className="tl-body">
                  <div className="tl-title">{cfg.label}</div>
                  <div
                    className="tl-sub"
                    style={{ maxWidth: 440, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {intent.raw_input}
                  </div>
                  <div className={`tl-badge ${cfg.badgeClass}`}>{cfg.badgeLabel}</div>
                </div>
                <div className="tl-right">
                  <div className="tl-amt">{amount}</div>
                  <div className="tl-time">{relativeTime(intent.created_at)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function primitiveConfig(primitive: string, status: string) {
  const icons: Record<string, string> = {
    MOVE: '↗', GROW: '↑', PROTECT: '⬡', INVEST: '◈',
    SAVE: '◎', CONVERT: '⇄', EARN: '↓', SPEND: '⊕',
  };
  const labels: Record<string, string> = {
    MOVE: 'Transfer', GROW: 'Yield deposit', PROTECT: 'Inflation shield',
    INVEST: 'Investment', SAVE: 'Goal contribution', CONVERT: 'Conversion',
    EARN: 'Incoming funds', SPEND: 'Payment',
  };
  const badges: Record<string, { cls: string; label: string }> = {
    complete:  { cls: 'complete', label: 'Completed' },
    failed:    { cls: 'failed',   label: 'Failed' },
    confirmed: { cls: 'active',   label: 'Executing' },
    executing: { cls: 'active',   label: 'Executing' },
    cancelled: { cls: 'pending',  label: 'Cancelled' },
  };
  const badge = badges[status] ?? { cls: 'pending', label: status };
  return {
    icon:       icons[primitive]  ?? '·',
    label:      labels[primitive] ?? primitive,
    badgeClass: badge.cls,
    badgeLabel: badge.label,
  };
}

function relativeTime(iso: string): string {
  const diff  = Date.now() - new Date(iso).getTime();
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (mins  < 1)  return 'just now';
  if (mins  < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days  < 7)  return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
