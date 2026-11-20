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
  unlinkSync,
  watch,
  type FSWatcher,
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
  if (!existsSync(pausePath)) return false;
  try {
    unlinkSync(pausePath);
    return true;
  } catch {
    return false;
  }
}

export type WebpackWatching = {
  suspend(): void;
  resume(): void;
};

export type WebpackCompilerLike = {
  watching?: WebpackWatching;
  hooks: {
    done: { tap(name: string, fn: () => void): void };
    watchClose: { tap(name: string, fn: () => void): void };
  };
};

class PauseGate {
  private readonly pausePath: string;
  private readonly label: string;
  private readonly watchings = new Set<WebpackWatching>();
  private paused = false;
  private watcher: FSWatcher | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(pausePath: string) {
    this.pausePath = pausePath;
    this.label = relative(process.cwd(), pausePath) || pausePath;
  }

  register(watching: WebpackWatching): void {
    const first = this.watchings.size === 0;
    if (first) {
      this.paused = existsSync(this.pausePath);
      this.startWatching();
      if (this.paused) {
        console.log(
          `[dev-pause] Rebuilds paused (run \`pnpm dev:resume\` or remove ${this.label} to apply changes)`,
        );
      }
    } else {
      this.sync();
    }

    this.watchings.add(watching);
    if (this.paused) {
      watching.suspend();
    }
  }

  unregister(watching: WebpackWatching): void {
    this.watchings.delete(watching);
    if (this.watchings.size === 0) {
      this.stopWatching();
    }
  }

  private startWatching(): void {
    if (this.watcher || this.pollTimer) return;
    const dir = dirname(this.pausePath);
    try {
      mkdirSync(dir, { recursive: true });
      this.watcher = watch(dir, { persistent: false }, (_event, filename) => {
        if (filename && filename !== DEV_PAUSE_FILE) return;
        this.sync();
      });
      this.watcher.on('error', () => {
        this.watcher?.close();
        this.watcher = null;
        this.startPolling();
      });
    } catch {
      this.startPolling();
    }
  }

  private startPolling(): void {
    if (this.pollTimer) return;
    this.pollTimer = setInterval(() => this.sync(), 250);
    this.pollTimer.unref();
  }

  private stopWatching(): void {
    this.watcher?.close();
    this.watcher = null;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private sync(): void {
    const shouldPause = existsSync(this.pausePath);
    if (shouldPause === this.paused) return;
    this.paused = shouldPause;

    if (shouldPause) {
      for (const watching of this.watchings) {
        watching.suspend();
      }
      console.log(
        `[dev-pause] Rebuilds paused (run \`pnpm dev:resume\` or remove ${this.label} to apply changes)`,
      );
    } else {
      console.log(
        '[dev-pause] Rebuilds resumed — applying accumulated changes',
      );
      for (const watching of this.watchings) {
        watching.resume();
      }
    }
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
      compiler.hooks.done.tap('DevPausePlugin', () => {
        if (registered || !compiler.watching) return;
        registered = compiler.watching;
        gate.register(registered);
      });

      compiler.hooks.watchClose.tap('DevPausePlugin', () => {
        if (!registered) return;
        gate.unregister(registered);
        registered = undefined;
      });
    },
  };
}
