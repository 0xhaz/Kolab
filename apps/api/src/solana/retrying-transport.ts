import {
  createDefaultRpcTransport,
  isSolanaError,
  SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR,
  type RpcTransport,
} from '@solana/kit';

const RETRYABLE = new Set([429, 502, 503, 504]);

/**
 * RPC transport that retries rate limits and gateway errors with exponential backoff
 * (honouring Retry-After). Public devnet RPC throttles bursts; a dedicated RPC mostly won't.
 */
export function createRetryingTransport(url: string, maxRetries = 5): RpcTransport {
  const transport = createDefaultRpcTransport({ url });
  return (async (...args: Parameters<RpcTransport>) => {
    for (let attempt = 0; ; attempt++) {
      try {
        return await transport(...args);
      } catch (err) {
        const status =
          isSolanaError(err, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR) ? err.context.statusCode : undefined;
        if (status === undefined || !RETRYABLE.has(status) || attempt >= maxRetries) throw err;
        const retryAfter = isSolanaError(err, SOLANA_ERROR__RPC__TRANSPORT_HTTP_ERROR)
          ? Number(err.context.headers?.get?.('retry-after'))
          : NaN;
        const wait = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 400 * 2 ** attempt;
        await new Promise((r) => setTimeout(r, Math.min(wait, 8_000)));
      }
    }
  }) as RpcTransport;
}
