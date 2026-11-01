import {
  ArrowRightIcon,
  CircleXIcon,
  HourglassIcon,
  LockIcon,
  RadioIcon,
  ShieldCheckIcon,
  TagIcon,
  Trash2Icon,
  Undo2Icon,
  type LucideIcon,
} from 'lucide-react';

const STAGES: { icon: LucideIcon; when: string; title: string; body: string; moves: { who: string; amount: string; tone: 'money' | 'muted' | 'fee' }[] }[] = [
  {
    icon: LockIcon,
    when: 'Day 0',
    title: 'Locked',
    body: 'The brand locks the creator’s rate plus the 5% fee in escrow.',
    moves: [{ who: 'Escrow', amount: '105 USDC', tone: 'muted' }],
  },
  {
    icon: RadioIcon,
    when: 'Before the due date',
    title: 'Submitted',
    body: 'The creator posts and submits. Checks run, and a 72-hour review window opens.',
    moves: [{ who: 'Nothing moves yet', amount: '', tone: 'muted' }],
  },
  {
    icon: ShieldCheckIcon,
    when: 'Approved, or 72h of silence',
    title: '70% released',
    body: 'The brand approves, or the slot auto-releases when the window ends.',
    moves: [
      { who: 'Creator', amount: '+70 USDC', tone: 'money' },
      { who: 'Kolab fee', amount: '+3.5', tone: 'fee' },
    ],
  },
  {
    icon: HourglassIcon,
    when: 'Post still live after 7 days',
    title: '30% holdback',
    body: 'The verifier confirms the post is still up, and the rest is paid.',
    moves: [
      { who: 'Creator', amount: '+30 USDC', tone: 'money' },
      { who: 'Kolab fee', amount: '+1.5', tone: 'fee' },
    ],
  },
];

const WHAT_IF: { icon: LucideIcon; color: string; title: string; body: string; result: string }[] = [
  { icon: CircleXIcon, color: '#F87171', title: 'Creator misses the deadline', body: 'Nothing submitted by the due date plus a 48-hour grace period.', result: '105 USDC back to the brand, no fee' },
  { icon: Trash2Icon, color: '#F87171', title: 'Post deleted early', body: 'The post comes down before it has been live for 7 days.', result: '31.5 USDC holdback back to the brand' },
  { icon: Undo2Icon, color: '#FBBF24', title: 'Brand requests changes', body: 'The creator fixes it and resubmits before the due date.', result: 'Nothing moves until it’s approved' },
  { icon: HourglassIcon, color: '#818CF8', title: 'Brand goes quiet', body: 'Anyone can trigger the release, so it works even if Kolab is offline.', result: 'Creator paid automatically after 72h' },
  { icon: TagIcon, color: '#34D399', title: 'Per-sale campaigns', body: 'Each order made with the creator’s voucher adds to their balance.', result: 'Creator claims anytime; 5% on top for the brand' },
];

const toneClass = { money: 'text-money', fee: 'text-accent', muted: 'text-muted-foreground' } as const;

export function PaymentFlow() {
  return (
    <section id="payments" className="mx-auto max-w-6xl scroll-mt-28 px-4 py-24">
      <div className="mx-auto mb-14 max-w-2xl text-center">
        <div className="mb-3 text-sm font-semibold uppercase tracking-[0.18em] text-glow">How payment is released</div>
        <h2 className="text-4xl font-bold tracking-tight md:text-5xl">Follow one 100 USDC post</h2>
        <p className="mt-4 text-muted-foreground">Every rule below runs in the Solana program itself, so neither side has to trust the other.</p>
      </div>

      <ol className="relative grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div aria-hidden className="bg-glow absolute left-[12%] right-[12%] top-[52px] hidden h-0.5 opacity-60 lg:block" />
        {STAGES.map(({ icon: Icon, when, title, body, moves }, i) => (
          <li key={title} className="relative flex flex-col rounded-3xl border border-white/8 bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="bg-glow relative grid size-14 place-items-center rounded-2xl text-white shadow-[0_10px_30px_-10px_rgb(219_39_119/0.8)]">
                <Icon className="size-6" />
              </span>
              <span className="text-4xl font-bold text-white/6">{i + 1}</span>
            </div>
            <div className="text-xs font-medium text-muted-foreground">{when}</div>
            <h3 className="mt-0.5 text-lg font-semibold">{title}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
            <div className="mt-auto space-y-1.5 pt-4">
              {moves.map((m) => (
                <div key={m.who} className="flex items-center justify-between rounded-xl bg-popover px-3 py-2 text-sm">
                  <span className="text-muted-foreground">{m.who}</span>
                  <span className={`font-semibold tabular-nums ${toneClass[m.tone]}`}>{m.amount}</span>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 grid gap-3 rounded-3xl border border-white/8 bg-card p-5 sm:grid-cols-3">
        {[
          { label: 'Creator receives', value: '100 USDC', note: 'their full rate', cls: 'text-money' },
          { label: 'Kolab earns', value: '5 USDC', note: 'only on released money', cls: 'text-accent' },
          { label: 'Brand pays', value: '105 USDC', note: 'for delivered work only', cls: 'text-foreground' },
        ].map((t) => (
          <div key={t.label} className="text-center sm:border-l sm:border-white/8 sm:first:border-0">
            <div className="text-xs text-muted-foreground">{t.label}</div>
            <div className={`text-3xl font-bold tabular-nums ${t.cls}`}>{t.value}</div>
            <div className="text-xs text-muted-foreground">{t.note}</div>
          </div>
        ))}
      </div>

      <h3 className="mb-5 mt-16 text-center text-2xl font-bold tracking-tight">And when things don’t go to plan</h3>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {WHAT_IF.map(({ icon: Icon, color, title, body, result }) => (
          <div key={title} className="flex flex-col rounded-3xl border border-white/8 bg-card p-5">
            <span className="mb-4 grid size-10 place-items-center rounded-full" style={{ backgroundColor: `${color}26`, color }}>
              <Icon className="size-[18px]" />
            </span>
            <h4 className="font-semibold">{title}</h4>
            <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            <div className="mt-auto flex items-start gap-1.5 pt-4 text-sm font-medium" style={{ color }}>
              <ArrowRightIcon className="mt-0.5 size-3.5 shrink-0" /> {result}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
