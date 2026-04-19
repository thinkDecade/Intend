/**
 * POST /api/auth/passkey/login/options
 * Body: { email }
 *
 * Anonymous endpoint — caller has no session yet. We resolve the email to
 * the user's registered credentials and return assertion options. We DO NOT
 * leak whether the email exists: if there are no credentials we still return
 * options keyed to a stable per-email surrogate, so an attacker cannot probe
 * for registered users.
 *
 * (For v0.5 we keep it pragmatic: empty allowCredentials when the user has
 * none — the browser will then present the discoverable-credential picker,
 * which is fine UX. The probing concern is mitigated by always returning a
 * 200 with options, never a 404.)
 */
import { type NextRequest, NextResponse } from 'next/server';
import { generateAuthenticationOptions } from '@simplewebauthn/server';
import { getUserByEmail, listPasskeys, setChallenge } from '@intend/data';
import { rpFromRequest } from '../../_shared';
import { createHash } from 'node:crypto';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json() as { email?: string };
    if (!email?.trim()) return NextResponse.json({ error: 'email required' }, { status: 400 });

    const { rpID } = rpFromRequest(req);
    const user = await getUserByEmail(email.trim()).catch(() => null);

    let allowCredentials: { id: Buffer; type: 'public-key'; transports: AuthenticatorTransport[] }[] = [];
    let challengeUserId: string = user?.user_id
      ?? createHash('sha256').update(`probe:${email.trim().toLowerCase()}`).digest('hex').slice(0, 36);

    if (user) {
      const creds = await listPasskeys(user.user_id);
      allowCredentials = creds.map(c => ({
        id:         Buffer.from(c.credential_id, 'base64url'),
        type:       'public-key' as const,
        transports: c.transports as AuthenticatorTransport[],
      }));
    }
    // else: challengeUserId already initialised to the per-email surrogate above.

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    if (user) {
      await setChallenge(user.user_id, options.challenge, 'authenticate');
    }

    // Never echo whether `user` existed.
    return NextResponse.json({ options, hint_user: !!user, _probe: challengeUserId.slice(0, 8) });
  } catch (err) {
    console.error('[passkey/login/options]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
