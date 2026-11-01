'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckIcon, ExternalLinkIcon, PlayIcon, QuoteIcon, ShieldCheckIcon, SparklesIcon, UserCheckIcon, UsersIcon, XIcon } from 'lucide-react';
import { PLATFORM_LABEL, type ApplicationDto, type CampaignDto, type CreatorProfileDto, type Platform, type SampleDto } from '@kolab/shared';
import { Avatar, Chip, Empty, Panel, SectionHeader, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { keys, useApplications } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { assetUrl } from '@/lib/upload';
import { usdc } from '@/lib/format';
import { cn } from '@/lib/utils';

const compact = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

const PLATFORM_COLOR: Record<Platform, string> = {
  tiktok: '#F472B6',
  instagram: '#FB923C',
  youtube: '#F87171',
  facebook: '#60A5FA',
  x: '#E5E7EB',
};

const STATUS = {
  pending: { label: 'Waiting for you', color: tone.warning },
  accepted: { label: 'Approved on-chain', color: tone.money },
  declined: { label: 'Declined', color: tone.muted },
} as const;

function Sample({ s }: { s: SampleDto }) {
  const base = 'group relative aspect-[3/4] overflow-hidden rounded-xl border border-white/8 bg-popover';
  if (s.kind === 'link') {
    return (
      <a href={s.url} target="_blank" rel="noreferrer" className={cn(base, 'flex flex-col justify-between p-2.5 text-xs transition hover:border-white/20')}>
        <ExternalLinkIcon className="size-4 text-primary" />
        <span className="line-clamp-3 break-all text-muted-foreground">{s.caption ?? s.url.replace(/^https:\/\/(www\.)?/, '')}</span>
      </a>
    );
  }
  const src = assetUrl(s.url);
  return (
    <a href={src} target="_blank" rel="noreferrer" className={base} title={s.caption ?? undefined}>
      {s.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed upload links
        <img src={src} alt={s.caption ?? 'Sample'} className="size-full object-cover transition duration-300 group-hover:scale-105" />
      ) : (
        <>
          <video src={src} muted playsInline preload="metadata" className="size-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <span className="grid size-9 place-items-center rounded-full bg-white/90 text-black">
              <PlayIcon className="size-4 fill-current" />
            </span>
          </span>
        </>
      )}
    </a>
  );
}

/** Everything a brand needs to judge fit: audience, niche, samples and on-chain track record. */
function ApplicantCard({ app, campaign }: { app: ApplicationDto; campaign: CampaignDto }) {
  const p = app.creator as CreatorProfileDto;
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const status = STATUS[app.status];
  const r = p.record;
  const isNew = r.delivered + r.missed === 0;

  async function accept() {
    setBusy('accept');
    try {
      const tx = await send(`/applications/${app.id}/tx/accept`, {});
      await qc.invalidateQueries({ queryKey: keys.applications(campaign.id) });
      toast.success(`${p.displayName ?? 'Creator'} approved on-chain. They can join now.`, {
        action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') },
      });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  async function decline() {
    setBusy('decline');
    try {
      await api(`/applications/${app.id}/decline`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: keys.applications(campaign.id) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className={cn('space-y-4', app.status === 'declined' && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={p.displayName ?? 'Creator'} size={52} ring />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-lg font-semibold">{p.displayName ?? 'Creator'}</span>
              {p.country && <span className="text-xs text-muted-foreground">{p.country}</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {p.niches.map((n) => (
                <Chip key={n} label={n} color={tone.primary} />
              ))}
            </div>
          </div>
        </div>
        <Chip label={status.label} color={status.color} icon={app.status === 'accepted' ? ShieldCheckIcon : undefined} />
      </div>

      {app.pitch && (
        <div className="flex gap-2 rounded-2xl bg-popover px-3.5 py-3 text-sm">
          <QuoteIcon className="mt-0.5 size-3.5 shrink-0 text-accent" />
          <p className="text-foreground/90">{app.pitch}</p>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-[1fr_1.2fr]">
        <div className="space-y-3">
          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-xs text-muted-foreground">
              <span>Audience</span>
              <span>
                <span className="text-base font-bold text-foreground tabular-nums">{compact.format(p.totalFollowers)}</span> total reach
              </span>
            </div>
            <ul className="space-y-1.5">
              {p.channels.map((ch) => (
                <li key={ch.platform} className="flex items-center justify-between gap-2 rounded-xl border border-white/6 px-3 py-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ backgroundColor: PLATFORM_COLOR[ch.platform] }} />
                    <span className="font-medium">{PLATFORM_LABEL[ch.platform]}</span>
                    <span className="truncate text-muted-foreground">@{ch.handle}</span>
                  </span>
                  <span className="font-semibold tabular-nums">{compact.format(ch.followers)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-1 text-[11px] text-muted-foreground">Follower counts are self-declared. Post checks confirm the author on each submission.</p>
          </div>

          <div className="rounded-2xl border border-white/6 p-3">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <ShieldCheckIcon className="size-3.5 text-money" /> Kolab track record (on-chain)
              </span>
              {isNew && <Chip label="New creator" color={tone.info} icon={SparklesIcon} />}
            </div>
            {isNew ? (
              <p className="text-xs text-muted-foreground">No paid Kolab work yet. Judge by samples, or start with a single low-value slot.</p>
            ) : (
              <dl className="grid grid-cols-4 gap-2 text-center">
                {[
                  ['On time', r.onTimeRate === null ? '—' : `${Math.round(r.onTimeRate * 100)}%`],
                  ['Delivered', r.delivered],
                  ['Missed', r.missed],
                  ['Earned', usdc(r.earned, 0).replace(' USDC', '')],
                ].map(([label, v]) => (
                  <div key={label as string}>
                    <dd className="font-semibold tabular-nums">{v}</dd>
                    <dt className="text-[11px] text-muted-foreground">{label}</dt>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs text-muted-foreground">Samples ({p.samples.length})</div>
          {p.samples.length ? (
            <div className="grid grid-cols-3 gap-2">
              {p.samples.map((s) => (
                <Sample key={s.id} s={s} />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No samples yet.</p>
          )}
        </div>
      </div>

      {app.status === 'pending' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
          <p className="text-xs text-muted-foreground">Approving signs an on-chain approval. Their payout is locked from escrow only when they join.</p>
          <div className="flex gap-2">
            <Button variant="glass" className="h-10 px-4" disabled={!!busy} onClick={decline}>
              <XIcon /> Decline
            </Button>
            <Button variant="gradient" className="h-10 px-5" disabled={!!busy} onClick={accept}>
              <CheckIcon /> {busy === 'accept' ? 'Confirm in wallet…' : 'Approve creator'}
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

const TABS = ['pending', 'accepted', 'declined'] as const;

export function ApplicantsPanel({ campaign }: { campaign: CampaignDto }) {
  const { data: apps = [] } = useApplications(campaign.id);
  const [tab, setTab] = useState<(typeof TABS)[number]>('pending');
  const shown = apps.filter((a) => a.status === tab && a.creator);

  if (!campaign.selective) {
    return (
      <Panel className="flex items-center gap-3 text-sm text-muted-foreground">
        <span className="grid size-10 place-items-center rounded-full bg-money/15 text-money">
          <UsersIcon className="size-4" />
        </span>
        Open campaign: anyone with the join link can join without applying.
      </Panel>
    );
  }

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Applicants"
        count={apps.filter((a) => a.status === 'pending').length}
        action={
          <div className="flex gap-1 rounded-full border border-white/8 bg-card p-1">
            {TABS.map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-full px-3 py-1 text-xs font-medium capitalize transition',
                  tab === t ? 'bg-glow text-white' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t} {apps.filter((a) => a.status === t).length}
              </button>
            ))}
          </div>
        }
      />
      {shown.length === 0 ? (
        <Empty icon={UserCheckIcon}>
          {tab === 'pending' ? 'No applications waiting. Share the join link: creators apply with their niche, audience and samples.' : `No ${tab} applications.`}
        </Empty>
      ) : (
        <div className="space-y-4">
          {shown.map((a) => (
            <ApplicantCard key={a.id} app={a} campaign={campaign} />
          ))}
        </div>
      )}
    </section>
  );
}
