/**
 * GET    /api/auth/passkey/list  → { passkeys: [...] } for the authed user
 * DELETE /api/auth/passkey/list  → body { credential_id_pk } removes one
 */
import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, listPasskeys, deletePasskey } from '@intend/data';

export const dynamic = 'force-dynamic';

async function getAuthedUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const dbUser = await getUserByEmail(user.email).catch(() => null);
  return dbUser?.user_id ?? null;
}

export async function GET() {
  const userId = await getAuthedUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const all = await listPasskeys(userId);
  return NextResponse.json({
    passkeys: all.map(p => ({
      credential_id_pk: p.credential_id_pk,
      device_label:     p.device_label,
      created_at:       p.created_at,
      last_used_at:     p.last_used_at,
    })),
  });
}

export async function DELETE(req: NextRequest) {
  const userId = await getAuthedUserId();
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { credential_id_pk } = await req.json() as { credential_id_pk?: string };
  if (!credential_id_pk) return NextResponse.json({ error: 'credential_id_pk required' }, { status: 400 });
  await deletePasskey(userId, credential_id_pk);
  return NextResponse.json({ ok: true });
}
