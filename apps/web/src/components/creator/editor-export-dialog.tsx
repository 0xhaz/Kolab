'use client';

import { DownloadIcon, FileVideoIcon, LoaderCircleIcon, SendIcon } from 'lucide-react';
import { Chip, tone } from '@/components/dashboard';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fmt } from './editor-model';

export interface RenderedVideo {
  /** Object URL owned by the editor page (revoked when replaced or on unmount). */
  url: string;
  blob: Blob;
  mime: string;
  ext: 'mp4' | 'webm';
  durationMs: number;
  codec: string;
}

/** Rendering progress, then the finished file: preview, download and (for UGC) deliver. */
export function ExportDialog({
  progress,
  result,
  aspect,
  fileName,
  canDeliver,
  delivering,
  onCancel,
  onClose,
  onDeliver,
}: {
  progress: number | null;
  result: RenderedVideo | null;
  aspect: string;
  fileName: string;
  canDeliver: boolean;
  delivering: string | null;
  onCancel: () => void;
  onClose: () => void;
  onDeliver: () => void;
}) {
  const open = progress !== null || !!result;
  const pct = Math.round((progress ?? 0) * 100);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) return;
        if (progress !== null) onCancel();
        else if (!delivering) onClose();
      }}
    >
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2.5">
            <span className="bg-glow grid size-8 place-items-center rounded-xl text-white">
              <FileVideoIcon className="size-4" />
            </span>
            {result ? 'Your video' : 'Rendering in your browser'}
          </DialogTitle>
        </DialogHeader>

        {progress !== null && !result && (
          <div className="space-y-3">
            <div className="h-2.5 overflow-hidden rounded-full bg-white/8" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Export progress">
              <div className="bg-brand-gradient h-full transition-[width]" style={{ width: `${pct}%` }} />
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Recording in real time. Keep this tab open and visible.</span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
            <Button variant="glass" className="h-10 px-5" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-1.5">
              <Chip label={fmt(result.durationMs)} />
              <Chip label={`${(result.blob.size / 1_048_576).toFixed(1)} MB`} />
              <Chip label={aspect} />
              <Chip label={result.ext.toUpperCase()} color={result.ext === 'mp4' ? tone.money : tone.info} />
            </div>
            <video src={result.url} controls playsInline loop className="max-h-[52vh] w-full rounded-2xl bg-black" aria-label="Exported video" />
            <div className="flex flex-wrap gap-2">
              <Button variant="glass" className="h-10 px-5" nativeButton={false} render={<a href={result.url} download={fileName} />}>
                <DownloadIcon /> Download
              </Button>
              {canDeliver && (
                <Button variant="gradient" className="h-10 flex-1 px-5" disabled={!!delivering} onClick={onDeliver}>
                  {delivering ? <LoaderCircleIcon className="animate-spin" /> : <SendIcon />}
                  {delivering ?? 'Deliver to the brand'}
                </Button>
              )}
            </div>
            {!canDeliver && <p className="text-xs text-muted-foreground">Post it on TikTok or Reels, then submit the post link from this deliverable.</p>}
            {canDeliver && result.ext === 'webm' && <p className="text-xs text-muted-foreground">Your browser records WebM. Brands can play it in any modern browser.</p>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
