/**
 * Model Router — P0-04
 *
 * Provider chain (in fallback order):
 *   primary   → Anthropic   Claude Sonnet 4.6                   (highest quality, pay-per-token)
 *   fallback1 → DeepSeek    deepseek-chat (V3)                  (paid, fast, reliable backup)
 *   fallback2 → OpenRouter  openai/gpt-oss-120b:free            (120B OSS, 131K ctx)
 *   fast      → OpenRouter  openai/gpt-oss-20b:free             (20B OSS, lowest latency)
 *
 * DeepSeek sits at fallback1 so the moment Anthropic credit / quota
 * issues hit, we cut over to a paid, reliable provider before falling
 * down into OpenRouter's free tiers.
 *
 * Tiers without their API key set are skipped at request time — we never
 * burn a timeout on a provider we know we can't reach.
 *
 * Per-tier timeouts:
 *   primary   (Anthropic)  15 s
 *   fallback1 (DeepSeek)   20 s
 *   fallback2 (OpenRouter) 30 s
 *   fast      (OpenRouter) 20 s
 */

import { anthropic }    from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

// ── DeepSeek provider (OpenAI-compatible) ──────────────────────────────────

const deepseek = createOpenAI({
  baseURL: 'https://api.deepseek.com',
  apiKey:  process.env['DEEPSEEK_API_KEY'] ?? '',
});

// ── OpenRouter provider (OpenAI-compatible) ────────────────────────────────

const openrouter = createOpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey:  process.env['OPENROUTER_API_KEY'] ?? '',
  headers: {
    'HTTP-Referer': 'https://intend.finance',
    'X-Title':      'Intend',
  },
});

// ── Tier definitions ───────────────────────────────────────────────────────

export type ModelTier = 'primary' | 'fallback1' | 'fallback2' | 'fast';

interface TierConfig {
  tier:        ModelTier;
  label:       string;   // human-readable for logs
  timeoutMs:   number;
  envKey:      string;   // env var that must be present for this tier to be tried
  getModel:    () => ReturnType<typeof anthropic> | ReturnType<typeof openrouter> | ReturnType<typeof deepseek>;
}

const TIERS: TierConfig[] = [
  {
    tier:      'primary',
    label:     'Claude Sonnet 4.6 (Anthropic)',
    timeoutMs: 15_000,
    envKey:    'ANTHROPIC_API_KEY',
    getModel:  () => anthropic('claude-sonnet-4-6'),
  },
  {
    tier:      'fallback1',
    label:     'DeepSeek V3 (deepseek-chat)',
    timeoutMs: 20_000,
    envKey:    'DEEPSEEK_API_KEY',
    getModel:  () => deepseek('deepseek-chat'),
  },
  {
    tier:      'fallback2',
    label:     'GPT-OSS-120B free (OpenRouter)',
    timeoutMs: 30_000,
    envKey:    'OPENROUTER_API_KEY',
    getModel:  () => openrouter('openai/gpt-oss-120b:free'),
  },
  {
    tier:      'fast',
    label:     'GPT-OSS-20B free (OpenRouter)',
    timeoutMs: 20_000,
    envKey:    'OPENROUTER_API_KEY',
    getModel:  () => openrouter('openai/gpt-oss-20b:free'),
  },
];

// ── Public helpers ─────────────────────────────────────────────────────────

/**
 * Return the model for a specific tier (useful for streaming which always
 * wants a single model rather than the whole fallback chain).
 *
 * Falls back gracefully: if the requested tier's API key is missing, returns
 * the first available tier instead so callers don't have to special-case it.
 */
export function getModel(tier: ModelTier = 'primary') {
  const requested = TIERS.find((t) => t.tier === tier);
  if (!requested) throw new Error(`Unknown model tier: ${tier}`);

  // If the requested tier is configured, use it.
  if (process.env[requested.envKey]) return requested.getModel();

  // Otherwise return the first tier whose key is set — keeps single-shot
  // streaming alive even when the "preferred" provider is unavailable.
  const available = TIERS.find((t) => Boolean(process.env[t.envKey]));
  if (!available) {
    // Surface a useful error for ops; callers will see this in their logs.
    console.warn(
      `[model-router] No provider keys set — falling back to requested tier "${tier}". ` +
      `Calls will fail until DEEPSEEK_API_KEY / ANTHROPIC_API_KEY / OPENROUTER_API_KEY is set.`,
    );
    return requested.getModel();
  }
  if (available.tier !== tier) {
    console.warn(
      `[model-router] Requested tier "${tier}" has no key — using "${available.tier}" (${available.label}) instead.`,
    );
  }
  return available.getModel();
}

/**
 * Execute `fn` with automatic provider fallback.
 *
 * Tries each tier in order, **skipping any whose API key is unset** so we
 * never burn a 15–30 s timeout on a provider we know we can't reach. On
 * error or timeout, logs a warning and advances to the next tier. Throws
 * only when every available tier has been exhausted.
 *
 * The `fn` callback receives the LanguageModel for the current tier.
 * Pass that model directly to `generateObject`, `generateText`, or `streamText`.
 */
export async function withFallback<T>(
  fn: (model: ReturnType<typeof getModel>) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  const usable = TIERS.filter((t) => Boolean(process.env[t.envKey]));

  if (usable.length === 0) {
    throw new Error(
      '[model-router] No provider keys set. Configure DEEPSEEK_API_KEY, ' +
      'ANTHROPIC_API_KEY, or OPENROUTER_API_KEY before making model calls.',
    );
  }

  for (let i = 0; i < usable.length; i++) {
    const { tier, label, timeoutMs, getModel: buildModel } = usable[i]!;
    const isLast = i === usable.length - 1;
    const model = buildModel();

    try {
      const result = await Promise.race([
        fn(model),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`[model-router] ${label} timed out after ${timeoutMs}ms`)),
            timeoutMs,
          ),
        ),
      ]);

      // Surface degraded mode to ops monitoring
      if (i > 0) {
        console.warn(`[model-router] Using fallback tier: ${tier} (${label})`);
      }

      return result;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (isLast) {
        console.error(`[model-router] All tiers exhausted. Last error: ${msg}`);
        break;
      }

      console.warn(`[model-router] ${label} failed — trying next tier. Reason: ${msg}`);
    }
  }

  throw new Error(
    `[model-router] All model providers exhausted. Last error: ${
      lastError instanceof Error ? lastError.message : String(lastError)
    }`,
  );
}

/**
 * Check whether a specific tier is reachable (env var set).
 * Useful for startup diagnostics / health-check endpoint.
 */
export function tierAvailable(tier: ModelTier): boolean {
  const config = TIERS.find((t) => t.tier === tier);
  if (!config) return false;
  return Boolean(process.env[config.envKey]);
}

/**
 * Log the availability of all tiers at startup.
 * Call once from bot/webapp entry point.
 */
export function logModelRouterStatus(): void {
  console.info('[model-router] Provider status:');
  for (const { tier, label, envKey } of TIERS) {
    const available = Boolean(process.env[envKey]);
    console.info(`  ${available ? '✓' : '✗'} ${tier.padEnd(10)} ${label}${available ? '' : `  (set ${envKey})`}`);
  }
  const anyAvailable = TIERS.some(({ envKey }) => process.env[envKey]);
  if (!anyAvailable) {
    console.error(
      '[model-router] ⚠️  No providers available — set DEEPSEEK_API_KEY, ANTHROPIC_API_KEY, or OPENROUTER_API_KEY',
    );
  }
}
