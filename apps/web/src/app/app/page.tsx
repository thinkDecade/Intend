import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser, listPasskeys } from '@intend/data';
import ChatPanel from './_components/ChatPanel';
import { PasskeyNudge } from './_components/PasskeyNudge';

export default async function AppPage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let userId: string | null = null;
  let isOnboarding = false;
  let hasPasskeys  = true; // default true so we don't flash the nudge for unauthed
  if (user?.email) {
    let dbUser = await getUserByEmail(user.email).catch(() => null);
    // Auto-create if layout didn't catch it
    if (!dbUser) {
      try {
        dbUser = await createUser({ email: user.email, webapp_uid: user.id });
      } catch { /* layout will retry */ }
    }
    userId      = dbUser?.user_id ?? null;
    isOnboarding = dbUser ? !dbUser.onboarding_completed : false;
    if (userId) {
      const passkeys = await listPasskeys(userId).catch(() => []);
      hasPasskeys = passkeys.length > 0;
    }
  }

  return (
    <>
      <PasskeyNudge show={!!userId && !isOnboarding && !hasPasskeys} />
      <ChatPanel userId={userId} isOnboarding={isOnboarding} />
    </>
  );
}
