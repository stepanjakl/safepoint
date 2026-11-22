import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AgentationToolbar } from '@/components/dev/agentation-toolbar';
import { DesignControls } from '@/components/dev/design-controls';
import { DEFAULT_EDGE_PRESET } from '@/components/dev/design-preferences';
import { DesignPreferencesScript } from '@/components/dev/design-preferences-script';
import { StyleInspector } from '@/components/dev/style-inspector';
import { QueryProvider } from '@/components/trpc/provider';
import { DevicePixelScript } from '@/components/ui/device-pixel-script';
import { DEFAULT_MONO, DEFAULT_THEME } from '@/lib/ui/typography';

import './styles/index.css';
import { fontVariables } from './typography';

export const metadata: Metadata = {
  description:
    'Safepoint helps people review changes proposed by an AI agent before those changes reach real systems.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The preferences script can apply saved choices before hydration.
    <html
      lang="en-GB"
      className={fontVariables}
      data-theme={DEFAULT_THEME}
      data-edges={DEFAULT_EDGE_PRESET}
      data-mono={DEFAULT_MONO}
      suppressHydrationWarning
    >
      <head>
        <title>Safepoint</title>
        <DesignPreferencesScript />
        <DevicePixelScript />
      </head>
      <body className="bg-canvas text-primary" suppressHydrationWarning>
        <a
          href="#main"
          className="focus:bg-action focus:text-dense focus:text-inverse sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:font-medium"
        >
          Skip to review
        </a>
        <QueryProvider>{children}</QueryProvider>
        <DesignControls />
        <StyleInspector />
        <AgentationToolbar />
      </body>
    </html>
  );
}
