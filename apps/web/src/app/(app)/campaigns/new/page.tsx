'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { GlobeIcon, SparklesIcon, WalletIcon, PlusIcon, Trash2Icon } from 'lucide-react';
import { budgetForCreators, creatorsCovered, perCreatorCommitment, type CampaignDto, type CreateCampaign } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PageHeader } from '@/components/dashboard';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { keys, useBalance } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { usdc } from '@/lib/format';

type Market = 'MY' | 'ID' | 'PH' | 'TH';
type Goal = 'awareness' | 'sales' | 'ugc';
interface Slot {
  kind: 'post' | 'ugc';
  amountUsdc: number;
  dueDays: number;
}
interface Draft {
  title: string;
  briefMd: string;
  campaignType: CampaignDto['type'];
  slots: Slot[];
  perSaleUsdc: number;
  suggestedCreators: number;
  rationale: string;
  source: 'gemini' | 'template';
}

const FEE = 0.05;

const REVIEW_OPTIONS = [
  { label: '72 hours (standard)', secs: 72 * 3600 },
  { label: '24 hours', secs: 24 * 3600 },
  { label: '2 minutes (live demo)', secs: 120 },
];
const select = 'h-10 w-full rounded-xl border border-input bg-transparent px-3 text-sm dark:bg-input/30';

function Step({ n, title, subtitle }: { n: number; title: string; subtitle: string }) {
  return (
    <div className="flex items-center gap-3 md:col-span-2">
      <span className="bg-glow grid size-9 shrink-0 place-items-center rounded-full text-sm font-bold text-white">{n}</span>
      <div>
        <div className="font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{subtitle}</div>
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export default function NewCampaignPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const send = useSponsoredTx();
  const { data: balance } = useBalance();

  const [productText, setProductText] = useState('');
  const [productUrl, setProductUrl] = useState('');
  const [budget, setBudget] = useState(120);
  const [markets, setMarkets] = useState<Market[]>(['MY', 'ID']);
  const [goal, setGoal] = useState<Goal>('awareness');
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const [maxCreators, setMaxCreators] = useState(5);
  const [durationDays, setDurationDays] = useState(45);
  const [reviewSecs, setReviewSecs] = useState(REVIEW_OPTIONS[0]!.secs);
  const [holdbackPct, setHoldbackPct] = useState(30);
  const [shipping, setShipping] = useState(false);
  const [selective, setSelective] = useState(true);
  /** null = not chosen yet: default to the wallet unless it can't cover the budget. */
  const [payWith, setPayWith] = useState<'wallet' | 'any' | null>(null);
  const [creating, setCreating] = useState<'idle' | 'saving' | 'signing'>('idle');

  async function draftBrief() {
    setDrafting(true);
    try {
      const d = await api<Draft>('/ai/brief', {
        method: 'POST',
        body: JSON.stringify({ productText, productUrl: productUrl || undefined, budgetUsdc: budget, markets, goal }),
      });
      setDraft(d);
      const covered = d.campaignType === 'per_sale' ? null : creatorsCovered(budget, d.slots);
      setMaxCreators(Math.max(1, covered === null ? d.suggestedCreators : Math.min(d.suggestedCreators, covered)));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDrafting(false);
    }
  }

  const perCreator = draft ? draft.slots.reduce((s, x) => s + x.amountUsdc, 0) : 0;
  const perCreatorWithFee = draft ? Number(perCreatorCommitment(draft.slots)) / 1e6 : 0;
  const fundable = draft ? creatorsCovered(budget, draft.slots) : null;
  /** More spots than the budget can reserve: the extra creators would be refused when they join. */
  const spotsShort = !!draft && draft.campaignType !== 'per_sale' && fundable !== null && maxCreators > fundable;
  const budgetForSpots = draft ? budgetForCreators(draft.slots, maxCreators) : 0;
  const walletUsdc = balance ? Number(balance.usdc) / 1e6 : null;
  const walletShort = walletUsdc !== null && walletUsdc < budget;
  const funding = payWith ?? (walletShort ? 'any' : 'wallet');

  function updateSlot(i: number, patch: Partial<Slot>) {
    setDraft((d) => (d ? { ...d, slots: d.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)) } : d));
  }

  /** `anyChain`: create the escrow empty, then fund it from another chain (Aurora Intents). */
  async function createAndFund(anyChain = false) {
    if (!draft) return;
    const body: CreateCampaign = {
      title: draft.title,
      briefMd: draft.briefMd,
      type: draft.campaignType,
      budgetUsdc: budget,
      slots: draft.campaignType === 'per_sale' ? [] : draft.slots,
      perSaleUsdc: draft.campaignType === 'per_sale' ? draft.perSaleUsdc : 0,
      maxCreators,
      durationDays,
      reviewWindowSecs: reviewSecs,
      holdbackPct,
      requiresShipping: shipping,
      selective,
      shipsTo: markets,
    };
    setCreating('saving');
    try {
      const campaign = await api<CampaignDto>('/campaigns', { method: 'POST', body: JSON.stringify(body) });
      setCreating('signing');
      const tx = await send(`/campaigns/${campaign.id}/tx/${anyChain ? 'create' : 'create-and-fund'}`, {});
      await qc.invalidateQueries({ queryKey: keys.campaigns });
      toast.success(anyChain ? 'Escrow created. Now fund it from any chain.' : 'Campaign live. Budget locked in escrow.', {
        action: { label: 'Explorer', onClick: () => window.open(tx.explorerUrl, '_blank') },
      });
      router.push(anyChain ? `/campaigns/${campaign.id}?fund=any` : `/campaigns/${campaign.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
      setCreating('idle');
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <PageHeader
        eyebrow="Create"
        title="New campaign"
        description="Paste your product, set a budget, and Kolab drafts the brief and payout schedule. You can edit everything before funding."
      />

      <section className="glass-panel grid gap-5 rounded-3xl p-6 md:grid-cols-2">
        <Step n={1} title="Your product" subtitle="What creators will promote" />
        <div className="space-y-4 md:col-span-2">
          <Field label="Product" hint="Name and a few lines about it. Paste from your Shopee / TikTok Shop listing.">
            <Textarea rows={3} value={productText} onChange={(e) => setProductText(e.target.value)} placeholder="Glow Lab Vitamin C Serum 30ml. Brightening serum for dull skin, fragrance-free." />
          </Field>
        </div>
        <Field label="Product link (optional)">
          <Input value={productUrl} onChange={(e) => setProductUrl(e.target.value)} placeholder="https://shopee.com.my/…" />
        </Field>
        <Field label="Budget (USDC)" hint={walletUsdc !== null ? `Wallet: ${usdc(walletUsdc)}` : undefined}>
          <Input type="number" min={1} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </Field>
        <div className="space-y-1.5 md:col-span-2">
          <Label>Pay for it with</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setPayWith('wallet')}
              className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${funding === 'wallet' ? 'border-primary/60 bg-primary/10' : 'border-white/8 hover:border-white/16'}`}
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-money/15 text-money">
                <WalletIcon className="size-4" />
              </span>
              <span>
                <span className="block text-sm font-semibold">Kolab wallet</span>
                <span className={`block text-xs ${walletShort ? 'text-amber-300' : 'text-muted-foreground'}`}>
                  {walletUsdc === null ? 'Loading balance…' : walletShort ? `${usdc(walletUsdc)} available: not enough for this budget` : `${usdc(walletUsdc)} available, USDC on Solana`}
                </span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => setPayWith('any')}
              className={`flex items-start gap-3 rounded-2xl border p-3.5 text-left transition ${funding === 'any' ? 'border-primary/60 bg-primary/10' : 'border-white/8 hover:border-white/16'}`}
            >
              <span className="bg-glow grid size-9 shrink-0 place-items-center rounded-xl text-white">
                <GlobeIcon className="size-4" />
              </span>
              <span>
                <span className="flex items-center gap-1.5 text-sm font-semibold">
                  Any chain <span className="rounded-full bg-white/8 px-1.5 py-px text-[10px] font-medium text-muted-foreground">Aurora Intents</span>
                </span>
                <span className="block text-xs text-muted-foreground">USDT on Tron, ETH on Base, BTC and more. Lands straight in the campaign escrow.</span>
              </span>
            </button>
          </div>
        </div>
        <Field label="Creator markets">
          <div className="flex gap-2">
            {(['MY', 'ID', 'PH', 'TH'] as const).map((m) => (
              <Button
                key={m}
                type="button"
                variant={markets.includes(m) ? 'gradient' : 'glass'}
                className="h-9 rounded-full px-4"
                onClick={() => setMarkets((cur) => (cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m]))}
              >
                {m}
              </Button>
            ))}
          </div>
        </Field>
        <Field label="Goal">
          <select className={select} value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            <option value="awareness">Awareness: regular posts</option>
            <option value="sales">Sales: pay per order</option>
            <option value="ugc">UGC videos for ads</option>
          </select>
        </Field>
        <div className="md:col-span-2">
          <Button variant="gradient" size="lg" className="h-10 px-5" disabled={drafting || productText.length < 3} onClick={draftBrief}>
            <SparklesIcon /> {drafting ? 'Drafting…' : draft ? 'Redraft' : 'Draft with AI'}
          </Button>
        </div>
      </section>

      {draft && (
        <section className="glass-panel space-y-5 rounded-3xl p-6">
          <Step n={2} title="Review the draft" subtitle="Edit anything, then lock the budget in escrow" />
          <div className="flex items-start gap-2 rounded-2xl border border-primary/25 bg-primary/8 px-3.5 py-2.5 text-xs text-muted-foreground">
            <SparklesIcon className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <span>
              {draft.source === 'gemini' ? 'Drafted by Gemini' : 'Drafted from a template (no AI key configured)'} · {draft.rationale}
            </span>
          </div>
          <Field label="Title">
            <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          </Field>
          <Field label="Brief for creators">
            <Textarea rows={5} value={draft.briefMd} onChange={(e) => setDraft({ ...draft, briefMd: e.target.value })} />
          </Field>
          <Field label="Campaign type">
            <select className={select} value={draft.campaignType} onChange={(e) => setDraft({ ...draft, campaignType: e.target.value as Draft['campaignType'] })}>
              <option value="monthly">Monthly package</option>
              <option value="per_post">Per post</option>
              <option value="ugc">UGC delivery</option>
              <option value="per_sale">Per sale</option>
            </select>
          </Field>

          {draft.campaignType === 'per_sale' ? (
            <Field label="Creator earns per confirmed sale (USDC)">
              <Input type="number" min={0.5} step={0.5} value={draft.perSaleUsdc} onChange={(e) => setDraft({ ...draft, perSaleUsdc: Number(e.target.value) })} />
            </Field>
          ) : (
            <div className="space-y-2">
              <Label>Deliverables per creator</Label>
              {draft.slots.map((s, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_1fr_auto] items-center gap-2">
                  <select className={select} value={s.kind} onChange={(e) => updateSlot(i, { kind: e.target.value as Slot['kind'] })}>
                    <option value="post">Post</option>
                    <option value="ugc">UGC video</option>
                  </select>
                  <Input type="number" min={1} value={s.amountUsdc} onChange={(e) => updateSlot(i, { amountUsdc: Number(e.target.value) })} aria-label="USDC" />
                  <Input type="number" min={1} value={s.dueDays} onChange={(e) => updateSlot(i, { dueDays: Number(e.target.value) })} aria-label="Due (days)" />
                  <Button variant="ghost" size="icon" aria-label="Remove" onClick={() => setDraft({ ...draft, slots: draft.slots.filter((_, j) => j !== i) })}>
                    <Trash2Icon />
                  </Button>
                </div>
              ))}
              <div className="grid grid-cols-[1fr_1fr_1fr_auto] gap-2 text-xs text-muted-foreground">
                <span>Type</span>
                <span>Pays (USDC)</span>
                <span>Due (days after start)</span>
              </div>
              {draft.slots.length < 8 && (
                <Button variant="outline" size="sm" onClick={() => setDraft({ ...draft, slots: [...draft.slots, { kind: 'post', amountUsdc: 10, dueDays: (draft.slots.length + 1) * 7 }] })}>
                  <PlusIcon /> Add deliverable
                </Button>
              )}
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <Field label="Max creators">
              <Input type="number" min={1} value={maxCreators} onChange={(e) => setMaxCreators(Number(e.target.value))} />
            </Field>
            <Field label="Runs for (days)">
              <Input type="number" min={1} value={durationDays} onChange={(e) => setDurationDays(Number(e.target.value))} />
            </Field>
            <Field label="Review window" hint="If you don’t respond in time, the creator is paid automatically.">
              <select className={select} value={reviewSecs} onChange={(e) => setReviewSecs(Number(e.target.value))}>
                {REVIEW_OPTIONS.map((o) => (
                  <option key={o.secs} value={o.secs}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Holdback until post stays live (%)">
              <Input type="number" min={0} max={100} value={holdbackPct} onChange={(e) => setHoldbackPct(Number(e.target.value))} />
            </Field>
            <Field label="Ship a product first?" hint="Deadlines start when the creator receives it.">
              <select className={select} value={shipping ? 'yes' : 'no'} onChange={(e) => setShipping(e.target.value === 'yes')}>
                <option value="no">No</option>
                <option value="yes">Yes, I ship to the creator</option>
              </select>
            </Field>
          </div>

          <Field label="Who can join">
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { value: true, title: 'I pick creators', body: 'Creators apply with their niche, audience and samples. You approve each one on-chain.' },
                { value: false, title: 'Anyone with the link', body: 'Creators join straight away, first come first served, until the budget is used.' },
              ].map((o) => (
                <button
                  key={o.title}
                  type="button"
                  onClick={() => setSelective(o.value)}
                  className={`rounded-2xl border p-3.5 text-left transition ${selective === o.value ? 'border-primary/60 bg-primary/10' : 'border-white/8 hover:border-white/16'}`}
                >
                  <div className="text-sm font-semibold">{o.title}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">{o.body}</div>
                </button>
              ))}
            </div>
          </Field>

          <div className="rounded-2xl border border-money/25 bg-money/6 p-4 text-sm">
            {draft.campaignType === 'per_sale' ? (
              <p>
                Each confirmed sale reserves {usdc(draft.perSaleUsdc * (1 + FEE))} ({usdc(draft.perSaleUsdc)} to the creator + 5% Kolab fee). Your {usdc(budget)} budget covers{' '}
                {Math.floor(budget / (draft.perSaleUsdc * (1 + FEE) || 1))} sales.
              </p>
            ) : (
              <p>
                Each creator costs {usdc(perCreatorWithFee)} at most ({usdc(perCreator)} to them + 5% fee, only on what’s released). Your {usdc(budget)} budget covers{' '}
                <strong>{fundable ?? 0}</strong> creator{fundable === 1 ? '' : 's'}. Missed or removed work is refunded with no fee.
              </p>
            )}
            {spotsShort && (
              <div className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p>
                  You set {maxCreators} spots, but the budget covers {fundable}. Creators who join after the money runs out would be turned away.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" onClick={() => setBudget(budgetForSpots)}>
                    Raise budget to {usdc(budgetForSpots)}
                  </Button>
                  {fundable! > 0 && (
                    <Button variant="outline" size="sm" onClick={() => setMaxCreators(fundable!)}>
                      Lower spots to {fundable}
                    </Button>
                  )}
                </div>
              </div>
            )}
            {funding === 'wallet' && walletShort && (
              <p className="mt-2 text-muted-foreground">
                Your wallet holds {usdc(walletUsdc ?? 0)}. <Link className="underline" href="/wallet">Get test USDC</Link>, or pay from any chain.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {funding === 'any' ? (
              <Button variant="gradient" size="lg" className="h-11 px-6" disabled={creating !== 'idle' || spotsShort} onClick={() => createAndFund(true)}>
                <GlobeIcon /> {creating === 'saving' ? 'Saving…' : creating === 'signing' ? 'Confirm in your wallet…' : `Create & fund ${usdc(budget)} from any chain`}
              </Button>
            ) : (
              <Button variant="gradient" size="lg" className="h-11 px-6" disabled={creating !== 'idle' || walletShort || spotsShort} onClick={() => createAndFund(false)}>
                {creating === 'saving' ? 'Saving…' : creating === 'signing' ? 'Confirm in your wallet…' : `Create & lock ${usdc(budget)} from wallet`}
              </Button>
            )}
            <button className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setPayWith(funding === 'any' ? 'wallet' : 'any')}>
              {funding === 'any' ? 'Pay from my Kolab wallet instead' : 'Pay from another chain instead'}
            </button>
          </div>
          {funding === 'any' && (
            <p className="text-xs text-muted-foreground">You sign once to create the escrow, then get a deposit address for the chain you pick. Funds arrive in escrow automatically.</p>
          )}
        </section>
      )}
    </div>
  );
}
