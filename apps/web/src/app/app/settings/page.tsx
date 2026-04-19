import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import { getUserByEmail, listPasskeys } from '@intend/data';
import { SettingsForm } from './settings-form';
import { PasskeySection } from './passkey-section';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  const cookieStore = await cookies();
  const supabase    = createClient(cookieStore);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) redirect('/login');

  const dbUser = await getUserByEmail(user.email).catch(() => null);
  if (!dbUser) redirect('/login');

  const passkeys = await listPasskeys(dbUser.user_id).catch(() => []);

  return (
    <>
      <SettingsForm
        initial={{
          email:                         dbUser.email ?? user.email,
          display_name:                  dbUser.display_name,
          region:                        dbUser.region,
          local_currency:                dbUser.local_currency,
          timezone:                      dbUser.timezone,
          execution_mode:                dbUser.execution_mode,
          max_auto_tx_usd:               Number(dbUser.max_auto_tx_usd ?? 500),
          require_confirm_new_recipient: dbUser.require_confirm_new_recipient ?? true,
          preferred_channel:             dbUser.preferred_channel,
          telegram_linked:               dbUser.telegram_id !== null,
          whatsapp_linked:               dbUser.whatsapp_id !== null,
        }}
      />
      <div className="settings-container" style={{ marginTop: 0 }}>
        <PasskeySection
          initial={passkeys.map(p => ({
            credential_id_pk: p.credential_id_pk,
            device_label:     p.device_label,
            created_at:       p.created_at,
            last_used_at:     p.last_used_at,
          }))}
        />
      </div>
    </>
  );
}
