'use client';

import { createContext, useContext, type RefObject } from 'react';
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

type AssistantState = {
  id: string;
  open: boolean;
  toggle: () => void;
  close: () => void;
  // Opens the assistant with a question already written, for a control
  // elsewhere that knows what the reader is about to ask.
  ask: (prompt: string) => void;
  opener: RefObject<HTMLButtonElement | null>;
};
export const AssistantContext = createContext<AssistantState | null>(null);
export function useAssistant() {
  const context = useContext(AssistantContext);
  if (!context)
    throw new Error('Assistant must be inside the application shell');
  return context;
}
