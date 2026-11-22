import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { loadDevConfig } from './dev-config';

describe('dev-config', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    vi.unstubAllEnvs();
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) rmSync(dir, { recursive: true, force: true });
    }
  });

  it('uses AGENTATION from .env.local before deciding whether to start the toolbar', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'safepoint-dev-config-'));
    tempDirs.push(cwd);
    writeFileSync(join(cwd, '.env.local'), 'AGENTATION=off\n');
    const previousCwd = process.cwd();
    const previousAgentation = process.env.AGENTATION;
    vi.stubEnv('NODE_ENV', 'development');
    delete process.env.AGENTATION;

    try {
      process.chdir(cwd);
      expect(loadDevConfig()).toEqual({
        agentationEnabled: false,
        nextPublicAgentation: 'off',
      });
    } finally {
      process.chdir(previousCwd);
      if (previousAgentation === undefined) {
        delete process.env.AGENTATION;
      } else {
        process.env.AGENTATION = previousAgentation;
      }
    }
  });
});
