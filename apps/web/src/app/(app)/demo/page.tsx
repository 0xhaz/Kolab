'use client';

import { useState } from 'react';
import { notFound } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ClockIcon, ExternalLinkIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, SlotBadge } from '@/components/dashboard';
import { api } from '@/lib/api';
import { env } from '@/lib/env';
import { errorMessage } from '@/lib/errors';
import { keys, useCampaign, useCampaigns } from '@/lib/queries';
import { useLiveEvents } from '@/lib/realtime';
import { explorerTx } from '@/lib/format';
import { useDemoSeed } from '@/lib/use-demo-seed';

const H = 3600;

function useDemoAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(label: string, path: string, body: unknown = {}, success?: (r: unknown) => string) {
    setBusy(label);
    try {
      const r = await api<unknown>(path, { method: 'POST', body: JSON.stringify(body) });
      await qc.invalidateQueries();
      toast.success(success ? success(r) : `${label}: done`);
    } catch (e) {
      toast.error(`${label}: ${errorMessage(e)}`);
    } finally {
      setBusy(null);
    }
  }
  return { busy, run };
}

function CampaignControls({ id }: { id: string }) {
  const { data: c } = useCampaign(id);
  const { busy, run } = useDemoAction();
  if (!c) return null;
  return (
    <div className="glass-panel space-y-3 rounded-3xl p-4">
      <div className="font-medium">{c.title}</div>
      {c.enrollments.length === 0 && <div className="text-sm text-muted-foreground">No creators yet.</div>}
      {c.enrollments.map((e) => (
        <div key={e.id} className="space-y-2 border-t border-border pt-3 first:border-0 first:pt-0">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>{e.creator.displayName ?? e.creator.email}</span>
            {e.trackingRef && e.status === 'in_transit' && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('Deliver parcel', '/demo/deliver-parcel', { id: e.id })}>
                Mark parcel delivered
              </Button>
            )}
            {c.type === 'per_sale' && e.voucherCode && (
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run('Fire sale', '/demo/fire-sale', { id: e.id }, () => `Order with ${e.voucherCode} sent to the store webhook`)}>
                Fire mock sale ({e.voucherCode})
              </Button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {e.slots.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-xl border border-white/8 bg-popover px-2.5 py-1.5 text-xs">
                #{s.idx + 1} <SlotBadge status={s.status} />
                {s.submissions[0]?.url && ['released', 'submitted'].includes(s.status) && (
                  <button className="text-red-300 hover:underline" disabled={!!busy} onClick={() => run('Delete post', '/demo/delete-post', { id: s.id }, () => 'Post deleted on the mock platform')}>
                    delete post
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function DemoPage() {
  if (!env.demoMode) notFound();
  const { busy, run } = useDemoAction();
  const demoSeed = useDemoSeed();
  const { data: campaigns = [] } = useCampaigns();
  const events = useLiveEvents();
  const clock = useQuery({
    queryKey: keys.clock,
    queryFn: () => api<{ offsetSecs: number; chainNow: string }>('/demo/clock'),
    refetchInterval: 10_000,
  });
  const offset = clock.data?.offsetSecs ?? 0;

  const setClock = (secs: number, label: string) =>
    run(label, '/demo/clock', { offsetSecs: Math.max(0, secs) }, () => `${label}. Running the crank…`).then(() =>
      run('Crank', '/demo/crank', {}, (r) => `Crank: ${JSON.stringify(r)}`),
    );

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Devnet · demo-clock program" title="Demo control panel" description="Drives the parts of the story that normally take days: the clock, the courier, the store and the platform." />

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="glass-panel space-y-3 rounded-3xl p-5">
          <div className="flex items-center gap-2 font-medium">
            <ClockIcon className="size-4" /> Program clock
          </div>
          <div className="text-sm text-muted-foreground">
            {clock.isError ? 'Unavailable' : `Program time ${clock.data ? new Date(clock.data.chainNow).toLocaleString() : '…'} · offset +${Math.round(offset / H)}h`}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!busy} onClick={() => setClock(offset + 72 * H, 'Clock +72h')}>
              +72h (review window)
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => setClock(offset + 7 * 24 * H, 'Clock +7d')}>
              +7 days
            </Button>
            <Button variant="ghost" disabled={!!busy} onClick={() => setClock(0, 'Clock reset')}>
              <RotateCcwIcon /> Reset
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Only the demo-clock program accepts this; the hosted program refuses it on-chain.</p>
        </section>

        <section className="glass-panel space-y-3 rounded-3xl p-5">
          <div className="font-medium">Run now</div>
          <div className="flex flex-wrap gap-2">
            <Button variant="gradient" disabled={!!busy} onClick={() => run('Crank', '/demo/crank', {}, (r) => `Crank: ${JSON.stringify(r)}`)}>
              <PlayIcon /> Run crank
            </Button>
            <Button variant="outline" disabled={!!busy || demoSeed.busy} onClick={demoSeed.seed}>
              {demoSeed.progress ?? 'Load Glow Lab campaigns'}
            </Button>
            <Button variant="outline" disabled={!!busy} onClick={() => run('Still-live checks', '/demo/still-live', {}, (r) => `Still-live: ${(r as unknown[]).length} slot(s) settled`)}>
              Still-live checks
            </Button>
            <Button
              variant="destructive"
              disabled={!!busy}
              onClick={() => {
                if (window.confirm('Clear all off-chain demo data (campaigns, submissions, mock platform)? Chain state stays.')) void run('Reset demo', '/demo/reset');
              }}
            >
              Reset demo data
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Crank = auto-release, missed slots, receipt confirmation, still-live after 7 days.</p>
        </section>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          {campaigns.filter((c) => c.status === 'active').map((c) => (
            <CampaignControls key={c.id} id={c.id} />
          ))}
        </div>
        <section className="glass-panel h-fit space-y-2 rounded-3xl p-4">
          <div className="font-medium">Live events</div>
          {events.length === 0 && <div className="text-sm text-muted-foreground">Waiting for on-chain events…</div>}
          <ol className="space-y-1.5">
            {events.map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-center justify-between gap-2 text-xs">
                <span className="font-mono">{e.event}</span>
                <span className="flex items-center gap-2 text-muted-foreground">
                  {new Date(e.at).toLocaleTimeString()}
                  {e.txSignature && (
                    <a href={explorerTx(e.txSignature)} target="_blank" rel="noreferrer" aria-label="Open transaction">
                      <ExternalLinkIcon className="size-3" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
