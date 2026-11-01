import { openAddress, sealAddress } from './address-crypto.js';

const key = 'a'.repeat(64);
const address = JSON.stringify({ name: 'Siti', line1: 'Jl. Sudirman 1', city: 'Jakarta' });

describe('address crypto', () => {
  it('round-trips', () => {
    expect(openAddress(sealAddress(address, key, 'enr-1'), key, 'enr-1')).toBe(address);
  });
  it('never stores plaintext', () => {
    expect(sealAddress(address, key, 'enr-1').toString('utf8')).not.toContain('Sudirman');
  });
  it('fails for another enrollment (bound AAD)', () => {
    expect(() => openAddress(sealAddress(address, key, 'enr-1'), key, 'enr-2')).toThrow();
  });
  it('fails with the wrong key', () => {
    expect(() => openAddress(sealAddress(address, key, 'enr-1'), 'b'.repeat(64), 'enr-1')).toThrow();
  });
});
