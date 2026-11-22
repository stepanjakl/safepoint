/*
  Pause or resume webpack rebuilds in a running `pnpm dev` server by creating
  or removing `<distDir>/dev-pause`.

  Usage:
    SAFEPOINT_DEV_PAUSE=1 pnpm dev:pause  # hold an opt-in server's rebuilds
    pnpm dev:resume         # apply accumulated edits in one compile
    node scripts/runtime/dev-pause.ts status|toggle
*/
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, relative } from 'node:path';

import { readDevPauseFile, resolveDevPausePath } from './dev-pause-plugin.ts';

const action = process.argv[2] ?? 'status';
const pausePath = resolveDevPausePath();
const label = relative(process.cwd(), pausePath) || pausePath;

function pause(): void {
  if (process.env.SAFEPOINT_DEV_PAUSE !== '1') {
    console.error(
      'Hard pause is for diagnosis. Set SAFEPOINT_DEV_PAUSE=1 for both pnpm dev and pnpm dev:pause.',
    );
    process.exitCode = 1;
    return;
  }
  mkdirSync(dirname(pausePath), { recursive: true });
  writeFileSync(pausePath, randomUUID(), 'utf8');
  console.log(
    `Dev rebuilds paused (${label}). Run \`pnpm dev:resume\` to apply changes.`,
  );
}

async function resume(): Promise<void> {
  const resumePath = pausePath + '.resume';
  const paused = readDevPauseFile(pausePath);
  if (paused !== null) renameSync(pausePath, resumePath);
  const request = paused ?? readDevPauseFile(resumePath);
  if (request === null) {
    console.log('Dev rebuilds are not paused.');
    return;
  }
  const clearRequest = () => {
    if (readDevPauseFile(resumePath) === request)
      rmSync(resumePath, { force: true });
  };
  console.log('Waiting for webpack to confirm the rebuild…');

  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const [acknowledged, outcome] =
      readDevPauseFile(pausePath + '.result')?.split('\n') ?? [];
    if (
      acknowledged === request &&
      (outcome === 'compiled' ||
        outcome === 'unchanged' ||
        outcome === 'failed')
    ) {
      clearRequest();
      if (outcome === 'compiled') {
        console.log('Dev rebuilds resumed. Webpack recompiled successfully.');
        return;
      }
      if (outcome === 'unchanged') {
        console.log('Dev rebuilds resumed. No changes to the compiled output.');
        return;
      }
      console.error(
        'Dev rebuilds resumed, but webpack reported a compilation error. Check the dev server output.',
      );
      process.exitCode = 1;
      return;
    }
    await delay(100);
  }
  clearRequest();
  console.error(
    `Webpack did not confirm the rebuild within 30 seconds. Check the dev server using ${label}.`,
  );
  process.exitCode = 1;
}

switch (action) {
  case 'pause':
    pause();
    break;
  case 'resume':
    await resume();
    break;
  case 'toggle':
    if (existsSync(pausePath) || existsSync(pausePath + '.resume'))
      await resume();
    else pause();
    break;
  case 'status':
    console.log(existsSync(pausePath) ? `paused (${label})` : 'active');
    break;
  default:
    console.error(
      `Unknown action "${action}". Expected pause, resume, toggle, or status.`,
    );
    process.exit(2);
}
