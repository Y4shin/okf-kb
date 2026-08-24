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

/** Loopback hostname literals — a URL pointing at one of these is "local".
 * Note: `new URL('http://[::1]:30700').hostname` returns `"[::1]"` (bracketed),
 * so we include both the raw `::1` (daemon bind-host check) and the bracketed
 * `[::1]` (URL hostname check) forms. */
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]'];

/**
 * Determine whether KB_URL points at a non-localhost (remote) daemon.
 *
 * This is a **string** check on the URL hostname literal, NOT a DNS
 * resolution — a hostname that *resolves* to loopback is still treated as
 * remote (safe over-permissive). `0.0.0.0` is NOT a loopback literal and is
 * treated as remote.
 *
 * - `'http://127.0.0.1:30700'` → `false` (local)
 * - `'http://localhost:30700'` → `false` (local)
 * - `'http://[::1]:30700'` → `false` (local)
 * - `'http://0.0.0.0:30700'` → `true`  (remote — not a loopback literal)
 * - `'http://kb.lan:30700'` → `true`  (remote)
 * - `'not a url'` → `false` (malformed → treat as local; do not activate Write on a parse error)
 *
 * @param url The KB_URL string.
 * @returns `true` if the URL points at a non-localhost host.
 */
export function isRemoteKb(url: string): boolean {
  try {
    const h = new URL(url).hostname;
    return !LOOPBACK_HOSTS.includes(h);
  } catch {
    return false; // malformed URL → treat as local (don't activate Write on a parse error)
  }
}
