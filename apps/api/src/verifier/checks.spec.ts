import { platformFromUrl, runChecks } from './checks.js';

const enrolledAt = new Date('2026-10-20T00:00:00Z');
const now = new Date('2026-10-22T00:00:00Z');
const base = { title: 'Best serum ever #ad', author_name: 'siti.reviews', kolab_created_at: '2026-10-21T10:00:00Z' };

describe('runChecks', () => {
  it('passes a disclosed, on-time post by the linked handle', () => {
    const r = runChecks({ oembed: base, linkedHandle: '@Siti.Reviews', enrolledAt, now });
    expect(r.every((c) => c.passed)).toBe(true);
  });

  it('fails a missing post outright', () => {
    expect(runChecks({ oembed: null, linkedHandle: null, enrolledAt, now })).toEqual([
      expect.objectContaining({ checkType: 'exists', passed: false }),
    ]);
  });

  it('flags missing disclosure, wrong author and a post from before enrollment', () => {
    const r = runChecks({
      oembed: { ...base, title: 'Best serum ever', author_name: 'someone.else', kolab_created_at: '2026-10-10T00:00:00Z' },
      linkedHandle: 'siti.reviews',
      enrolledAt,
      now,
    });
    const failed = r.filter((c) => !c.passed).map((c) => c.checkType);
    expect(failed).toEqual(['author', 'timing', 'disclosure']);
  });

  it('accepts local-language disclosure tags', () => {
    const r = runChecks({ oembed: { ...base, title: 'Cuba produk ni #iklan' }, linkedHandle: null, enrolledAt, now });
    expect(r.find((c) => c.checkType === 'disclosure')?.passed).toBe(true);
  });
});

describe('platformFromUrl', () => {
  it('maps post URLs to the channel they belong to', () => {
    expect(platformFromUrl('https://www.tiktok.com/@siti/video/1')).toBe('tiktok');
    expect(platformFromUrl('https://vm.tiktok.com/abc')).toBe('tiktok');
    expect(platformFromUrl('https://www.instagram.com/reel/xyz')).toBe('instagram');
    expect(platformFromUrl('https://youtu.be/abc')).toBe('youtube');
    expect(platformFromUrl('https://x.com/a/status/1')).toBe('x');
    expect(platformFromUrl('https://example.com/post')).toBeNull();
    expect(platformFromUrl('not a url')).toBeNull();
  });
});
