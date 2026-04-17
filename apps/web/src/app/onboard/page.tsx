import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail } from '@intend/data';
import { OnboardFlow } from './onboard-flow';

export const metadata = {
  title: 'Welcome to Intend',
  description: 'Set up your financial command center.',
};

export default async function OnboardPage() {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();

  if (!user?.email) redirect('/login');

  const dbUser = await getUserByEmail(user.email).catch(() => null);
  if (!dbUser) redirect('/login');

  // If they somehow got here after finishing onboarding, send to app
  if (dbUser.onboarding_completed) redirect('/app');

  return (
    <OnboardFlow
      email={user.email}
      displayName={dbUser.display_name}
      localCurrency={dbUser.local_currency}
      region={dbUser.region}
    />
  );
}
