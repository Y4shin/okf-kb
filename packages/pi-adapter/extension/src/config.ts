// extension/src/config.ts — resolve KB daemon config (url + token) from env/keyring.
// No committed secrets. url default http://127.0.0.1:30700 (tRPC at <url>/trpc).
// The default port 30700 matches the @kb/cli default and avoids colliding with
// Silverbullet's web UI (default port 3000).

import { getOrMintToken } from '@kb/daemon';

export interface KbConfig {
  /** Base URL of the KB daemon (tRPC endpoint is <url>/trpc). */
  url: string;
  /** Bearer auth token for the daemon. */
  token: string;
}

/**
 * Resolve KB daemon config.
 * - url: KB_URL env or default "http://127.0.0.1:30700"
 * - token: KB_TOKEN env, or @kb/daemon's getOrMintToken (env > keyring > mint)
 */
export function resolveKbConfig(): KbConfig {
  const url = process.env.KB_URL ?? 'http://127.0.0.1:30700';
  const token = process.env.KB_TOKEN ?? getOrMintToken();
  return { url, token };
}
