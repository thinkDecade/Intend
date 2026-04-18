import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser } from '@intend/data';
import AppShell from './_components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const email = user.email ?? '';

  // Look up or auto-create internal user record
  let dbUser = email
    ? await getUserByEmail(email).catch(() => null)
    : null;

  if (!dbUser && email) {
    try {
      dbUser = await createUser({
        email,
        webapp_uid: user.id,
      });
    } catch (err) {
      console.error('[app/layout] auto-create user failed:', err);
    }
  }

  const userId      = dbUser?.user_id ?? null;
  const displayName = dbUser?.display_name ?? null;
  const isOnboarding = dbUser ? !dbUser.onboarding_completed : false;

  return (
    <>
      <div className="ambient" />
      <AppShell userId={userId} displayName={displayName} isOnboarding={isOnboarding}>
        {children}
      </AppShell>
    </>
  );
}
