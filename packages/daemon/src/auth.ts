// @kb/daemon — auth: getOrMintToken. Read from OS keyring via @napi-rs/keyring
// (service 'kb', account 'daemon'); if absent, read KB_TOKEN env; if both absent,
// mint a random token (crypto.randomUUID), store in keyring, return it.
// Never log the token.

import { randomUUID } from 'node:crypto';
import { Entry } from '@napi-rs/keyring';

const SERVICE = 'kb';
const ACCOUNT = 'daemon';

/** Options for getOrMintToken (test seam). */
export interface GetOrMintTokenOptions {
  /** Override the env var name (default 'KB_TOKEN'). */
  envVar?: string;
  /** Override the keyring entry (test seam). */
  entry?: { getPassword(): string | null; setPassword(p: string): void };
}

/**
 * Retrieve the daemon auth token.
 * 1. Try the OS keyring (service 'kb', account 'daemon').
 * 2. If absent, try KB_TOKEN env.
 * 3. If both absent, mint a random token (crypto.randomUUID), store in keyring, return it.
 * Never logs the token.
 */
export function getOrMintToken(opts: GetOrMintTokenOptions = {}): string {
  const envVar = opts.envVar ?? 'KB_TOKEN';
  const entry = opts.entry ?? new Entry(SERVICE, ACCOUNT);

  // 1. Try keyring
  let fromKeyring: string | null = null;
  try {
    fromKeyring = entry.getPassword();
  } catch {
    // keyring may be unavailable (headless CI, no secret service) — fall through to env
    fromKeyring = null;
  }

  // 2. If keyring has it, return it
  if (fromKeyring && fromKeyring.length > 0) {
    return fromKeyring;
  }

  // 3. Try env fallback
  const fromEnv = process.env[envVar];
  if (fromEnv && fromEnv.length > 0) {
    return fromEnv;
  }

  // 4. Both absent → mint + store
  const minted = randomUUID();
  try {
    entry.setPassword(minted);
  } catch {
    // keyring unavailable — return the minted token anyway (in-memory only).
    // The caller (daemon) will use it for this process lifetime.
  }
  return minted;
}
