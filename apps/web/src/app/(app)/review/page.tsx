'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CheckIcon, XIcon, ExternalLinkIcon, FilmIcon, InboxIcon, TimerIcon } from 'lucide-react';
import { openUpload } from '@/lib/files';
import { Button } from '@/components/ui/button';
import { Avatar, Chip, Empty, PageHeader, tone } from '@/components/dashboard';
import { useReview } from '@/lib/queries';
import { useSlotActions } from '@/lib/use-slot-actions';
import { explorerTx, relative, usdc } from '@/lib/format';

const CHECK_LABEL: Record<string, string> = {
  exists: 'Post is public',
  author: 'Posted by this creator',
  timing: 'Posted during the campaign',
  disclosure: '#ad disclosure',
  hash: 'Fingerprint matches on-chain',
  format: 'Video file',
};

export default function ReviewPage() {
  const { data: items = [], isLoading } = useReview();
  const actions = useSlotActions();
  const [now] = useState(() => Date.now());

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={items.length ? `${items.length} waiting` : 'All clear'}
        title="Review"
        description="Submissions waiting for you, oldest first. Automated checks run as soon as a creator submits. If you don’t decide before the window ends, the creator is paid automatically."
      />
      {isLoading ? null : items.length === 0 ? (
        <Empty icon={InboxIcon}>Nothing to review. New submissions appear here the moment they land on-chain.</Empty>
      ) : (
        <div className="space-y-4">
          {items.map((item) => {
            const checks = item.submission?.checkResults ?? [];
            const failed = checks.filter((r) => !r.passed);
            const who = item.creator.displayName ?? item.creator.email ?? item.creator.walletPubkey ?? 'Creator';
            return (
              <div
                key={item.slot.id}
                className="grid gap-5 rounded-3xl border border-white/8 bg-card p-5 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)] lg:grid-cols-[1fr_auto]"
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Avatar name={who} size={44} ring />
                    <div className="min-w-0">
                      <div className="truncate font-semibold">{who}</div>
                      <div className="text-xs text-muted-foreground">
                        <Link className="hover:text-foreground hover:underline" href={`/campaigns/${item.campaign.id}`}>
                          {item.campaign.title}
                        </Link>{' '}
                        · {item.slot.kind === 'ugc' ? 'UGC' : 'Post'} #{item.slot.idx + 1}
                      </div>
                    </div>
                    <span className="ml-auto text-lg font-bold tabular-nums text-money lg:hidden">{usdc(item.slot.amount, 0)}</span>
                  </div>
                  {item.submission?.url && (
                    <a className="inline-flex max-w-full items-center gap-1 truncate text-sm text-primary underline-offset-4 hover:underline" href={item.submission.url} target="_blank" rel="noreferrer">
                      {item.submission.url} <ExternalLinkIcon className="size-3.5 shrink-0" />
                    </a>
                  )}
                  {item.submission?.fileKey && (
                    <Button variant="glass" className="h-9 px-4" onClick={() => void openUpload(item.submission!.fileKey!)}>
                      <FilmIcon /> Watch delivered video
                    </Button>
                  )}
                  {checks.length === 0 ? (
                    <div className="text-sm text-muted-foreground">Automated checks running…</div>
                  ) : (
                    <ul className="flex flex-wrap gap-2">
                      {checks.map((r) => (
                        <li key={r.checkType} title={r.detailsJson?.detail}>
                          <Chip
                            label={CHECK_LABEL[r.checkType] ?? r.checkType}
                            color={r.passed ? tone.money : tone.danger}
                            icon={r.passed ? CheckIcon : XIcon}
                          />
                        </li>
                      ))}
                      {checks[0]?.attestedTx && (
                        <li>
                          <a className="text-xs text-muted-foreground underline-offset-4 hover:underline" href={explorerTx(checks[0].attestedTx)} target="_blank" rel="noreferrer">
                            attested on-chain
                          </a>
                        </li>
                      )}
                    </ul>
                  )}
                  {failed.length > 0 && <p className="rounded-2xl border border-red-400/25 bg-red-400/8 px-3.5 py-2.5 text-sm text-red-300">{failed.map((f) => f.detailsJson?.detail).filter(Boolean).join(' · ')}. Auto-release is paused until you decide.</p>}
                </div>
                <div className="flex flex-col items-start justify-between gap-3 lg:items-end">
                  <div className="hidden text-right lg:block">
                    <div className="text-xs text-muted-foreground">Releases</div>
                    <div className="text-2xl font-bold tabular-nums text-money">{usdc(item.slot.amount, 0)}</div>
                  </div>
                  <Chip label={`Auto-pays ${relative(item.reviewEndsAt, now)}`} color={tone.warning} icon={TimerIcon} />
                  <div className="flex gap-2">
                    <Button variant="gradient" className="h-10 px-5" disabled={!!actions.busy} onClick={() => actions.approve(item.slot.id)}>
                      {actions.busy === `approve:${item.slot.id}` ? 'Confirm in wallet…' : 'Approve & pay'}
                    </Button>
                    <Button variant="glass" className="h-10 px-4" disabled={!!actions.busy} onClick={() => actions.reject(item.slot.id)}>
                      Request changes
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
