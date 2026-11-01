import {
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  getBase64Encoder,
  getTransactionDecoder,
  getTransactionEncoder,
  createNoopSigner,
  partiallySignTransaction,
  type KeyPairSigner,
} from '@solana/kit';
import { getAddMemoInstruction } from '@solana-program/memo';
import { TxService } from './tx.service.js';
import type { SolanaService } from '../solana/solana.service.js';

const BLOCKHASH = {
  blockhash: '11111111111111111111111111111111',
  lastValidBlockHeight: 100n,
};

function fakeSolana(sponsor: KeyPairSigner) {
  const sent: string[] = [];
  const rpc = {
    getLatestBlockhash: () => ({ send: async () => ({ value: BLOCKHASH }) }),
    sendTransaction: (wire: string) => ({
      send: async () => {
        sent.push(wire);
        return 'sig';
      },
    }),
    getSignatureStatuses: () => ({
      send: async () => ({ value: [{ confirmationStatus: 'confirmed', err: null }] }),
    }),
  };
  return { solana: { sponsor, rpc } as unknown as SolanaService, sent };
}

async function userSign(wire: string, user: KeyPairSigner): Promise<string> {
  const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
  const signed = await partiallySignTransaction([user.keyPair], tx);
  return getBase64EncodedWireTransaction(signed);
}

describe('TxService', () => {
  let sponsor: KeyPairSigner;
  let user: KeyPairSigner;
  let service: TxService;
  let sent: string[];

  beforeEach(async () => {
    sponsor = await generateKeyPairSigner();
    user = await generateKeyPairSigner();
    const fake = fakeSolana(sponsor);
    sent = fake.sent;
    service = new TxService(fake.solana);
  });

  async function buildMemo(forUser = user) {
    const ix = getAddMemoInstruction({ memo: 'hi', signers: [createNoopSigner(forUser.address)] });
    return service.buildSponsored([ix]);
  }

  it('builds a tx signed by the sponsor with the user slot empty', async () => {
    const wire = await buildMemo();
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(wire));
    expect(tx.signatures[sponsor.address]).toBeTruthy();
    expect(tx.signatures[user.address]).toBeNull();
  });

  it('submits once the expected user has signed', async () => {
    const signed = await userSign(await buildMemo(), user);
    await expect(service.submit(signed, user.address)).resolves.toBeTypeOf('string');
    expect(sent).toHaveLength(1);
  });

  it('rejects a tx the user has not signed', async () => {
    await expect(service.submit(await buildMemo(), user.address)).rejects.toMatchObject({
      response: { code: 'tx_missing_user_signature' },
    });
    expect(sent).toHaveLength(0);
  });

  it('rejects a tx submitted by a different logged-in user', async () => {
    const other = await generateKeyPairSigner();
    const signed = await userSign(await buildMemo(), user);
    await expect(service.submit(signed, other.address)).rejects.toMatchObject({
      response: { code: 'tx_missing_user_signature' },
    });
  });

  it('rejects a tx whose message was changed after we signed it', async () => {
    const signed = await userSign(await buildMemo(), user);
    const tx = getTransactionDecoder().decode(getBase64Encoder().encode(signed));
    const bytes = new Uint8Array(getTransactionEncoder().encode(tx));
    bytes[bytes.length - 1] ^= 0xff; // flip a byte inside the memo data
    const tampered = Buffer.from(bytes).toString('base64');
    await expect(service.submit(tampered, user.address)).rejects.toMatchObject({
      response: { code: 'tx_not_sponsored' },
    });
    expect(sent).toHaveLength(0);
  });

  it('rejects a tx built with someone else as fee payer', async () => {
    const otherSponsor = await generateKeyPairSigner();
    const otherService = new TxService(fakeSolana(otherSponsor).solana);
    const ix = getAddMemoInstruction({ memo: 'hi', signers: [createNoopSigner(user.address)] });
    const signed = await userSign(await otherService.buildSponsored([ix]), user);
    await expect(service.submit(signed, user.address)).rejects.toMatchObject({
      response: { code: 'tx_not_sponsored' },
    });
  });
});
