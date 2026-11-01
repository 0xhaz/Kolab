/** Deterministic submission checks (architecture §5.1). The AI content check layers on top later. */

export interface OEmbed {
  title?: string;
  author_name?: string;
  kolab_created_at?: string;
}

export interface CheckOutcome {
  checkType: 'exists' | 'author' | 'timing' | 'disclosure' | 'hash' | 'format';
  passed: boolean;
  detail: string;
}

/** Paid-partnership markers accepted across MY / ID / PH / TH. */
const DISCLOSURE = /#(ad|ads|iklan|sponsored|spon|paidpartnership|kolab)\b|paid partnership|bayad na partnership/i;

/** Which of the creator's channels a post URL belongs to (so the author is compared to that handle). */
export function platformFromUrl(url: string): string | null {
  let host: string;
  try {
    host = new URL(url).hostname.replace(/^(www|m|vm)\./, '');
  } catch {
    return null;
  }
  if (host.endsWith('tiktok.com')) return 'tiktok';
  if (host.endsWith('instagram.com')) return 'instagram';
  if (host.endsWith('youtube.com') || host === 'youtu.be') return 'youtube';
  if (host.endsWith('facebook.com') || host === 'fb.watch') return 'facebook';
  if (host === 'x.com' || host === 'twitter.com') return 'x';
  return null;
}

export function runChecks(input: {
  oembed: OEmbed | null;
  linkedHandle: string | null;
  enrolledAt: Date;
  now: Date;
}): CheckOutcome[] {
  const { oembed, linkedHandle, enrolledAt, now } = input;
  if (!oembed) return [{ checkType: 'exists', passed: false, detail: 'Post not found or not public' }];

  const out: CheckOutcome[] = [{ checkType: 'exists', passed: true, detail: 'Public post found via oEmbed' }];

  const author = oembed.author_name?.toLowerCase() ?? '';
  out.push(
    linkedHandle
      ? {
          checkType: 'author',
          passed: author === linkedHandle.toLowerCase().replace(/^@/, ''),
          detail: `Post author @${author}, linked handle @${linkedHandle.replace(/^@/, '')}`,
        }
      : { checkType: 'author', passed: true, detail: `No linked handle yet; post author @${author}` },
  );

  const created = oembed.kolab_created_at ? new Date(oembed.kolab_created_at) : null;
  out.push(
    created
      ? {
          checkType: 'timing',
          // a day of slack for timezone / clock differences between platforms
          passed: created.getTime() >= enrolledAt.getTime() - 86_400_000 && created.getTime() <= now.getTime() + 300_000,
          detail: `Posted ${created.toISOString()}`,
        }
      : { checkType: 'timing', passed: true, detail: 'Platform gives no post time; skipped' },
  );

  const caption = oembed.title ?? '';
  out.push({
    checkType: 'disclosure',
    passed: DISCLOSURE.test(caption),
    detail: DISCLOSURE.test(caption) ? 'Paid-partnership disclosure found' : 'No #ad / paid-partnership disclosure in caption',
  });
  return out;
}
