'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { usePrivy } from '@privy-io/react-auth';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shell/sidebar';

const links = [
  { name: 'How it works', href: '/#how' },
  { name: 'Sellers', href: '/#sellers' },
  { name: 'Creators', href: '/#creators' },
  { name: 'Payments', href: '/#payments' },
  { name: 'Any chain', href: '/#any-chain' },
  { name: 'Pricing', href: '/#pricing' },
];

export function Navbar() {
  const { ready, authenticated } = usePrivy();

  return (
    <motion.nav
      className="fixed inset-x-0 top-5 z-50 px-4"
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 250, damping: 70, mass: 1 }}
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between rounded-full border border-white/8 bg-[#07070B]/60 py-2.5 pl-4 pr-2.5 backdrop-blur-xl">
        <Link href="/" className="px-1">
          <Logo />
        </Link>
        <div className="hidden items-center gap-8 text-sm font-medium text-muted-foreground md:flex">
          {links.map((l) => (
            <Link key={l.name} href={l.href} className="transition hover:text-foreground">
              {l.name}
            </Link>
          ))}
        </div>
        <Button
          variant="gradient"
          size="lg"
          className="h-10 px-5"
          disabled={!ready}
          nativeButton={false} render={<Link href={authenticated ? '/campaigns' : '/login'} />}
        >
          {authenticated ? 'Open dashboard' : 'Get started'}
        </Button>
      </div>
    </motion.nav>
  );
}
