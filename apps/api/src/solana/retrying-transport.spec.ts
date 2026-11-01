import { createRetryingTransport } from './retrying-transport.js';

const ok = () =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: 42 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
const status = (code: number) => new Response('busy', { status: code, headers: { 'retry-after': '0' } });

describe('createRetryingTransport', () => {
  const realFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  const call = (t: ReturnType<typeof createRetryingTransport>) =>
    t({ payload: { jsonrpc: '2.0', id: 1, method: 'getSlot', params: [] } } as never);

  it('retries 429s and returns the eventual result', async () => {
    const responses = [status(429), status(429), ok()];
    const fetchMock = vi.fn(async () => responses.shift()!);
    globalThis.fetch = fetchMock as never;
    await expect(call(createRetryingTransport('http://rpc.test'))).resolves.toMatchObject({ result: 42n });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('does not retry client errors', async () => {
    const fetchMock = vi.fn(async () => status(400));
    globalThis.fetch = fetchMock as never;
    await expect(call(createRetryingTransport('http://rpc.test'))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxRetries', async () => {
    const fetchMock = vi.fn(async () => status(503));
    globalThis.fetch = fetchMock as never;
    await expect(call(createRetryingTransport('http://rpc.test', 2))).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
