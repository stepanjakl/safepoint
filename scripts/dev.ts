/*
  `pnpm dev`: the Next development server, and beside it the Agentation server
  the development toolbar sends annotations to (components/dev/agentation-toolbar.tsx).
  Agentation starts only when its port is free, so a second dev server, or one
  started by Playwright (AGENTATION=off), shares the first or goes without; with
  AGENTATION=off the toolbar is not drawn either (NEXT_PUBLIC_AGENTATION).
  Arguments are passed to `next dev`.
*/
import { spawn, type ChildProcess } from 'node:child_process';
import { connect } from 'node:net';

const AGENTATION_PORT = 4747;

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
if (process.env.AGENTATION !== 'off' && !(await portInUse(AGENTATION_PORT))) {
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

const next = spawn(
  'node_modules/.bin/next',
  ['dev', '--webpack', ...process.argv.slice(2)],
  {
    stdio: 'inherit',
    // Inlined into the client bundle: the toolbar renders only where an
    // annotation server is meant to be (AGENTATION=off is not).
    env: {
      ...process.env,
      NEXT_PUBLIC_AGENTATION: process.env.AGENTATION === 'off' ? 'off' : 'on',
    },
  },
);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    next.kill(signal);
    agentation?.kill(signal);
  });
}

next.on('exit', (code, signal) => {
  agentation?.kill();
  process.exit(code ?? (signal ? 1 : 0));
});
