// @kb/cli — client: createTrpcClient(url, token) -> a tRPC proxy typed AppRouter.
// The CLI uses this to call daemon procedures over HTTP with Bearer auth.

import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@kb/protocol';

/**
 * Create a tRPC proxy client typed against the daemon's AppRouter.
 * Connects to <url>/trpc with the Authorization: Bearer <token> header.
 */
export function createTrpcClient(url: string, token?: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${url}/trpc`,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      } as never),
    ],
  });
}

/** Re-export the AppRouter type for consumers that want the client type. */
export type { AppRouter };
