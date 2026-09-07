import type { NextConfig } from 'next';

// LocatorJS (https://www.locatorjs.com) lets the browser extension jump from a
// rendered element straight to its JSX in the editor. React 19 dropped the
// `_debugSource` fiber field the extension used to read, so the source location
// has to be baked into the markup at build time instead: this loader runs the
// `@locator/babel-jsx` transform and stamps every JSX element with
// `data-locatorjs="<abs path>:<line>:<column>"`.
//
// Dev only, and never on `node_modules` — the attributes are debug metadata and
// the Babel pass is pure overhead in a production build.
const locatorRule = {
  condition: { all: ['development' as const, { not: 'foreign' as const }] },
  loaders: [
    {
      loader: '@locator/webpack-loader',
      options: { env: 'development' },
    },
  ],
};

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the repository root by default.
  // Safepoint adds agent instructions deliberately, not as build output.
  agentRules: false,

  turbopack: {
    rules: {
      '*.tsx': locatorRule,
      '*.jsx': locatorRule,
    },
  },
};

export default nextConfig;
