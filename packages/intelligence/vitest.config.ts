import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals:     true,
    environment: 'node',
    include:     ['src/**/*.test.ts'],
    testTimeout: 60_000,
    // Load root .env into process.env before any test runs
    setupFiles:  ['./src/test-setup.ts'],
  },
});
