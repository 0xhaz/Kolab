'use client';

import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckIcon, ImagePlusIcon, LinkIcon, PlusIcon, SaveIcon, Trash2Icon, XIcon } from 'lucide-react';
import { NICHES, PLATFORMS, PLATFORM_LABEL, type CreatorProfileDto, type Platform } from '@kolab/shared';
import { Chip, Panel, SectionHeader, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { errorMessage } from '@/lib/errors';
import { uploadFile } from '@/lib/upload';
import { cn } from '@/lib/utils';
import { PLATFORM_ICON, SampleTile } from './creator-profile';
import { useAddSample, useRemoveSample, useUpdateProfile } from './discover-data';

export const COUNTRIES = [
  { code: 'MY', label: 'Malaysia' },
  { code: 'ID', label: 'Indonesia' },
  { code: 'PH', label: 'Philippines' },
  { code: 'TH', label: 'Thailand' },
] as const;
type Country = (typeof COUNTRIES)[number]['code'];
type Niche = (typeof NICHES)[number];

const MAX_NICHES = 5;
const MAX_CHANNELS = 5;
const MAX_SAMPLES = 6;

interface ChannelDraft {
  key: string;
  platform: Platform;
  handle: string;
  followers: string;
}

let seq = 0;
const newKey = () => `ch${++seq}`;
const cleanHandle = (h: string) => h.trim().replace(/^@/, '');
const channelValid = (ch: ChannelDraft) => cleanHandle(ch.handle).length >= 2 && /^\d+$/.test(ch.followers.replace(/[,\s]/g, ''));

/** Pill toggle; selected state is shown with a check icon, not colour alone. */
function ToggleChip({ label, on, onClick, disabled }: { label: string; on: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      disabled={disabled}
      onClick={onClick}
      className="rounded-full transition focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
    >
      <Chip label={label} color={on ? tone.primary : tone.muted} icon={on ? CheckIcon : undefined} className="cursor-pointer px-3 py-1 text-sm" />
    </button>
  );
}

/** Bio, country, niches and channels, saved together with one PUT /me/profile. */
export function ProfileForm({ profile }: { profile: CreatorProfileDto }) {
  const update = useUpdateProfile();
  const [bio, setBio] = useState(profile.bio);
  const [country, setCountry] = useState<Country | undefined>(COUNTRIES.find((x) => x.code === profile.country)?.code);
  const [niches, setNiches] = useState<Niche[]>(profile.niches.filter((n): n is Niche => (NICHES as readonly string[]).includes(n)));
  const [channels, setChannels] = useState<ChannelDraft[]>(() =>
    profile.channels.map((ch) => ({ key: newKey(), platform: ch.platform, handle: ch.handle, followers: String(ch.followers) })),
  );
  const allValid = channels.every(channelValid);

  function toggleNiche(n: Niche) {
    setNiches((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : cur.length < MAX_NICHES ? [...cur, n] : cur));
  }

  function patchChannel(key: string, patch: Partial<ChannelDraft>) {
    setChannels((cur) => cur.map((ch) => (ch.key === key ? { ...ch, ...patch } : ch)));
  }

  async function save() {
    try {
      await update.mutateAsync({
        bio: bio.trim(),
        country,
        niches,
        channels: channels.map((ch) => ({ platform: ch.platform, handle: cleanHandle(ch.handle), followers: Number(ch.followers.replace(/[,\s]/g, '')) })),
      });
      toast.success('Profile saved');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Panel className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" className="min-h-24" placeholder="What you make and who watches it" maxLength={280} value={bio} onChange={(e) => setBio(e.target.value)} />
        <p className="text-right text-xs text-muted-foreground tabular-nums">{bio.length}/280</p>
      </div>

      <fieldset className="space-y-2.5">
        <legend className="mb-2.5 text-sm font-medium">Country</legend>
        <div className="flex flex-wrap gap-2">
          {COUNTRIES.map((ct) => (
            <ToggleChip key={ct.code} label={ct.label} on={country === ct.code} onClick={() => setCountry(country === ct.code ? undefined : ct.code)} />
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-2.5 flex w-full items-center justify-between text-sm font-medium">
          Niches <span className="text-xs font-normal text-muted-foreground tabular-nums">{niches.length}/{MAX_NICHES}</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {NICHES.map((n) => {
            const on = niches.includes(n);
            return <ToggleChip key={n} label={n} on={on} disabled={!on && niches.length >= MAX_NICHES} onClick={() => toggleNiche(n)} />;
          })}
        </div>
      </fieldset>

      <fieldset className="space-y-2.5">
        <legend className="mb-2.5 flex w-full items-center justify-between text-sm font-medium">
          <span className="flex items-center gap-2">
            Channels <Chip label="Self-declared" />
          </span>
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {channels.length}/{MAX_CHANNELS}
          </span>
        </legend>
        {channels.map((ch, i) => {
          const Icon = PLATFORM_ICON[ch.platform];
          const invalid = (ch.handle !== '' || ch.followers !== '') && !channelValid(ch);
          return (
            <div key={ch.key} className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-popover p-2.5">
              <select
                aria-label={`Channel ${i + 1} platform`}
                value={ch.platform}
                onChange={(e) => patchChannel(ch.key, { platform: e.target.value as Platform })}
                className="h-10 rounded-xl border border-input bg-input/30 px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                {PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>
                    {PLATFORM_LABEL[pl]}
                  </option>
                ))}
              </select>
              <div className="relative min-w-36 flex-[1.4]">
                <Icon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  aria-label={`Channel ${i + 1} handle`}
                  aria-invalid={invalid && cleanHandle(ch.handle).length < 2}
                  className="pl-8"
                  placeholder="@handle"
                  autoCapitalize="none"
                  autoCorrect="off"
                  maxLength={41}
                  value={ch.handle}
                  onChange={(e) => patchChannel(ch.key, { handle: e.target.value })}
                />
              </div>
              <Input
                aria-label={`Channel ${i + 1} followers`}
                aria-invalid={invalid && !/^\d+$/.test(ch.followers)}
                className="min-w-28 flex-1"
                placeholder="Followers"
                inputMode="numeric"
                value={ch.followers}
                onChange={(e) => patchChannel(ch.key, { followers: e.target.value.replace(/[^\d]/g, '') })}
              />
              <Button variant="ghost" size="icon-lg" aria-label={`Remove channel ${i + 1}`} onClick={() => setChannels((cur) => cur.filter((x) => x.key !== ch.key))}>
                <Trash2Icon className="text-destructive" />
              </Button>
            </div>
          );
        })}
        {channels.length < MAX_CHANNELS && (
          <Button variant="glass" className="h-9 px-4" onClick={() => setChannels((cur) => [...cur, { key: newKey(), platform: 'tiktok', handle: '', followers: '' }])}>
            <PlusIcon /> Add channel
          </Button>
        )}
        <p className="text-xs text-muted-foreground">Brands see these numbers as you enter them until we can verify them with the platform.</p>
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-5">
        <p className={cn('text-sm', allValid ? 'text-muted-foreground' : 'text-amber-300')}>
          {allValid ? `${niches.length} niche${niches.length === 1 ? '' : 's'} · ${channels.length} channel${channels.length === 1 ? '' : 's'}` : 'Each channel needs a handle and a follower count'}
        </p>
        <Button variant="gradient" size="lg" className="h-10 px-5" disabled={!allValid || update.isPending} onClick={save}>
          <SaveIcon /> {update.isPending ? 'Saving…' : 'Save profile'}
        </Button>
      </div>
    </Panel>
  );
}

/** Work samples save one by one: upload a photo/video or add a link to a public post. */
export function SamplesEditor({ profile }: { profile: CreatorProfileDto }) {
  const addSample = useAddSample();
  const removeSample = useRemoveSample();
  const fileRef = useRef<HTMLInputElement>(null);
  const [link, setLink] = useState('');
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const samples = profile.samples;
  const linkValid = /^https:\/\/\S+\.\S+/.test(link.trim());
  const full = samples.length >= MAX_SAMPLES;

  async function onFile(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const { uploadId } = await uploadFile(file);
      await addSample.mutateAsync({ uploadId });
      toast.success('Sample added');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function addLink() {
    if (!linkValid) return;
    try {
      await addSample.mutateAsync({ url: link.trim() });
      setLink('');
      toast.success('Link added');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  async function remove(id: string) {
    setRemoving(id);
    try {
      await removeSample.mutateAsync(id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setRemoving(null);
    }
  }

  return (
    <section className="space-y-3">
      <SectionHeader title="Work samples" action={<span className="text-xs text-muted-foreground tabular-nums">{samples.length}/{MAX_SAMPLES}</span>} />
      <Panel className="space-y-4">
        {samples.length > 0 ? (
          <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
            {samples.map((s) => (
              <div key={s.id} className="relative">
                <SampleTile sample={s} />
                <button
                  type="button"
                  aria-label="Remove sample"
                  disabled={removing === s.id}
                  onClick={() => remove(s.id)}
                  className="absolute right-1.5 top-1.5 grid size-7 place-items-center rounded-full bg-black/70 text-white transition hover:bg-black/90 disabled:opacity-50"
                >
                  <XIcon className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No samples yet. Brands decide faster when they can see your work.</p>
        )}

        {full ? (
          <p className="text-sm text-muted-foreground">That’s the maximum. Remove one to add another.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input ref={fileRef} type="file" accept="image/*,video/*" className="sr-only" aria-label="Choose a photo or video" onChange={(e) => void onFile(e.target.files?.[0])} />
            <Button variant="glass" className="h-10 px-4" disabled={uploading} onClick={() => fileRef.current?.click()}>
              <ImagePlusIcon /> {uploading ? 'Uploading…' : 'Add photo or video'}
            </Button>
            <form
              className="flex min-w-64 flex-1 items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void addLink();
              }}
            >
              <div className="relative flex-1">
                <LinkIcon className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input aria-label="Post link" className="pl-8" type="url" placeholder="Add a post link (https://…)" value={link} onChange={(e) => setLink(e.target.value)} />
              </div>
              <Button type="submit" variant="gradient" className="h-10 px-4" disabled={!linkValid || addSample.isPending}>
                <PlusIcon /> Add link
              </Button>
            </form>
          </div>
        )}
        <p className="text-xs text-muted-foreground">Samples save right away. Brands see up to {MAX_SAMPLES}.</p>
      </Panel>
    </section>
  );
}
