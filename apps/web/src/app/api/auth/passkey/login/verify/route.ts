/**
 * POST /api/auth/passkey/login/verify
 * Body: { email, response }
 *
 * Verifies the WebAuthn assertion. On success, mints a Supabase session
 * for that user by:
 *   1. admin.generateLink({ type: 'magiclink' }) → returns hashed_token
 *   2. supabase.auth.verifyOtp({ token_hash, type: 'magiclink' }) →
 *      sets the session cookie via the SSR client.
 *
 * The client gets { ok: true } and redirects to /app. No token ever touches
 * the client — the cookie is set inside this handler.
 */
import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { verifyAuthenticationResponse } from '@simplewebauthn/server';
import type { AuthenticationResponseJSON } from '@simplewebauthn/types';
import {
  getUserByEmail, findCredentialById, consumeChallenge, bumpCounter, logEvent,
} from '@intend/data';
import { rpFromRequest } from '../../_shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { email?: string; response?: AuthenticationResponseJSON };
    if (!body.email?.trim() || !body.response) {
      return NextResponse.json({ error: 'email and response required' }, { status: 400 });
    }

    const dbUser = await getUserByEmail(body.email.trim()).catch(() => null);
    if (!dbUser) return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });

    const expectedChallenge = await consumeChallenge(dbUser.user_id, 'authenticate');
    if (!expectedChallenge) {
      return NextResponse.json({ error: 'Challenge expired or missing — start over.' }, { status: 400 });
    }

    const credentialIdB64u = body.response.id;
    const cred = await findCredentialById(credentialIdB64u);
    if (!cred || cred.user_id !== dbUser.user_id) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    const { rpID, origin } = rpFromRequest(req);

    const verification = await verifyAuthenticationResponse({
      response:                 body.response,
      expectedChallenge,
      expectedOrigin:           origin,
      expectedRPID:             rpID,
      authenticator: {
        credentialID:        Buffer.from(cred.credential_id, 'base64url'),
        credentialPublicKey: Buffer.from(cred.public_key),
        counter:             cred.counter,
        transports:          cred.transports as AuthenticatorTransport[],
      },
      requireUserVerification: false,
    });

    if (!verification.verified) {
      return NextResponse.json({ error: 'Authentication failed' }, { status: 401 });
    }

    // Anti-cloning: counter must increase (or stay 0 for some authenticators).
    if (verification.authenticationInfo.newCounter > 0
        && verification.authenticationInfo.newCounter <= cred.counter) {
      console.warn('[passkey] possible cloned authenticator', {
        cred_id: cred.credential_id, old: cred.counter, new: verification.authenticationInfo.newCounter,
      });
      return NextResponse.json({ error: 'Credential integrity check failed' }, { status: 401 });
    }
    await bumpCounter(cred.credential_id, verification.authenticationInfo.newCounter);

    // ── Mint a Supabase session for this user ────────────────────────────
    const admin = createAdmin(
      process.env['SUPABASE_URL']!,
      process.env['SUPABASE_SERVICE_ROLE_KEY']!,
    );
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type:  'magiclink',
      email: dbUser.email!,
    });
    if (linkErr || !linkData?.properties?.hashed_token) {
      console.error('[passkey/login/verify] generateLink failed', linkErr);
      return NextResponse.json({ error: 'Could not establish session' }, { status: 500 });
    }

    const cookieStore = await cookies();
    const supabase    = createClient(cookieStore);
    const { error: verifyErr } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type:       'magiclink',
    });
    if (verifyErr) {
      console.error('[passkey/login/verify] verifyOtp failed', verifyErr);
      return NextResponse.json({ error: 'Could not establish session' }, { status: 500 });
    }

    await logEvent({
      user_id:    dbUser.user_id,
      event_type: 'channel_linked',          // semantic: auth method used
      source:     'web',
      event_data: { auth_method: 'passkey', credential_id_pk: cred.credential_id_pk },
    }).catch(() => { /* swallow */ });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[passkey/login/verify]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
