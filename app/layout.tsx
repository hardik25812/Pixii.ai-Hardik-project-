import type { Metadata } from 'next';
import { DM_Sans, JetBrains_Mono, Playfair_Display } from 'next/font/google';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';
import PixiiChatPanel from './pixii-chat-panel';
import NavChatButton from './nav-chat-button';

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
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link href="/" className="group flex items-center gap-3 transition-opacity hover:opacity-80">
            <Image src="/pixii-logo.svg" alt="Pixii" width={90} height={24} priority />
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 rounded-full border hairline bg-card/80 p-1 shadow-sm backdrop-blur">
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
            <NavChatButton />
          </div>
        </nav>
        {children}
        <PixiiChatPanel />
      </body>
    </html>
  );
}
