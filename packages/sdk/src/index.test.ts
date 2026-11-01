import { describe, expect, it } from 'vitest';
import {
  KOLAB_ERROR__INSUFFICIENT_FUNDS,
  KOLAB_ERROR__REVIEW_WINDOW_OPEN,
  KOLAB_PROGRAM_ADDRESS,
  KOLAB_PROGRAM_IDS,
  kolabErrorMessage,
} from './index.js';

describe('@kolab/sdk', () => {
  it('generated client targets the hosted program by default', () => {
    expect(KOLAB_PROGRAM_ADDRESS).toBe(KOLAB_PROGRAM_IDS.hosted);
  });

  it('friendly messages line up with the generated error codes', () => {
    expect(kolabErrorMessage(KOLAB_ERROR__INSUFFICIENT_FUNDS)).toMatch(/unpromised funds/);
    expect(kolabErrorMessage(KOLAB_ERROR__REVIEW_WINDOW_OPEN)).toMatch(/time to review/);
  });

  it('falls back to the program message and ignores foreign codes', () => {
    expect(kolabErrorMessage(6000)).toBe('Signer is not the configured admin');
    expect(kolabErrorMessage(1)).toBeNull();
  });
});
