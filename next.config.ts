import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the repository root by default.
  // Safepoint adds agent instructions deliberately, not as build output.
  agentRules: false,

  // The dev tools indicator overlaps the sidebar's bottom-left notice, which is
  // a piece of the design that has to be looked at. Off entirely rather than
  // repositioned: nothing it reports is worth a corner of the shell.
  devIndicators: false,

  // Webpack holds every compiled module in memory for the life of `pnpm dev`;
  // this trades slightly slower compiles for a lower peak heap.
  experimental: { webpackMemoryOptimizations: true },

  // `pnpm dev` is webpack, not Turbopack: under Turbopack Tailwind has already
  // inlined every @import, so each rule's source map names app/styles/index.css
  // rather than the component stylesheet it is written in (Next 16.3), and
  // tools/postcss-light-dark runs before the polyfill it folds exists.
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
    }
    return config;
  },

  // Builds stay on Turbopack, which needs none of the above. Declared, because
  // Next 16 refuses a Turbopack build beside a webpack() block otherwise.
  turbopack: {},
};

export default nextConfig;
