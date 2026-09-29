'use client';

import { createContext, useContext, type RefObject } from 'react';
import type { SidebarPreferences } from '@/components/app-shell/sidebar-preferences';
import { parseSidebarPreferences } from '@/components/app-shell/sidebar-preferences';

const KEY = 'safepoint.assistant.v1';
const CHANGE = 'safepoint:assistant';
let temporary: string | null = null;
const CLOSED: SidebarPreferences = { width: null, collapsed: true };

export function readAssistantPreferences() {
  if (temporary !== null) return temporary;
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function parseAssistantPreferences(
  value: string | null,
): SidebarPreferences {
  return parseSidebarPreferences(value, CLOSED);
}

export function subscribeAssistantPreferences(notify: () => void) {
  const storage = (event: StorageEvent) => {
    if (event.key === KEY || event.key === null) notify();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(CHANGE, notify);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(CHANGE, notify);
  };
}
export function saveAssistantPreferences(value: SidebarPreferences) {
  const serialized = JSON.stringify(value);
  try {
    localStorage.setItem(KEY, serialized);
    temporary = null;
  } catch {
    temporary = serialized;
  }
  window.dispatchEvent(new Event(CHANGE));
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
