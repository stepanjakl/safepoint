/*
  Dev-only webpack plugin that pauses rebuilds while `<distDir>/dev-pause`
  exists, letting an agent (or user) batch multi-file edits into a single
  incremental compile and reload.

  Uses Webpack 5's native `Watching.suspend()` / `Watching.resume()`: while
  suspended, watchpack keeps collecting modified and removed files without
  starting a compile; resuming flushes the whole batch in one pass.
*/
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';

const DEV_PAUSE_FILE = 'dev-pause';

export function resolveDevPausePath(
  distDir = process.env.NEXT_DIST_DIR || '.next',
  cwd = process.cwd(),
): string {
  return resolve(cwd, distDir, DEV_PAUSE_FILE);
}

export function clearStaleDevPause(
  distDir = process.env.NEXT_DIST_DIR || '.next',
  cwd = process.cwd(),
): boolean {
  const pausePath = resolveDevPausePath(distDir, cwd);
  const leftovers = [pausePath + '.resume', pausePath + '.result', pausePath];
  let clearedPause = false;
  for (const path of leftovers) {
    try {
      unlinkSync(path);
      clearedPause ||= path === pausePath;
    } catch {
      // The file may already have been removed.
    }
  }
  return clearedPause;
}

export function readDevPauseFile(path: string): string | null {
  try {
    return readFileSync(path, 'utf8').trim();
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT')
      return null;
    throw error;
  }
}

type Compilation = { hash?: string; hasErrors(): boolean };

export type WebpackWatching = {
  running?: boolean;
  invalidate(): void;
  suspend(): void;
  resume(): void;
};

export type WebpackCompilerLike = {
  watching?: WebpackWatching;
  hooks: {
    done: { tap(name: string, fn: (stats: Compilation) => void): void };
    failed: { tap(name: string, fn: () => void): void };
    watchClose: { tap(name: string, fn: () => void): void };
  };
};

class PauseGate {
  private readonly pausePath: string;
  private readonly label: string;
  private readonly watchings = new Map<WebpackWatching, string | undefined>();
  private paused = false;
  private lastRequest: string | null = null;
  private pending: {
    request: string;
    compilers: Set<WebpackWatching>;
    changed: boolean;
    failed: boolean;
  } | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(pausePath: string) {
    this.pausePath = pausePath;
    this.label = relative(process.cwd(), pausePath) || pausePath;
  }

  register(watching: WebpackWatching, hash: string | undefined): void {
    const first = this.watchings.size === 0;
    if (first) {
      this.paused = existsSync(this.pausePath);
      mkdirSync(dirname(this.pausePath), { recursive: true });
      this.pollTimer = setInterval(() => this.sync(), 100);
      this.pollTimer.unref();
      if (this.paused) {
        console.log(
          `[dev-pause] Rebuilds paused (run \`pnpm dev:resume\` or remove ${this.label} to apply changes)`,
        );
      }
    } else {
      this.sync();
    }

    this.watchings.set(watching, hash);
    if (this.paused) {
      watching.suspend();
    }
  }

  complete(watching: WebpackWatching, stats?: Compilation): void {
    const previousHash = this.watchings.get(watching);
    if (stats) this.watchings.set(watching, stats.hash);
    const pending = this.pending;
    if (!pending?.compilers.delete(watching)) return;

    pending.failed ||= !stats || stats.hasErrors();
    pending.changed ||= stats?.hash !== previousHash;
    if (pending.compilers.size > 0) return;

    const outcome = pending.failed
      ? 'failed'
      : pending.changed
        ? 'compiled'
        : 'unchanged';
    writeFileSync(this.pausePath + '.result', pending.request + '\n' + outcome);
    this.pending = null;
  }

  unregister(watching: WebpackWatching): void {
    this.complete(watching);
    this.watchings.delete(watching);
    if (this.watchings.size === 0 && this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private sync(): void {
    const request = readDevPauseFile(this.pausePath + '.resume');
    if (this.pending?.request === request) return;
    this.pending = null;
    const shouldPause = existsSync(this.pausePath);
    const newRequest = !shouldPause && request && request !== this.lastRequest;
    if (shouldPause === this.paused && !newRequest) return;

    if (newRequest) {
      this.lastRequest = request;
      this.pending = {
        request,
        compilers: new Set(this.watchings.keys()),
        changed: false,
        failed: false,
      };
    }

    if (shouldPause) {
      for (const watching of this.watchings.keys()) watching.suspend();
      console.log(
        `[dev-pause] Rebuilds paused (run \`pnpm dev:resume\` or remove ${this.label} to apply changes)`,
      );
    } else {
      console.log(
        '[dev-pause] Rebuilds resumed — applying accumulated changes',
      );
      for (const watching of this.watchings.keys()) {
        watching.resume();
        // Invalidate idle compilers only after releasing the suspended build.
        if (newRequest && !watching.running) watching.invalidate();
      }
    }
    this.paused = shouldPause;
  }
}

const gates = new Map<string, PauseGate>();

function gateFor(pausePath: string): PauseGate {
  let gate = gates.get(pausePath);
  if (!gate) {
    gate = new PauseGate(pausePath);
    gates.set(pausePath, gate);
  }
  return gate;
}

export function createDevPausePlugin(distDir: string, cwd = process.cwd()) {
  const pausePath = resolveDevPausePath(distDir, cwd);
  const gate = gateFor(pausePath);

  return {
    apply(compiler: WebpackCompilerLike): void {
      let registered: WebpackWatching | undefined;

      // Register after the initial compile finishes so `next dev` never blocks
      // on startup even if the pause file already exists.
      compiler.hooks.done.tap('DevPausePlugin', (stats) => {
        if (registered) {
          gate.complete(registered, stats);
          return;
        }
        if (!compiler.watching) return;
        registered = compiler.watching;
        gate.register(registered, stats.hash);
      });

      compiler.hooks.failed.tap('DevPausePlugin', () => {
        if (registered) gate.complete(registered);
      });

      compiler.hooks.watchClose.tap('DevPausePlugin', () => {
        if (!registered) return;
        gate.unregister(registered);
        registered = undefined;
      });
    },
  };
}
