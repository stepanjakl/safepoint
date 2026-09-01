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
    <html lang="en-GB">
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
