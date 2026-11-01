'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutGridIcon, InboxIcon, UsersIcon, WalletIcon, FlaskConicalIcon, PlusIcon, HomeIcon, CompassIcon, BriefcaseIcon, CircleDollarSignIcon, UserIcon } from 'lucide-react';
import { useMe } from '@/lib/use-me';
import { cn } from '@/lib/utils';
import { env } from '@/lib/env';
import { useReview } from '@/lib/queries';

const creatorItems = [
  { href: '/creator', label: 'Home', icon: HomeIcon, exact: true },
  { href: '/creator/discover', label: 'Discover', icon: CompassIcon },
  { href: '/creator/work', label: 'My work', icon: BriefcaseIcon },
  { href: '/creator/earnings', label: 'Earnings', icon: CircleDollarSignIcon },
  { href: '/creator/profile', label: 'Profile', icon: UserIcon },
];

const items = [
  { href: '/campaigns', label: 'Campaigns', icon: LayoutGridIcon },
  { href: '/review', label: 'Review', icon: InboxIcon },
  { href: '/creators', label: 'Creators', icon: UsersIcon },
  { href: '/wallet', label: 'Wallet', icon: WalletIcon },
];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="bg-glow grid size-9 shrink-0 place-items-center rounded-xl text-lg font-bold text-white shadow-[0_8px_24px_-8px_rgb(219_39_119/0.7)]">k</span>
      {!compact && <span className="text-xl font-bold tracking-tight">kolab</span>}
    </span>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: me } = useMe();
  const creator = me?.role === 'creator';
  const { data: review = [] } = useReview(!!me && !creator);
  const brandNav = env.demoMode ? [...items, { href: '/demo', label: 'Demo panel', icon: FlaskConicalIcon }] : items;
  const nav: { href: string; label: string; icon: typeof HomeIcon; exact?: boolean }[] = creator ? creatorItems : brandNav;

  return (
    // Icons-only below 1280px so the dashboard fits a third of the screen in the three-pane demo.
    <aside className="sticky top-0 hidden h-screen w-[76px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3.5 backdrop-blur-xl md:flex xl:w-64">
      <Link href="/" className="mb-8 px-1.5 pt-1">
        <span className="xl:hidden">
          <Logo compact />
        </span>
        <span className="hidden xl:inline">
          <Logo />
        </span>
      </Link>
      <nav className="flex flex-col gap-1.5">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href) && !(href === '/campaigns' && pathname === '/campaigns/new');
          const badge = href === '/review' ? review.length : 0;
          return (
            <Link
              key={href}
              href={href}
              title={label}
              className={cn(
                'group relative flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground',
                active && 'bg-white/8 text-foreground',
              )}
            >
              <span
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-xl transition',
                  active ? 'bg-glow text-white shadow-[0_6px_18px_-6px_rgb(219_39_119/0.7)]' : 'bg-white/5 group-hover:bg-white/8',
                )}
              >
                <Icon className="size-4" />
              </span>
              <span className="hidden xl:inline">{label}</span>
              {badge > 0 && (
                <span className="absolute left-8 top-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white tabular-nums xl:static xl:ml-auto">
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
      {!creator && (
      <Link
        href="/campaigns/new"
        title="New campaign"
        className="mt-auto flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/4 p-2.5 text-sm font-medium transition hover:bg-white/8 xl:justify-start xl:p-3"
      >
        <span className="bg-glow grid size-8 place-items-center rounded-xl text-white">
          <PlusIcon className="size-4" />
        </span>
        <span className="hidden xl:inline">New campaign</span>
      </Link>
      )}
    </aside>
  );
}
