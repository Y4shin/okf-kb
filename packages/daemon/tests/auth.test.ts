// @kb/daemon — auth test: getOrMintToken env fallback + mint path.
// Keyring path is hard to test without mocking (may be unavailable in CI);
// we test the env fallback and the mint path (both cleared).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getOrMintToken } from '../src/auth.js';

describe('getOrMintToken', () => {
  const savedToken = process.env.KB_TOKEN;

  afterEach(() => {
    if (savedToken === undefined) delete process.env.KB_TOKEN;
    else process.env.KB_TOKEN = savedToken;
  });

  it('returns KB_TOKEN from env when set (keyring empty)', () => {
    delete process.env.KB_TOKEN;
    process.env.KB_TOKEN = 'test-token-from-env';
    const fakeEntry = { getPassword: () => null, setPassword: () => {} };
    const token = getOrMintToken({ entry: fakeEntry });
    expect(token).toBe('test-token-from-env');
  });

  it('returns a non-empty string when both keyring and env are empty (mint path)', () => {
    delete process.env.KB_TOKEN;
    let stored: string | null = null;
    const fakeEntry = {
      getPassword: () => stored,
      setPassword: (p: string) => { stored = p; },
    };
    const token = getOrMintToken({ entry: fakeEntry });
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    // minted token should be stored
    expect(stored).toBe(token);
  });

  it('returns the keyring token when keyring has one (keyring takes priority over env)', () => {
    process.env.KB_TOKEN = 'env-should-not-win';
    const fakeEntry = { getPassword: () => 'keyring-token', setPassword: () => {} };
    const token = getOrMintToken({ entry: fakeEntry });
    expect(token).toBe('keyring-token');
  });

  it('returns minted token and survives when keyring setPassword throws (headless fallback)', () => {
    delete process.env.KB_TOKEN;
    const fakeEntry = {
      getPassword: () => null,
      setPassword: () => { throw new Error('no secret service'); },
    };
    const token = getOrMintToken({ entry: fakeEntry });
    expect(token).toBeTruthy();
    expect(token.length).toBeGreaterThan(0);
  });

  it('does not return an empty keyring entry (falls through to env)', () => {
    process.env.KB_TOKEN = 'env-fallback';
    const fakeEntry = { getPassword: () => '', setPassword: () => {} };
    const token = getOrMintToken({ entry: fakeEntry });
    expect(token).toBe('env-fallback');
  });
});
