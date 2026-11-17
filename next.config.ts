import type { NextConfig } from 'next';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { withWorkflow } from 'workflow/next';

const CAPTURED_READ = './fixtures/brunch-orders/sheet-snapshot.json';
const KEPT_FIXTURES = ['./fixtures/brunch-orders/**/*'];

const nextConfig: NextConfig = {
  // Next writes AGENTS.md and CLAUDE.md into the repository root by default.
  // Safepoint adds agent instructions deliberately, not as build output.
  agentRules: false,

  // The dev tools indicator overlaps the sidebar's bottom-left notice, which is
  // a piece of the design that has to be looked at. Off entirely rather than
  // repositioned: nothing it reports is worth a corner of the shell.
  devIndicators: false,

  // PGlite loads its WebAssembly and data files from beside its own module,
  // which a bundled copy cannot find (server/db/client.ts). pg is external
  // by Next's own list.
  serverExternalPackages: ['@electric-sql/pglite'],

  // Files the server reads by path at run time, which a trace cannot see.
  // Vercel bundles only what a route's trace lists. The fixtures hold the
  // rulebooks and profile a database is seeded from the first time a process
  // needs them (server/storage/rulebook-files.ts) and the captured sheet read
  // (server/storage/source-reads.ts, brunch-orders-reads.ts). Each key is a
  // route, scoped to those that reach them: the tRPC route, the Workflow
  // route its steps run in, and the page that shows the captured read. Not
  // drizzle/: a deployment is migrated by its build (scripts/vercel-build.mjs),
  // and only the PGlite path reads it at run time.
  outputFileTracingIncludes: {
    '/api/trpc/\\[trpc\\]': KEPT_FIXTURES,
    '/.well-known/workflow/v1/flow': KEPT_FIXTURES,
    '/examples/brunch-orders': [CAPTURED_READ],
  },

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

// The Workflow SDK compiles `"use workflow"` and `"use step"` under webpack
// (pnpm dev) and Turbopack (pnpm build) alike, and generates its routes under
// app/.well-known/workflow/ (server/workflows/).
export default withWorkflow(nextConfig);
