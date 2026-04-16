import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser } from '@intend/data';
import NavPanel from './_components/NavPanel';
import TopBar from './_components/TopBar';
import AppShell from './_components/AppShell';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const email    = user.email ?? '';
  const initials = email.slice(0, 2).toUpperCase();
  const greeting = getGreeting();

  // Look up or auto-create internal user record
  let dbUser = email
    ? await getUserByEmail(email).catch(() => null)
    : null;

  // Auto-create if missing (fallback for users who signed up before this was wired)
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

  const userId = dbUser?.user_id ?? null;

  return (
    <>
      <div className="ambient" />
      <div className="shell">
        <NavPanel />
        <div className="main">
          <TopBar greeting={greeting} initials={initials} />
          <AppShell userId={userId}>
            {children}
          </AppShell>
        </div>
      </div>
    </>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}
