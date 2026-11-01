'use client';

import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { LogOutIcon, WalletIcon } from 'lucide-react';
import { Avatar } from '@/components/dashboard';
import { Logo } from '@/components/shell/sidebar';
import { useBalance } from '@/lib/queries';
import { useMe } from '@/lib/use-me';
import { shortAddr, usdc } from '@/lib/format';

function greeting(d = new Date()) {
  const h = d.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function Topbar() {
  const { logout } = usePrivy();
  const { data: me } = useMe();
  const { data: balance } = useBalance();
  const name = me?.displayName ?? me?.email?.split('@')[0] ?? 'there';

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between gap-3 border-b border-white/6 bg-background/70 px-4 backdrop-blur-xl md:px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={me?.role === 'creator' ? '/creator' : '/campaigns'} className="md:hidden">
          <Logo compact />
        </Link>
        <div className="hidden min-w-0 sm:block">
          <div className="text-xs text-muted-foreground" suppressHydrationWarning>
            {greeting()},
          </div>
          <div className="truncate text-sm font-semibold">{name}</div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/10 px-2.5 py-0.5 text-xs font-medium text-amber-300">
          <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-amber-300" /> Devnet
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href={me?.role === 'creator' ? '/creator/earnings' : '/wallet'}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/4 py-1 pl-1 pr-3 text-sm transition hover:bg-white/8"
          title={me?.walletPubkey ?? undefined}
        >
          <span className="grid size-7 place-items-center rounded-full bg-money/15 text-money">
            <WalletIcon className="size-3.5" />
          </span>
          {me?.walletPubkey ? (
            <span className="flex items-baseline gap-2">
              <span className="font-semibold tabular-nums text-money">{balance ? usdc(balance.usdc, 0) : '…'}</span>
              <span className="hidden font-mono text-xs text-muted-foreground lg:inline">{shortAddr(me.walletPubkey)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Creating wallet…</span>
          )}
        </Link>
        <Avatar name={name} size={34} ring />
        <button
          className="grid size-9 place-items-center rounded-full text-muted-foreground transition hover:bg-white/8 hover:text-foreground"
          title="Sign out"
          onClick={() => logout()}
        >
          <LogOutIcon className="size-4" />
        </button>
      </div>
    </header>
  );
}
