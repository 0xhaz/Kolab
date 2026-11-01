'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { LockIcon, PercentIcon, ZapIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/shell/sidebar';
import { SoftBackdrop } from '@/components/marketing/soft-backdrop';

const POINTS = [
  { icon: LockIcon, text: 'Budgets locked in escrow before work starts' },
  { icon: ZapIcon, text: 'Auto-paid if a review goes quiet' },
  { icon: PercentIcon, text: '5% fee, only on released money' },
];

export default function LoginPage() {
  const router = useRouter();
  const { ready, authenticated } = usePrivy();
  const { login } = useLogin({ onComplete: () => router.replace('/campaigns') });

  useEffect(() => {
    if (ready && authenticated) router.replace('/campaigns');
  }, [ready, authenticated, router]);

  return (
    <main className="grid flex-1 lg:grid-cols-2">
      <SoftBackdrop />
      <div className="relative hidden overflow-hidden lg:block">
        <div className="absolute inset-0" style={{ backgroundImage: 'linear-gradient(160deg, #5B21B6 0%, #BE185D 45%, rgba(7,7,11,0) 90%)' }} />
        <div className="relative flex h-full flex-col justify-between p-12">
          <Link href="/">
            <Logo />
          </Link>
          <div className="max-w-md space-y-6">
            <h2 className="text-5xl font-bold leading-[1.05] tracking-tight text-white">Creator campaigns, paid out fairly.</h2>
            <ul className="space-y-3">
              {POINTS.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-3 text-white/90">
                  <span className="grid size-8 place-items-center rounded-full bg-white/18">
                    <Icon className="size-4" />
                  </span>
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <span className="text-sm text-white/60">Solana devnet</span>
        </div>
      </div>
      <div className="flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-6">
          <Link href="/" className="lg:hidden">
            <Logo />
          </Link>
          <div className="rounded-[2rem] border border-white/10 bg-card/80 p-8 shadow-2xl backdrop-blur-xl">
            <h1 className="mb-2 text-2xl font-bold tracking-tight">Sign in to Kolab</h1>
            <p className="mb-6 text-sm text-muted-foreground">Email login. We create a Solana wallet for you, with no seed phrase and no SOL needed.</p>
            <Button variant="gradient" size="lg" className="h-12 w-full text-base" disabled={!ready} onClick={() => login()}>
              Continue with email
            </Button>
          </div>
          <p className="text-center text-xs text-muted-foreground">Creators can sign in here too, or use the Kolab mobile app.</p>
        </div>
      </div>
    </main>
  );
}
