/*
  `pnpm dev`: the Next development server, beside it the Agentation server
  the development toolbar sends annotations to (components/dev/agentation-toolbar.tsx),
  and the AI SDK DevTools viewer (`pnpm exec devtools`).
  Sidecars start only when their port is free, so a second dev server, or one
  started by Playwright (AGENTATION=off, DEVTOOLS=off), shares the first or goes
  without; with AGENTATION=off the toolbar is not drawn either (NEXT_PUBLIC_AGENTATION).
  Arguments are passed to `next dev`.
*/
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';

import { watchColours } from '../colours/colour-theme/watch.ts';

import { loadDevConfig } from './dev-config.ts';
import { clearStaleDevPause } from './dev-pause-plugin.ts';

const devConfig = loadDevConfig();

if (clearStaleDevPause()) {
  console.log('[dev-pause] Cleared stale pause file on startup.');
}

const AGENTATION_PORT = 4747;
const parsedDevtoolsPort = Number.parseInt(
  process.env.AI_SDK_DEVTOOLS_PORT ?? '',
  10,
);
const DEVTOOLS_PORT = Number.isFinite(parsedDevtoolsPort)
  ? parsedDevtoolsPort
  : 4983;

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

let agentation: ChildProcess | undefined;
if (devConfig.agentationEnabled && !(await portInUse(AGENTATION_PORT))) {
  agentation = spawn(
    'node_modules/.bin/agentation-mcp',
    ['server', '--port', String(AGENTATION_PORT)],
    {
      // In memory: pending annotations last as long as this dev server.
      env: { ...process.env, AGENTATION_STORE: 'memory' },
      stdio: ['pipe', 'ignore', 'ignore'],
    },
  );
  agentation.on('error', (error) => {
    console.warn(`Agentation did not start: ${error.message}`);
  });
}

let devtools: ChildProcess | undefined;
if (
  process.env.DEVTOOLS !== 'off' &&
  !process.env.CI &&
  !(await portInUse(DEVTOOLS_PORT))
) {
  devtools = spawn('node_modules/.bin/devtools', [], {
    env: process.env,
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  devtools.on('error', (error) => {
    console.warn(`AI SDK DevTools did not start: ${error.message}`);
  });
}

const colourWatch = watchColours();
await colourWatch.ready;

const next = spawn(
  'node_modules/.bin/next',
  ['dev', '--webpack', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    // Inlined into the client bundle: the toolbar renders only where an
    // annotation server is meant to be (AGENTATION=off is not).
    env: {
      ...process.env,
      NEXT_PUBLIC_AGENTATION: devConfig.nextPublicAgentation,
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    colourWatch.close();
    next.kill(signal);
    agentation?.kill(signal);
    devtools?.kill(signal);
  });
}

next.on('exit', (code, signal) => {
  colourWatch.close();
  agentation?.kill();
  devtools?.kill();
  process.exit(code ?? (signal ? 1 : 0));
});
