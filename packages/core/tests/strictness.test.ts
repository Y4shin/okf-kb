import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Proves the GroupBindings/builder gates are real: runs `npm run typecheck:negatives`
 * (tsc --noEmit --strict on tests/negatives.test-d.ts) and asserts exit 0.
 * Every @ts-expect-error in negatives.test-d.ts MUST fire; if one is unused (the line is
 * actually fine), tsc errors with "Unused '@ts-expect-error' directive" and this test fails.
 */
describe('strictness negatives', () => {
  it('all @ts-expect-error directives in negatives.test-d.ts fire (exit 0)', () => {
    let exit = 0;
    let stderr = '';
    try {
      execSync('npm run typecheck:negatives', { cwd: here, stdio: 'pipe' });
    } catch (e: any) {
      exit = e.status ?? 1;
      stderr = String(e.stderr ?? '');
    }
    expect(exit).toBe(0);
    if (stderr) {
      // The only acceptable stderr is tsc's normal (non-fatal) output; assert no "error TS".
      expect(stderr).not.toMatch(/error TS\d/);
    }
  });
});
