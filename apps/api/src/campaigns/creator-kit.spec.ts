import { postRequirements, precheckCaption } from '@kolab/shared';

const camp = { title: 'Glow Lab serum: October package', brandName: 'Glow Lab MY' };

describe('post requirements + pre-check', () => {
  it('derives tags from the campaign', () => {
    expect(postRequirements(camp, 'KOLAB-ABC123')).toEqual({
      disclosure: '#ad',
      brandTag: '#GlowLabMY',
      product: 'Glow Lab serum',
      voucher: 'KOLAB-ABC123',
    });
  });

  it('passes a complete caption', () => {
    const req = postRequirements(camp, 'KOLAB-ABC123');
    const items = precheckCaption('My morning glow lab serum routine ✨ code KOLAB-ABC123 #ad #glowlabmy', req);
    expect(items.every((i) => i.passed)).toBe(true);
  });

  it('flags what is missing with a fix', () => {
    const req = postRequirements(camp);
    const failed = precheckCaption('Loving this serum', req).filter((i) => !i.passed);
    expect(failed.map((i) => i.key)).toEqual(['disclosure', 'brandTag', 'product']);
    expect(failed[0]?.fix).toBe('Add #ad');
  });

  it('accepts local-language disclosure', () => {
    const req = postRequirements(camp);
    expect(precheckCaption('Glow Lab serum #iklan #GlowLabMY', req).find((i) => i.key === 'disclosure')?.passed).toBe(true);
  });
});
