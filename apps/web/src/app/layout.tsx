import type { Metadata } from 'next';
import { Outfit } from 'next/font/google';
import { Providers } from '@/components/providers';
import './globals.css';

const outfit = Outfit({ variable: '--font-sans', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Kolab',
  description: 'Hire micro-creators across Southeast Asia, pay in USDC through on-chain escrow.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${outfit.variable} dark h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
