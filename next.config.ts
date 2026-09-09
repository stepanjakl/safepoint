import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

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

  experimental: {
    // Tabler is on Next's default list; the workbench's candidate families are
    // not, and their barrels are thousands of modules each. Without this the
    // icon comparison alone dominates the dev compile of /workbench.
    optimizePackageImports: ['@phosphor-icons/react', '@remixicon/react'],
  },

  webpack(config, { dev, webpack }) {
    if (dev) {
      // Emit CSS maps separately from Next's JavaScript devtool setting.
      config.plugins.push(
        new webpack.SourceMapDevToolPlugin({
          test: /\.css$/,
          filename: '[file].map',
          // Give DevTools the exact on-disk identity for workspace linking.
          moduleFilenameTemplate: (info: { absoluteResourcePath: string }) => {
            const file = resolve(config.context, info.absoluteResourcePath);
            return existsSync(file)
              ? pathToFileURL(file).href
              : `webpack:///${info.absoluteResourcePath}`;
          },
        }),
      );
      config.module.rules.push({
        test: /\.[jt]sx$/,
        exclude: /node_modules/,
        use: locatorRule.loaders,
      });
    }
    return config;
  },

  turbopack: {
    rules: {
      '*.tsx': locatorRule,
      '*.jsx': locatorRule,
    },
  },
};

export default nextConfig;
