// @okf-kb/daemon — bin test: spawn the built okfkbd binary on an ephemeral
// port with a tmp space, assert health endpoint, then SIGTERM cleanly.
import { describe, it, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { testManifest } from '../../fs/tests/helpers.js';

const DIST_PATH = join(process.cwd(), 'packages/daemon/dist/index.js');
const BIN_PATH = join(process.cwd(), 'packages/daemon/bin/okfkbd.js');

async function makeTmpSpace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kb-daemon-bin-test-'));
  for (const entry of Object.values(testManifest.types)) {
    await mkdir(join(dir, entry.dir), { recursive: true });
  }
  await writeFile(join(dir, '.gitkeep'), '');
  return dir;
}

describe('daemon bin', () => {
  it('okfkbd starts, serves health, and exits cleanly on SIGTERM', async () => {
    if (!existsSync(DIST_PATH)) {
      console.warn('Skipping daemon bin test: packages/daemon/dist/index.js not found');
      return;
    }

    const space = await makeTmpSpace();
    const proc = spawn('node', [BIN_PATH, '--port', '0', '--space', space], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (d) => { stderr += d; });

    const url = await new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('timeout waiting for okfkbd listen line'));
      }, 15000);

      const onData = (d: Buffer) => {
        stderr += d;
        const match = stderr.match(/okfkbd listening on (http:\/\/[^\s]+)/);
        if (match) {
          clearTimeout(timer);
          proc.stderr.off('data', onData);
          resolve(match[1]);
        }
      };
      proc.stderr.on('data', onData);

      proc.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on('exit', (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timer);
          reject(new Error(`okfkbd exited ${code}: ${stderr}`));
        }
      });
    });

    try {
      const res = await fetch(url);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.service).toBe('kb-daemon');
    } finally {
      proc.kill('SIGTERM');
    }

    const exitCode = await new Promise<number>((resolve) => {
      const timer = setTimeout(() => {
        proc.kill('SIGKILL');
        resolve(-1);
      }, 5000);
      proc.on('close', (code) => {
        clearTimeout(timer);
        resolve(code ?? -1);
      });
    });

    await rm(space, { recursive: true, force: true });

    expect(exitCode).toBe(0);
  });
});
