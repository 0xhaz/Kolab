'use client';

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowUpRightIcon, CheckIcon, CircleDashedIcon, ExternalLinkIcon, FlaskConicalIcon, LoaderCircleIcon, XCircleIcon } from 'lucide-react';
import { CASHOUT_DESTINATIONS, isValidAddress, type CashoutDto, type CashoutQuoteDto, type CashoutStatus, type FundingChain } from '@kolab/shared';
import { Chip, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { errorMessage } from '@/lib/errors';
import { usdc } from '@/lib/format';
import { keys } from '@/lib/queries';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';
import { cn } from '@/lib/utils';

const STEPS: { status: CashoutStatus; label: string }[] = [
  { status: 'awaiting_signature', label: 'Confirm in your wallet' },
  { status: 'deposit_sent', label: 'USDC sent to Aurora Intents' },
  { status: 'swapping', label: 'Swapping' },
  { status: 'completed', label: 'Delivered to your address' },
];
const TERMINAL = ['completed', 'refunded', 'failed', 'expired'];
const chainOf = (chain: FundingChain) => CASHOUT_DESTINATIONS.find((d) => d.chain === chain)!;

function Progress({ id, onDone }: { id: string; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: o } = useQuery({
    queryKey: ['cashout', id],
    queryFn: () => api<CashoutDto>(`/cashouts/${id}`),
    refetchInterval: (q) => (q.state.data && TERMINAL.includes(q.state.data.status) ? false : 2500),
  });
  useEffect(() => {
    if (o?.status === 'completed') void qc.invalidateQueries({ queryKey: keys.balance });
  }, [o?.status, qc]);
  if (!o) return null;
  const at = STEPS.findIndex((s) => s.status === o.status);
  const done = o.status === 'completed';
  const failed = ['refunded', 'failed', 'expired'].includes(o.status);
  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs text-muted-foreground">
          {usdc(o.amountIn)} → {chainOf(o.destChain).label}
        </div>
        <div className="text-2xl font-bold text-money tabular-nums">
          {o.amountOut} {o.destAsset}
        </div>
        <div className="truncate font-mono text-xs text-muted-foreground">{o.recipient}</div>
      </div>
      <ol className="space-y-2.5">
        {STEPS.map((s, i) => {
          const isDone = at > i || done;
          const isNow = at === i && !done && !failed;
          return (
            <li key={s.status} className="flex items-center gap-2.5 text-sm">
              <span className={cn('grid size-6 place-items-center rounded-full border-2', isDone ? 'border-money text-money' : isNow ? 'border-primary text-primary' : 'border-white/12 text-muted-foreground')}>
                {isDone ? <CheckIcon className="size-3" /> : isNow ? <LoaderCircleIcon className="size-3 animate-spin" /> : <CircleDashedIcon className="size-3" />}
              </span>
              <span className={cn(!isDone && !isNow && 'text-muted-foreground')}>{s.label}</span>
            </li>
          );
        })}
      </ol>
      {failed && (
        <p className="flex items-start gap-2 text-sm text-red-300">
          <XCircleIcon className="mt-0.5 size-4 shrink-0" />
          {o.status === 'refunded' ? 'The swap couldn’t complete; your USDC was refunded to your wallet.' : (o.failureReason ?? 'Cash-out did not complete.')}
        </p>
      )}
      {o.relayTx && (
        <a className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground" href={`https://solscan.io/tx/${o.relayTx}`} target="_blank" rel="noreferrer">
          Relay’s mainnet USDC into Aurora <ExternalLinkIcon className="size-3" />
        </a>
      )}
      {done && (
        <div className="flex gap-2">
          {o.destinationExplorerUrl && (
            <Button variant="glass" className="h-10 px-4" nativeButton={false} render={<a href={o.destinationExplorerUrl} target="_blank" rel="noreferrer" />}>
              Explorer <ExternalLinkIcon />
            </Button>
          )}
          <Button variant="gradient" className="h-10 px-5" onClick={onDone}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}

/** Move USDC from the Kolab wallet to any chain/asset (Aurora Intents Swap API). */
export function CashoutDialog({ open, onOpenChange, availableUsdc }: { open: boolean; onOpenChange: (open: boolean) => void; availableUsdc: number }) {
  const send = useSponsoredTx();
  const [amount, setAmount] = useState(0);
  const [chain, setChain] = useState<FundingChain>('tron');
  const [asset, setAsset] = useState('USDT');
  const [recipient, setRecipient] = useState('');
  const [quote, setQuote] = useState<CashoutQuoteDto | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [id, setId] = useState<string | null>(null);
  const addressOk = isValidAddress(chain, recipient);
  const amountOk = amount >= 1 && amount <= availableUsdc;

  useEffect(() => {
    if (!open || id || !amountOk || !addressOk) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<CashoutQuoteDto>('/cashouts/quote', { method: 'POST', body: JSON.stringify({ amountUsdc: amount, destChain: chain, destAsset: asset, recipient: recipient.trim() }) })
        .then((q) => !cancelled && setQuote(q))
        .catch(() => !cancelled && setQuote(null));
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, id, amount, chain, asset, recipient, amountOk, addressOk]);

  async function start() {
    try {
      setStage('Getting a fresh quote…');
      const o = await api<CashoutDto>('/cashouts', { method: 'POST', body: JSON.stringify({ amountUsdc: amount, destChain: chain, destAsset: asset, recipient: recipient.trim() }) });
      setStage('Confirm in your wallet…');
      const tx = await send(`/cashouts/${o.id}/tx`, {});
      await api(`/cashouts/${o.id}/sent`, { method: 'POST', body: JSON.stringify({ signature: tx.signature }) });
      setId(o.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStage(null);
    }
  }

  function close(next: boolean) {
    onOpenChange(next);
    if (!next) {
      setId(null);
      setQuote(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-glow grid size-8 place-items-center rounded-xl text-white">
              <ArrowUpRightIcon className="size-4" />
            </span>
            Move funds to any chain
          </DialogTitle>
          <p className="text-sm text-muted-foreground">Send USDC from your Kolab wallet as USDT on Tron, ETH on Base, BTC and more. Kolab pays the Solana fee.</p>
        </DialogHeader>
        {id ? (
          <Progress id={id} onDone={() => close(false)} />
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label>Amount (USDC)</Label>
                <button className="text-xs font-medium text-accent" onClick={() => setAmount(Math.floor(availableUsdc * 100) / 100)}>
                  Max {usdc(availableUsdc)}
                </button>
              </div>
              <Input type="number" min={1} value={amount || ''} onChange={(e) => setAmount(Number(e.target.value))} placeholder="0.00" />
            </div>
            <div className="space-y-2">
              <Label>Receive on</Label>
              <div className="grid grid-cols-3 gap-2">
                {CASHOUT_DESTINATIONS.map((d) => (
                  <button
                    key={d.chain}
                    onClick={() => {
                      setChain(d.chain);
                      setAsset(d.assets[0]);
                    }}
                    className={cn('flex items-center gap-2 rounded-xl border px-2.5 py-2 text-left text-sm transition', chain === d.chain ? 'border-primary/60 bg-primary/10' : 'border-white/8 hover:border-white/16')}
                  >
                    <span aria-hidden className="size-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="truncate font-medium">{d.label}</span>
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {chainOf(chain).assets.map((a) => (
                  <button key={a} onClick={() => setAsset(a)} className={cn('rounded-full border px-3 py-1 text-xs font-semibold', asset === a ? 'border-accent bg-accent/15 text-accent' : 'border-white/10 text-muted-foreground')}>
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Your {chainOf(chain).label} address</Label>
              <Input value={recipient} onChange={(e) => setRecipient(e.target.value)} className="font-mono text-xs" />
              {recipient.length > 6 && !addressOk && <p className="text-xs text-red-300">That doesn’t look like a {chainOf(chain).label} address.</p>}
            </div>
            {quote && amountOk && addressOk && (
              <div className="rounded-2xl border border-white/8 bg-popover p-4">
                <div className="text-xs text-muted-foreground">You receive about</div>
                <div className="text-xl font-bold text-money tabular-nums">
                  {quote.amountOut} {quote.destAsset}
                </div>
                <div className="text-xs text-muted-foreground">
                  ≈ ${quote.amountOutUsd.toFixed(2)} · includes {quote.appFeeBps / 100}% fee · powered by Aurora Intents
                </div>
                {quote.mode === 'simulated' && <Chip label="Devnet: swap simulated, USDC transfer real" color={tone.warning} icon={FlaskConicalIcon} className="mt-2" />}
                {quote.mode === 'hybrid' && (
                  <p className="mt-2 text-xs text-emerald-200">
                    Live Aurora payout: your devnet USDC goes in, and Kolab’s mainnet relay pays the same amount into a real Aurora swap to this address.
                  </p>
                )}
              </div>
            )}
            <Button variant="gradient" size="lg" className="h-11 w-full" disabled={!quote || !amountOk || !addressOk || !!stage} onClick={start}>
              {stage ?? `Send ${amount > 0 ? usdc(amount) : ''}`}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
