/**
 * Canvas compositor shared by the live preview and the exporter. Layout constants mirror the
 * native renderer (apps/mobile/modules/kolab-video/ios/KolabVideoModule.swift) so a video looks the
 * same whether it was cut on the phone or in the browser. Everything is laid out in render pixels
 * (1080 wide) and scaled to the canvas.
 */
import { DISCLOSURE, renderSize, type EditorState } from './editor-model';

export interface BrandAssets {
  logo: ImageBitmap | null;
  product: ImageBitmap | null;
  /** End-card gradient (brand colours, or the Kolab glow). */
  colors: string[];
  title: string;
  subtitle: string;
}

export interface FrameInput {
  state: Pick<EditorState, 'texts' | 'captionPosition' | 'captionStyle' | 'watermark' | 'endCard' | 'aspect'>;
  /** The current clip's frame, already seeked; null draws black. */
  video: HTMLVideoElement | null;
  /** Position on the output timeline, in ms. */
  t: number;
  /** Trimmed clips only (the end card starts here). */
  contentMs: number;
  brand: BrandAssets;
}

const FONT = 'ui-rounded, "SF Pro Rounded", "Nunito", system-ui, -apple-system, "Segoe UI", sans-serif';
const font = (size: number) => `800 ${size}px ${FONT}`;

interface Block {
  lines: string[];
  size: number;
  width: number;
  height: number;
  padX: number;
  padY: number;
  lineHeight: number;
}

/** Word-wrapped text measured like the native `textImage` (padding 0.55em × 0.3em). */
function layout(ctx: CanvasRenderingContext2D, text: string, size: number, maxWidth: number): Block {
  ctx.font = font(size);
  const padX = size * 0.55;
  const padY = size * 0.3;
  const inner = maxWidth - padX * 2;
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(next).width > inner) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    lines.push(line);
  }
  const textWidth = Math.min(inner, Math.max(...lines.map((l) => ctx.measureText(l).width)));
  const lineHeight = size * 1.2;
  return { lines, size, padX, padY, lineHeight, width: Math.ceil(textWidth + padX * 2), height: Math.ceil(lines.length * lineHeight + padY * 2) };
}

function drawBlock(ctx: CanvasRenderingContext2D, b: Block, x: number, y: number, background: string | undefined) {
  ctx.save();
  if (background) {
    ctx.fillStyle = background;
    ctx.beginPath();
    ctx.roundRect(x, y, b.width, b.height, Math.min(b.height / 2, b.size * 0.6));
    ctx.fill();
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.75)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
  }
  ctx.font = font(b.size);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  b.lines.forEach((line, i) => ctx.fillText(line, x + b.width / 2, y + b.padY + b.lineHeight * (i + 0.5), b.width - b.padX * 2 + 1));
  ctx.restore();
}

/** Centered text at the renderer's "top" (13%), "center" or "bottom" (72%) anchor. */
function placeText(ctx: CanvasRenderingContext2D, W: number, H: number, text: string, size: number, position: 'top' | 'center' | 'bottom', background?: string) {
  if (!text.trim()) return;
  const b = layout(ctx, text, size, W * 0.86);
  const y = position === 'top' ? H * 0.13 : position === 'center' ? (H - b.height) / 2 : H * 0.72 - b.height / 2;
  drawBlock(ctx, b, (W - b.width) / 2, y, background);
}

/** Aspect-fit (`contain`) or aspect-fill (`cover`) of a source into a rect. */
function fit(sw: number, sh: number, x: number, y: number, w: number, h: number, mode: 'contain' | 'cover') {
  const s = mode === 'cover' ? Math.max(w / sw, h / sh) : Math.min(w / sw, h / sh);
  const dw = sw * s;
  const dh = sh * s;
  return { x: x + (w - dw) / 2, y: y + (h - dh) / 2, w: dw, h: dh };
}

function endCard(ctx: CanvasRenderingContext2D, W: number, H: number, brand: BrandAssets) {
  const g = ctx.createLinearGradient(0, 0, W, H);
  const colors = brand.colors.length ? brand.colors : ['#7C3AED', '#DB2777'];
  colors.forEach((c, i) => g.addColorStop(colors.length === 1 ? 0 : i / (colors.length - 1), c));
  if (colors.length === 1) g.addColorStop(1, colors[0]!);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  let y = H * 0.16;
  if (brand.logo) {
    const side = W * 0.22;
    const x = (W - side) / 2;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(x, y, side, side, side * 0.22);
    ctx.fill();
    const r = fit(brand.logo.width, brand.logo.height, x + side * 0.12, y + side * 0.12, side * 0.76, side * 0.76, 'contain');
    ctx.drawImage(brand.logo, r.x, r.y, r.w, r.h);
    y += side + H * 0.04;
  }
  if (brand.product) {
    const w = W * 0.56;
    const h = w * 1.2;
    const x = (W - w) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 48);
    ctx.clip();
    const r = fit(brand.product.width, brand.product.height, x, y, w, h, 'cover');
    ctx.drawImage(brand.product, r.x, r.y, r.w, r.h);
    ctx.restore();
    y += h + H * 0.04;
  }
  for (const [text, size] of [
    [brand.title, 76],
    [brand.subtitle, 46],
  ] as const) {
    if (!text.trim()) continue;
    const b = layout(ctx, text, size, W * 0.84);
    drawBlock(ctx, b, (W - b.width) / 2, y, undefined);
    y += b.height + 16;
  }
}

/** Draws one output frame onto `ctx` (canvas size decides the scale). */
export function drawFrame(ctx: CanvasRenderingContext2D, input: FrameInput) {
  const [W, H] = renderSize(input.state.aspect);
  const k = ctx.canvas.width / W;
  ctx.setTransform(k, 0, 0, k, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const { state, t, contentMs, brand, video } = input;
  if (state.endCard && t >= contentMs && contentMs > 0) {
    endCard(ctx, W, H, brand);
    return;
  }

  if (video && video.readyState >= 2 && video.videoWidth) {
    const r = fit(video.videoWidth, video.videoHeight, 0, 0, W, H, 'cover');
    ctx.drawImage(video, r.x, r.y, r.w, r.h);
  }
  if (t >= contentMs && contentMs > 0) return;

  if (state.watermark && brand.logo) {
    const box = fit(brand.logo.width, brand.logo.height, W * 0.79, H * 0.105, W * 0.17, H * 0.07, 'contain');
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.beginPath();
    ctx.roundRect(box.x, box.y, box.w, box.h, 18);
    ctx.clip();
    ctx.drawImage(brand.logo, box.x, box.y, box.w, box.h);
    ctx.restore();
  }

  placeText(ctx, W, H, DISCLOSURE, 34, 'top', '#00000080');
  for (const tx of state.texts) {
    if (t < tx.startMs || t >= Math.min(tx.endMs, contentMs)) continue;
    if (tx.kind === 'hook') placeText(ctx, W, H, tx.text, 88, 'center', '#DB2777E6');
    else placeText(ctx, W, H, tx.text, 60, state.captionPosition, state.captionStyle === 'pill' ? '#000000B3' : undefined);
  }
}
