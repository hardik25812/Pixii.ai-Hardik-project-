import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import PixiiChatPanel from './pixii-chat-panel';

const display = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-display',
});

const body = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Hook Mining Engine | Pixii',
  description: 'Mine viral hooks, extract patterns, and write Monte-style Pixii posts.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <Link href="/" className="group flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-accent text-sm font-black text-white shadow-sm transition group-hover:scale-105">
              Px
            </span>
            <span>
              <span className="block text-sm font-black uppercase tracking-[0.22em] text-ink">
                Pixii
              </span>
              <span className="block text-xs text-muted">Hook Mining Engine</span>
            </span>
          </Link>
          <div className="flex items-center gap-2 rounded-full border hairline bg-card/80 p-1 shadow-sm backdrop-blur">
            <Link className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-accent-light" href="/">
              Mine
            </Link>
            <Link className="rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-accent-light" href="/patterns">
              Patterns
            </Link>
            <Link className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-white shadow-sm" href="/write">
              Write Post
            </Link>
          </div>
        </nav>
        {children}
        <PixiiChatPanel />
      </body>
    </html>
  );
}
