/**
 * Model Router — P0-04
 *
 * Provider chain (in fallback order):
 *   primary   → Anthropic   Claude Sonnet 4.6                   (best quality, pay-per-token)
 *   fallback1 → OpenRouter  openai/gpt-oss-120b:free           (120B OSS, 131K ctx)
 *   fallback2 → OpenRouter  nvidia/nemotron-3-super-120b:free  (120B Nemotron, 262K ctx)
 *   fast      → OpenRouter  openai/gpt-oss-20b:free            (20B OSS, lowest latency)
 *
 * All OpenRouter tiers are zero-cost (:free suffix).
 * Primary requires ANTHROPIC_API_KEY. Fallbacks require OPENROUTER_API_KEY.
 *
 * Per-tier timeouts account for free-tier latency variance:
 *   primary   15 s — Anthropic is fast
 *   fallback1 30 s — free models can queue
 *   fallback2 30 s
 *   fast      20 s
 */

import { anthropic }    from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';

// ── OpenRouter provider (OpenAI-compatible API) ────────────────────────────

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
  getModel:    () => ReturnType<typeof anthropic> | ReturnType<typeof openrouter>;
}

const TIERS: TierConfig[] = [
  {
    tier:      'primary',
    label:     'Claude Sonnet 4.6 (Anthropic)',
    timeoutMs: 15_000,
    getModel:  () => anthropic('claude-sonnet-4-6'),
  },
  {
    tier:      'fallback1',
    label:     'GPT-OSS-120B free (OpenRouter)',
    timeoutMs: 30_000,
    getModel:  () => openrouter('openai/gpt-oss-120b:free'),
  },
  {
    tier:      'fallback2',
    label:     'Nemotron-120B free (OpenRouter)',
    timeoutMs: 30_000,
    getModel:  () => openrouter('nvidia/nemotron-3-super-120b-a12b:free'),
  },
  {
    tier:      'fast',
    label:     'GPT-OSS-20B free (OpenRouter)',
    timeoutMs: 20_000,
    getModel:  () => openrouter('openai/gpt-oss-20b:free'),
  },
];

// ── Public helpers ─────────────────────────────────────────────────────────

/** Return the model for a specific tier (useful for streaming which always uses primary). */
export function getModel(tier: ModelTier = 'primary') {
  const config = TIERS.find((t) => t.tier === tier);
  if (!config) throw new Error(`Unknown model tier: ${tier}`);
  return config.getModel();
}

/**
 * Execute `fn` with automatic provider fallback.
 *
 * Tries each tier in order. On error or timeout, logs a warning and advances
 * to the next tier. Throws only when all tiers are exhausted.
 *
 * The `fn` callback receives the LanguageModel for the current tier.
 * Pass that model directly to `generateObject`, `generateText`, or `streamText`.
 */
export async function withFallback<T>(
  fn: (model: ReturnType<typeof getModel>) => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (const { tier, label, timeoutMs, getModel: buildModel } of TIERS) {
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

      if (tier !== 'primary') {
        // Surface to monitoring so we know primary is degraded
        console.warn(`[model-router] Using fallback tier: ${tier} (${label})`);
      }

      return result;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);

      if (tier === 'fast') {
        // All tiers exhausted
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
  switch (tier) {
    case 'primary':
      return Boolean(process.env['ANTHROPIC_API_KEY']);
    case 'fallback1':
    case 'fallback2':
    case 'fast':
      return Boolean(process.env['OPENROUTER_API_KEY']);
  }
}

/**
 * Log the availability of all tiers at startup.
 * Call once from bot/webapp entry point.
 */
export function logModelRouterStatus(): void {
  console.info('[model-router] Provider status:');
  for (const { tier, label } of TIERS) {
    const available = tierAvailable(tier);
    console.info(`  ${available ? '✓' : '✗'} ${tier.padEnd(10)} ${label}`);
  }
  const anyAvailable = TIERS.some(({ tier }) => tierAvailable(tier));
  if (!anyAvailable) {
    console.error(
      '[model-router] ⚠️  No providers available — set ANTHROPIC_API_KEY or OPENROUTER_API_KEY',
    );
  }
}
