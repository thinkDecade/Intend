/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: [
    '@intend/core',
    '@intend/intelligence',
    '@intend/decision',
    '@intend/data',
    '@intend/signals',
  ],

  // Allow webpack to resolve `.js` imports as `.ts` sources (NodeNext ESM convention)
  experimental: {
    extensionAlias: {
      '.js':  ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
      '.cjs': ['.cts', '.cjs'],
    },
  },
};

export default nextConfig;
