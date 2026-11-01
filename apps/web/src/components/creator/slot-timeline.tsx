import { CheckIcon, CircleIcon, DotIcon, XIcon, type LucideIcon } from 'lucide-react';
import type { SlotDto } from '@kolab/shared';
import { tone } from '@/components/dashboard';
import { relative, shortDate, usdc } from '@/lib/format';
import { cn } from '@/lib/utils';

export type StepState = 'done' | 'now' | 'todo' | 'bad';
export interface SlotStep {
  title: string;
  sub?: string;
  state: StepState;
}

/** Same steps as the mobile slot screen: submit → checks → review → paid 70% → live 7 days → last 30%. */
export function slotSteps(slot: SlotDto, reviewEnds: string | null, holdbackPct: number, now: number): SlotStep[] {
  const st = slot.status;
  const submitted = st !== 'open' && st !== 'missed';
  const paid = ['released', 'holdback_released', 'holdback_forfeited'].includes(st);
  const list: SlotStep[] = [
    {
      title: slot.kind === 'ugc' ? 'Deliver the video file' : 'Post and submit the link',
      sub: slot.dueAt ? `Due ${shortDate(slot.dueAt)} · ${relative(slot.dueAt, now)}` : 'Starts when the product arrives',
      state: st === 'missed' ? 'bad' : submitted ? 'done' : 'now',
    },
    {
      title: 'Automated checks',
      sub: slot.checks === 'failed' ? 'Something was flagged; the brand decides' : slot.kind === 'ugc' ? 'File fingerprint recorded, on time' : 'Post is public, on time, has #ad',
      state: !submitted || st === 'rejected' ? 'todo' : slot.checks === 'failed' ? 'bad' : slot.checks === 'passed' || paid ? 'done' : 'now',
    },
    {
      title: st === 'rejected' ? 'Brand asked for changes' : 'Brand review',
      sub:
        st === 'submitted'
          ? `Auto-paid ${relative(reviewEnds, now)} if they don’t reply`
          : st === 'rejected'
            ? slot.kind === 'ugc'
              ? 'Deliver an updated video'
              : 'Resubmit an updated post'
            : undefined,
      state: st === 'rejected' ? 'bad' : paid ? 'done' : st === 'submitted' ? 'now' : 'todo',
    },
    { title: `Paid ${100 - holdbackPct}%`, sub: paid ? usdc(BigInt(slot.amount) - BigInt(slot.holdback)) : undefined, state: paid ? 'done' : 'todo' },
  ];
  if (BigInt(slot.holdback) > 0n || (!paid && holdbackPct > 0 && slot.kind === 'post')) {
    list.push({
      title: st === 'holdback_forfeited' ? 'Post removed early' : `Live 7 days → last ${holdbackPct}%`,
      sub: st === 'holdback_released' ? usdc(slot.holdback) : st === 'holdback_forfeited' ? 'Holdback went back to the brand' : 'Keep the post up',
      state: st === 'holdback_released' ? 'done' : st === 'holdback_forfeited' ? 'bad' : st === 'released' ? 'now' : 'todo',
    });
  }
  return list;
}

const STEP: Record<StepState, { color: string; icon: LucideIcon; label: string }> = {
  done: { color: tone.money, icon: CheckIcon, label: 'Done' },
  now: { color: tone.primary, icon: DotIcon, label: 'Current step' },
  todo: { color: tone.muted, icon: CircleIcon, label: 'Not yet' },
  bad: { color: tone.danger, icon: XIcon, label: 'Problem' },
};

/** Vertical rail of steps; each dot has an icon and a screen-reader label so state isn't colour-only. */
export function SlotTimeline({ steps }: { steps: SlotStep[] }) {
  return (
    <ol className="py-1">
      {steps.map((step, i) => {
        const s = STEP[step.state];
        const Icon = s.icon;
        return (
          <li key={step.title} className="flex min-h-16 gap-3.5">
            <div className="flex w-7 flex-col items-center pt-3">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full border-2"
                style={{ borderColor: s.color, backgroundColor: step.state === 'todo' ? 'transparent' : `${s.color}33`, color: s.color }}
              >
                <Icon className={cn(step.state === 'now' ? 'size-6' : 'size-3.5')} strokeWidth={step.state === 'now' ? 4 : 2.5} aria-hidden />
                <span className="sr-only">{s.label}</span>
              </span>
              {i < steps.length - 1 && <span className={cn('my-0.5 w-0.5 flex-1 rounded-full', step.state === 'done' ? 'bg-money/40' : 'bg-white/10')} />}
            </div>
            <div className="flex-1 py-3">
              <div className={cn('text-sm font-semibold', step.state === 'todo' && 'text-muted-foreground')}>{step.title}</div>
              {step.sub && <div className="mt-0.5 text-xs text-muted-foreground">{step.sub}</div>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
