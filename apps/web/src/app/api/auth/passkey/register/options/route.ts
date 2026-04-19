/**
 * POST /api/auth/passkey/register/options
 *
 * Caller MUST be authenticated (Supabase session cookie). Returns
 * registration options for the browser to pass to navigator.credentials.create().
 *
 * Excludes any credentials already registered to this user so the browser
 * disables them in the picker (RFC 9591 excludeCredentials behaviour).
 */
import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { generateRegistrationOptions } from '@simplewebauthn/server';
import { getUserByEmail, listPasskeys, setChallenge } from '@intend/data';
import { rpFromRequest } from '../../_shared';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase    = createClient(cookieStore);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.email) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

    const dbUser = await getUserByEmail(user.email).catch(() => null);
    if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const { rpName, rpID } = rpFromRequest(req);
    const existing = await listPasskeys(dbUser.user_id);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      // userID must be a stable, opaque per-user identifier — never the email.
      userID: dbUser.user_id,
      userName: user.email,
      userDisplayName: dbUser.display_name ?? user.email,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({
        id:         Buffer.from(c.credential_id, 'base64url'),
        type:       'public-key' as const,
        transports: c.transports as AuthenticatorTransport[],
      })),
      authenticatorSelection: {
        residentKey:      'preferred',
        userVerification: 'preferred',
      },
    });

    await setChallenge(dbUser.user_id, options.challenge, 'register');
    return NextResponse.json(options);
  } catch (err) {
    console.error('[passkey/register/options]', err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
