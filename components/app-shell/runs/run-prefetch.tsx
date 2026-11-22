'use client';

import { createContext } from 'react';
import type { LiveRun } from './run-selection';

/*
  What a process asks for ahead of a run being opened, given that run as it
  would be shown. The rail calls it when a row is pointed at or focused, so
  the run's data is usually in by the time it is chosen. Provided by the
  process's page, since only the process knows what its thread asks for;
  absent, nothing is fetched ahead.
*/
export const RunPrefetch = createContext<((run: LiveRun) => void) | null>(null);
