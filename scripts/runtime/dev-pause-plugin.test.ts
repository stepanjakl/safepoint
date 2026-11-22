import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearStaleDevPause,
  createDevPausePlugin,
  resolveDevPausePath,
  type WebpackCompilerLike,
} from './dev-pause-plugin';

function createFakeCompiler() {
  const doneHandlers: Array<
    Parameters<WebpackCompilerLike['hooks']['done']['tap']>[1]
  > = [];
  const closeHandlers: Array<() => void> = [];
  const watching = {
    invalidate: vi.fn(),
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
      failed: { tap() {} },
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
    emitDone: () =>
      doneHandlers.forEach((fn) => fn({ hasErrors: () => false })),
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

  it('serves cold App Router routes requested while webpack is paused', async () => {
    const cwd = makeTempCwd();
    const modules = join(process.cwd(), 'node_modules');
    symlinkSync(modules, join(cwd, 'node_modules'), 'junction');
    mkdirSync(join(cwd, 'app/cold'), { recursive: true });
    mkdirSync(join(cwd, 'app/other'), { recursive: true });
    writeFileSync(
      join(cwd, 'app/layout.js'),
      'export default function Layout({ children }) { return <html><body>{children}</body></html> }',
    );
    for (const route of ['', 'cold', 'other']) {
      writeFileSync(
        join(cwd, 'app', route, 'page.js'),
        'export default function Page() { return "ready" }',
      );
    }
    writeFileSync(
      join(cwd, 'next.config.mjs'),
      `import { createDevPausePlugin } from ${JSON.stringify(new URL('./dev-pause-plugin.ts', import.meta.url).href)};
export default {
  agentRules: false,
  webpack(config) {
    config.plugins.push(createDevPausePlugin('.next'));
    return config;
  },
};`,
    );

    const child = spawn(
      process.execPath,
      [
        join(modules, 'next/dist/bin/next'),
        'dev',
        '--webpack',
        '--hostname',
        'localhost',
        '--port',
        '0',
      ],
      { cwd, env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' } },
    );
    const closed = once(child, 'close');
    let output = '';
    let phase = 'cold routes';
    for (const stream of [child.stdout, child.stderr]) {
      stream.setEncoding('utf8').on('data', (chunk: string) => {
        output += chunk;
      });
    }

    try {
      await waitFor(() => output.includes('Ready in'), 15_000);
      const origin = output.match(/Local:\s+(http:\/\/localhost:\d+)/)?.[1];
      if (!origin) throw new Error('Next did not report a local URL');
      const get = async (route: string, text = 'ready') => {
        const response = await fetch(origin + route, {
          signal: AbortSignal.timeout(12_000),
        });
        expect(response.status).toBe(200);
        expect(await response.text()).toContain(text);
      };

      await get('/');
      const pausePath = resolveDevPausePath('.next', cwd);
      writeFileSync(pausePath, 'paused\n');
      await waitFor(() => output.includes('Rebuilds paused'));

      const coldRoutes = Promise.allSettled([get('/cold'), get('/other')]);
      const whilePaused = await Promise.race([
        coldRoutes,
        new Promise((resolve) => setTimeout(() => resolve('paused'), 500)),
      ]);
      unlinkSync(pausePath);
      expect(whilePaused).toBe('paused');

      for (const result of await coldRoutes) {
        if (result.status === 'rejected') throw result.reason;
      }
      const command = promisify(execFile);
      const cli = fileURLToPath(new URL('./dev-pause.ts', import.meta.url));
      const run = (action: string) =>
        command(process.execPath, [cli, action], {
          cwd,
          env: { ...process.env, SAFEPOINT_DEV_PAUSE: '1' },
          timeout: 10_000,
        });
      const pause = async () => {
        output = '';
        await run('pause');
        await waitFor(() => output.includes('Rebuilds paused'));
      };

      phase = 'unchanged';
      await pause();
      const unchanged = await run('resume');
      expect(unchanged.stdout).toContain('No changes to the compiled output');

      phase = 'changed';
      const page = join(cwd, 'app/page.js');
      await pause();
      writeFileSync(
        page,
        'export default function Page() { return "updated" }',
      );
      const rebuilt = await run('resume');
      expect(rebuilt.stdout).toContain('Webpack recompiled successfully');
      await get('/', 'updated');

      phase = 'compile error';
      await pause();
      writeFileSync(page, 'export default function Page( {');
      await expect(run('resume')).rejects.toMatchObject({
        code: 1,
        stderr: expect.stringContaining('webpack reported a compilation error'),
      });
    } catch (error) {
      throw new Error(
        `Webpack pause integration failed during ${phase}:\n${output}`,
        {
          cause: error,
        },
      );
    } finally {
      child.kill('SIGTERM');
      await closed;
    }
  }, 45_000);
});
