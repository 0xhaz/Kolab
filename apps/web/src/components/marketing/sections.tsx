import Link from 'next/link';
import {
  ArrowRightIcon,
  BadgeCheckIcon,
  CameraIcon,
  CheckIcon,
  FileSearchIcon,
  HandCoinsIcon,
  LockIcon,
  PaletteIcon,
  RotateCcwIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TimerIcon,
  WalletIcon,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-glow">{children}</div>;
}

const STEPS: { icon: LucideIcon; title: string; body: string; color: string }[] = [
  { icon: SparklesIcon, title: 'Draft with AI', body: 'Paste your product. Gemini drafts the brief, deliverables and payout schedule.', color: '#8B5CF6' },
  { icon: LockIcon, title: 'Lock the budget', body: 'USDC goes into an on-chain escrow. Creators see the money is there before they start.', color: '#EC4899' },
  { icon: CameraIcon, title: 'Creators post', body: 'They join from the app, use your brand kit, and submit a link or video. Checks run automatically.', color: '#F59E0B' },
  { icon: HandCoinsIcon, title: 'Paid slot by slot', body: 'Approve, or stay quiet and it auto-releases. Missed work is refunded to you, fee-free.', color: '#34D399' },
];

export function HowItWorks() {
  return (
    <section id="how" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <Eyebrow>How it works</Eyebrow>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">From product link to paid post in four steps</h2>
      </div>
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(({ icon: Icon, title, body, color }, i) => (
          <li key={title} className="group relative overflow-hidden rounded-3xl border border-white/8 bg-card p-6 transition duration-300 hover:-translate-y-1 hover:border-white/16">
            <div aria-hidden className="absolute -right-10 -top-10 size-32 rounded-full opacity-20 blur-2xl transition group-hover:opacity-40" style={{ backgroundColor: color }} />
            <div className="mb-8 flex items-center justify-between">
              <span className="grid size-12 place-items-center rounded-2xl" style={{ backgroundColor: `${color}26`, color }}>
                <Icon className="size-5" />
              </span>
              <span className="text-5xl font-bold text-white/6">0{i + 1}</span>
            </div>
            <h3 className="mb-2 text-lg font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const WHY: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: ShieldCheckIcon, title: 'Money held in escrow', body: 'Funds sit in a Solana program, so neither side can walk away with the other’s money.' },
  { icon: TimerIcon, title: 'Silence pays the creator', body: 'If a brand doesn’t review in time, the slot auto-releases and the creator is paid.' },
  { icon: RotateCcwIcon, title: 'Missed work refunds itself', body: 'Late or deleted posts send the money back to the brand automatically, with no fee.' },
  { icon: FileSearchIcon, title: 'Verified delivery', body: 'Posts are checked for author, timing and disclosure; UGC files are fingerprinted on-chain.' },
  { icon: PaletteIcon, title: 'Brand kits built in', body: 'Creators who join get your logo and product shots inside templates that stay on-brand.' },
  { icon: WalletIcon, title: 'No crypto skills needed', body: 'Email sign-in with an embedded wallet. Kolab pays every network fee.' },
];

export function WhyKolab() {
  return (
    <section className="mx-auto max-w-6xl px-4 py-24">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <Eyebrow>Why Kolab</Eyebrow>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">What the escrow guarantees</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {WHY.map(({ icon: Icon, title, body }) => (
          <div key={title} className="rounded-3xl border border-white/8 bg-card p-6 transition hover:border-white/16">
            <span className="mb-5 grid size-11 place-items-center rounded-2xl bg-white/6">
              <Icon className="size-5 text-primary" />
            </span>
            <h3 className="mb-1.5 font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function Pricing() {
  return (
    <section id="pricing" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <Eyebrow>Pricing</Eyebrow>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Pay only for delivered work</h2>
      </div>
      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        <div className="bg-glow relative overflow-hidden rounded-[2rem] p-8 text-white">
          <div aria-hidden className="absolute -right-16 -top-20 size-60 rounded-full bg-white/16" />
          <div className="relative">
            <div className="text-sm font-medium text-white/85">Brands</div>
            <div className="mt-2 text-6xl font-bold tracking-tight">5%</div>
            <div className="mt-1 text-white/85">on money released to creators</div>
            <ul className="mt-8 space-y-2.5 text-sm">
              {['No subscription, no setup fee', 'Refunds are fee-free', 'Network fees on us', 'Fund from any chain: small swap fee shown upfront'].map((p) => (
                <li key={p} className="flex items-center gap-2">
                  <CheckIcon className="size-4" /> {p}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="rounded-[2rem] border border-white/8 bg-card p-8">
          <div className="text-sm font-medium text-muted-foreground">Creators</div>
          <div className="mt-2 text-6xl font-bold tracking-tight text-money">0%</div>
          <div className="mt-1 text-muted-foreground">you keep 100% of your rate</div>
          <ul className="mt-8 space-y-2.5 text-sm">
            {['Paid in USDC, shown in your currency', 'Cash out to any chain, gas on us', 'Holdback released after 7 days live', 'Reputation that’s yours, on-chain'].map((p) => (
              <li key={p} className="flex items-center gap-2">
                <BadgeCheckIcon className="size-4 text-money" /> {p}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-24">
      <div className="bg-glow relative overflow-hidden rounded-[2.5rem] px-8 py-16 text-center text-white">
        <div aria-hidden className="absolute -left-20 -top-24 size-80 rounded-full bg-white/14" />
        <div aria-hidden className="absolute -bottom-32 -right-10 size-96 rounded-full bg-black/12" />
        <div className="relative mx-auto max-w-2xl">
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Your next campaign, paid out fairly</h2>
          <p className="mt-4 text-lg text-white/85">Set it up in minutes. Creators see the money is locked the moment you launch.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" className="h-12 rounded-full bg-white px-7 text-base text-black hover:bg-white/90" nativeButton={false} render={<Link href="/login" />}>
              Start a campaign <ArrowRightIcon />
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
