// extension/src/client.ts — createKbTrpcClient(url, token) -> a tRPC proxy client
// typed against PiAppRouter (the daemon's AppRouter minus the 'write' group).
// pi authors with native write/edit; the client type simply doesn't expose Write.

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@kb/protocol';

/**
 * The pi-facing tRPC router type: the daemon's full AppRouter with the
 * 'write' group omitted. pi authors with native write/edit then calls
 * kb_update to reindex. This is a compile-time guarantee — client.write is
 * absent from the type, so pi can't call put/delete through the client.
 */
export type PiAppRouter = Omit<AppRouter, 'write'>;

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
      }),
    ],
  });
}
