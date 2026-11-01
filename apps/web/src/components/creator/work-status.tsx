import { BadgeCheckIcon, CircleXIcon, MapPinIcon, PackageCheckIcon, PackageIcon, PlayIcon, TruckIcon, type LucideIcon } from 'lucide-react';
import type { EnrollmentStatusName, MyEnrollmentDto } from '@kolab/shared';
import { Chip, tone } from '@/components/dashboard';

/** Creator-facing wording for an enrollment's state (icon + text, never colour alone). */
export const ENROLLMENT: Record<EnrollmentStatusName, { label: string; color: string; icon: LucideIcon }> = {
  awaiting_shipment: { label: 'Waiting for product', color: tone.warning, icon: PackageIcon },
  in_transit: { label: 'Product on the way', color: tone.sky, icon: TruckIcon },
  active: { label: 'Active', color: tone.primary, icon: PlayIcon },
  not_received: { label: 'Reported not received', color: tone.danger, icon: CircleXIcon },
  cancelled: { label: 'Cancelled', color: tone.muted, icon: CircleXIcon },
  completed: { label: 'Completed', color: tone.money, icon: BadgeCheckIcon },
};

export function EnrollmentChip({ status, className }: { status: EnrollmentStatusName; className?: string }) {
  const e = ENROLLMENT[status];
  return <Chip label={e.label} color={e.color} icon={e.icon} className={className} />;
}

/** The one thing the creator should do next on this enrollment, if any. */
export function enrollmentAction(e: MyEnrollmentDto): { label: string; color: string; icon: LucideIcon } | null {
  if (e.status === 'awaiting_shipment' && !e.hasAddress) return { label: 'Add shipping address', color: tone.warning, icon: MapPinIcon };
  if (e.status === 'in_transit') return { label: 'Product on the way: confirm received', color: tone.sky, icon: PackageCheckIcon };
  return null;
}

export type WorkGroup = 'active' | 'waiting' | 'completed';
export const groupOf = (e: MyEnrollmentDto): WorkGroup =>
  e.status === 'active' ? 'active' : e.status === 'completed' || e.status === 'cancelled' ? 'completed' : 'waiting';

/** Earliest deadline among deliverables still to do. */
export function nextDue(e: MyEnrollmentDto) {
  return (
    e.slots
      .filter((s) => (s.status === 'open' || s.status === 'rejected') && s.dueAt)
      .map((s) => s.dueAt!)
      .sort()[0] ?? null
  );
}
