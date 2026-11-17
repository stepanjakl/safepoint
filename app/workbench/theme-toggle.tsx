'use client';

import { useSyncExternalStore } from 'react';

import { Button } from '@/components/ui/button';

import { THEME_KEY } from './theme-script';

type Theme = 'light' | 'dark';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
  return () => observer.disconnect();
}

const read = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';

/*
  Light or dark for a visitor to the public workbench, where the design pane
  that sets it in development is not served. It writes the same attribute the
  pane does, and is not drawn in development, where the two would disagree
  after a reload.
*/
export function ThemeToggle() {
  const theme = useSyncExternalStore<Theme>(subscribe, read, () => 'light');

  if (process.env.NODE_ENV === 'development') return null;

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <Button
      size="small"
      onPress={() => {
        document.documentElement.dataset.theme = next;
        try {
          localStorage.setItem(THEME_KEY, next);
        } catch {
          // The choice holds for this page only.
        }
      }}
    >
      {next === 'dark' ? 'Dark theme' : 'Light theme'}
    </Button>
  );
}
