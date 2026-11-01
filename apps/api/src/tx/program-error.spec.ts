import { extractProgramErrorCode, txErrorBody } from './program-error.js';

describe('program errors', () => {
  it('reads hex codes from simulation logs', () => {
    const err = new Error('Transaction simulation failed: Error processing Instruction 0: custom program error: 0x177d');
    expect(extractProgramErrorCode(err)).toBe(6013);
  });

  it('reads decimal codes from nested error context', () => {
    const err = Object.assign(new Error('Simulation failed'), {
      context: { err: { InstructionError: [0, { Custom: 6022 }] } },
    });
    expect(extractProgramErrorCode(err)).toBe(6022);
  });

  it('maps to friendly copy', () => {
    const body = txErrorBody(new Error('custom program error: 0x177d'), 'tx_send_failed');
    expect(body).toMatchObject({ code: 'program_error', programCode: 6013 });
    expect(body.message).toMatch(/unpromised funds/);
  });

  it('keeps the transport message for non-program errors', () => {
    expect(txErrorBody(new Error('fetch failed'), 'tx_send_failed')).toMatchObject({
      code: 'tx_send_failed',
      message: 'fetch failed',
    });
  });
});
