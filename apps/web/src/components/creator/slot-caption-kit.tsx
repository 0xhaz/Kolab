'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  CopyIcon,
  ExternalLinkIcon,
  LoaderIcon,
  MicIcon,
  ServerIcon,
  SparklesIcon,
  WandSparklesIcon,
} from 'lucide-react';
import {
  postRequirements,
  precheckCaption,
  type CaptionLanguage,
  type CaptionRequest,
  type MyEnrollmentDto,
  type PostRequirements,
  type PrecheckItem,
} from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Chip, Panel, SectionHeader, tone } from '@/components/dashboard';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

type Vibe = NonNullable<CaptionRequest['vibe']>;
const LANGS: { value: CaptionLanguage; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'ms', label: 'Bahasa MY' },
  { value: 'id', label: 'Bahasa ID' },
];
const VIBES: { value: Vibe; label: string }[] = [
  { value: 'casual', label: 'Casual' },
  { value: 'honest review', label: 'Honest review' },
  { value: 'tutorial', label: 'Tutorial' },
  { value: 'hype', label: 'Hype' },
];

interface CaptionResult {
  caption: string;
  hook: string;
  source: 'gemini' | 'template';
  requirements: PostRequirements;
  checks: PrecheckItem[];
}

/** Value that settles `ms` after the last change (setState runs in the timer callback, not the effect body). */
function useDebounced<T>(value: T, ms: number) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

function Choice<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className="rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Chip label={o.label} color={o.value === value ? tone.primary : tone.muted} icon={o.value === value ? CheckCircle2Icon : undefined} />
        </button>
      ))}
    </div>
  );
}

/** Creator kit for one post: write the caption (Gemini or template), pre-check it, copy it, post on TikTok. */
export function SlotCaptionKit({ slotId, enrollment }: { slotId: string; enrollment: MyEnrollmentDto }) {
  const [language, setLanguage] = useState<CaptionLanguage>('en');
  const [vibe, setVibe] = useState<Vibe>('casual');
  const [notes, setNotes] = useState('');
  const [caption, setCaption] = useState('');
  const [result, setResult] = useState<Pick<CaptionResult, 'hook' | 'source'> | null>(null);

  const req = postRequirements(enrollment.campaign, enrollment.voucherCode);
  const local = precheckCaption(caption, req);
  const settled = useDebounced(caption, 400);

  // Server pre-check: the same rules the verifier applies after posting.
  const server = useQuery({
    queryKey: ['creator', 'precheck', slotId, settled],
    queryFn: () => api<{ requirements: PostRequirements; checks: PrecheckItem[] }>(`/slots/${slotId}/precheck`, { method: 'POST', body: JSON.stringify({ caption: settled }) }),
    enabled: settled.trim().length > 0,
    staleTime: Infinity,
  });
  const serverFresh = settled === caption && !!server.data;
  const checks = serverFresh ? server.data!.checks : local;
  const requirements = server.data?.requirements ?? req;

  const generate = useMutation({
    mutationFn: () =>
      api<CaptionResult>(`/slots/${slotId}/caption`, { method: 'POST', body: JSON.stringify({ language, vibe, notes: notes.trim() || undefined }) }),
    onSuccess: (r) => {
      setCaption(r.caption);
      setResult({ hook: r.hook, source: r.source });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function copy() {
    try {
      await navigator.clipboard.writeText(caption);
      toast.success('Caption copied. Paste it in TikTok.');
    } catch {
      toast.error('Couldn’t reach the clipboard. Select the text and copy it.');
    }
  }

  const allPassed = caption.length > 0 && checks.every((ck) => ck.passed);
  const required = [requirements.disclosure, requirements.brandTag, ...(requirements.voucher ? [requirements.voucher] : [])];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section className="space-y-3">
        <SectionHeader title="1 · Caption" />
        <Panel className="space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Language</div>
            <Choice label="Caption language" value={language} options={LANGS} onChange={setLanguage} />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Vibe</div>
            <Choice label="Caption vibe" value={vibe} options={VIBES} onChange={setVibe} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="kit-notes">Anything to mention? (optional)</Label>
            <Textarea id="kit-notes" maxLength={300} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. I use it every morning before work" />
          </div>
          <Button variant="gradient" className="h-10 px-5" disabled={generate.isPending} onClick={() => generate.mutate()}>
            {generate.isPending ? <LoaderIcon className="animate-spin" /> : <SparklesIcon />}
            {generate.isPending ? 'Writing…' : caption ? 'Rewrite caption' : 'Write my caption'}
          </Button>

          {result && (
            <div className="flex flex-wrap items-center gap-2">
              <Chip
                label={result.source === 'gemini' ? 'Written by Gemini' : 'Written from a template'}
                color={result.source === 'gemini' ? tone.primary : tone.muted}
                icon={result.source === 'gemini' ? WandSparklesIcon : undefined}
              />
              {result.source === 'template' && <span className="text-xs text-muted-foreground">Make it yours before posting.</span>}
            </div>
          )}
          {result?.hook && (
            <div className="flex items-start gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-medium" style={{ backgroundColor: `${tone.warning}14` }}>
              <MicIcon className="mt-0.5 size-4 shrink-0" style={{ color: tone.warning }} aria-hidden />
              <span>Say in the first 3 s: “{result.hook}”</span>
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="kit-caption">Caption</Label>
              <span className={caption.length > 2200 ? 'text-xs text-destructive tabular-nums' : 'text-xs text-muted-foreground tabular-nums'}>{caption.length.toLocaleString()} / 2,200</span>
            </div>
            <Textarea id="kit-caption" rows={8} className="min-h-40 leading-relaxed" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Write or generate your caption…" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="glass" className="h-10 px-4" disabled={!caption} onClick={copy}>
              <CopyIcon /> Copy caption
            </Button>
          </div>
        </Panel>
      </section>

      <div className="space-y-6">
        <section className="space-y-3">
          <SectionHeader
            title="2 · Pre-check"
            action={
              caption && (
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  {server.isFetching || !serverFresh ? <LoaderIcon className="size-3 animate-spin" /> : <ServerIcon className="size-3" />}
                  {server.isFetching || !serverFresh ? 'Checking…' : 'Verified by Kolab'}
                </span>
              )
            }
          />
          <Panel className="space-y-3">
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Must be in your caption</div>
              <div className="flex flex-wrap gap-1.5">
                {required.map((r) => (
                  <span key={r} className="rounded-full bg-white/8 px-2.5 py-0.5 font-mono text-xs">
                    {r}
                  </span>
                ))}
              </div>
            </div>
            {caption ? (
              <ul className="space-y-2.5" aria-live="polite">
                {checks.map((ck) => (
                  <li key={ck.key} className="flex items-start gap-2.5">
                    {ck.passed ? (
                      <CheckCircle2Icon className="mt-0.5 size-4.5 shrink-0" style={{ color: tone.money }} aria-label="Passed" />
                    ) : (
                      <AlertCircleIcon className="mt-0.5 size-4.5 shrink-0" style={{ color: tone.warning }} aria-label="Needs a fix" />
                    )}
                    <div>
                      <div className="text-sm">{ck.label}</div>
                      {!ck.passed && ck.fix && <div className="text-xs text-muted-foreground">{ck.fix}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">We check your caption against the brief, the same way the brand’s automated review will.</p>
            )}
            {allPassed && <p className="text-sm font-medium text-money">Looks good. This passes the automated checks.</p>}
          </Panel>
        </section>

        <section className="space-y-3">
          <SectionHeader title="3 · Post" />
          <Panel className="space-y-3">
            <p className="text-sm text-muted-foreground">Copy the caption, then upload your edited video on TikTok and paste it in.</p>
            <Button
              variant="gradient"
              className="h-10 px-5"
              nativeButton={false}
              render={<a href="https://www.tiktok.com/upload" target="_blank" rel="noreferrer" />}
              onClick={() => {
                if (caption) void navigator.clipboard.writeText(caption).catch(() => undefined);
              }}
            >
              Open TikTok upload <ExternalLinkIcon />
            </Button>
            <p className="text-xs text-muted-foreground">Turn on TikTok’s “Paid partnership” toggle when posting. Then come back and submit the link.</p>
          </Panel>
        </section>
      </div>
    </div>
  );
}
