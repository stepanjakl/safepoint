'use client';

import {
  createContext,
  useContext,
  type ReactNode,
  type RefObject,
} from 'react';
import type { SidebarPreferences } from '@/components/app-shell/sidebar-preferences';
import { parseSidebarPreferences } from '@/components/app-shell/sidebar-preferences';
import { createStoredRecord } from '@/components/app-shell/stored-record';

const CLOSED: SidebarPreferences = { width: null, collapsed: true };
const store = createStoredRecord<SidebarPreferences>(
  'safepoint.assistant.v1',
  'safepoint:assistant',
);

export const readAssistantPreferences = store.read;
export const serverAssistantPreferences = store.server;
export const subscribeAssistantPreferences = store.subscribe;
export const saveAssistantPreferences = (value: SidebarPreferences) => {
  store.save(value);
};
export function parseAssistantPreferences(
  value: string | null,
): SidebarPreferences {
  return parseSidebarPreferences(value, CLOSED);
}

/*
  A question a control elsewhere asks on the reader's behalf, and its answer
  as that control draws it: the shell knows nothing of what is asked.
*/
export type Consultation = { question: string } & (
  | { state: 'asking' }
  | { state: 'answered'; answer: ReactNode }
  | { state: 'failed'; message: string }
);

type AssistantState = {
  id: string;
  open: boolean;
  toggle: () => void;
  close: () => void;
  // Opens the assistant with a question already written, for a control
  // elsewhere that knows what the reader is about to ask.
  ask: (prompt: string) => void;
  // Opens the assistant on a question and shows its answer once loaded.
  consult: (question: string, load: () => Promise<ReactNode>) => void;
  opener: RefObject<HTMLButtonElement | null>;
};
export const AssistantContext = createContext<AssistantState | null>(null);
export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context)
    throw new Error('Assistant must be inside the application shell');
  return context;
}
