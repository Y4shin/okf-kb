// extension/src/config.ts — resolve KB daemon config (url + token) from env/keyring.
// No committed secrets. url default http://127.0.0.1:3000 (tRPC at <url>/trpc).

import { getOrMintToken } from '@kb/daemon';

export interface KbConfig {
  /** Base URL of the KB daemon (tRPC endpoint is <url>/trpc). */
  url: string;
  /** Bearer auth token for the daemon. */
  token: string;
}

/**
 * Resolve KB daemon config.
 * - url: KB_URL env or default "http://127.0.0.1:3000"
 * - token: KB_TOKEN env, or @kb/daemon's getOrMintToken (keyring > env > mint)
 */
export function resolveKbConfig(): KbConfig {
  const url = process.env.KB_URL ?? 'http://127.0.0.1:3000';
  const token = process.env.KB_TOKEN ?? getOrMintToken();
  return { url, token };
}
