import { NextRequest, NextResponse } from 'next/server';
import { getClaimByToken, markClaimClaimed } from '@intend/data';

export async function POST(req: NextRequest) {
  try {
    const { token, method, address } = await req.json() as {
      token:   string;
      method:  string;
      address: string;
    };

    if (!token || !method || !address) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Validate token
    const claim = await getClaimByToken(token);
    if (!claim) {
      return NextResponse.json({ error: 'Claim not found' }, { status: 404 });
    }

    if (claim.status !== 'pending') {
      return NextResponse.json({ error: 'This claim has already been processed' }, { status: 409 });
    }

    if (new Date(claim.expires_at) < new Date()) {
      return NextResponse.json({ error: 'This claim link has expired' }, { status: 410 });
    }

    // Mark claimed
    const ok = await markClaimClaimed(claim.claim_id, method, address);
    if (!ok) {
      return NextResponse.json({ error: 'Could not process claim — please try again' }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[api/claim] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
