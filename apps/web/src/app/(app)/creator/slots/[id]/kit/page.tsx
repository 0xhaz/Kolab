'use client';

import { use } from 'react';
import Link from 'next/link';
import { ChevronLeftIcon, CircleAlertIcon } from 'lucide-react';
import { Empty, PageHeader, Panel } from '@/components/dashboard';
import { SlotCaptionKit } from '@/components/creator/slot-caption-kit';
import { useSlot } from '@/lib/creator';
import { slotTitle } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';

/** Creator kit for one post: caption, pre-check, then post on TikTok. */
export default function CreatorKitPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { slot, enrollment, isLoading, isError, error } = useSlot(id);

  return (
    <div className="space-y-8">
      <Link href={`/creator/slots/${id}`} className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
        <ChevronLeftIcon className="size-4" /> {slot ? slotTitle(slot) : 'Deliverable'}
      </Link>
      {!slot || !enrollment ? (
        isLoading ? (
          <Panel className="h-64 animate-pulse bg-white/3" aria-busy />
        ) : (
          <Empty icon={CircleAlertIcon}>{isError ? errorMessage(error) : 'Deliverable not found.'}</Empty>
        )
      ) : (
        <>
          <PageHeader
            eyebrow={enrollment.campaign.brandName ?? 'Creator kit'}
            title="Creator kit"
            description={`${slotTitle(slot)} · write your caption, check it the way the brand’s automated review will, then post.`}
          />
          <SlotCaptionKit slotId={slot.id} enrollment={enrollment} />
        </>
      )}
    </div>
  );
}
