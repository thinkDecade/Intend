/**
 * Passkey credential repository (Phase 13).
 *
 * One row per registered WebAuthn authenticator. Public key is stored as BYTEA
 * in Postgres; we serialise/deserialise via base64url at the boundary.
 *
 * The challenge table is single-use and per-user — the verify handler reads
 * + deletes it atomically. 5-minute TTL is enforced by the handler, not the
 * DB, so the application boundary owns the freshness contract.
 */
import { getSupabase } from '../supabase.js';

export interface PasskeyCredential {
  credential_id_pk: string;
  user_id:          string;
  credential_id:    string;
  public_key:       Uint8Array;
  counter:          number;
  transports:       string[];
  device_label:     string | null;
  created_at:       string;
  last_used_at:     string | null;
}

export type Ceremony = 'register' | 'authenticate';

// ── base64url ↔ bytes (no Buffer dep) ─────────────────────────────────────
function b64uToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64u(b: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]!);
  const b64 = typeof btoa === 'function' ? btoa(bin) : Buffer.from(bin, 'binary').toString('base64');
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ── Credentials ────────────────────────────────────────────────────────────

export async function listPasskeys(userId: string): Promise<PasskeyCredential[]> {
  const { data, error } = await getSupabase()
    .from('passkey_credentials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`[passkeys] list: ${error.message}`);
  return (data ?? []).map(rowToCredential);
}

export async function findCredentialById(credentialId: string): Promise<PasskeyCredential | null> {
  const { data, error } = await getSupabase()
    .from('passkey_credentials')
    .select('*')
    .eq('credential_id', credentialId)
    .maybeSingle();
  if (error) throw new Error(`[passkeys] find: ${error.message}`);
  return data ? rowToCredential(data) : null;
}

export async function insertPasskey(input: {
  user_id:       string;
  credential_id: string;          // base64url
  public_key:    Uint8Array;
  counter:       number;
  transports:    string[];
  device_label?: string | null;
}): Promise<PasskeyCredential> {
  const { data, error } = await getSupabase()
    .from('passkey_credentials')
    .insert({
      user_id:       input.user_id,
      credential_id: input.credential_id,
      // Postgres BYTEA from JS: pg/PostgREST accepts a base64-encoded string
      // when the column is declared bytea. Send the canonical \x prefix
      // (hex) to avoid any base64 ambiguity in PostgREST.
      public_key:    `\\x${bytesToHex(input.public_key)}`,
      counter:       input.counter,
      transports:    input.transports,
      device_label:  input.device_label ?? null,
    })
    .select('*')
    .single();
  if (error) throw new Error(`[passkeys] insert: ${error.message}`);
  return rowToCredential(data);
}

export async function bumpCounter(credentialId: string, counter: number): Promise<void> {
  const { error } = await getSupabase()
    .from('passkey_credentials')
    .update({ counter, last_used_at: new Date().toISOString() })
    .eq('credential_id', credentialId);
  if (error) throw new Error(`[passkeys] bumpCounter: ${error.message}`);
}

export async function deletePasskey(userId: string, credentialIdPk: string): Promise<void> {
  const { error } = await getSupabase()
    .from('passkey_credentials')
    .delete()
    .eq('user_id', userId)
    .eq('credential_id_pk', credentialIdPk);
  if (error) throw new Error(`[passkeys] delete: ${error.message}`);
}

// ── Challenges ─────────────────────────────────────────────────────────────

export async function setChallenge(userId: string, challenge: string, ceremony: Ceremony): Promise<void> {
  const { error } = await getSupabase()
    .from('passkey_challenges')
    .upsert({ user_id: userId, challenge, ceremony, created_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(`[passkeys] setChallenge: ${error.message}`);
}

export async function consumeChallenge(
  userId: string,
  ceremony: Ceremony,
  maxAgeSeconds = 300,
): Promise<string | null> {
  const sb = getSupabase();
  const { data, error } = await sb
    .from('passkey_challenges')
    .select('challenge, ceremony, created_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(`[passkeys] consumeChallenge read: ${error.message}`);
  if (!data) return null;
  if (data.ceremony !== ceremony) return null;
  const ageMs = Date.now() - Date.parse(data.created_at);
  if (ageMs > maxAgeSeconds * 1000) {
    // expired — clean up
    await sb.from('passkey_challenges').delete().eq('user_id', userId);
    return null;
  }
  // single-use
  await sb.from('passkey_challenges').delete().eq('user_id', userId);
  return data.challenge as string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function rowToCredential(row: Record<string, unknown>): PasskeyCredential {
  // Supabase returns BYTEA as a base64-encoded string OR an "\\x..." hex
  // string depending on driver mode. Handle both.
  const rawPk = row['public_key'];
  let pk: Uint8Array;
  if (typeof rawPk === 'string') {
    pk = rawPk.startsWith('\\x') ? hexToBytes(rawPk.slice(2)) : b64uToBytes(rawPk);
  } else if (rawPk instanceof Uint8Array) {
    pk = rawPk;
  } else {
    pk = new Uint8Array();
  }
  return {
    credential_id_pk: row['credential_id_pk'] as string,
    user_id:          row['user_id'] as string,
    credential_id:    row['credential_id'] as string,
    public_key:       pk,
    counter:          Number(row['counter'] ?? 0),
    transports:       (row['transports'] as string[]) ?? [],
    device_label:     (row['device_label'] as string | null) ?? null,
    created_at:       row['created_at'] as string,
    last_used_at:     (row['last_used_at'] as string | null) ?? null,
  };
}

function bytesToHex(b: Uint8Array): string {
  let h = '';
  for (let i = 0; i < b.length; i++) h += b[i]!.toString(16).padStart(2, '0');
  return h;
}
function hexToBytes(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
  return out;
}

export const _internal = { b64uToBytes, bytesToB64u };
