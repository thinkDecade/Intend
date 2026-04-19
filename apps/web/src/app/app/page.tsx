import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser, listPasskeys, getERP } from '@intend/data';
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

    // Onboarding gate — rolling-update friendly.
    //
    // We treat a user as "needing onboarding" whenever EITHER:
    //   (a) the legacy `onboarding_completed` flag is still false (brand-new
    //       accounts, never finished the chat), OR
    //   (b) the flag is true but there is no ERP row whose seed_source is
    //       'onboarding' (legacy account from before the v0.5_updated chat
    //       agent — backfilled rows have seed_source='backfill' or
    //       'inference').
    //
    // This is what lets new releases land without wiping users: existing
    // accounts get a one-time conversational re-onboarding to fill the
    // ERP, then their `onboarding_completed` stays true and they never
    // see this flow again.
    if (userId) {
      const [passkeys, erp] = await Promise.all([
        listPasskeys(userId).catch(() => []),
        getERP(userId).catch(() => null),
      ]);
      hasPasskeys = passkeys.length > 0;

      const flagPending  = dbUser ? !dbUser.onboarding_completed : false;
      const erpFromChat  = erp?.seed_source === 'onboarding';
      isOnboarding       = flagPending || !erpFromChat;
    }
  }

  return (
    <>
      <PasskeyNudge show={!!userId && !isOnboarding && !hasPasskeys} />
      <ChatPanel userId={userId} isOnboarding={isOnboarding} />
    </>
  );
}
