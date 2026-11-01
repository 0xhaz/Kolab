import Link from 'next/link';
import { Navbar } from '@/components/marketing/navbar';
import { Logo } from '@/components/shell/sidebar';
import { SoftBackdrop } from '@/components/marketing/soft-backdrop';

export default function MarketingLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <SoftBackdrop />
      <Navbar />
      <main className="flex-1 overflow-x-clip">{children}</main>
      <footer className="border-t border-white/6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground">
          <Logo />
          <span className="flex flex-wrap items-center gap-4">
            <span>Creator campaigns with on-chain escrow · Solana devnet</span>
            <Link href="/delete-account" className="hover:text-foreground">
              Delete account
            </Link>
          </span>
        </div>
      </footer>
    </>
  );
}
