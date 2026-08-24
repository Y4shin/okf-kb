// @kb/daemon — trpc: mounts the tRPC router (built by @kb/protocol/buildRouter)
// with the Bearer auth middleware + the tRPC node-http adapter.
// The pure router lives in @kb/protocol so the CLI shares the type; the daemon
// just mounts it.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHTTPHandler } from '@trpc/server/adapters/standalone';
import type { AppRouter } from '@kb/protocol';
import { buildRouter } from '@kb/protocol';
import type { AllGroups } from '@kb/protocol';
import type { Kb } from '@kb/core';

/** Check a request's Authorization header against the expected Bearer token. */
export function checkBearer(req: IncomingMessage, expectedToken: string): boolean {
  const auth = req.headers.authorization;
  if (!auth) return false;
  if (!auth.startsWith('Bearer ')) return false;
  const token = auth.slice(7).trim();
  return token === expectedToken;
}

/** Build the tRPC HTTP handler (node-http adapter) with Bearer auth middleware. */
export function createTrpcHandler(kb: Kb<AllGroups>, token: string) {
  const router = buildRouter(kb);
  return createHTTPHandler({
    router,
    basePath: '/trpc/',
    createContext: async ({ req }: { req: IncomingMessage; res: ServerResponse }) => {
      if (!checkBearer(req, token)) {
        throw new AuthError('Unauthorized');
      }
      return {} as never;
    },
  });
}

/** Custom error so the server mount can detect auth failures and set 401. */
export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export type { AppRouter };
