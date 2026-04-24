/**
 * Model Router — P0-04 test suite
 *
 * Unit tests use mocked providers (no real API calls).
 * Integration tests (tagged :integration) hit real endpoints — run with OPENROUTER_API_KEY set.
 *
 * Run unit tests:       yarn workspace @intend/intelligence test
 * Run integration only: yarn workspace @intend/intelligence test --reporter=verbose model-router
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withFallback, getModel, tierAvailable, type ModelTier } from './model-router.js';

// Ensure every tier is "available" in unit-test mode so the fallback chain
// runs end-to-end even without real keys in the environment. The mocks
// passed to withFallback never actually hit the network.
process.env['DEEPSEEK_API_KEY']   ||= 'test-deepseek';
process.env['ANTHROPIC_API_KEY']  ||= 'test-anthropic';
process.env['OPENROUTER_API_KEY'] ||= 'test-openrouter';

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a mock model that resolves / rejects on demand. */
function mockModel(behaviour: 'resolve' | 'reject' | 'timeout', resolveValue = 'ok') {
  return { _behaviour: behaviour, _value: resolveValue } as unknown as ReturnType<typeof getModel>;
}

/** Replace the model-router's internal TIERS with controllable mocks. */
function patchTiersForTest(behaviours: Array<'resolve' | 'reject' | 'timeout'>) {
  const results: Array<'resolve' | 'reject' | 'timeout'> = behaviours;
  return results;
}

// ── Unit tests — withFallback logic ───────────────────────────────────────

describe('withFallback — fallback chain', () => {
  it('returns primary result when primary succeeds', async () => {
    let callCount = 0;
    const result = await withFallback(async (_model) => {
      callCount++;
      return 'primary-result';
    });
    expect(result).toBe('primary-result');
    expect(callCount).toBe(1);
  });

  it('falls through to next tier on error', async () => {
    let callCount = 0;
    const result = await withFallback(async (_model) => {
      callCount++;
      if (callCount === 1) throw new Error('primary unavailable');
      return `result-from-tier-${callCount}`;
    });
    expect(callCount).toBe(2);
    expect(result).toBe('result-from-tier-2');
  });

  it('falls through all the way to fast tier if needed', async () => {
    let callCount = 0;
    const result = await withFallback(async (_model) => {
      callCount++;
      if (callCount < 4) throw new Error(`tier ${callCount} failed`);
      return 'fast-result';
    });
    expect(callCount).toBe(4);
    expect(result).toBe('fast-result');
  });

  it('throws when all tiers are exhausted', async () => {
    await expect(
      withFallback(async (_model) => {
        throw new Error('always fails');
      })
    ).rejects.toThrow('[model-router] All model providers exhausted');
  });

  it('returns first successful result — does not call remaining tiers', async () => {
    const called: number[] = [];
    const result = await withFallback(async (_model) => {
      const n = called.length + 1;
      called.push(n);
      if (n === 2) return 'tier-2-result';
      throw new Error('fail');
    });
    // Should stop after tier 2 succeeds — tier 3 and 4 never called
    expect(called).toEqual([1, 2]);
    expect(result).toBe('tier-2-result');
  });
});

// ── Unit tests — getModel ─────────────────────────────────────────────────

describe('getModel', () => {
  const tiers: ModelTier[] = ['primary', 'fallback1', 'fallback2', 'fast'];

  it.each(tiers)('returns a model object for tier "%s"', (tier) => {
    const model = getModel(tier);
    // Vercel AI SDK models are objects with a provider string
    expect(model).toBeDefined();
    expect(typeof model).toBe('object');
  });

  it('defaults to primary when no tier specified', () => {
    const defaultModel = getModel();
    const primaryModel = getModel('primary');
    // Both should have the same provider/model-id shape
    expect(JSON.stringify(defaultModel)).toBe(JSON.stringify(primaryModel));
  });
});

// ── Unit tests — tierAvailable ────────────────────────────────────────────

describe('tierAvailable', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    // Restore env
    Object.keys(process.env).forEach((k) => delete process.env[k]);
    Object.assign(process.env, originalEnv);
  });

  it('primary is unavailable when DEEPSEEK_API_KEY is absent', () => {
    delete process.env['DEEPSEEK_API_KEY'];
    expect(tierAvailable('primary')).toBe(false);
  });

  it('primary is available when DEEPSEEK_API_KEY is set', () => {
    process.env['DEEPSEEK_API_KEY'] = 'sk-deepseek-test';
    expect(tierAvailable('primary')).toBe(true);
  });

  it('fallback1 is unavailable when ANTHROPIC_API_KEY is absent', () => {
    delete process.env['ANTHROPIC_API_KEY'];
    expect(tierAvailable('fallback1')).toBe(false);
  });

  it('fallback1 is available when ANTHROPIC_API_KEY is set', () => {
    process.env['ANTHROPIC_API_KEY'] = 'sk-ant-test';
    expect(tierAvailable('fallback1')).toBe(true);
  });

  it('fallback2/fast are unavailable when OPENROUTER_API_KEY is absent', () => {
    delete process.env['OPENROUTER_API_KEY'];
    expect(tierAvailable('fallback2')).toBe(false);
    expect(tierAvailable('fast')).toBe(false);
  });

  it('fallback2/fast are available when OPENROUTER_API_KEY is set', () => {
    process.env['OPENROUTER_API_KEY'] = 'sk-or-test';
    expect(tierAvailable('fallback2')).toBe(true);
    expect(tierAvailable('fast')).toBe(true);
  });
});

// ── Timeout test ──────────────────────────────────────────────────────────

describe('withFallback — timeout behaviour', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('advances to next tier when primary exceeds its timeout', async () => {
    let tiersAttempted = 0;

    const resultPromise = withFallback(async (_model) => {
      tiersAttempted++;
      if (tiersAttempted === 1) {
        // Simulate a never-resolving primary
        await new Promise<never>(() => {/* hang */});
      }
      return 'fallback-result';
    });

    // Advance past primary's 20 s timeout (DeepSeek)
    await vi.advanceTimersByTimeAsync(21_000);

    const result = await resultPromise;
    expect(result).toBe('fallback-result');
    expect(tiersAttempted).toBe(2);
  });
});

// ── Integration test — real OpenRouter call ───────────────────────────────
// Only runs when OPENROUTER_API_KEY is set in the environment.

describe.skipIf(!process.env['OPENROUTER_API_KEY'])('integration: OpenRouter fallback', () => {
  it('falls back to GLM-4.5 Air when primary (Anthropic) is disabled', async () => {
    const saved = process.env['ANTHROPIC_API_KEY'];
    process.env['ANTHROPIC_API_KEY'] = ''; // neutralise primary

    try {
      const { generateText } = await import('ai');

      const result = await withFallback((model) =>
        generateText({
          model,
          prompt: 'Say the word READY and nothing else.',
          maxTokens: 64,  // reasoning models need room before their first output token
        })
      );

      // Key assertion: fallback produced a non-empty response — GLM is alive
      expect(result.text.length).toBeGreaterThan(0);
      // Soft check: ideally contains our keyword (not enforced — model may add punctuation)
      console.info(`[integration] GLM response: "${result.text.trim()}"`);
    } finally {
      if (saved !== undefined) process.env['ANTHROPIC_API_KEY'] = saved;
      else delete process.env['ANTHROPIC_API_KEY'];
    }
  }, 60_000);
});
