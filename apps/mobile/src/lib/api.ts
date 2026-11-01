import { usePrivy } from '@privy-io/expo';
import { useCallback } from 'react';
import { env } from './env';

export class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
  }
}

/** Returns a fetcher for the Kolab API with the Privy access token attached. */
export function useApi() {
  const { getAccessToken } = usePrivy();

  return useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const token = await getAccessToken();
      const res = await fetch(`${env.apiUrl}${path}`, {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
      });
      const body = res.status === 204 ? undefined : await res.json().catch(() => undefined);
      if (!res.ok) throw new ApiError(res.status, body);
      return body as T;
    },
    [getAccessToken],
  );
}
