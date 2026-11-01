'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';
import {
  BadgeCheckIcon,
  CameraIcon,
  CheckIcon,
  CircleDollarSignIcon,
  ClipboardCheckIcon,
  CompassIcon,
  FingerprintIcon,
  HandCoinsIcon,
  HourglassIcon,
  LinkIcon,
  LockIcon,
  MailIcon,
  PackageIcon,
  PaletteIcon,
  SendIcon,
  SmartphoneIcon,
  SparklesIcon,
  StoreIcon,
  TrophyIcon,
  type LucideIcon,
} from 'lucide-react';
import { Avatar, Chip, tone } from '@/components/dashboard';

const SELLER = 'linear-gradient(135deg, #7C3AED, #DB2777)';
const CREATOR = 'linear-gradient(135deg, #DB2777, #F59E0B)';

// ------------------------------------------------------------------ tiny previews (CSS only)

function Mini({ children }: { children: ReactNode }) {
  return <div className="space-y-2 rounded-2xl border border-white/8 bg-[#07070B]/70 p-3 text-xs">{children}</div>;
}

function Row({ left, right }: { left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{left}</span>
      <span className="font-semibold tabular-nums">{right}</span>
    </div>
  );
}

const previews = {
  brief: (
    <Mini>
      <div className="flex items-center gap-1.5 text-primary">
        <SparklesIcon className="size-3" /> Drafted by Gemini
      </div>
      <div className="font-semibold">Glow Lab Vitamin C: 30-day glow-up</div>
      <div className="flex flex-wrap gap-1">
        <Chip label="4 posts" color={tone.primary} />
        <Chip label="1 UGC video" color={tone.accent} />
        <Chip label="Free product" color={tone.warning} />
      </div>
    </Mini>
  ),
  lock: (
    <Mini>
      <Row left="Budget" right="340 USDC" />
      <Row left="Covers" right="6 creators" />
      <div className="flex items-center gap-1.5 rounded-xl bg-money/10 px-2 py-1.5 font-medium text-money">
        <LockIcon className="size-3" /> Locked in escrow · 1 signature, no SOL
      </div>
      <div className="flex flex-wrap gap-1">
        <Chip label="USDT · Tron" color={tone.danger} />
        <Chip label="ETH · Base" color={tone.info} />
        <Chip label="+ 30 chains" color={tone.muted} />
      </div>
    </Mini>
  ),
  kit: (
    <Mini>
      <div className="flex gap-1.5">
        <div className="grid size-10 place-items-center rounded-lg bg-white text-[10px] font-bold text-violet-700">GL</div>
        <div className="size-10 rounded-lg" style={{ backgroundImage: 'linear-gradient(135deg,#F97316,#FBBF24)' }} />
        <div className="size-10 rounded-lg" style={{ backgroundImage: 'linear-gradient(135deg,#7C3AED,#EC4899)' }} />
        <div className="ml-auto flex flex-col justify-center gap-1">
          <span className="size-3 rounded-full bg-[#F97316]" />
          <span className="size-3 rounded-full bg-[#7C3AED]" />
        </div>
      </div>
      <Chip label="Brand kit ready" color={tone.money} icon={BadgeCheckIcon} />
    </Mini>
  ),
  ship: (
    <Mini>
      <div className="flex items-center gap-2">
        <Avatar name="Aisyah Rahman" size={24} />
        <span className="font-medium">Aisyah joined</span>
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <PackageIcon className="size-3" /> J&amp;T · JT1234567890
      </div>
      <Chip label="Deadlines start on receipt" color={tone.sky} />
    </Mini>
  ),
  review: (
    <Mini>
      {['Post is public', 'Posted by this creator', '#ad disclosure'].map((c) => (
        <div key={c} className="flex items-center gap-1.5">
          <CheckIcon className="size-3 text-money" /> {c}
        </div>
      ))}
      <Chip label="Auto-pays in 71h" color={tone.warning} icon={HourglassIcon} />
    </Mini>
  ),
  settle: (
    <Mini>
      <Row left="Paid for delivered work" right={<span className="text-money">210 USDC</span>} />
      <Row left="Missed slot · refunded" right="+42 USDC" />
      <Row left="Kolab fee (5%)" right="10.5 USDC" />
    </Mini>
  ),
  discover: (
    <Mini>
      <div className="h-12 rounded-xl" style={{ backgroundImage: 'linear-gradient(135deg,#7C3AED,#EC4899)' }} />
      <div className="flex items-center justify-between">
        <span className="font-semibold">Glow Lab</span>
        <span className="font-bold text-money">200 USDC</span>
      </div>
      <div className="flex gap-1">
        <Chip label="Money locked" color={tone.money} icon={LockIcon} />
        <Chip label="Kit ready" color={tone.money} icon={BadgeCheckIcon} />
      </div>
    </Mini>
  ),
  join: (
    <Mini>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <MailIcon className="size-3" /> aisyah@email.com
      </div>
      <div className="rounded-xl bg-white/6 px-2 py-1.5 font-mono tracking-[0.4em]">4 8 1 9 2 6</div>
      <div className="text-muted-foreground">Wallet created · no seed phrase</div>
    </Mini>
  ),
  create: (
    <Mini>
      <div className="flex gap-1.5">
        {['Story', 'Post', 'Review', 'Voucher'].map((t, i) => (
          <div
            key={t}
            className="grid h-14 flex-1 place-items-end rounded-lg p-1 text-[9px] font-semibold text-white"
            style={{ backgroundImage: `linear-gradient(160deg, ${['#7C3AED', '#0EA5E9', '#F97316', '#10B981'][i]}, #DB2777)` }}
          >
            {t}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground">“Day 7 with @glowlab… #ad #GlowLab”</div>
    </Mini>
  ),
  submit: (
    <Mini>
      <div className="flex items-center gap-1.5">
        <LinkIcon className="size-3 text-primary" /> tiktok.com/@aisyah/video/…
      </div>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <FingerprintIcon className="size-3" /> Video fingerprint saved on-chain
      </div>
      <Chip label="In review" color={tone.info} icon={HourglassIcon} />
    </Mini>
  ),
  paid: (
    <Mini>
      <Row left="On approval (70%)" right={<span className="text-money">+28 USDC</span>} />
      <Row left="After 7 days live (30%)" right={<span className="text-money">+12 USDC</span>} />
      <div className="text-muted-foreground">No reply in 72h? Paid automatically.</div>
    </Mini>
  ),
  rep: (
    <Mini>
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground">On time</span>
        <span className="font-bold">96%</span>
      </div>
      <Row left="Cash out 200 USDC" right={<span className="text-money">198.50 USDT · Tron</span>} />
      <Chip label="Reliable" color={tone.money} icon={TrophyIcon} />
    </Mini>
  ),
} satisfies Record<string, ReactNode>;

// ------------------------------------------------------------------ journey

interface Step {
  icon: LucideIcon;
  title: string;
  body: string;
  preview: ReactNode;
}

const SELLER_STEPS: Step[] = [
  { icon: SparklesIcon, title: 'Draft from a product link', body: 'Paste your listing. AI writes the brief, picks the deliverables and works out how many creators your budget covers.', preview: previews.brief },
  { icon: LockIcon, title: 'Lock the budget in escrow', body: 'Pay from your Kolab wallet, or from any chain: USDT on Tron, ETH on Base, BTC. It lands as USDC in a Solana escrow creators can check.', preview: previews.lock },
  { icon: PaletteIcon, title: 'Upload your brand kit', body: 'Logo, product photos, colours and notes. Creators see a “Brand kit ready” badge, and the files unlock once they join.', preview: previews.kit },
  { icon: PackageIcon, title: 'Share the link, ship the product', body: 'Send the join link on WhatsApp or Telegram. If there’s a free product, add tracking; deadlines start when it arrives.', preview: previews.ship },
  { icon: ClipboardCheckIcon, title: 'Review with checks done for you', body: 'Each post is checked for author, timing and #ad disclosure. Approve or request changes within 72 hours.', preview: previews.review },
  { icon: CircleDollarSignIcon, title: 'Pay only for what’s delivered', body: 'Missed slots refund themselves. Deleted posts return the holdback. The 5% fee applies only to money released.', preview: previews.settle },
];

const CREATOR_STEPS: Step[] = [
  { icon: CompassIcon, title: 'Discover paid campaigns', body: 'Every card shows the rate, the deliverables and that the money is already locked, so there’s nothing to invoice.', preview: previews.discover },
  { icon: SmartphoneIcon, title: 'Join with just your email', body: 'Sign in with a code. Kolab creates your wallet and pays every network fee. Add an address if there’s a free product.', preview: previews.join },
  { icon: CameraIcon, title: 'Create with the brand kit', body: 'Story, post, review and voucher templates use the brand’s logo and photos. Captions come with the right hashtags and #ad.', preview: previews.create },
  { icon: SendIcon, title: 'Post, then submit', body: 'Share to TikTok or Instagram and paste the link, or upload a UGC video. Its fingerprint is saved on-chain.', preview: previews.submit },
  { icon: HandCoinsIcon, title: 'Get paid, even if they go quiet', body: '70% lands when the brand approves, or automatically after 72 hours. The other 30% follows once the post has stayed live 7 days.', preview: previews.paid },
  { icon: TrophyIcon, title: 'Cash out your way', body: 'Keep USDC, or cash out to USDT on Tron, BNB, TON and more from the Earnings tab. Your on-time record builds as you go.', preview: previews.rep },
];

function Journey({
  id,
  icon: Icon,
  audience,
  title,
  summary,
  gradient,
  steps,
}: {
  id: string;
  icon: LucideIcon;
  audience: string;
  title: string;
  summary: string;
  gradient: string;
  steps: Step[];
}) {
  return (
    <section id={id} className="relative mx-auto max-w-6xl scroll-mt-28 px-4 py-20">
      <div aria-hidden className="absolute -top-10 left-1/2 -z-10 h-72 w-[70%] -translate-x-1/2 rounded-full opacity-20 blur-[100px]" style={{ backgroundImage: gradient }} />
      <div className="mb-12 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 py-1 pl-1 pr-3.5 text-xs font-medium">
            <span className="grid size-6 place-items-center rounded-full text-white" style={{ backgroundImage: gradient }}>
              <Icon className="size-3.5" />
            </span>
            {audience}
          </span>
          <h2 className="text-4xl font-bold tracking-tight md:text-5xl">{title}</h2>
        </div>
        <p className="max-w-sm text-muted-foreground">{summary}</p>
      </div>
      <ol className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {steps.map(({ icon: StepIcon, title: t, body, preview }, i) => (
          <motion.li
            key={t}
            initial={{ y: 24, opacity: 0 }}
            whileInView={{ y: 0, opacity: 1 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ type: 'spring', stiffness: 200, damping: 30, delay: (i % 3) * 0.08 }}
            className="group flex flex-col gap-4 rounded-3xl border border-white/8 bg-card p-5 transition duration-300 hover:-translate-y-1 hover:border-white/16"
          >
            <div className="flex items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-2xl text-white" style={{ backgroundImage: gradient }}>
                <StepIcon className="size-[18px]" />
              </span>
              <span className="text-xs font-semibold tracking-widest text-muted-foreground">STEP {i + 1}</span>
            </div>
            <div>
              <h3 className="mb-1.5 text-lg font-semibold">{t}</h3>
              <p className="text-sm text-muted-foreground">{body}</p>
            </div>
            <div className="mt-auto">{preview}</div>
          </motion.li>
        ))}
      </ol>
    </section>
  );
}

export function SellerJourney() {
  return (
    <Journey
      id="sellers"
      icon={StoreIcon}
      audience="For sellers · web dashboard"
      title="Launch a creator campaign in minutes"
      summary="Built for Shopee, TikTok Shop and Lazada sellers who want posts that actually go up, and a refund when they don’t."
      gradient={SELLER}
      steps={SELLER_STEPS}
    />
  );
}

export function CreatorJourney() {
  return (
    <Journey
      id="creators"
      icon={SmartphoneIcon}
      audience="For creators · mobile app & web"
      title="From joining a campaign to getting paid"
      summary="Made for micro-creators across Malaysia, Indonesia, the Philippines and Thailand. Keep 100% of your rate."
      gradient={CREATOR}
      steps={CREATOR_STEPS}
    />
  );
}
