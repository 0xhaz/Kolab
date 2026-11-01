/**
 * Brand-kit content templates drawn straight onto a <canvas> at export size (1080 px wide).
 * Ports apps/mobile/src/components/templates.tsx: same layouts, laid out on a 360-unit grid × 3.
 * Every template draws the mandatory, non-removable "#ad · Paid partnership" sticker.
 */

export type TemplateId = 'story' | 'square' | 'review' | 'voucher';

export const TEMPLATES: { id: TemplateId; label: string; ratio: string; width: number; height: number; perSaleOnly?: boolean }[] = [
  { id: 'story', label: 'Story 9:16', ratio: '9:16', width: 1080, height: 1920 },
  { id: 'square', label: 'Square post', ratio: '1:1', width: 1080, height: 1080 },
  { id: 'review', label: 'Review card', ratio: '4:5', width: 1080, height: 1350 },
  { id: 'voucher', label: 'Voucher card', ratio: '4:5', width: 1080, height: 1350, perSaleOnly: true },
];

export const DEFAULT_HEADLINE: Record<TemplateId, string> = {
  story: 'My new morning glow ✨',
  square: 'Two weeks in. Still obsessed.',
  review: 'Brighter skin in two weeks, and no sticky feel.',
  voucher: 'Try it with my code',
};

export interface TemplateInput {
  logo: HTMLImageElement | null;
  photo: HTMLImageElement | null;
  colors: [string, string];
  brandName: string;
  brandTag: string;
  headline: string;
  rating: number;
  handle: string;
  voucher: string | null;
  fontFamily: string;
}

// ------------------------------------------------------------------ images

const cache = new Map<string, Promise<HTMLImageElement>>();

function loadElement(src: string, cors: boolean) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

/** True when drawing `img` would taint a canvas (no CORS grant). */
function taints(img: HTMLImageElement) {
  try {
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return false;
  } catch {
    return true;
  }
}

async function viaBlob(src: string) {
  const res = await fetch(src);
  if (!res.ok) throw new Error(`Image failed to load (${res.status})`);
  return loadElement(URL.createObjectURL(await res.blob()), false);
}

/**
 * Loads an image that is safe to export: data/blob URLs directly, remote ones with
 * crossOrigin='anonymous', falling back to fetching the bytes into an object URL.
 */
export function loadCanvasImage(src: string): Promise<HTMLImageElement> {
  let p = cache.get(src);
  if (!p) {
    p = (async () => {
      if (src.startsWith('data:') || src.startsWith('blob:')) return loadElement(src, false);
      try {
        const img = await loadElement(src, true);
        return taints(img) ? await viaBlob(src) : img;
      } catch {
        return viaBlob(src);
      }
    })();
    p.catch(() => cache.delete(src));
    cache.set(src, p);
  }
  return p;
}

// ------------------------------------------------------------------ primitives

type Ctx = CanvasRenderingContext2D;

function font(ctx: Ctx, weight: number, size: number, family: string, spacing = 0) {
  ctx.font = `${weight} ${size}px ${family}`;
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`;
}

function rrect(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

/** object-fit: cover into the box (caller sets any clip). */
function cover(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, x, y, w, h);
}

function contain(ctx: Ctx, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

/** Photo, or a dark placeholder when there's none. */
function photo(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, w: number, h: number, r = 0) {
  ctx.save();
  rrect(ctx, x, y, w, h, r);
  ctx.clip();
  if (img) cover(ctx, img, x, y, w, h);
  else {
    ctx.fillStyle = '#1A1A24';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

function logo(ctx: Ctx, img: HTMLImageElement | null, x: number, y: number, size: number) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.clip();
  if (img) contain(ctx, img, x + size * 0.09, y + size * 0.09, size * 0.82, size * 0.82);
  ctx.restore();
}

/** Greedy word wrap; the last allowed line is ellipsised. */
function wrap(ctx: Ctx, text: string, maxWidth: number, maxLines = 6) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1]!;
    while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    kept[maxLines - 1] = `${last.trimEnd()}…`;
    return kept;
  }
  return lines;
}

function star(ctx: Ctx, cx: number, cy: number, r: number, filled: boolean) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx[i === 0 ? 'moveTo' : 'lineTo'](cx + rad * Math.cos(a), cy + rad * Math.sin(a));
  }
  ctx.closePath();
  ctx.strokeStyle = '#F59E0B';
  ctx.fillStyle = '#F59E0B';
  ctx.lineWidth = r * 0.16;
  ctx.lineJoin = 'round';
  if (filled) ctx.fill();
  ctx.stroke();
}

/** The required paid-partnership sticker. Returns its size so callers can place it. */
function disclosureSize(ctx: Ctx, p: TemplateInput, scale: number) {
  font(ctx, 600, 12 * scale, p.fontFamily);
  const text = `#ad · Paid partnership with ${p.brandName}`;
  return { text, w: ctx.measureText(text).width + 24 * scale, h: 12 * scale * 1.35 + 12 * scale };
}

function disclosure(ctx: Ctx, p: TemplateInput, scale: number, x: number, y: number, bg = '#fff') {
  const { text, w, h } = disclosureSize(ctx, p, scale);
  rrect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x + 12 * scale, y + h / 2);
  ctx.textBaseline = 'alphabetic';
  return { w, h };
}

function diagonal(ctx: Ctx, colors: [string, string], w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, colors[0]);
  g.addColorStop(1, colors[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

// ------------------------------------------------------------------ templates

function drawStory(ctx: Ctx, p: TemplateInput, W: number, H: number) {
  const s = W / 360;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  photo(ctx, p.photo, 0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(0.35, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // Brand pill
  font(ctx, 600, 13 * s, p.fontFamily);
  const pillH = 38 * s;
  const pillW = 4 * s + 30 * s + 8 * s + ctx.measureText(p.brandName).width + 14 * s;
  rrect(ctx, 20 * s, 24 * s, pillW, pillH, pillH / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  logo(ctx, p.logo, 24 * s, 28 * s, 30 * s);
  ctx.fillStyle = '#111';
  ctx.textBaseline = 'middle';
  ctx.fillText(p.brandName, 62 * s, 24 * s + pillH / 2);
  ctx.textBaseline = 'alphabetic';

  // Bottom stack, laid out upwards from the sticker.
  const left = 22 * s;
  const maxW = W - 44 * s;
  const d = disclosureSize(ctx, p, s);
  const dY = H - 34 * s - d.h;
  disclosure(ctx, p, s, left, dY);
  font(ctx, 500, 15 * s, p.fontFamily);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  const tagY = dY - 10 * s - 4 * s;
  ctx.fillText(p.brandTag, left, tagY);
  font(ctx, 700, 36 * s, p.fontFamily, -0.8 * s);
  const lines = wrap(ctx, p.headline, maxW, 4);
  ctx.fillStyle = '#fff';
  const lh = 40 * s;
  const firstBase = tagY - 15 * s - 10 * s - (lines.length - 1) * lh - 6 * s;
  lines.forEach((l, i) => ctx.fillText(l, left, firstBase + i * lh));
}

function drawSquare(ctx: Ctx, p: TemplateInput, W: number) {
  const s = W / 360;
  diagonal(ctx, p.colors, W, W);
  ctx.beginPath();
  ctx.arc(W - 60 * s, 40 * s, 130 * s, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.14)';
  ctx.fill();
  logo(ctx, p.logo, 18 * s, 18 * s, 44 * s);

  // Taped polaroid
  ctx.save();
  ctx.translate(70 * s + 105 * s, 54 * s + 105 * s);
  ctx.rotate((-4 * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 24 * s;
  ctx.shadowOffsetY = 8 * s;
  rrect(ctx, -105 * s, -105 * s, 210 * s, 210 * s, 6 * s);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.shadowColor = 'transparent';
  photo(ctx, p.photo, -97 * s, -97 * s, 194 * s, 194 * s, 3 * s);
  ctx.save();
  ctx.translate(-105 * s + 70 * s + 35 * s, -105 * s - 10 * s + 11 * s);
  ctx.rotate((6 * Math.PI) / 180);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(-35 * s, -11 * s, 70 * s, 22 * s);
  ctx.restore();
  ctx.restore();

  // Sticker, top right, tilted
  const ds = s * 0.85;
  const d = disclosureSize(ctx, p, ds);
  ctx.save();
  ctx.translate(W - 16 * s - d.w / 2, 24 * s + d.h / 2);
  ctx.rotate((8 * Math.PI) / 180);
  ctx.shadowColor = 'rgba(0,0,0,0.2)';
  ctx.shadowBlur = 10 * s;
  disclosure(ctx, p, ds, -d.w / 2, -d.h / 2);
  ctx.restore();

  // Headline + tag
  font(ctx, 500, 12 * s, p.fontFamily);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  const tagY = W - 16 * s - 3 * s;
  ctx.fillText(p.brandTag, 20 * s, tagY);
  font(ctx, 700, 26 * s, p.fontFamily, -0.5 * s);
  const lines = wrap(ctx, p.headline, W - 40 * s, 2);
  const lh = 29 * s;
  ctx.fillStyle = '#fff';
  const firstBase = tagY - 12 * s - 4 * s - (lines.length - 1) * lh - 6 * s;
  lines.forEach((l, i) => ctx.fillText(l, 20 * s, firstBase + i * lh));
}

function drawReview(ctx: Ctx, p: TemplateInput, W: number, H: number) {
  const s = W / 360;
  ctx.fillStyle = p.colors[1];
  ctx.fillRect(0, 0, W, H);
  photo(ctx, p.photo, 0, 0, W, H * 0.58);

  const pad = 18 * s;
  const cardW = W - 32 * s;
  const innerW = cardW - pad * 2;
  font(ctx, 700, 22 * s, p.fontFamily, -0.4 * s);
  const lines = wrap(ctx, `“${p.headline}”`, innerW, 4);
  const lh = 26 * s;
  const ds = s * 0.9;
  const d = disclosureSize(ctx, p, ds);
  const rowH = 34 * s;
  const cardH = pad + rowH + 8 * s + lines.length * lh + 8 * s + 17 * s + 8 * s + d.h + pad;
  const x = 16 * s;
  const y = H - 16 * s - cardH;

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.18)';
  ctx.shadowBlur = 30 * s;
  rrect(ctx, x, y, cardW, cardH, 22 * s);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.restore();

  let cy = y + pad;
  for (let n = 1; n <= 5; n++) star(ctx, x + pad + 9 * s + (n - 1) * 21 * s, cy + rowH / 2, 9 * s, n <= p.rating);
  logo(ctx, p.logo, x + cardW - pad - 34 * s, cy, 34 * s);
  ctx.save();
  ctx.beginPath();
  ctx.arc(x + cardW - pad - 17 * s, cy + 17 * s, 17 * s, 0, Math.PI * 2);
  ctx.strokeStyle = '#E5E7EB';
  ctx.lineWidth = s;
  ctx.stroke();
  ctx.restore();
  cy += rowH + 8 * s;

  font(ctx, 700, 22 * s, p.fontFamily, -0.4 * s);
  ctx.fillStyle = '#111';
  lines.forEach((l, i) => ctx.fillText(l, x + pad, cy + 20 * s + i * lh));
  cy += lines.length * lh + 8 * s;

  font(ctx, 500, 13 * s, p.fontFamily);
  ctx.fillStyle = '#555';
  ctx.fillText(`@${p.handle} · ${p.brandTag}`, x + pad, cy + 13 * s);
  cy += 17 * s + 8 * s;

  disclosure(ctx, p, ds, x + pad, cy, '#F3F4F6');
}

function drawVoucher(ctx: Ctx, p: TemplateInput, W: number, H: number) {
  const s = W / 360;
  diagonal(ctx, p.colors, W, H);
  const cx = W / 2;
  logo(ctx, p.logo, cx - 23 * s, 22 * s, 46 * s);

  const r = 85 * s;
  const py = 22 * s + 46 * s + 14 * s;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, py + r, r, 0, Math.PI * 2);
  ctx.clip();
  if (p.photo) cover(ctx, p.photo, cx - r, py, r * 2, r * 2);
  else {
    ctx.fillStyle = '#1A1A24';
    ctx.fillRect(cx - r, py, r * 2, r * 2);
  }
  ctx.restore();
  ctx.beginPath();
  ctx.arc(cx, py + r, r - 3 * s, 0, Math.PI * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 6 * s;
  ctx.stroke();

  font(ctx, 700, 24 * s, p.fontFamily);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  const lines = wrap(ctx, p.headline, W - 40 * s, 2);
  let y = py + 2 * r + 14 * s;
  lines.forEach((l, i) => ctx.fillText(l, cx, y + 24 * s + i * 29 * s));
  y += lines.length * 29 * s + 12 * s;

  const code = p.voucher ?? 'KOLAB-CODE';
  font(ctx, 700, 28 * s, p.fontFamily, 2 * s);
  const boxW = Math.max(ctx.measureText(code).width, 110 * s) + 44 * s;
  const boxH = 10 * s + 15 * s + 34 * s + 10 * s;
  rrect(ctx, cx - boxW / 2, y, boxW, boxH, 16 * s);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.setLineDash([6 * s, 4 * s]);
  ctx.strokeStyle = p.colors[1];
  ctx.lineWidth = 2 * s;
  ctx.stroke();
  ctx.setLineDash([]);
  font(ctx, 500, 11 * s, p.fontFamily, s);
  ctx.fillStyle = '#555';
  ctx.fillText('USE MY CODE', cx, y + 10 * s + 12 * s);
  font(ctx, 700, 28 * s, p.fontFamily, 2 * s);
  ctx.fillStyle = '#111';
  ctx.fillText(code, cx, y + 10 * s + 15 * s + 28 * s);
  ctx.textAlign = 'left';

  const d = disclosureSize(ctx, p, s);
  disclosure(ctx, p, s, cx - d.w / 2, H - 16 * s - d.h);
}

/** Draws a template onto `canvas`, resizing it to the 1080-px export size. */
export function drawTemplate(canvas: HTMLCanvasElement, id: TemplateId, p: TemplateInput) {
  const t = TEMPLATES.find((x) => x.id === id)!;
  canvas.width = t.width;
  canvas.height = t.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, t.width, t.height);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  if (id === 'story') drawStory(ctx, p, t.width, t.height);
  else if (id === 'square') drawSquare(ctx, p, t.width);
  else if (id === 'review') drawReview(ctx, p, t.width, t.height);
  else drawVoucher(ctx, p, t.width, t.height);
}

/** PNG of the canvas; rejects if a cross-origin image slipped through and tainted it. */
export function canvasPng(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Export failed'))), 'image/png');
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Export failed'));
    }
  });
}
