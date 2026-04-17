/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@intend/core',
    '@intend/intelligence',
    '@intend/decision',
    '@intend/data',
    '@intend/signals',
    '@intend/skills',
  ],

  // Allow webpack to resolve `.js` imports as `.ts` sources (NodeNext ESM convention)
  experimental: {
    extensionAlias: {
      '.js':  ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
    // Exclude heavy execution-layer packages from Next.js bundling (Next.js 14 syntax).
    // These packages use native Node.js APIs and must be required() at runtime
    // rather than bundled by webpack. Applies to all server-side routes.
    serverComponentsExternalPackages: [
      '@intend/execution',
      '@coinbase/agentkit',
      '@coinbase/cdp-sdk',
      'viem',
      '@x402/core',
      '@x402/paywall',
    ],
  },
};

export default nextConfig;
