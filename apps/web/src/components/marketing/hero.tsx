'use client';

import Link from 'next/link';
import { motion } from 'motion/react';
import { ArrowRightIcon, GlobeIcon, LockIcon, PercentIcon, ZapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EscrowCard, KitToast, PaidToast, PhoneMockup } from './mockups';

const spring = { type: 'spring', stiffness: 220, damping: 60, mass: 1 } as const;
const rise = (delay: number) => ({ initial: { y: 40, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { ...spring, delay } });

const points = [
  { icon: LockIcon, text: 'Budget locked in USDC escrow before work starts' },
  { icon: ZapIcon, text: 'Auto-paid slot by slot if the brand goes quiet' },
  { icon: PercentIcon, text: 'Creators keep 100% of their rate' },
  { icon: GlobeIcon, text: 'Fund and cash out from any chain via Aurora Intents' },
];

export function Hero() {
  return (
    <section className="relative mx-auto grid min-h-[min(100svh,960px)] max-w-6xl items-center gap-16 px-4 pb-20 pt-36 lg:grid-cols-[1.1fr_1fr] lg:pt-28">
      <div>
        <motion.span {...rise(0)} className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-4 text-xs text-gray-200/90 backdrop-blur">
          <span className="bg-glow rounded-full px-2 py-0.5 font-semibold text-white">New</span>
          Built on Solana · MY · ID · PH · TH
        </motion.span>
        <motion.h1 {...rise(0.08)} className="mb-6 text-5xl font-bold leading-[1.05] tracking-tight md:text-7xl">
          Creators who deliver.
          <br />
          <span className="text-glow">Payouts they trust.</span>
        </motion.h1>
        <motion.p {...rise(0.16)} className="mb-8 max-w-lg text-lg text-muted-foreground">
          Kolab helps Shopee, TikTok Shop and Lazada sellers run campaigns with micro-creators across Southeast Asia. You pay 5% only on money actually released.
        </motion.p>
        <motion.ul {...rise(0.24)} className="mb-10 space-y-3">
          {points.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-center gap-3 text-sm text-gray-200">
              <span className="grid size-7 place-items-center rounded-full bg-white/10">
                <Icon className="size-3.5" />
              </span>
              {text}
            </li>
          ))}
        </motion.ul>
        <motion.div {...rise(0.32)} className="flex flex-wrap gap-3">
          <Button variant="gradient" size="lg" className="h-12 px-7 text-base shadow-[0_12px_40px_-12px_rgb(219_39_119/0.8)]" nativeButton={false} render={<Link href="/login" />}>
            Start a campaign <ArrowRightIcon />
          </Button>
          <Button variant="glass" size="lg" className="h-12 px-7 text-base" nativeButton={false} render={<Link href="/#how" />}>
            How it works
          </Button>
        </motion.div>
      </div>

      <motion.div
        className="relative mx-auto"
        initial={{ y: 60, opacity: 0, rotate: 2 }}
        animate={{ y: 0, opacity: 1, rotate: 0 }}
        transition={{ ...spring, delay: 0.2 }}
      >
        <div aria-hidden className="bg-glow absolute inset-10 -z-10 rounded-full opacity-40 blur-3xl" />
        <PhoneMockup />
        <motion.div className="absolute -left-56 -bottom-6 hidden md:block" animate={{ y: [0, -8, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
          <EscrowCard />
        </motion.div>
        <motion.div className="absolute -right-36 top-[46%] hidden md:block" animate={{ y: [0, 8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
          <PaidToast />
        </motion.div>
        <motion.div className="absolute -right-20 -top-5 hidden md:block" animate={{ y: [0, -6, 0] }} transition={{ duration: 4.5, repeat: Infinity, ease: 'easeInOut', delay: 1 }}>
          <KitToast />
        </motion.div>
      </motion.div>
    </section>
  );
}
