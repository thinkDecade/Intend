/**
 * Vitest global setup — loads the monorepo root .env into process.env
 * so integration tests can access ANTHROPIC_API_KEY, OPENROUTER_API_KEY, etc.
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath }    from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);   // reliable ESM dirname equivalent
const envPath    = resolve(__dirname, '../../../.env');

const { error } = config({ path: envPath, override: true });
if (error) {
  console.warn('[test-setup] dotenv failed to load:', error.message, '| path:', envPath);
} else {
  const hasAnthropic = !!process.env['ANTHROPIC_API_KEY'];
  const hasOpenRouter = !!process.env['OPENROUTER_API_KEY'];
  console.info(`[test-setup] env loaded — ANTHROPIC_API_KEY: ${hasAnthropic}, OPENROUTER_API_KEY: ${hasOpenRouter}`);
}
