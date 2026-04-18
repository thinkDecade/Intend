import { Redis } from '@upstash/redis';

// Singleton — imported by all callers in this process
let _redis: Redis | null = null;

export function getRedis(): Redis {
  if (_redis) return _redis;

  const url   = process.env['UPSTASH_REDIS_REST_URL'];
  const token = process.env['UPSTASH_REDIS_REST_TOKEN'];

  if (!url || !token) {
    throw new Error(
      '[redis] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN must be set'
    );
  }

  _redis = new Redis({ url, token });
  return _redis;
}

// ── TTLs (seconds) — matches CLAUDE.md signal freshness rules ─────────────
export const TTL = {
  FX:          14_400, // 4 hours
  APY:         21_600, // 6 hours
  PRICES:          900, // 15 minutes
  GAS:             300, // 5 minutes
  HEDGE_SCORE: 14_400, // 4 hours
  SESSION:              3_600, // 1 hour (durable backup to Supabase)
  PROTECT_ALERT_COOLDOWN: 86_400, // 24 hours — don't re-alert same user same day
  PLAN_CACHE:              2_400, // 40 minutes — matches confirmation expiry window
  BALANCES:                  120, // 2 minutes — wallet balance display cache
} as const;

// ── Max ages (2× TTL) — staleness limit before pipeline abort ─────────────
export const MAX_AGE_MS = {
  FX:          TTL.FX          * 2 * 1000,
  APY:         TTL.APY         * 2 * 1000,
  PRICES:      TTL.PRICES      * 2 * 1000,
  GAS:         TTL.GAS         * 2 * 1000,
  HEDGE_SCORE: TTL.HEDGE_SCORE * 2 * 1000,
} as const;

// ── Key helpers ───────────────────────────────────────────────────────────
export const keys = {
  fx:                   (region: string, currency: string) => `intend:fx:${region}:${currency}`,
  apy:                  ()                                 => `intend:apy:protocols`,
  price:                (asset: string)                    => `intend:price:${asset.toLowerCase()}`,
  gas:                  ()                                 => `intend:gas:base`,
  hedgeScore:           (region: string)                   => `intend:hedge:${region}`,
  session:              (channel: string, channelId: string) => `intend:session:${channel}:${channelId}`,
  /** Cooldown flag — prevents repeat PROTECT alerts within 24h for the same user. */
  protectAlertCooldown: (userId: string)                   => `intend:protect:cooldown:${userId}`,
  /**
   * Short-lived cache for ExecutionPlan objects.
   * Written by chat route when plan is generated; read by confirm route on dispatch.
   * TTL matches confirmation expiry window (40 minutes).
   */
  planCache: (intentId: string)                            => `intend:plan:${intentId}`,
  /** 2-minute wallet balance cache for portfolio display. */
  userBalances: (userId: string)                           => `intend:balances:${userId}`,
} as const;

// ── Typed cache helpers ───────────────────────────────────────────────────

/** Store a value with TTL and embedded timestamp for staleness checks. */
export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds: number,
): Promise<void> {
  const envelope = { data: value, fetched_at: Date.now() };
  await getRedis().set(key, JSON.stringify(envelope), { ex: ttlSeconds });
}

/** Retrieve a cached value. Returns null if missing or expired. */
export async function cacheGet<T>(key: string): Promise<{ data: T; fetched_at: number } | null> {
  const raw = await getRedis().get<string>(key);
  if (!raw) return null;
  try {
    return JSON.parse(typeof raw === 'string' ? raw : JSON.stringify(raw)) as { data: T; fetched_at: number };
  } catch {
    return null;
  }
}

/** Delete a key. */
export async function cacheDel(key: string): Promise<void> {
  await getRedis().del(key);
}

/** Check if a cached value is within the allowed age. */
export function isFresh(fetchedAt: number, maxAgeMs: number): boolean {
  return Date.now() - fetchedAt < maxAgeMs;
}
