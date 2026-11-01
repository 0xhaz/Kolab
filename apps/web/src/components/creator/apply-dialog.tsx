'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowRightIcon, SendIcon, UserRoundPenIcon } from 'lucide-react';
import type { CampaignDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useMyProfile } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { useMe } from '@/lib/use-me';
import { cn } from '@/lib/utils';
import { Completeness, CreatorProfileCard } from './creator-profile';
import { firstName, useApply } from './discover-data';

const MIN = 10;
const MAX = 500;

/** Send the brand a pitch along with the creator profile (mobile apply sheet). */
export function ApplyDialog({ camp, again, disabled }: { camp: CampaignDto; again?: boolean; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [pitch, setPitch] = useState('');
  const profile = useMyProfile();
  const { data: me } = useMe();
  const apply = useApply(camp.id);
  const length = pitch.trim().length;
  const name = me?.displayName ?? firstName(null, me?.email);
  const p = profile.data;

  async function send() {
    try {
      await apply.mutateAsync(pitch.trim());
      toast.success('Application sent. We’ll let you know when the brand decides.');
      setOpen(false);
      setPitch('');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="gradient" size="lg" className="h-11 w-full px-5" disabled={disabled} />}>
        <SendIcon /> {again ? 'Apply again' : 'Apply'}
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <div className="text-sm text-muted-foreground">{camp.brandName ?? 'Apply'}</div>
          <DialogTitle className="text-xl font-semibold leading-tight">Apply to {camp.title}</DialogTitle>
          <DialogDescription>The brand sees your profile, samples and on-chain track record.</DialogDescription>
        </DialogHeader>

        {!p ? (
          <p className="text-sm text-muted-foreground">{profile.isError ? errorMessage(profile.error) : 'Loading your profile…'}</p>
        ) : !p.complete ? (
          <div className="space-y-3 rounded-2xl border border-amber-400/30 bg-amber-400/8 p-4">
            <div className="flex items-center gap-2 font-semibold">
              <UserRoundPenIcon className="size-4 text-amber-300" /> Complete your profile first
            </div>
            <p className="text-sm text-muted-foreground">This brand picks creators from their profiles. Add a niche, a channel and one sample of your work.</p>
            <Completeness profile={p} />
            <Button variant="gradient" className="h-10 w-full" nativeButton={false} render={<Link href="/creator/profile" />}>
              Complete your profile <ArrowRightIcon />
            </Button>
          </div>
        ) : (
          <>
            <CreatorProfileCard profile={p} name={name} compact />
            <div className="space-y-2">
              <Label htmlFor="pitch">Why you’re a fit for this brand</Label>
              <Textarea
                id="pitch"
                className="min-h-28"
                placeholder="Your audience, a past post that worked, an idea for this campaign…"
                maxLength={MAX}
                value={pitch}
                onChange={(e) => setPitch(e.target.value)}
                aria-describedby="pitch-count"
              />
              <p id="pitch-count" className={cn('text-right text-xs', length > 0 && length < MIN ? 'text-amber-300' : 'text-muted-foreground')}>
                {length < MIN ? `At least ${MIN} characters` : `${length}/${MAX}`}
              </p>
            </div>
            <Button variant="gradient" size="lg" className="h-11" disabled={length < MIN || apply.isPending} onClick={send}>
              <SendIcon /> {apply.isPending ? 'Sending…' : 'Send application'}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Joining unlocks once the brand accepts you on-chain.</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
