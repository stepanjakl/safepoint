/*
  Pause or resume webpack rebuilds in a running `pnpm dev` server by creating
  or removing `<distDir>/dev-pause`.

  Usage:
    pnpm dev:pause          # hold rebuilds until resumed
    pnpm dev:resume         # apply accumulated edits in one compile
    node scripts/runtime/dev-pause.ts status|toggle
*/
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, relative } from 'node:path';

import { resolveDevPausePath } from './dev-pause-plugin.ts';

const action = process.argv[2] ?? 'status';
const pausePath = resolveDevPausePath();
const label = relative(process.cwd(), pausePath) || pausePath;

function pause(): void {
  mkdirSync(dirname(pausePath), { recursive: true });
  writeFileSync(pausePath, `paused at ${new Date().toISOString()}\n`, 'utf8');
  console.log(
    `Dev rebuilds paused (${label}). Run \`pnpm dev:resume\` to apply changes.`,
  );
}

function resume(): void {
  if (!existsSync(pausePath)) {
    console.log('Dev rebuilds are not paused.');
    return;
  }
  unlinkSync(pausePath);
  console.log('Dev rebuilds resumed.');
}

switch (action) {
  case 'pause':
    pause();
    break;
  case 'resume':
    resume();
    break;
  case 'toggle':
    if (existsSync(pausePath)) resume();
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
