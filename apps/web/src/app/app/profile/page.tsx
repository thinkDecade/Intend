import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail } from '@intend/data';
import ProfileView from './profile-view';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const dbUser = await getUserByEmail(user.email).catch(() => null);
  if (!dbUser) redirect('/login');

  return (
    <ProfileView
      profile={{
        email:          dbUser.email ?? user.email,
        display_name:   dbUser.display_name,
        intend_handle:  dbUser.intend_handle,
        kyc_tier:       dbUser.kyc_tier,
        created_at:     dbUser.created_at,
        region:         dbUser.region,
        local_currency: dbUser.local_currency,
        telegram_linked: dbUser.telegram_id !== null,
        whatsapp_linked: dbUser.whatsapp_id !== null,
        execution_mode:  dbUser.execution_mode,
      }}
    />
  );
}
