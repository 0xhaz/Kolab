'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { toast } from 'sonner';
import {
  ArrowDownIcon,
  CheckCircle2Icon,
  CheckIcon,
  CircleDashedIcon,
  CopyIcon,
  ExternalLinkIcon,
  FlaskConicalIcon,
  GlobeIcon,
  LoaderCircleIcon,
  LockIcon,
  RefreshCwIcon,
  XCircleIcon,
} from 'lucide-react';
import { FUNDING_SOURCES, isValidAddress, type CampaignDto, type FundingChain, type FundingDto, type FundingQuoteDto, type FundingStatus } from '@kolab/shared';
import { Chip, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { explorerTx, usdc } from '@/lib/format';
import { keys, useFunding, useFundingConfig } from '@/lib/queries';
import { cn } from '@/lib/utils';

const STEPS: { status: FundingStatus; label: string; sub: string }[] = [
  { status: 'awaiting_deposit', label: 'Waiting for your deposit', sub: 'Send the exact amount to the address above' },
  { status: 'deposit_detected', label: 'Deposit detected', sub: 'Confirmed on the source chain' },
  { status: 'swapping', label: 'Swapping to USDC on Solana', sub: 'Routed by Aurora Intents (NEAR Intents)' },
  { status: 'funding_escrow', label: 'Locking in campaign escrow', sub: 'top_up_campaign on Solana' },
  { status: 'completed', label: 'Funded', sub: 'Creators can see the money is there' },
];
const ORDER = STEPS.map((s) => s.status);

const eta = (secs: number) => (secs < 90 ? `~${secs}s` : `~${Math.round(secs / 60)} min`);
const chainOf = (chain: FundingChain) => FUNDING_SOURCES.find((s) => s.chain === chain)!;

/** Hybrid PoC: Aurora delivers to Kolab's mainnet relay, which credits the devnet escrow. */
const HYBRID_SUB: Partial<Record<FundingStatus, string>> = {
  swapping: 'Aurora swaps into USDC on Solana mainnet, delivered to Kolab’s relay',
  funding_escrow: 'The relay credits the same USDC to this escrow on devnet',
};

function Timeline({ status, hybrid }: { status: FundingStatus; hybrid?: boolean }) {
  const failed = status === 'failed' || status === 'refunded' || status === 'expired';
  const at = failed ? -1 : ORDER.indexOf(status);
  return (
    <ol className="space-y-0">
      {STEPS.map((s, i) => {
        const done = at > i || status === 'completed';
        const now = at === i && status !== 'completed';
        return (
          <li key={s.status} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className={cn(
                  'grid size-7 shrink-0 place-items-center rounded-full border-2',
                  done ? 'border-money bg-money/15 text-money' : now ? 'border-primary bg-primary/15 text-primary' : 'border-white/12 text-muted-foreground',
                )}
              >
                {done ? <CheckIcon className="size-3.5" /> : now ? <LoaderCircleIcon className="size-3.5 animate-spin" /> : <CircleDashedIcon className="size-3.5" />}
              </span>
              {i < STEPS.length - 1 && <span className={cn('my-0.5 w-0.5 flex-1', done ? 'bg-money/50' : 'bg-white/10')} />}
            </div>
            <div className="pb-4">
              <div className={cn('text-sm font-semibold', !done && !now && 'text-muted-foreground')}>{s.label}</div>
              <div className="text-xs text-muted-foreground">{(hybrid && HYBRID_SUB[s.status]) || s.sub}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function DepositStage({ id, onDone }: { id: string; onDone: () => void }) {
  const { data: f } = useFunding(id);
  const config = useFundingConfig();
  const qc = useQueryClient();
  const [qr, setQr] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);

  useEffect(() => {
    if (!f) return;
    void QRCode.toDataURL(f.depositAddress, { margin: 1, width: 360, color: { dark: '#07070B', light: '#FFFFFF' } }).then(setQr);
  }, [f?.depositAddress, f]);

  useEffect(() => {
    if (f?.status === 'completed') {
      void qc.invalidateQueries();
      toast.success(`${usdc(f.amountOut)} locked in escrow from ${chainOf(f.sourceChain).label}`);
    }
  }, [f?.status, f, qc]);

  if (!f) return <p className="text-sm text-muted-foreground">Preparing deposit address…</p>;
  const src = chainOf(f.sourceChain);
  const failed = f.status === 'failed' || f.status === 'refunded' || f.status === 'expired';

  async function simulate() {
    setSimulating(true);
    try {
      await api(`/funding/${id}/simulate-deposit`, { method: 'POST' });
      await qc.invalidateQueries({ queryKey: keys.funding(id) });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSimulating(false);
    }
  }

  return (
    <div className="grid gap-5 sm:grid-cols-[200px_1fr]">
      <div className="space-y-3">
        <div className="rounded-2xl bg-white p-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element -- generated data URL */}
          {qr ? <img src={qr} alt={`Deposit address on ${src.label}`} className="w-full" /> : <div className="aspect-square" />}
        </div>
        {f.mode === 'simulated' && (
          <Chip label="Devnet simulation" color={tone.warning} icon={FlaskConicalIcon} className="w-full justify-center" />
        )}
        {f.mode === 'hybrid' && <Chip label="Live Aurora · mainnet" color={tone.money} icon={GlobeIcon} className="w-full justify-center" />}
      </div>
      <div className="min-w-0 space-y-4">
        <div>
          <div className="text-xs text-muted-foreground">Send exactly</div>
          <div className="text-2xl font-bold tabular-nums">
            {f.amountIn} {f.sourceAsset}
          </div>
          <div className="text-xs text-muted-foreground">
            on <span className="font-medium" style={{ color: src.color }}>{src.label}</span> · ≈ ${f.amountInUsd.toFixed(2)} · {eta(f.estimatedSecs)}
          </div>
        </div>
        <button
          className="flex w-full items-center gap-2 rounded-xl border border-white/10 bg-popover px-3 py-2.5 text-left font-mono text-xs transition hover:border-white/20"
          onClick={() => {
            void navigator.clipboard.writeText(f.depositAddress);
            toast('Deposit address copied');
          }}
        >
          <span className="min-w-0 flex-1 break-all">{f.depositAddress}</span>
          <CopyIcon className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
        {f.depositMemo && (
          <p className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-amber-200">
            Include memo <span className="font-mono font-semibold">{f.depositMemo}</span> or the deposit won’t settle.
          </p>
        )}
        {f.mode === 'hybrid' && f.status === 'awaiting_deposit' && (
          <p className="rounded-xl border border-emerald-400/25 bg-emerald-400/8 px-3 py-2 text-xs text-emerald-200">
            This is a real Aurora deposit address on {src.label} mainnet. Send real funds from your own wallet; Aurora refunds {f.refundAddress ?? 'your refund address'} if
            the swap can’t complete.
          </p>
        )}
        <Timeline status={f.status} hybrid={f.mode === 'hybrid'} />
        {(f.originTxUrl || f.bridgeTxUrl) && (
          <div className="flex flex-wrap gap-2">
            {f.originTxUrl && (
              <Button variant="glass" size="sm" nativeButton={false} render={<a href={f.originTxUrl} target="_blank" rel="noreferrer" />}>
                Your {src.label} deposit <ExternalLinkIcon />
              </Button>
            )}
            {f.bridgeTxUrl && (
              <Button variant="glass" size="sm" nativeButton={false} render={<a href={f.bridgeTxUrl} target="_blank" rel="noreferrer" />}>
                Aurora delivery on Solana <ExternalLinkIcon />
              </Button>
            )}
          </div>
        )}
        {failed && (
          <p className="flex items-start gap-2 rounded-xl border border-red-400/25 bg-red-400/8 px-3 py-2 text-sm text-red-300">
            <XCircleIcon className="mt-0.5 size-4 shrink-0" />
            {f.status === 'expired'
              ? 'No deposit arrived before the quote expired. Start a new one.'
              : f.status === 'refunded'
                ? `Aurora couldn’t complete the swap and refunded ${f.refundAddress ?? 'your refund address'}.`
                : (f.failureReason ?? 'Funding failed.')}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {f.status === 'awaiting_deposit' && config.data?.simulateDeposits && (
            <Button variant="glass" className="h-10 px-4" disabled={simulating} onClick={simulate}>
              <FlaskConicalIcon /> {simulating ? 'Sending…' : `Simulate the ${f.sourceAsset} deposit`}
            </Button>
          )}
          {f.status === 'completed' && (
            <>
              {f.escrowTx && (
                <Button variant="glass" className="h-10 px-4" nativeButton={false} render={<a href={explorerTx(f.escrowTx)} target="_blank" rel="noreferrer" />}>
                  {f.mode === 'hybrid' ? 'Escrow tx (devnet)' : 'Escrow tx'} <ExternalLinkIcon />
                </Button>
              )}
              <Button variant="gradient" className="h-10 px-5" onClick={onDone}>
                <CheckCircle2Icon /> Done
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * "Fund from any chain": pay with USDT on Tron, ETH on Base, BTC… and it lands as USDC in this
 * campaign's escrow on Solana. Aurora Intents on mainnet; simulated on devnet.
 */
export function FundAnyChainDialog({
  campaign,
  open,
  onOpenChange,
}: {
  campaign: CampaignDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const config = useFundingConfig();
  const remaining = Math.max(0, (Number(campaign.budget) - Number(campaign.totalFunded)) / 1e6);
  const [amount, setAmount] = useState(remaining > 0 ? remaining : 50);
  const [chain, setChain] = useState<FundingChain>('tron');
  const [asset, setAsset] = useState('USDT');
  const [refund, setRefund] = useState('');
  const [quote, setQuote] = useState<FundingQuoteDto | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [fundingId, setFundingId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const mode = config.data?.mode ?? 'simulated';
  const live = mode !== 'simulated';
  const hybrid = mode === 'hybrid';
  const maxUsdc = config.data?.maxUsdc;
  const overCap = hybrid && maxUsdc !== undefined && amount > maxUsdc;
  // Live quotes need a refund address on the paying chain (Aurora refunds there).
  const refundOk = !live || isValidAddress(chain, refund);
  const shownQuote = refundOk && !overCap ? quote : null;

  useEffect(() => {
    if (!open || fundingId || amount <= 0 || !refundOk || overCap) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setQuoting(true);
      api<FundingQuoteDto>(`/campaigns/${campaign.id}/funding/quote`, {
        method: 'POST',
        body: JSON.stringify({ amountUsdc: amount, sourceChain: chain, sourceAsset: asset, refundAddress: refund || undefined }),
      })
        .then((q) => !cancelled && setQuote(q))
        .catch(() => !cancelled && setQuote(null))
        .finally(() => !cancelled && setQuoting(false));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, fundingId, amount, chain, asset, refund, campaign.id, refundOk, overCap]);

  async function start() {
    setBusy(true);
    try {
      const f = await api<FundingDto>(`/campaigns/${campaign.id}/funding`, {
        method: 'POST',
        body: JSON.stringify({ amountUsdc: amount, sourceChain: chain, sourceAsset: asset, refundAddress: refund || undefined }),
      });
      setFundingId(f.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setFundingId(null);
      setQuote(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-glow grid size-8 place-items-center rounded-xl text-white">
              <GlobeIcon className="size-4" />
            </span>
            Fund from any chain
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            Pay with what you already hold. It arrives as USDC in <span className="text-foreground">{campaign.title}</span>’s escrow on Solana, in one flow.
          </p>
        </DialogHeader>

        {fundingId ? (
          <DepositStage id={fundingId} onDone={() => close(false)} />
        ) : (
          <div className="space-y-5">
            <div className="space-y-1.5">
              <Label>Amount to lock in escrow (USDC)</Label>
              <Input type="number" min={1} value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              {remaining > 0 && <p className="text-xs text-muted-foreground">{usdc(remaining)} of the budget isn’t funded yet.</p>}
              {hybrid && maxUsdc !== undefined && (
                <p className={cn('text-xs', overCap ? 'text-red-300' : 'text-muted-foreground')}>Live Aurora demo: up to {usdc(maxUsdc)} per deposit, paid with real funds.</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Pay with</Label>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                {FUNDING_SOURCES.map((s) => (
                  <button
                    key={s.chain}
                    onClick={() => {
                      setChain(s.chain);
                      setAsset(s.assets[0]);
                    }}
                    className={cn(
                      'flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition',
                      chain === s.chain ? 'border-primary/60 bg-primary/10' : 'border-white/8 hover:border-white/16',
                    )}
                  >
                    <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="truncate font-medium">{s.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {chainOf(chain).assets.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAsset(a)}
                    className={cn('rounded-full border px-3 py-1 text-xs font-semibold transition', asset === a ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-muted-foreground hover:text-foreground')}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>
                Refund address on {chainOf(chain).label} {live ? '' : <span className="text-muted-foreground">(optional on devnet)</span>}
              </Label>
              <Input value={refund} onChange={(e) => setRefund(e.target.value)} placeholder="Where Aurora returns funds if the swap can’t complete" className="font-mono text-xs" />
              {live && refund.length > 6 && !refundOk && <p className="text-xs text-red-300">That doesn’t look like a {chainOf(chain).label} address.</p>}
            </div>

            <div className="rounded-2xl border border-white/8 bg-popover p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">You send</div>
                  <div className="text-xl font-bold tabular-nums">
                    {shownQuote ? `${shownQuote.amountIn} ${asset}` : '—'}
                    {quoting && <RefreshCwIcon className="ml-2 inline size-3.5 animate-spin text-muted-foreground" />}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {shownQuote ? `≈ $${shownQuote.amountInUsd.toFixed(2)} on ${chainOf(chain).label}` : !refundOk ? 'Add a refund address for a live quote' : 'Getting a quote…'}
                  </div>
                </div>
                <ArrowDownIcon className="size-4 -rotate-90 text-muted-foreground" />
                <div className="text-right">
                  <div className="text-xs text-muted-foreground">Lands in escrow</div>
                  <div className="text-xl font-bold tabular-nums text-money">{usdc(amount)}</div>
                  <div className="text-xs text-muted-foreground">{shownQuote ? eta(shownQuote.estimatedSecs) : ''}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-white/6 pt-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <LockIcon className="size-3" /> Lands straight in escrow, not your wallet
                </span>
                <span>Includes {(config.data?.appFeeBps ?? 50) / 100}% cross-chain fee</span>
                <span>Powered by Aurora Intents</span>
              </div>
            </div>

            {hybrid && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <GlobeIcon className="mt-0.5 size-3.5 shrink-0 text-emerald-300" />
                Live Aurora Intents swap on mainnet. The USDC is delivered to Kolab’s relay wallet on Solana mainnet, which credits this devnet escrow 1:1. In production
                the relay goes away and Aurora calls the escrow program directly.
              </p>
            )}
            {!live && (
              <p className="flex items-start gap-2 text-xs text-muted-foreground">
                <FlaskConicalIcon className="mt-0.5 size-3.5 shrink-0 text-amber-300" />
                Aurora Intents runs on mainnet. On devnet the deposit address and swap are simulated; the escrow top-up itself is a real devnet transaction.
              </p>
            )}

            <Button variant="gradient" size="lg" className="h-11 w-full" disabled={busy || !shownQuote || amount <= 0 || !refundOk || overCap} onClick={start}>
              {busy ? 'Creating deposit address…' : `Get ${chainOf(chain).label} deposit address`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
