import sharp from 'sharp';

/**
 * Original demo artwork for the fictional "Glow Lab" brand (no real brand imagery): a monogram logo
 * and stylised serum-bottle product shots, rendered from SVG.
 */
export const GLOW_LAB_COLORS = ['#F97316', '#7C3AED'] as const;

const logoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#F97316"/><stop offset="1" stop-color="#7C3AED"/></linearGradient></defs>
  <circle cx="256" cy="200" r="150" fill="url(#g)"/>
  <circle cx="256" cy="200" r="104" fill="none" stroke="#fff" stroke-width="10" opacity="0.9"/>
  <path d="M256 112 C 286 156 314 196 314 228 A 58 58 0 0 1 198 228 C 198 196 226 156 256 112 Z" fill="#fff"/>
  <text x="256" y="430" font-family="Helvetica, Arial, sans-serif" font-size="72" font-weight="800" fill="#1F1235" text-anchor="middle" letter-spacing="6">GLOW LAB</text>
</svg>`;

function productSvg(bg: [string, string], accent: string, caption: string) {
  return `
<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg[0]}"/><stop offset="1" stop-color="${bg[1]}"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#FDBA74"/><stop offset="0.5" stop-color="#F97316"/><stop offset="1" stop-color="#C2410C"/></linearGradient>
  </defs>
  <rect width="1080" height="1350" fill="url(#bg)"/>
  <circle cx="860" cy="260" r="220" fill="#fff" opacity="0.18"/>
  <circle cx="180" cy="1150" r="260" fill="#fff" opacity="0.12"/>
  <ellipse cx="540" cy="1150" rx="260" ry="40" fill="#000" opacity="0.12"/>
  <rect x="505" y="250" width="70" height="120" rx="30" fill="#1F1235"/>
  <rect x="470" y="360" width="140" height="70" rx="18" fill="#2E1A4F"/>
  <rect x="380" y="420" width="320" height="730" rx="70" fill="url(#glass)"/>
  <rect x="410" y="450" width="40" height="660" rx="20" fill="#fff" opacity="0.25"/>
  <rect x="405" y="640" width="270" height="330" rx="24" fill="#fff"/>
  <text x="540" y="730" font-family="Helvetica, Arial, sans-serif" font-size="36" font-weight="800" fill="#1F1235" text-anchor="middle" letter-spacing="2">GLOW LAB</text>
  <text x="540" y="800" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="${accent}" text-anchor="middle">VITAMIN C</text>
  <text x="540" y="845" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="600" fill="${accent}" text-anchor="middle">SERUM</text>
  <text x="540" y="930" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#6B7280" text-anchor="middle">30 ml</text>
  <text x="540" y="1270" font-family="Helvetica, Arial, sans-serif" font-size="40" font-weight="700" fill="#fff" text-anchor="middle" opacity="0.95">${caption}</text>
</svg>`;
}

export async function renderGlowLabKit(): Promise<{ logo: Buffer; products: Buffer[] }> {
  const logo = await sharp(Buffer.from(logoSvg)).png().toBuffer();
  const shots: Array<[[string, string], string, string]> = [
    [['#FDE68A', '#FB923C'], '#C2410C', 'Your morning glow'],
    [['#E9D5FF', '#A78BFA'], '#7C3AED', 'Vitamin C, every day'],
    [['#FECACA', '#F472B6'], '#BE185D', 'Bright skin, no fragrance'],
  ];
  const products = await Promise.all(shots.map(([bg, accent, caption]) => sharp(Buffer.from(productSvg(bg, accent, caption))).jpeg({ quality: 88 }).toBuffer()));
  return { logo, products };
}
