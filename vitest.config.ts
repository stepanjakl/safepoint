import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  test: { exclude: [...configDefaults.exclude, 'e2e/**'] },
  resolve: {
    alias: {
      '@': here('.'),
      // The real package throws unless a React server build loads it; a test
      // is neither, so it gets the empty module the server build gets.
      'server-only': here('./node_modules/server-only/empty.js'),
    },
  },
});
