'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CheckCircle2Icon, ClipboardPasteIcon, FilmIcon, FingerprintIcon, LinkIcon, SendIcon, UploadIcon } from 'lucide-react';
import type { SlotDto } from '@kolab/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Panel } from '@/components/dashboard';
import { creatorKeys } from '@/lib/creator';
import { errorMessage } from '@/lib/errors';
import { explorerTx } from '@/lib/format';
import { uploadFile } from '@/lib/upload';
import { useSponsoredTx } from '@/lib/use-sponsored-tx';

const POST_CHECKS = ['Post is public', 'Caption has #ad', 'Product shown in the first 3 seconds'];
const mb = (bytes: number) => `${(bytes / 1_048_576).toFixed(1)} MB`;
/** Same limits as the API's /uploads endpoint. */
const MAX_BYTES = 150 * 1024 * 1024;
const VIDEO_TYPES = 'video/mp4,video/quicktime,video/webm';

/** Submit a post link, or deliver a UGC video file (its SHA-256 fingerprint goes on-chain). */
export function SlotDeliver({ slot }: { slot: SlotDto }) {
  const send = useSponsoredTx();
  const qc = useQueryClient();
  const [url, setUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const isUgc = slot.kind === 'ugc';
  const tooBig = !!file && file.size > MAX_BYTES;
  const valid = isUgc ? !!file && !tooBig : /^https?:\/\/\S+\.\S+/.test(url.trim());

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!valid) return;
    try {
      let body: { url: string } | { uploadId: string };
      if (isUgc && file) {
        setStage('Fingerprinting & uploading…');
        const up = await uploadFile(file);
        body = { uploadId: up.uploadId };
      } else {
        body = { url: url.trim() };
      }
      setStage('Recording on Solana…');
      const { signature } = await send(`/slots/${slot.id}/tx/submit`, body);
      await qc.invalidateQueries({ queryKey: creatorKeys.enrollments });
      toast.success(isUgc ? 'Delivered! The file’s fingerprint is on-chain.' : 'Submitted! Checks are running now.', {
        action: { label: 'View tx', onClick: () => window.open(explorerTx(signature), '_blank', 'noopener') },
      });
      setUrl('');
      setFile(null);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setStage(null);
    }
  }

  async function paste() {
    try {
      setUrl((await navigator.clipboard.readText()).trim());
    } catch {
      toast.error('Clipboard access was blocked. Paste the link with Ctrl/⌘+V.');
    }
  }

  return (
    <Panel className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="bg-glow grid size-10 shrink-0 place-items-center rounded-2xl text-white">{isUgc ? <FilmIcon className="size-5" /> : <SendIcon className="size-5" />}</span>
        <div>
          <h3 className="font-semibold">{isUgc ? 'Deliver video' : slot.status === 'rejected' ? 'Resubmit your post' : 'Submit post link'}</h3>
          <p className="text-xs text-muted-foreground">{isUgc ? 'The brand receives the original file.' : 'Paste the public link once it’s live.'}</p>
        </div>
      </div>
      <form onSubmit={submit} className="space-y-4">
        {isUgc ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="ugc-file">Video file</Label>
              <label
                htmlFor="ugc-file"
                className="flex cursor-pointer items-center gap-3 rounded-2xl border border-dashed border-white/15 bg-white/3 p-4 transition hover:bg-white/6 focus-within:ring-3 focus-within:ring-ring/50"
              >
                <UploadIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1">
                  {file ? (
                    <>
                      <span className="block truncate text-sm font-medium">{file.name}</span>
                      <span className={tooBig ? 'text-xs text-destructive tabular-nums' : 'text-xs text-muted-foreground tabular-nums'}>
                        {mb(file.size)}
                        {tooBig && ' · over the 150 MB limit'}
                      </span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Choose a video (MP4, MOV or WebM, up to 150 MB)</span>
                  )}
                </span>
                <span className="text-xs font-medium text-primary">{file ? 'Change' : 'Browse'}</span>
                <input id="ugc-file" type="file" accept={VIDEO_TYPES} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </div>
            <p className="flex items-start gap-2 text-xs text-muted-foreground">
              <FingerprintIcon className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
              Your browser computes the file’s SHA-256 fingerprint; Kolab re-checks it on upload and records it on Solana, so delivery of this exact file is provable.
            </p>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="post-url">Post link</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <LinkIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <Input id="post-url" type="url" inputMode="url" className="pl-9" placeholder="https://www.tiktok.com/@you/video/…" value={url} onChange={(e) => setUrl(e.target.value)} />
                </div>
                <Button type="button" variant="glass" className="h-10 px-3.5" onClick={paste} aria-label="Paste from clipboard">
                  <ClipboardPasteIcon />
                </Button>
              </div>
            </div>
            <ul className="space-y-1.5">
              {POST_CHECKS.map((ck) => (
                <li key={ck} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2Icon className="size-3.5" aria-hidden /> {ck}
                </li>
              ))}
            </ul>
          </>
        )}
        <Button type="submit" variant="gradient" className="h-10 w-full px-5" disabled={!valid || !!stage}>
          <SendIcon /> {stage ?? (isUgc ? 'Deliver video' : slot.status === 'rejected' ? 'Resubmit' : 'Submit')}
        </Button>
      </form>
    </Panel>
  );
}
