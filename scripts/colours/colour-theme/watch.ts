import { execFile } from 'node:child_process';
import { readFileSync, watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const DIRECTORY = new URL('.', import.meta.url);
const CONFIG = new URL('config.ts', DIRECTORY);
const GENERATOR = fileURLToPath(new URL('generate.ts', DIRECTORY));

function warnAboutGeneration(error: unknown) {
  const details = error instanceof Error ? error.message : String(error);
  const rangeError = details.match(
    /(?:light|dark) (--sp-[\w-]+).*lands on step [^\n]+/,
  );
  const role = rangeError?.[1];
  const line = role
    ? readFileSync(CONFIG, 'utf8')
        .split('\n')
        .findIndex((text) => text.includes(`'${role}'`)) + 1
    : 1;
  const message =
    rangeError?.[0] ??
    details.match(/^Error: (.+)$/m)?.[1] ??
    'Could not regenerate colours. Run pnpm colors:custom for details.';
  console.warn(
    `${fileURLToPath(CONFIG)}:${Math.max(1, line)}:1: warning: ${message}`,
  );
}

export function watchColours() {
  const controller = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let pending = false;
  let running = false;

  async function regenerate() {
    pending = true;
    if (running) return;
    running = true;
    while (pending && !controller.signal.aborted) {
      pending = false;
      console.log('[colours] Checking offsets');
      try {
        await run(process.execPath, [GENERATOR], { signal: controller.signal });
      } catch (error) {
        if (!controller.signal.aborted) warnAboutGeneration(error);
      } finally {
        console.log('[colours] Check finished');
      }
    }
    running = false;
  }

  const watcher = watch(
    DIRECTORY,
    { persistent: false },
    (_event, filename) => {
      if (filename !== 'config.ts') return;
      clearTimeout(timer);
      timer = setTimeout(() => void regenerate(), 100);
    },
  );
  watcher.on('error', (error) => {
    console.warn(
      `[colours] Could not watch the colour config: ${error.message}`,
    );
  });

  return {
    ready: regenerate(),
    close() {
      watcher.close();
      clearTimeout(timer);
      controller.abort();
    },
  };
}
