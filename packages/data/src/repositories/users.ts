import { getSupabase } from '../supabase.js';

export interface UserRow {
  user_id: string;
  telegram_id: bigint | null;
  whatsapp_id: string | null;
  webapp_uid: string | null;
  phone_number: string | null;
  email: string | null;
  display_name: string | null;
  intend_handle: string | null;
  region: string;
  local_currency: string;
  timezone: string;
  preferred_language: string;
  /** @deprecated use execution_mode */
  automation_level: 'suggest' | 'assisted' | 'autonomous';
  execution_mode: 'semi_autonomous' | 'autonomous';
  kyc_tier: 'tier_0' | 'tier_1' | 'tier_2' | 'tier_3';
  preferred_channel: 'telegram' | 'whatsapp' | 'web' | null;
  max_auto_tx_usd: number;
  created_at: string;
  last_active_at: string | null;
  is_active: boolean;
}

export async function getUserById(userId: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // not found
    throw new Error(`[users] getUserById: ${error.message}`);
  }
  return data as UserRow;
}

export async function getUserByTelegramId(telegramId: bigint): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('telegram_id', telegramId.toString())
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[users] getUserByTelegramId: ${error.message}`);
  }
  return data as UserRow;
}

export async function getUserByWhatsAppId(whatsappId: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('whatsapp_id', whatsappId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[users] getUserByWhatsAppId: ${error.message}`);
  }
  return data as UserRow;
}

export async function getUserByWebAppUid(webappUid: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('webapp_uid', webappUid)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[users] getUserByWebAppUid: ${error.message}`);
  }
  return data as UserRow;
}

export async function getUserByEmail(email: string): Promise<UserRow | null> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`[users] getUserByEmail: ${error.message}`);
  }
  return data as UserRow;
}

/**
 * Create a new user record. Used on first web sign-up (auth callback)
 * and Telegram /start. Returns the created row.
 */
export async function createUser(fields: {
  email?: string | null;
  webapp_uid?: string | null;
  telegram_id?: string | null;
  display_name?: string | null;
  region?: string;
  local_currency?: string;
}): Promise<UserRow> {
  const { data, error } = await getSupabase()
    .from('users')
    .insert({
      email:          fields.email ?? null,
      webapp_uid:     fields.webapp_uid ?? null,
      telegram_id:    fields.telegram_id ?? null,
      display_name:   fields.display_name ?? null,
      region:         fields.region ?? 'GH',
      local_currency: fields.local_currency ?? 'GHS',
    })
    .select('*')
    .single();

  if (error) throw new Error(`[users] createUser: ${error.message}`);
  return data as UserRow;
}

export async function updateLastActive(userId: string): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .update({ last_active_at: new Date().toISOString() })
    .eq('user_id', userId);

  if (error) throw new Error(`[users] updateLastActive: ${error.message}`);
}

/**
 * Return all active users that have a Telegram channel linked.
 * Used by the proactive monitor to enumerate users for PROTECT alerts.
 * Filters: is_active = true, telegram_id IS NOT NULL.
 */
export async function getAllActiveUsersWithTelegram(): Promise<UserRow[]> {
  const { data, error } = await getSupabase()
    .from('users')
    .select('*')
    .eq('is_active', true)
    .not('telegram_id', 'is', null);

  if (error) throw new Error(`[users] getAllActiveUsersWithTelegram: ${error.message}`);
  return (data ?? []) as UserRow[];
}

export async function updateUserSettings(
  userId: string,
  settings: {
    execution_mode?: 'semi_autonomous' | 'autonomous';
    local_currency?: string;
    region?: string;
    display_name?: string | null;
  },
): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .update(settings)
    .eq('user_id', userId);

  if (error) throw new Error(`[users] updateUserSettings: ${error.message}`);
}
