/**
 * Smoke test — DeepSeek tier
 *
 * Disables the Anthropic key in-process so withFallback drops to fallback1
 * (DeepSeek) and returns a real model response. Confirms the tier label
 * we cut over to and prints the response text.
 *
 * Run from the repo root:
 *   npx tsx scripts/smoke-deepseek.ts
 *
 * Requires DEEPSEEK_API_KEY (or DEEP_SEEK_API_KEY) in .env.
 */

import { config } from 'dotenv';

async function main() {
  // Load .env BEFORE the model-router module is imported — the router reads
  // env vars at module-load time to alias DEEP_SEEK_API_KEY → DEEPSEEK_API_KEY.
  config();

  // Disable Anthropic so the chain advances to DeepSeek.
  delete process.env['ANTHROPIC_API_KEY'];

  const { withFallback, streamWithFallback, logModelRouterStatus } = await import(
    '../packages/intelligence/src/model-router.js'
  );
  const { generateText } = await import('ai');

  console.log('── Provider status (with Anthropic disabled) ──');
  logModelRouterStatus();
  console.log();

  console.log('── 1. withFallback (generateText) ──');
  const t1 = Date.now();
  const result = await withFallback((model) =>
    generateText({
      model,
      prompt:    'Reply with the single word READY and nothing else.',
      maxTokens: 24,
    }),
  );
  console.log(`✓ generate ok in ${Date.now() - t1} ms — "${result.text.trim()}"`);
  console.log();

  console.log('── 2. streamWithFallback (textStream) ──');
  const t2 = Date.now();
  let buf = '';
  for await (const chunk of streamWithFallback({
    prompt:    'Count from one to five, separated by commas. No other words.',
    maxTokens: 64,
  })) {
    buf += chunk;
    process.stdout.write(chunk);
  }
  console.log();
  console.log(`✓ stream ok in ${Date.now() - t2} ms — got ${buf.length} chars`);
}

main().catch((err) => {
  console.error('✗ Smoke test failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
