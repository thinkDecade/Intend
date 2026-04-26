import type { Metadata } from 'next';
import { display, body, mono, serif } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: 'Intend — Your money, executing your intentions.',
  description: 'Finance, built around your intentions.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} ${serif.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
