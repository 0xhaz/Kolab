'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useLogin, usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import { AlertCircleIcon, LockIcon, Trash2Icon } from 'lucide-react';
import type { DeletionCheckDto } from '@kolab/shared';
import { Logo } from '@/components/shell/sidebar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SoftBackdrop } from '@/components/marketing/soft-backdrop';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

const GOES = ['Your email login and profile', 'Niches, channels and work samples (creators)', 'Shipping addresses and pending applications', 'Your in-app wallet and its keys'];
const STAYS = ['Payment records the other party relies on (amounts, dates), with no name or email', 'On-chain transactions, which can’t be erased from Solana'];

/**
 * Public account-deletion page (Google Play needs a web URL; the app has the same flow in-app).
 * Works for creators and brands, so it lives outside the brand-only dashboard.
 */
export default function DeleteAccountPage() {
  const { ready, authenticated, logout } = usePrivy();
  const { login } = useLogin();
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const check = useQuery({ queryKey: ['deletion-check'], queryFn: () => api<DeletionCheckDto>('/me/deletion'), enabled: ready && authenticated && !done });

  async function remove() {
    setBusy(true);
    try {
      await api('/me', { method: 'DELETE', body: JSON.stringify({ confirm: 'DELETE' }) });
      setDone(true);
      await logout();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-start justify-center px-4 py-16">
      <SoftBackdrop />
      <div className="w-full max-w-lg space-y-6">
        <Link href="/">
          <Logo />
        </Link>
        <div className="space-y-5 rounded-[2rem] border border-white/10 bg-card/80 p-7 backdrop-blur-xl">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Delete your Kolab account</h1>
            <p className="mt-1 text-sm text-muted-foreground">For creators and brands. This is permanent: you can’t sign back in to the account or recover its wallet.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-sm font-semibold">What gets deleted</div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {GOES.map((t) => (
                  <li key={t} className="flex gap-2">
                    <Trash2Icon className="mt-0.5 size-3.5 shrink-0 text-red-300" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="mb-1.5 text-sm font-semibold">What stays</div>
              <ul className="space-y-1.5 text-sm text-muted-foreground">
                {STAYS.map((t) => (
                  <li key={t} className="flex gap-2">
                    <LockIcon className="mt-0.5 size-3.5 shrink-0" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {done ? (
            <p className="rounded-2xl border border-money/30 bg-money/10 px-4 py-3 text-sm text-money">Your account was deleted.</p>
          ) : !ready ? null : !authenticated ? (
            <Button variant="gradient" size="lg" className="h-11 w-full" onClick={() => login()}>
              Sign in to delete your account
            </Button>
          ) : check.data?.canDelete === false ? (
            <div className="space-y-2 rounded-2xl border border-amber-400/30 bg-amber-400/8 p-4">
              <div className="text-sm font-semibold text-amber-200">Before you can delete</div>
              {check.data.blockers.map((b) => (
                <p key={b.code} className="flex gap-2 text-sm text-muted-foreground">
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0 text-amber-300" />
                  {b.detail}
                </p>
              ))}
              <p className="text-xs text-muted-foreground">Creators: withdraw from Earnings in the app. Brands: close campaigns and move funds from the Wallet page.</p>
            </div>
          ) : check.data?.canDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Type <span className="font-semibold text-foreground">DELETE</span> to confirm.
              </p>
              <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="DELETE" />
              <Button variant="destructive" size="lg" className="h-11 w-full" disabled={confirm !== 'DELETE' || busy} onClick={remove}>
                <Trash2Icon /> {busy ? 'Deleting…' : 'Delete my account'}
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Checking your account…</p>
          )}
        </div>
      </div>
    </main>
  );
}
