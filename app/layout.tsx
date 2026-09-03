import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: 'Safepoint',
  description:
    'Safepoint helps people review changes proposed by an AI agent before those changes reach real systems.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en-GB"
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className="bg-canvas text-primary" suppressHydrationWarning>
        <a
          href="#main"
          className="focus:bg-action focus:text-dense focus:text-inverse sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:font-medium"
        >
          Skip to review
        </a>
        {children}
      </body>
    </html>
  );
}
