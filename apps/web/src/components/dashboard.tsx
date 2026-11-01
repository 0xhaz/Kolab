import type { ComponentProps, ComponentType, CSSProperties, ReactNode } from 'react';
import {
  BadgeCheckIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleXIcon,
  GiftIcon,
  HourglassIcon,
  OctagonAlertIcon,
  SparklesIcon,
  TagIcon,
  Undo2Icon,
  VideoIcon,
  type LucideIcon,
} from 'lucide-react';
import type { CampaignDto, SlotStatusName } from '@kolab/shared';
import { assetUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';

/* Mirrors apps/mobile/src/lib/theme.ts so the dashboard and the creator app feel like one product. */
export const tone = {
  primary: '#8B5CF6',
  accent: '#EC4899',
  money: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#818CF8',
  sky: '#38BDF8',
  muted: '#A5A5BC',
} as const;

const COVERS: [string, string][] = [
  ['#7C3AED', '#EC4899'],
  ['#0EA5E9', '#8B5CF6'],
  ['#F97316', '#DB2777'],
  ['#10B981', '#0EA5E9'],
  ['#F59E0B', '#EF4444'],
  ['#6366F1', '#22D3EE'],
];

function hash(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h;
}

// ------------------------------------------------------------------ layout

export function PageHeader({ title, description, eyebrow, action }: { title: string; description?: string; eyebrow?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="mb-1 text-sm font-medium text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function SectionHeader({ title, count, action }: { title: string; count?: number; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        {title}
        {count !== undefined && <span className="rounded-full bg-white/8 px-2 py-0.5 text-xs font-medium text-muted-foreground tabular-nums">{count}</span>}
      </h2>
      {action}
    </div>
  );
}

/** Raised surface card, same as the mobile `Card`. */
export function Panel({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div className={cn('rounded-3xl border border-white/8 bg-card p-5 shadow-[inset_0_1px_0_0_rgb(255_255_255/0.04)]', className)} {...props}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ numbers

/** The one gradient moment on a page: the headline money number (mobile home balance card). */
export function HeroStat({ label, value, note, stats, action }: { label: string; value: string; note?: string; stats: { label: string; value: string }[]; action?: ReactNode }) {
  return (
    <div className="bg-glow relative overflow-hidden rounded-[2rem] p-6 text-white shadow-[0_24px_60px_-24px_rgb(219_39_119/0.55)] md:p-7">
      <div aria-hidden className="absolute -right-20 -top-28 size-72 rounded-full bg-white/16" />
      <div aria-hidden className="absolute -bottom-32 left-1/3 size-64 rounded-full bg-black/10" />
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-sm font-medium text-white/85">{label}</div>
          <div className="mt-1 text-4xl font-bold tracking-tight tabular-nums md:text-5xl">{value}</div>
          {note && <div className="mt-1 text-sm text-white/80">{note}</div>}
        </div>
        {action}
      </div>
      <div className="relative mt-6 grid grid-cols-2 gap-2 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-black/22 px-3.5 py-2.5 backdrop-blur-sm">
            <div className="text-base font-semibold tabular-nums md:text-lg">{s.value}</div>
            <div className="text-xs text-white/75">{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** A headline number. Not a chart: one value, a label, an optional note (dataviz: stat tile). */
export function StatTile({ label, value, note, icon: Icon, color = tone.primary }: { label: string; value: string; note?: string; icon?: LucideIcon; color?: string }) {
  return (
    <Panel className="flex items-start gap-3.5 p-4">
      {Icon && (
        <span className="grid size-10 shrink-0 place-items-center rounded-full" style={{ backgroundColor: `${color}26`, color }}>
          <Icon className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <div className="text-xs font-medium text-muted-foreground">{label}</div>
        <div className="mt-0.5 truncate text-xl font-semibold tabular-nums">{value}</div>
        {note && <div className="mt-0.5 text-xs text-muted-foreground">{note}</div>}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------------ labels

export function Chip({ label, color = tone.muted, icon: Icon, className }: { label: string; color?: string; icon?: ComponentType<{ className?: string }>; className?: string }) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', className)}
      style={{ borderColor: `${color}55`, backgroundColor: `${color}1A`, color }}
    >
      {Icon && <Icon className="size-3" />}
      {label}
    </span>
  );
}

const SLOT: Record<SlotStatusName, { label: string; color: string; icon: LucideIcon }> = {
  open: { label: 'To do', color: tone.muted, icon: CircleDashedIcon },
  submitted: { label: 'In review', color: tone.info, icon: HourglassIcon },
  approved: { label: 'Approved', color: tone.primary, icon: CheckCircle2Icon },
  rejected: { label: 'Changes requested', color: tone.warning, icon: Undo2Icon },
  released: { label: 'Paid 70%', color: tone.money, icon: CheckCircle2Icon },
  holdback_released: { label: 'Paid in full', color: tone.money, icon: BadgeCheckIcon },
  missed: { label: 'Missed · refunded', color: tone.danger, icon: CircleXIcon },
  holdback_forfeited: { label: 'Post removed', color: tone.danger, icon: OctagonAlertIcon },
};

export const SLOT_LABEL = Object.fromEntries(Object.entries(SLOT).map(([k, v]) => [k, v.label])) as Record<SlotStatusName, string>;
export const slotColor = (status: SlotStatusName) => SLOT[status].color;

/** Status is never colour alone: icon + text label. */
export function SlotBadge({ status, className }: { status: SlotStatusName; className?: string }) {
  const st = SLOT[status];
  return <Chip label={st.label} color={st.color} icon={st.icon} className={className} />;
}

/** One segment per deliverable, coloured by status, with the count in text beside it. */
export function SlotStrip({ statuses }: { statuses: SlotStatusName[] }) {
  const done = statuses.filter((st) => st === 'released' || st === 'holdback_released').length;
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex flex-1 gap-1">
        {statuses.map((st, i) => (
          <span key={i} className="h-1.5 flex-1 rounded-full" style={{ backgroundColor: st === 'open' ? 'rgb(255 255 255 / 0.1)' : SLOT[st].color }} />
        ))}
      </div>
      <span className="text-xs text-muted-foreground tabular-nums">
        {done}/{statuses.length} paid
      </span>
    </div>
  );
}

export function KitBadge({ camp }: { camp: Pick<CampaignDto, 'hasBrandKit'> }) {
  return camp.hasBrandKit ? <Chip label="Brand kit ready" color={tone.money} icon={BadgeCheckIcon} /> : <Chip label="No brand kit yet" />;
}

// ------------------------------------------------------------------ people

function initials(name: string) {
  const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}

export function Avatar({ name, size = 40, ring, className }: { name: string; size?: number; ring?: boolean; className?: string }) {
  const [from, to] = COVERS[hash(name) % COVERS.length]!;
  const inner = (
    <span
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-white', !ring && className)}
      style={{ width: size, height: size, fontSize: size * 0.38, backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
    >
      {initials(name)}
    </span>
  );
  if (!ring) return inner;
  return (
    <span className={cn('bg-glow inline-flex shrink-0 rounded-full p-[2px]', className)}>
      <span className="rounded-full bg-background p-[2px]">{inner}</span>
    </span>
  );
}

// ------------------------------------------------------------------ campaigns

export const TYPE_LABEL: Record<CampaignDto['type'], string> = { per_post: 'Per post', monthly: 'Monthly', per_sale: 'Per sale', ugc: 'UGC' };

export function TypeIcon({ camp, className }: { camp: Pick<CampaignDto, 'type' | 'requiresShipping'>; className?: string }) {
  if (camp.type === 'per_sale') return <TagIcon aria-hidden className={className} />;
  if (camp.type === 'ugc') return <VideoIcon aria-hidden className={className} />;
  if (camp.requiresShipping) return <GiftIcon aria-hidden className={className} />;
  return <SparklesIcon aria-hidden className={className} />;
}

/** Brand photo if the kit has one, otherwise a generated gradient cover (never stock photos of real brands). */
export function CampaignCover({
  camp,
  className,
  style,
  children,
}: {
  camp: Pick<CampaignDto, 'id' | 'coverUrl' | 'type' | 'requiresShipping'>;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const [from, to] = COVERS[hash(camp.id) % COVERS.length]!;
  return (
    <div className={cn('relative overflow-hidden', className)} style={style}>
      {camp.coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- kit images come from the API or Cloudinary
        <img src={assetUrl(camp.coverUrl)} alt="" className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
      ) : (
        <div className="absolute inset-0" style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}>
          <div aria-hidden className="absolute -right-[10%] -top-[30%] aspect-square w-[60%] rounded-full bg-white/18" />
          <div aria-hidden className="absolute -bottom-[45%] -left-[15%] aspect-square w-[55%] rounded-full bg-white/10" />
          <TypeIcon camp={camp} className="absolute left-1/2 top-1/2 size-[22%] max-h-16 -translate-x-1/2 -translate-y-1/2 text-white/90" />
        </div>
      )}
      <div aria-hidden className="absolute inset-0 bg-linear-to-b from-transparent via-transparent to-black/70" />
      {children}
    </div>
  );
}

export function Empty({ children, icon: Icon = SparklesIcon }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <Panel className="flex flex-col items-center gap-3 px-6 py-12 text-center text-sm text-muted-foreground">
      <span className="grid size-12 place-items-center rounded-full bg-primary/15 text-primary">
        <Icon className="size-5" />
      </span>
      {children}
    </Panel>
  );
}
