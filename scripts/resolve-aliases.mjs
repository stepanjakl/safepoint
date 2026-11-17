/*
  Loaded with `node --import`, for a script that reaches the app's own modules
  (server/storage/, lib/engine/): they import each other as `@/lib/...`
  and without an extension, as the bundler and TypeScript resolve them, and
  Node does neither. This resolves both to the file, as tsconfig.json's
  `paths` and `moduleResolution: bundler` do. It resolves; Node itself strips
  the types.
*/
import { existsSync, statSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const EXTENSIONS = ['.ts', '.tsx', '/index.ts', '/index.tsx'];

const isFile = (url) => {
  const path = fileURLToPath(url);
  return existsSync(path) && statSync(path).isFile();
};

// Only the app's own TypeScript is resolved here: a package's own requires
// (CommonJS, which Node resolves itself) are left alone.
const isApp = (parentURL) => /\.tsx?$/.test(parentURL ?? '');

registerHooks({
  resolve(specifier, context, next) {
    const local = specifier.startsWith('@/')
      ? new URL(specifier.slice(2), root)
      : isApp(context.parentURL) &&
          (specifier.startsWith('./') || specifier.startsWith('../'))
        ? new URL(specifier, context.parentURL)
        : null;
    // A package or a built-in.
    if (!local) return next(specifier, context);
    if (isFile(local)) return next(local.href, context);
    for (const extension of EXTENSIONS) {
      const candidate = new URL(`${local.href}${extension}`);
      if (isFile(candidate)) return next(candidate.href, context);
    }
    return next(specifier, context);
  },
});
