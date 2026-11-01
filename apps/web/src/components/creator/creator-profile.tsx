import type { ComponentType } from 'react';
import { AtSignIcon, CameraIcon, ExternalLinkIcon, MusicIcon, PlayIcon, SquarePlayIcon, UsersIcon } from 'lucide-react';
import { PLATFORM_LABEL, type CreatorProfileDto, type Platform, type SampleDto } from '@kolab/shared';
import { Avatar, Chip, Panel, tone } from '@/components/dashboard';
import { assetUrl } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { compact, missingSteps } from './discover-data';

export const PLATFORM_ICON: Record<Platform, ComponentType<{ className?: string }>> = {
  tiktok: MusicIcon,
  instagram: CameraIcon,
  youtube: SquarePlayIcon,
  facebook: UsersIcon,
  x: AtSignIcon,
};

const host = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] ?? url;

/** Photo, video or post link as a square tile that opens the original. */
export function SampleTile({ sample, className }: { sample: SampleDto; className?: string }) {
  const base = cn('group relative block aspect-square overflow-hidden rounded-2xl border border-white/8 bg-popover', className);
  if (sample.kind === 'link') {
    return (
      <a href={sample.url} target="_blank" rel="noreferrer" className={cn(base, 'flex flex-col items-center justify-center gap-1.5 p-2 text-center transition hover:border-white/20')}>
        <ExternalLinkIcon className="size-5 text-primary" />
        <span className="w-full truncate text-xs text-muted-foreground">{sample.caption ?? host(sample.url)}</span>
      </a>
    );
  }
  const src = assetUrl(sample.url);
  return (
    <a href={src} target="_blank" rel="noreferrer" className={base} aria-label={sample.caption ?? (sample.kind === 'video' ? 'Video sample' : 'Photo sample')}>
      {sample.kind === 'image' ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed upload links
        <img src={src} alt={sample.caption ?? 'Sample'} className="size-full object-cover transition duration-300 group-hover:scale-105" />
      ) : (
        <>
          <video src={src} muted playsInline preload="metadata" className="size-full object-cover" />
          <span className="absolute inset-0 grid place-items-center bg-black/25">
            <span className="grid size-8 place-items-center rounded-full bg-white/90 text-black">
              <PlayIcon className="size-3.5 fill-current" />
            </span>
          </span>
        </>
      )}
    </a>
  );
}

/** "2 of 3 done: add a sample", with a three-segment bar. */
export function Completeness({ profile }: { profile: CreatorProfileDto }) {
  const missing = missingSteps(profile);
  const done = 3 - missing.length;
  return (
    <div className="space-y-2">
      <div className="flex gap-1" role="progressbar" aria-valuemin={0} aria-valuemax={3} aria-valuenow={done} aria-label="Profile completeness">
        {[0, 1, 2].map((i) => (
          <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < done ? (done === 3 ? 'bg-money' : 'bg-primary') : 'bg-white/10')} />
        ))}
      </div>
      <p className={cn('text-xs', done === 3 ? 'text-money' : 'text-muted-foreground')}>
        {done === 3 ? 'Ready to apply · brands see everything they need' : `${done} of 3 done: ${missing.join(', ')}`}
      </p>
    </div>
  );
}

/** What brands see when the creator applies. `compact` trims it for the apply dialog. */
export function CreatorProfileCard({ profile, name, compact: small, className }: { profile: CreatorProfileDto; name: string; compact?: boolean; className?: string }) {
  const samples = profile.samples.slice(0, small ? 4 : 6);
  return (
    <Panel className={cn('space-y-4', small && 'bg-popover p-4', className)}>
      <div className="flex items-center gap-3">
        <Avatar name={name} size={small ? 40 : 48} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-semibold">{name}</div>
          <p className={cn('text-xs text-muted-foreground', small ? 'line-clamp-1' : 'line-clamp-3')}>{profile.bio || 'No bio yet'}</p>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums">{compact(profile.totalFollowers)}</div>
          <div className="text-xs text-muted-foreground">total reach</div>
        </div>
      </div>
      {profile.niches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {profile.niches.map((n) => (
            <Chip key={n} label={n} color={tone.primary} />
          ))}
        </div>
      )}
      {profile.channels.length > 0 && (
        <ul className="space-y-1.5">
          {profile.channels.map((ch) => {
            const Icon = PLATFORM_ICON[ch.platform];
            return (
              <li key={`${ch.platform}-${ch.handle}`} className="flex items-center gap-2 text-sm">
                <Icon className="size-3.5 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate font-medium">
                  {PLATFORM_LABEL[ch.platform]} · @{ch.handle}
                </span>
                <span className="font-semibold tabular-nums">{compact(ch.followers)}</span>
              </li>
            );
          })}
          <li className="text-[11px] text-muted-foreground">Follower counts are self-declared.</li>
        </ul>
      )}
      {samples.length > 0 && (
        <div className={cn('grid gap-2', small ? 'grid-cols-4' : 'grid-cols-3 sm:grid-cols-6')}>
          {samples.map((s) => (
            <SampleTile key={s.id} sample={s} />
          ))}
        </div>
      )}
      {!small && <Completeness profile={profile} />}
    </Panel>
  );
}
