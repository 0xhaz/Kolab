'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePrivy } from '@privy-io/react-auth';
import { toast } from 'sonner';
import {
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  FlameIcon,
  LockIcon,
  LogOutIcon,
  PackageIcon,
  PencilIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TagIcon,
  Trash2Icon,
  XIcon,
  type LucideIcon,
} from 'lucide-react';
import type { Me } from '@kolab/shared';
import { Avatar, PageHeader, Panel, SectionHeader, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Completeness, CreatorProfileCard } from '@/components/creator/creator-profile';
import { firstName, useRename } from '@/components/creator/discover-data';
import { ProfileForm, SamplesEditor } from '@/components/creator/profile-editor';
import { useMyEnrollments, useMyProfile } from '@/lib/creator';
import { reliability, summarize } from '@/lib/earnings';
import { errorMessage } from '@/lib/errors';
import { shortAddr, usdc } from '@/lib/format';
import { useMe } from '@/lib/use-me';
import { cn } from '@/lib/utils';

/** Display name, edited inline and saved with PATCH /me. */
function NameEditor({ me }: { me: Me }) {
  const rename = useRename();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(me.displayName ?? '');
  const name = me.displayName ?? firstName(null, me.email);

  async function save() {
    try {
      await rename.mutateAsync(value.trim());
      setEditing(false);
      toast.success('Name updated');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  if (!editing) {
    return (
      <div className="flex items-center justify-center gap-1.5">
        <h2 className="truncate text-2xl font-bold tracking-tight">{name}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Edit display name" onClick={() => setEditing(true)}>
          <PencilIcon />
        </Button>
      </div>
    );
  }
  return (
    <form
      className="flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Input aria-label="Display name" autoFocus maxLength={80} value={value} onChange={(e) => setValue(e.target.value)} />
      <Button type="submit" variant="gradient" size="icon-lg" aria-label="Save name" disabled={!value.trim() || rename.isPending}>
        <CheckIcon />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        aria-label="Cancel"
        onClick={() => {
          setValue(me.displayName ?? '');
          setEditing(false);
        }}
      >
        <XIcon />
      </Button>
    </form>
  );
}

interface Badge {
  icon: LucideIcon;
  label: string;
  earned: boolean;
  color: string;
}

export default function CreatorProfilePage() {
  const { logout } = usePrivy();
  const { data: me } = useMe();
  const profile = useMyProfile();
  const q = useMyEnrollments();
  const enrollments = q.data ?? [];
  const r = reliability(enrollments);
  const totals = summarize(enrollments);
  const record = profile.data?.record;
  const delivered = record?.delivered ?? r.delivered;
  const missed = record?.missed ?? r.missed;
  const onTime = record?.onTimeRate ?? (r.decided ? r.delivered / r.decided : null);
  const earned = record ? BigInt(record.earned) : totals.paid;
  const name = me?.displayName ?? firstName(null, me?.email);
  const handle = me?.email?.split('@')[0] ?? 'creator';

  const badges: Badge[] = [
    { icon: SparklesIcon, label: 'First campaign', earned: enrollments.length > 0, color: '#A78BFA' },
    { icon: BadgeCheckIcon, label: 'First delivery', earned: r.delivered > 0, color: tone.money },
    { icon: FlameIcon, label: '3 on time', earned: r.delivered >= 3 && r.missed === 0, color: '#FB923C' },
    { icon: ClockIcon, label: 'Stayed live', earned: r.stayedLive > 0, color: tone.sky },
    { icon: PackageIcon, label: 'Product received', earned: enrollments.some((e) => !!e.receivedAt && e.campaign.requiresShipping), color: '#F472B6' },
    {
      icon: TagIcon,
      label: 'First sale',
      earned: enrollments.some((e) => e.campaign.type === 'per_sale' && (BigInt(e.salesAccrued) > 0n || BigInt(e.earnedTotal) > 0n)),
      color: tone.warning,
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Profile" title="Your creator profile" description="Brands see this when you apply to a selective campaign. Your track record comes from on-chain outcomes." />

      <div className="grid gap-8 xl:grid-cols-[340px_minmax(0,1fr)]">
        <div className="space-y-6">
          <Panel className="space-y-4 text-center">
            <div className="flex justify-center">
              <Avatar name={name} size={88} ring />
            </div>
            {me ? <NameEditor key={me.displayName ?? ''} me={me} /> : <div className="h-8" />}
            <div className="-mt-3 text-sm text-muted-foreground">@{handle}</div>
            {me?.walletPubkey && (
              <button
                className="mx-auto inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/4 px-3 py-1 font-mono text-xs transition hover:bg-white/8"
                onClick={() => {
                  void navigator.clipboard.writeText(me.walletPubkey!);
                  toast('Wallet address copied');
                }}
              >
                {shortAddr(me.walletPubkey)} <CopyIcon className="size-3 text-muted-foreground" />
                <span className="sr-only">Copy wallet address</span>
              </button>
            )}
            {profile.data && (
              <div className="border-t border-white/6 pt-4 text-left">
                <div className="mb-2 text-xs font-medium text-muted-foreground">Profile completeness</div>
                <Completeness profile={profile.data} />
              </div>
            )}
          </Panel>

          <section className="space-y-3">
            <SectionHeader title="Track record" />
            <Panel className="space-y-3">
              <dl className="grid grid-cols-3 gap-2 text-center">
                {[
                  ['On time', onTime === null ? 'New' : `${Math.round(onTime * 100)}%`, ''],
                  ['Delivered', String(delivered), ''],
                  ['Earned', usdc(earned, 0).replace(' USDC', ''), 'text-money'],
                ].map(([label, value, cls]) => (
                  <div key={label} className="rounded-2xl bg-popover px-2 py-3">
                    <dd className={cn('text-lg font-bold tabular-nums', cls)}>{value}</dd>
                    <dt className="text-xs text-muted-foreground">{label}</dt>
                  </div>
                ))}
              </dl>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-money" />
                {missed > 0 ? `${missed} missed deadline${missed === 1 ? '' : 's'} on record. ` : ''}From on-chain outcomes, so ratings can’t override it.
              </p>
            </Panel>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Badges" />
            <ul className="grid grid-cols-3 gap-2.5">
              {badges.map((b) => (
                <li key={b.label} className={cn('flex flex-col items-center gap-2 rounded-2xl border border-white/8 bg-card p-3 text-center', !b.earned && 'opacity-45')}>
                  <span
                    className="grid size-11 place-items-center rounded-full"
                    style={{ backgroundColor: b.earned ? `${b.color}26` : 'rgb(255 255 255 / 0.06)', color: b.earned ? b.color : tone.muted }}
                  >
                    {b.earned ? <b.icon className="size-5" /> : <LockIcon className="size-4" />}
                  </span>
                  <span className="text-xs font-medium">
                    {b.label}
                    <span className="sr-only">{b.earned ? ' (earned)' : ' (locked)'}</span>
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <SectionHeader title="Account" />
            <Panel className="space-y-2.5">
              <Button variant="glass" className="h-10 w-full" onClick={() => void logout()}>
                <LogOutIcon /> Sign out
              </Button>
              <Button variant="destructive" className="h-10 w-full rounded-full" nativeButton={false} render={<Link href="/delete-account" />}>
                <Trash2Icon /> Delete account
              </Button>
            </Panel>
          </section>
        </div>

        <div className="space-y-8">
          {profile.data ? (
            <>
              <section className="space-y-3">
                <SectionHeader title="Details" />
                <ProfileForm key={profile.data.userId} profile={profile.data} />
              </section>
              <SamplesEditor profile={profile.data} />
              <section className="space-y-3">
                <SectionHeader title="What brands see" />
                <CreatorProfileCard profile={profile.data} name={name} />
              </section>
            </>
          ) : (
            <Panel className="text-sm text-muted-foreground">{profile.isError ? errorMessage(profile.error) : 'Loading your profile…'}</Panel>
          )}
        </div>
      </div>
    </div>
  );
}
