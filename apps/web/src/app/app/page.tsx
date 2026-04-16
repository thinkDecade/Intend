import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, createUser } from '@intend/data';
import ChatPanel from './_components/ChatPanel';

export default async function AppPage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  let userId: string | null = null;
  if (user?.email) {
    let dbUser = await getUserByEmail(user.email).catch(() => null);
    // Auto-create if layout didn't catch it
    if (!dbUser) {
      try {
        dbUser = await createUser({ email: user.email, webapp_uid: user.id });
      } catch { /* layout will retry */ }
    }
    userId = dbUser?.user_id ?? null;
  }

  return <ChatPanel userId={userId} />;
}
