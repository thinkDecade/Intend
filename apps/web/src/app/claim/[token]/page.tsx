/**
 * /claim/[token] — Public claim page for MOVE transfers to non-users.
 * No auth required. The token itself validates access (72-hour escrow).
 */

import { getClaimByToken } from '@intend/data';
import ClaimClient from './ClaimClient';

interface Props {
  params: { token: string };
}

export default async function ClaimPage({ params }: Props) {
  const { token } = params;

  // Validate token and fetch claim
  const claim = await getClaimByToken(token).catch(() => null);

  // Expired or missing
  if (!claim) {
    return <ClaimInvalid reason="not_found" />;
  }

  const isExpired = claim.status === 'expired' || new Date(claim.expires_at) < new Date();
  const isClaimed = claim.status === 'claimed';
  const isReturned = claim.status === 'returned';

  if (isExpired)  return <ClaimInvalid reason="expired" />;
  if (isClaimed)  return <ClaimInvalid reason="claimed" />;
  if (isReturned) return <ClaimInvalid reason="returned" />;

  // Calculate time remaining
  const expiresAt  = new Date(claim.expires_at);
  const msLeft     = expiresAt.getTime() - Date.now();
  const hoursLeft  = Math.max(0, Math.floor(msLeft / 1000 / 60 / 60));
  const minutesLeft = Math.max(0, Math.floor((msLeft % (1000 * 60 * 60)) / 1000 / 60));

  return (
    <ClaimClient
      claimId={claim.claim_id}
      token={token}
      amount={claim.amount}
      asset={claim.asset}
      {...(claim.sender_note ? { senderNote: claim.sender_note } : {})}
      recipientContact={claim.recipient_contact}
      hoursLeft={hoursLeft}
      minutesLeft={minutesLeft}
    />
  );
}

// ── Error / terminal states ────────────────────────────────────────────────

function ClaimInvalid({ reason }: { reason: 'not_found' | 'expired' | 'claimed' | 'returned' }) {
  const config = {
    not_found: {
      icon:    '⊘',
      title:   'Link not found',
      body:    'This claim link is invalid or has been removed.',
      accent:  'var(--red)',
    },
    expired: {
      icon:    '◷',
      title:   'Link expired',
      body:    'This claim link has expired. The sender has been notified and the funds will be returned.',
      accent:  'var(--gold)',
    },
    claimed: {
      icon:    '✓',
      title:   'Already claimed',
      body:    'These funds have already been collected. Check your delivery method for the transfer.',
      accent:  'var(--green)',
    },
    returned: {
      icon:    '↩',
      title:   'Funds returned',
      body:    'The claim expired and the funds have been returned to the sender.',
      accent:  'var(--text3)',
    },
  } as const;

  const { icon, title, body, accent } = config[reason];

  return (
    <div className="claim-page">
      <div className="claim-card">
        <div className="claim-logo">i</div>
        <div className="claim-terminal-icon" style={{ color: accent }}>{icon}</div>
        <div className="claim-terminal-title">{title}</div>
        <div className="claim-terminal-body">{body}</div>
      </div>
    </div>
  );
}
