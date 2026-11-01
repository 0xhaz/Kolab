import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/** True for loopback, private, link-local, CGNAT and other non-public addresses. */
export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === '::1' || v === '::') return true;
    if (v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80')) return true;
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
    return mapped ? isPrivateAddress(mapped[1]!) : false;
  }
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    a === 0 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224
  );
}

/**
 * Fetches a public product page as plain text for the brief builder. Refuses non-http(s) URLs and
 * hosts that resolve to private addresses (SSRF), doesn't follow redirects, caps time and size.
 */
export async function fetchProductText(raw: string, maxChars = 4000): Promise<string | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const addrs = await lookup(url.hostname, { all: true }).catch(() => []);
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return null;

  try {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(5000), headers: { 'user-agent': 'KolabBriefBot/0.1' } });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) return null;
    const html = (await res.text()).slice(0, 400_000);
    const title = /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1] ?? '';
    const desc = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html)?.[1] ?? '';
    const body = html
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ');
    return `${title}. ${desc}. ${body}`.slice(0, maxChars);
  } catch {
    return null;
  }
}
