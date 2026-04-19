#!/usr/bin/env ts-node
/**
 * INTEND — Full user wipe (auth + Redis + bot session check)
 *
 * Companion to scripts/wipe-users.sql. The SQL file truncates the
 * application tables (run it first in the Supabase SQL editor or via
 * psql). This script then:
 *
 *   1. Deletes every user from `auth.users` via the Supabase Admin SDK
 *   2. Flushes every per-user Redis namespace (sessions, link codes,
 *      plan caches, balance caches, protect cooldowns)
 *   3. Reports any Telegram bot session that was still in flight
 *
 * Safety: requires INTEND_WIPE_CONFIRM=YES in the environment, and
 * refuses to run if NODE_ENV === 'production' unless
 * INTEND_WIPE_ALLOW_PROD=YES is also set. There is no second prompt
 * because this script is meant to be invoked from CI / a workstation
 * shell where the operator has already typed the magic words.
 *
 * Usage:
 *   INTEND_WIPE_CONFIRM=YES npx ts-node scripts/wipe-users.ts
 *
 * Env required:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   UPSTASH_REDIS_REST_URL
 *   UPSTASH_REDIS_REST_TOKEN
 */

import { createClient } from '@supabase/supabase-js';
import { Redis } from '@upstash/redis';

const REDIS_USER_PREFIXES = [
  'intend:session:',          // live session state, all channels
  'intend:link_code:',        // /connect 6-digit codes
  'intend:plan:',             // 40-min plan cache
  'intend:balances:',         // balance display cache
  'intend:protect:cooldown:', // PROTECT 24h alert cooldown
  'onboard:',                 // any onboarding scratch state
];

function need(name: string): string {
  const v = process.env[name];
  if (!v) { console.error(`Missing env: ${name}`); process.exit(2); }
  return v;
}

async function main() {
  if (process.env['INTEND_WIPE_CONFIRM'] !== 'YES') {
    console.error('Refusing to run: set INTEND_WIPE_CONFIRM=YES to confirm.');
    process.exit(2);
  }
  if (process.env['NODE_ENV'] === 'production' && process.env['INTEND_WIPE_ALLOW_PROD'] !== 'YES') {
    console.error('Refusing to run in production without INTEND_WIPE_ALLOW_PROD=YES.');
    process.exit(2);
  }

  const supa = createClient(need('SUPABASE_URL'), need('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const redis = new Redis({
    url:   need('UPSTASH_REDIS_REST_URL'),
    token: need('UPSTASH_REDIS_REST_TOKEN'),
  });

  // ------------------------------------------------------------
  // 0. Truncate application tables (children first).
  //
  // The append-only "no modify / no delete" policies on event_log
  // and revenue_events are RLS policies, not triggers — service
  // role bypasses RLS, so direct deletes succeed.
  //
  // Each table is keyed off a column we know is never null so the
  // PostgREST `.delete()` filter resolves to "every row".
  // ------------------------------------------------------------
  const TABLES: { name: string; pk: string }[] = [
    { name: 'parallel_lanes',           pk: 'lane_id' },
    { name: 'event_log',                pk: 'log_id' },
    { name: 'revenue_events',           pk: 'event_id' },
    { name: 'signal_snapshots',         pk: 'snapshot_id' },
    { name: 'x402_events',              pk: 'event_id' },
    { name: 'kyc_records',              pk: 'kyc_id' },
    { name: 'confirmation_reminders',   pk: 'reminder_id' },
    { name: 'claims',                   pk: 'claim_id' },
    { name: 'life_horizons',            pk: 'horizon_id' },
    { name: 'positions',                pk: 'position_id' },
    { name: 'intents',                  pk: 'intent_id' },
    { name: 'sessions',                 pk: 'session_id' },
    { name: 'wallets',                  pk: 'wallet_id' },
    { name: 'passkey_challenges',       pk: 'challenge_id' },
    { name: 'passkey_credentials',      pk: 'credential_id_pk' },
    { name: 'economic_reality_profile', pk: 'user_id' },
    { name: 'users',                    pk: 'user_id' },
  ];
  console.log('• application tables — truncating…');
  for (const t of TABLES) {
    const { error, count } = await supa
      .from(t.name)
      .delete({ count: 'exact' })
      .not(t.pk, 'is', null);
    if (error) {
      // Most likely cause: table or column doesn't exist locally yet
      // (e.g. migration 006 not applied). Surface and continue —
      // a missing table is harmless for a "wipe everything" pass.
      console.warn(`  ! ${t.name}: ${error.message}`);
    } else {
      console.log(`  ✓ ${t.name} — removed ${count ?? 0} row(s)`);
    }
  }

  // ------------------------------------------------------------
  // 1. Delete all auth.users (paginated)
  // ------------------------------------------------------------
  console.log('• auth.users — deleting…');
  let page = 1;
  let totalDeleted = 0;
  // listUsers default perPage is 50; bump to 1000 to keep round-trips low.
  // Loop until a page comes back empty.
  while (true) {
    const { data, error } = await supa.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) { console.error('listUsers failed:', error); process.exit(1); }
    const users = data?.users ?? [];
    if (users.length === 0) break;
    for (const u of users) {
      const { error: delErr } = await supa.auth.admin.deleteUser(u.id);
      if (delErr) console.warn(`  delete ${u.email ?? u.id} failed: ${delErr.message}`);
      else totalDeleted++;
    }
    // After deletion, page 1 will refill — keep asking for page 1.
    if (users.length < 1000) break;
  }
  console.log(`  ✓ removed ${totalDeleted} auth.users record(s)`);

  // ------------------------------------------------------------
  // 2. Telegram session inventory (informational — gets wiped below)
  // ------------------------------------------------------------
  const tgSessions = await scanKeys(redis, 'intend:session:telegram:');
  if (tgSessions.length) {
    console.log(`• bot — ${tgSessions.length} live Telegram session(s) still in Redis:`);
    for (const k of tgSessions) console.log(`    ${k}`);
    console.log('  (these are about to be flushed)');
  } else {
    console.log('• bot — no live Telegram sessions in Redis. Clean.');
  }

  // ------------------------------------------------------------
  // 3. Flush per-user Redis namespaces
  // ------------------------------------------------------------
  for (const prefix of REDIS_USER_PREFIXES) {
    const keys = await scanKeys(redis, prefix);
    if (keys.length === 0) { console.log(`• redis ${prefix}* — empty`); continue; }
    // Upstash REST del takes varargs; chunk to stay well below limits.
    for (let i = 0; i < keys.length; i += 200) {
      const batch = keys.slice(i, i + 200);
      await redis.del(...batch);
    }
    console.log(`• redis ${prefix}* — deleted ${keys.length} key(s)`);
  }

  // Final residual check — anything still in users / event_log means the
  // append-only trigger blocked the cascade, and the SQL file must be run.
  const { count: remainingUsers } = await supa
    .from('users').select('*', { count: 'exact', head: true });
  const { count: remainingLogs } = await supa
    .from('event_log').select('*', { count: 'exact', head: true });

  console.log('');
  if ((remainingUsers ?? 0) > 0 || (remainingLogs ?? 0) > 0) {
    console.log('⚠ Partial wipe: auth + Redis cleared, but DB rows remain.');
    console.log(`    users      : ${remainingUsers}`);
    console.log(`    event_log  : ${remainingLogs}`);
    console.log('');
    console.log('  The event_log append-only trigger blocks deletes that cascade');
    console.log('  through ON DELETE SET NULL. Finish the wipe by pasting');
    console.log('  scripts/wipe-users.sql into the Supabase SQL Editor:');
    console.log('    Dashboard → SQL Editor → New query → paste → Run.');
    console.log('  TRUNCATE bypasses BEFORE-row triggers, so it completes cleanly.');
  } else {
    console.log('✅ Full wipe complete — auth, Redis, and DB are all empty.');
  }
}

async function scanKeys(redis: Redis, prefix: string): Promise<string[]> {
  const out: string[] = [];
  let cursor: string | number = 0;
  do {
    // @upstash/redis supports SCAN with a MATCH pattern.
    const [next, batch] = await redis.scan(cursor, { match: `${prefix}*`, count: 500 });
    out.push(...batch);
    cursor = next;
  } while (cursor !== 0 && cursor !== '0');
  return out;
}

main().catch(err => { console.error(err); process.exit(1); });
