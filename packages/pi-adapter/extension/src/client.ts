// extension/src/client.ts — createKbTrpcClient(url, token) -> a tRPC proxy client
// typed against PiAppRouter (the daemon's AppRouter minus the 'write' group).
// pi authors with native write/edit; the client type simply doesn't expose Write.

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { PiAppRouter } from '@kb/protocol';

export type { PiAppRouter } from '@kb/protocol';

/**
 * Build a tRPC proxy client for the KB daemon.
 * @param url   Base URL (e.g. "http://127.0.0.1:3000"); tRPC at <url>/trpc.
 * @param token Bearer auth token.
 */
export function createKbTrpcClient(url: string, token: string) {
  return createTRPCProxyClient<PiAppRouter>({
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        headers: () => ({ authorization: `Bearer ${token}` }),
      } as never),
    ],
  });
}
