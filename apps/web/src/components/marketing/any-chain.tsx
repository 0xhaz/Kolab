'use client';

import { motion } from 'motion/react';
import { ArrowDownIcon, ArrowRightIcon, CheckIcon, GlobeIcon, LockIcon, RouteIcon, ShieldCheckIcon, SparklesIcon, StoreIcon, SmartphoneIcon, type LucideIcon } from 'lucide-react';
import { FUNDING_SOURCES } from '@kolab/shared';

const IN = FUNDING_SOURCES.filter((s) => s.chain !== 'sol').slice(0, 6);
const OUT = FUNDING_SOURCES.filter((s) => ['tron', 'bsc', 'ton', 'base', 'btc', 'near'].includes(s.chain));

function ChainPill({ label, color, asset }: { label: string; color: string; asset: string }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-card px-3 py-1.5 text-xs font-medium whitespace-nowrap">
      <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: color }} />
      {asset} <span className="text-muted-foreground">on {label}</span>
    </span>
  );
}

/** Animated flow: any chain → Kolab escrow on Solana → any chain. */
function FlowDiagram() {
  return (
    <div className="relative grid items-center gap-6 rounded-[2rem] border border-white/8 bg-card/60 p-6 md:grid-cols-[1fr_auto_1fr] md:p-8">
      <div className="flex flex-wrap justify-center gap-2 md:flex-col md:items-end">
        {IN.map((s, i) => (
          <motion.div key={s.chain} initial={{ x: -16, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
            <ChainPill label={s.label} color={s.color} asset={s.assets[0]} />
          </motion.div>
        ))}
      </div>

      <div className="flex flex-col items-center gap-3">
        <ArrowRightIcon className="hidden size-5 text-muted-foreground md:block" />
        <ArrowDownIcon className="size-5 text-muted-foreground md:hidden" />
        <div className="bg-glow relative w-56 overflow-hidden rounded-3xl p-5 text-center text-white shadow-[0_24px_60px_-20px_rgb(219_39_119/0.7)]">
          <div aria-hidden className="absolute -right-10 -top-12 size-32 rounded-full bg-white/16" />
          <LockIcon className="relative mx-auto size-6" />
          <div className="relative mt-2 text-sm font-medium text-white/85">Kolab escrow</div>
          <div className="relative text-2xl font-bold">USDC on Solana</div>
          <div className="relative mt-1 text-xs text-white/80">Paid out slot by slot</div>
        </div>
        <ArrowRightIcon className="hidden size-5 text-muted-foreground md:block" />
        <ArrowDownIcon className="size-5 text-muted-foreground md:hidden" />
      </div>

      <div className="flex flex-wrap justify-center gap-2 md:flex-col md:items-start">
        {OUT.map((s, i) => (
          <motion.div key={s.chain} initial={{ x: 16, opacity: 0 }} whileInView={{ x: 0, opacity: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}>
            <ChainPill label={s.label} color={s.color} asset={s.assets[0]} />
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function Side({
  icon: Icon,
  who,
  title,
  body,
  steps,
  quote,
  gradient,
}: {
  icon: LucideIcon;
  who: string;
  title: string;
  body: string;
  steps: string[];
  quote: { send: string; get: string; note: string };
  gradient: string;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden rounded-[2rem] border border-white/8 bg-card p-7">
      <div aria-hidden className="absolute -right-20 -top-20 size-60 rounded-full opacity-25 blur-3xl" style={{ backgroundImage: gradient }} />
      <div className="relative flex flex-1 flex-col">
        <span className="mb-5 grid size-12 place-items-center rounded-2xl text-white" style={{ backgroundImage: gradient }}>
          <Icon className="size-5" />
        </span>
        <div className="text-sm font-medium text-muted-foreground">{who}</div>
        <h3 className="mb-2 text-2xl font-bold tracking-tight">{title}</h3>
        <p className="mb-5 text-sm text-muted-foreground">{body}</p>
        <ol className="mb-6 space-y-2.5">
          {steps.map((s, i) => (
            <li key={s} className="flex items-start gap-3 text-sm">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-white/8 text-[11px] font-semibold">{i + 1}</span>
              {s}
            </li>
          ))}
        </ol>
        <div className="mt-auto rounded-2xl border border-white/8 bg-[#07070B]/70 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] text-muted-foreground">You send</div>
              <div className="font-semibold tabular-nums">{quote.send}</div>
            </div>
            <ArrowRightIcon className="size-4 text-muted-foreground" />
            <div className="text-right">
              <div className="text-[11px] text-muted-foreground">Arrives</div>
              <div className="font-semibold tabular-nums text-money">{quote.get}</div>
            </div>
          </div>
          <div className="mt-2 border-t border-white/6 pt-2 text-[11px] text-muted-foreground">{quote.note}</div>
        </div>
      </div>
    </div>
  );
}

const WHY: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: GlobeIcon, title: '34 chains, one flow', body: 'EVM and non-EVM chains, including Tron, Bitcoin, TON, NEAR, Base and BNB Chain, with no bridge to pick.' },
  { icon: SparklesIcon, title: 'Deposit and execute', body: 'The bridged USDC calls Kolab’s escrow program directly, so funding needs no second step.' },
  { icon: ShieldCheckIcon, title: 'Safe by default', body: 'If a swap can’t complete, funds go back to the refund address. Nothing waits in a Kolab account.' },
  { icon: RouteIcon, title: 'Gas on us', body: 'Kolab sponsors every Solana fee, so creators never need SOL to cash out.' },
];

export function AnyChain() {
  return (
    <section id="any-chain" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24">
      <div className="mx-auto mb-12 max-w-2xl text-center">
        <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3.5 py-1 text-xs font-medium">
          <span aria-hidden className="size-1.5 rounded-full bg-[#A3E635]" />
          Powered by Aurora Intents · NEAR Intents
        </span>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">
          Any chain in. <span className="text-glow">Any chain out.</span>
        </h2>
        <p className="mt-4 text-muted-foreground">
          Sellers pay with what they already hold and creators cash out to what they use. The escrow in between holds USDC on Solana.
        </p>
      </div>

      <FlowDiagram />

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <Side
          icon={StoreIcon}
          who="For sellers · web dashboard"
          title="Fund a campaign from any chain"
          body="Many SEA sellers keep their money in USDT on Tron or BNB Chain. Pick what you have and Kolab gives you a deposit address."
          steps={['Choose the amount and what you’ll pay with', 'Send it to your deposit address', 'Aurora swaps it to USDC and locks it in your campaign’s escrow, in one flow']}
          quote={{ send: '120.90 USDT · Tron', get: '120 USDC in escrow', note: '~1 min · creators see the budget is locked' }}
          gradient="linear-gradient(135deg, #7C3AED, #DB2777)"
        />
        <Side
          icon={SmartphoneIcon}
          who="For creators · app & web"
          title="Cash out to any chain"
          body="Earnings arrive as USDC. Move them to the chain and coin you use every day, straight from the Earnings tab."
          steps={['Pick a chain and asset, paste your address', 'Confirm once in the app (no gas, no seed phrase)', 'Receive USDT, BNB, TON, ETH… at your address']}
          quote={{ send: '200 USDC · Kolab wallet', get: '198.50 USDT · Tron', note: '~1 min · refunded to your wallet if the swap fails' }}
          gradient="linear-gradient(135deg, #DB2777, #F59E0B)"
        />
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {WHY.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-3xl border border-white/8 bg-card p-5">
            <Icon className="mb-3 size-5 text-primary" />
            <h4 className="mb-1 font-semibold">{title}</h4>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-muted-foreground">
        <CheckIcon className="size-3.5 text-money" />
        Cross-chain fee shown upfront in every quote. Refunds and missed-work returns stay fee-free.
      </p>
    </section>
  );
}
