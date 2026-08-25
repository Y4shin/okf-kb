// extension/src/client.ts — createKbTrpcClient<R>(url, token) -> a tRPC proxy client
// typed against R (PiAppRouter for local, AppRouter for remote).
// pi authors with native write/edit locally (PiAppRouter omits write);
// remotely, AppRouter exposes write for kb_put/kb_delete.

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { PiAppRouter, AppRouter } from '@okf-kb/protocol';

export type { PiAppRouter, AppRouter } from '@okf-kb/protocol';

/** The router type parameter: PiAppRouter (local) or AppRouter (remote). */
export type KbRouterType = PiAppRouter | AppRouter;

/**
 * Build a tRPC proxy client for the KB daemon.
 * @param url   Base URL (e.g. "http://127.0.0.1:30700"); tRPC at <url>/trpc.
 * @param token Bearer auth token.
 * @typeParam R The router type: PiAppRouter (local, no write) or AppRouter (remote, full).
 */
export function createKbTrpcClient<R extends KbRouterType>(url: string, token: string) {
  return createTRPCProxyClient<R>({
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        headers: () => ({ authorization: `Bearer ${token}` }),
      } as never),
    ],
  });
}
