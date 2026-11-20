import {
  existsSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStaleDevPause,
  createDevPausePlugin,
  resolveDevPausePath,
  type WebpackCompilerLike,
} from './dev-pause-plugin';

function createFakeCompiler() {
  const doneHandlers: Array<() => void> = [];
  const closeHandlers: Array<() => void> = [];
  const watching = {
    suspend: vi.fn(),
    resume: vi.fn(),
  };
  const compiler: WebpackCompilerLike = {
    watching,
    hooks: {
      done: {
        tap(_name, fn) {
          doneHandlers.push(fn);
        },
      },
      watchClose: {
        tap(_name, fn) {
          closeHandlers.push(fn);
        },
      },
    },
  };
  return {
    compiler,
    watching,
    emitDone: () => doneHandlers.forEach((fn) => fn()),
    emitClose: () => closeHandlers.forEach((fn) => fn()),
  };
}

async function waitFor(check: () => boolean, timeoutMs = 1500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!check()) {
    if (Date.now() > deadline) {
      throw new Error('Timed out waiting for watcher reaction');
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

describe('dev-pause-plugin', () => {
  const tempDirs: string[] = [];

  function makeTempCwd(): string {
    const dir = mkdtempSync(join(tmpdir(), 'safepoint-dev-pause-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('suspends all registered compilers when the pause file appears and resumes when removed', async () => {
    const cwd = makeTempCwd();
    const distDir = '.next';
    const pausePath = resolveDevPausePath(distDir, cwd);

    const client = createFakeCompiler();
    const server = createFakeCompiler();

    createDevPausePlugin(distDir, cwd).apply(client.compiler);
    createDevPausePlugin(distDir, cwd).apply(server.compiler);

    // Initial boot compiles are never suspended before `done`.
    client.emitDone();
    server.emitDone();
    expect(client.watching.suspend).not.toHaveBeenCalled();
    expect(server.watching.suspend).not.toHaveBeenCalled();

    writeFileSync(pausePath, 'paused\n', 'utf8');
    await waitFor(
      () =>
        client.watching.suspend.mock.calls.length === 1 &&
        server.watching.suspend.mock.calls.length === 1,
    );

    unlinkSync(pausePath);
    await waitFor(
      () =>
        client.watching.resume.mock.calls.length === 1 &&
        server.watching.resume.mock.calls.length === 1,
    );

    client.emitClose();
    server.emitClose();
  });

  it('allows initial boot even if pause file already exists, then suspends', () => {
    const cwd = makeTempCwd();
    const distDir = '.next';
    const pausePath = resolveDevPausePath(distDir, cwd);
    const compiler = createFakeCompiler();

    // Create the pause file before the compiler finishes its first build.
    const plugin = createDevPausePlugin(distDir, cwd);
    plugin.apply(compiler.compiler);

    // Simulate distDir existing with a pre-existing pause file.
    rmSync(join(cwd, distDir), { recursive: true, force: true });
    const c2 = createFakeCompiler();
    createDevPausePlugin(distDir, cwd).apply(c2.compiler);

    // First compiler finishes boot before pause file exists -> creates distDir.
    compiler.emitDone();
    writeFileSync(pausePath, 'paused\n', 'utf8');

    // Second compiler finishes its initial boot while pause file exists ->
    // it should still not have been suspended prior to emitDone, then suspend.
    expect(c2.watching.suspend).not.toHaveBeenCalled();
    c2.emitDone();
    expect(c2.watching.suspend).toHaveBeenCalledTimes(1);

    compiler.emitClose();
    c2.emitClose();
  });

  it('clears a stale pause file cleanly', () => {
    const cwd = makeTempCwd();
    const distDir = '.next';
    const pausePath = resolveDevPausePath(distDir, cwd);

    expect(clearStaleDevPause(distDir, cwd)).toBe(false);

    const compiler = createFakeCompiler();
    createDevPausePlugin(distDir, cwd).apply(compiler.compiler);
    compiler.emitDone();
    writeFileSync(pausePath, 'stale\n', 'utf8');
    compiler.emitClose();

    expect(existsSync(pausePath)).toBe(true);
    expect(clearStaleDevPause(distDir, cwd)).toBe(true);
    expect(existsSync(pausePath)).toBe(false);
  });
});
