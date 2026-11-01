'use client';

import { useEffect, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { SmartphoneIcon, StoreIcon } from 'lucide-react';
import type { Me } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { useMe } from '@/lib/use-me';

/** Brands use the campaign pages, creators the /creator pages. Each role is kept on its own side. */
const CREATOR_HOME = '/creator';
const BRAND_HOME = '/campaigns';
const SHARED = ['/delete-account'];

/** Picks a role once for new users, then keeps brands and creators on their own pages. */
export function RoleGate({ children }: { children: ReactNode }) {
  const { data: me, isLoading } = useMe();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const choose = useMutation({
    mutationFn: (role: 'brand' | 'creator') =>
      api<Me>('/me', { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: (updated) => {
      qc.setQueryData(['me'], updated);
      router.replace(updated.role === 'creator' ? CREATOR_HOME : BRAND_HOME);
    },
    onError: () => toast.error('Couldn’t save your role. Try again.'),
  });

  const onCreatorPage = pathname.startsWith(CREATOR_HOME);
  const misplaced =
    !!me?.role && !SHARED.some((p) => pathname.startsWith(p)) && (me.role === 'creator' ? !onCreatorPage : onCreatorPage);

  useEffect(() => {
    if (misplaced) router.replace(me?.role === 'creator' ? CREATOR_HOME : BRAND_HOME);
  }, [misplaced, me?.role, router]);

  if (isLoading || !me || misplaced) return null;
  if (me.role) return <>{children}</>;

  return (
    <div className="mx-auto mt-16 max-w-2xl space-y-6 text-center">
      <div>
        <h1 className="text-2xl font-semibold">How will you use Kolab?</h1>
        <p className="text-sm text-muted-foreground">You can’t change this later.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="glass-panel space-y-3 rounded-3xl p-6">
          <StoreIcon className="mx-auto size-8 text-primary" />
          <h2 className="font-medium">I’m a brand</h2>
          <p className="text-sm text-muted-foreground">
            Run campaigns, fund escrow and review creator submissions.
          </p>
          <Button
            variant="gradient"
            className="w-full"
            disabled={choose.isPending}
            onClick={() => choose.mutate('brand')}
          >
            Continue as brand
          </Button>
        </div>
        <div className="glass-panel space-y-3 rounded-3xl p-6">
          <SmartphoneIcon className="mx-auto size-8 text-primary" />
          <h2 className="font-medium">I’m a creator</h2>
          <p className="text-sm text-muted-foreground">
            Join campaigns, create content and get paid in USDC, here or in the mobile app.
          </p>
          <Button
            variant="glass"
            className="w-full"
            disabled={choose.isPending}
            onClick={() => choose.mutate('creator')}
          >
            Continue as creator
          </Button>
        </div>
      </div>
    </div>
  );
}
