'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';

import { useTRPC } from '@/components/trpc/provider';

/*
  The shell asks the server for a process's published instructions as it opens
  the process. This prototype's process is not one the server keeps, so the
  question would only be refused; the page holds it back and the shell shows
  the instructions the prototype declares. Set during the first render, since a
  child's effect asks before a parent's runs, and put back when the page
  unmounts, so the shared cache serves the next process as usual.
*/
export function QuietQueries({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const key = trpc.instructions.list.queryKey();
  const hold = (enabled: boolean) =>
    queryClient.setQueryDefaults(key, { enabled });
  useState(() => hold(false));
  useEffect(() => {
    hold(false);
    return () => hold(true);
    // The key and the client do not change for the life of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return children;
}
