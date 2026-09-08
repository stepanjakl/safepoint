import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { DesignControls } from '@/components/dev/design-controls';
import { DesignPreferencesScript } from '@/components/dev/design-preferences-script';
import { LocatorRuntime } from '@/components/dev/locator-runtime';

import './globals.css';
import { fontVariables } from './typography';

export const metadata: Metadata = {
  title: 'Safepoint',
  description:
    'Safepoint helps people review changes proposed by an AI agent before those changes reach real systems.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // suppressHydrationWarning: DesignPreferencesScript sets data-typeface,
    // data-mono and data-theme here before React hydrates.
    <html lang="en-GB" className={fontVariables} suppressHydrationWarning>
      {/* suppressHydrationWarning: the LocatorJS browser extension writes its
          own data-locator-* status attributes onto <head> before React
          hydrates, which React would otherwise report as a mismatch. */}
      <head suppressHydrationWarning>
        <DesignPreferencesScript />
      </head>
      <body className="bg-canvas text-primary" suppressHydrationWarning>
        <a
          href="#main"
          className="focus:bg-action focus:text-dense focus:text-inverse sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:font-medium"
        >
          Skip to review
        </a>
        {children}
        <DesignControls />
        <LocatorRuntime />
      </body>
    </html>
  );
}
