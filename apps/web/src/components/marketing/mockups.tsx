import { BadgeCheckIcon, CheckCircle2Icon, GiftIcon, HourglassIcon, LockIcon, SparklesIcon, VideoIcon } from 'lucide-react';
import { Avatar, Chip, tone } from '@/components/dashboard';

/** A CSS-only phone showing the creator app home screen (no screenshots to keep in sync). */
export function PhoneMockup() {
  return (
    <div className="relative mx-auto w-[300px] rounded-[3rem] border border-white/12 bg-[#07070B] p-3 shadow-[0_40px_120px_-30px_rgb(139_92_246/0.6)]">
      <div className="absolute left-1/2 top-4 z-10 h-6 w-24 -translate-x-1/2 rounded-full bg-black" />
      <div className="space-y-3 overflow-hidden rounded-[2.4rem] bg-[#07070B] px-4 pb-5 pt-12">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[11px] text-[#9C9CB0]">Good evening,</div>
            <div className="text-lg font-bold">Aisyah</div>
          </div>
          <Avatar name="Aisyah Rahman" size={34} ring />
        </div>
        <div className="bg-glow relative overflow-hidden rounded-3xl p-4 text-white">
          <div aria-hidden className="absolute -right-10 -top-14 size-36 rounded-full bg-white/16" />
          <div className="text-[11px] text-white/85">Earned on Kolab</div>
          <div className="text-[28px] font-bold leading-tight tracking-tight">1,240 USDC</div>
          <div className="text-[11px] text-white/80">≈ RM 5,208</div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {[
              ['54', 'Held back'],
              ['12', 'To claim'],
              ['300', 'Still to earn'],
            ].map(([v, l]) => (
              <div key={l} className="rounded-xl bg-black/22 px-2 py-1.5">
                <div className="text-xs font-semibold">{v}</div>
                <div className="text-[9px] text-white/75">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="text-sm font-semibold">Up next</div>
        {[
          { t: 'Post #2', b: 'Glow Lab', a: '40', g: ['#7C3AED', '#EC4899'], st: { label: 'To do', color: tone.muted, icon: SparklesIcon } },
          { t: 'UGC video', b: 'Glow Lab', a: '25', g: ['#10B981', '#0EA5E9'], st: { label: 'In review', color: tone.info, icon: HourglassIcon } },
        ].map((r) => (
          <div key={r.t} className="flex items-center gap-2.5 rounded-2xl border border-white/8 bg-[#111118] p-2.5">
            <div className="grid size-11 shrink-0 place-items-center rounded-xl" style={{ backgroundImage: `linear-gradient(135deg, ${r.g[0]}, ${r.g[1]})` }}>
              <VideoIcon className="size-4 text-white/90" />
            </div>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="text-xs font-semibold">{r.t}</div>
              <Chip label={r.st.label} color={r.st.color} icon={r.st.icon} className="px-1.5 text-[10px]" />
            </div>
            <div className="text-sm font-bold text-money">{r.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Small dashboard card: what the brand sees on the web. */
export function EscrowCard() {
  return (
    <div className="w-64 space-y-3 rounded-3xl border border-white/10 bg-[#111118]/90 p-4 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="grid size-7 place-items-center rounded-full bg-money/15 text-money">
          <LockIcon className="size-3.5" />
        </span>
        Locked in escrow
      </div>
      <div className="text-2xl font-bold tabular-nums text-money">340.00 USDC</div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/8">
        <div className="bg-glow h-full w-[38%] rounded-full" />
      </div>
      <div className="flex justify-between text-[11px] text-muted-foreground">
        <span>3 live campaigns</span>
        <span>38% settled</span>
      </div>
    </div>
  );
}

export function PaidToast() {
  return (
    <div className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-[#1A1A24]/90 py-2.5 pl-2.5 pr-4 shadow-2xl backdrop-blur-xl">
      <span className="grid size-8 place-items-center rounded-full bg-money/15 text-money">
        <CheckCircle2Icon className="size-4" />
      </span>
      <div>
        <div className="text-xs font-semibold">+28 USDC paid</div>
        <div className="text-[10px] text-muted-foreground">Auto-released · brand went quiet</div>
      </div>
    </div>
  );
}

export function KitToast() {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-[#1A1A24]/90 py-1.5 pl-1.5 pr-3.5 shadow-2xl backdrop-blur-xl">
      <span className="bg-glow grid size-7 place-items-center rounded-full text-white">
        <GiftIcon className="size-3.5" />
      </span>
      <span className="text-xs font-medium">Free product</span>
      <BadgeCheckIcon className="size-3.5 text-money" />
      <span className="text-xs text-money">Brand kit ready</span>
    </div>
  );
}
