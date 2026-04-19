/**
 * POST /api/auth/passkey/register/verify
 *
 * Body: RegistrationResponseJSON (from @simplewebauthn/browser).
 *
 * Verifies the attestation against the challenge we issued, then persists
 * the credential. Optional `device_label` for the user-facing list.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { verifyRegistrationResponse } from '@simplewebauthn/server';
import type { RegistrationResponseJSON } from '@simplewebauthn/types';
import { getUserByEmail, consumeChallenge, insertPasskey, logEvent } from '@intend/data';
import { rpFromRequest, bytesToB64u } from '../../_shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase    = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const dbUser = await getUserByEmail(user.email).catch(() => null);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await req.json() as { response: RegistrationResponseJSON; device_label?: string };
    if (!body?.response) return NextResponse.json({ error: 'Missing registration response' }, { status: 400 });

    const expectedChallenge = await consumeChallenge(dbUser.user_id, 'register');
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge expired or missing — start over.' }, { status: 400 });
    }

    const { rpID, origin } = rpFromRequest(req);

    const verification = await verifyRegistrationResponse({
      response:                  body.response,
      expectedChallenge,
      expectedOrigin:            origin,
      expectedRPID:              rpID,
      requireUserVerification:   false,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return NextResponse.json({ error: 'Verification failed' }, { status: 400 });
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    await insertPasskey({
      user_id:       dbUser.user_id,
      credential_id: bytesToB64u(credentialID),
      public_key:    new Uint8Array(credentialPublicKey),
      counter,
      transports:    body.response.response.transports ?? [],
      device_label:  body.device_label?.trim() || null,
    });

    await logEvent({
      user_id:    dbUser.user_id,
      event_type: 'channel_linked',
      source:     'web',
      event_data: { channel: 'passkey', device_label: body.device_label ?? null },
    }).catch(() => { /* observability — never block */ });

    return NextResponse.json({ verified: true });
  } catch (err) {
    console.error('[passkey/register/verify]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
