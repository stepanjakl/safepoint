import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, vi } from 'vitest';

// Runs each test of the file in its own empty directory, so kept sets are
// written there and never to the repository's fixtures.
export function inScratchDirectory() {
  let scratch = '';
  beforeEach(() => {
    scratch = mkdtempSync(path.join(tmpdir(), 'definitions-'));
    vi.spyOn(process, 'cwd').mockReturnValue(scratch);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(scratch, { recursive: true, force: true });
  });
  return () => scratch;
}
