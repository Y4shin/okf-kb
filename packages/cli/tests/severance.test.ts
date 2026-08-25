import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainPath = join(__dirname, '..', 'src', 'main.ts');

describe('CLI → daemon severance', () => {
  it('src/main.ts has no references to @okf-kb/daemon', async () => {
    const source = await readFile(mainPath, 'utf-8');
    expect(source).not.toContain("import('@okf-kb/daemon')");
    expect(source).not.toContain("from '@okf-kb/daemon'");
    expect(source).not.toContain('@okf-kb/daemon');
    expect(source).not.toContain('runDaemon');
  });

  it('okfkb --help does not list a daemon subcommand', async () => {
    const { runCli } = await import('../src/main.js');
    const origStdoutWrite = process.stdout.write.bind(process.stdout);
    const origStderrWrite = process.stderr.write.bind(process.stderr);
    const stdout: string[] = [];
    const stderr: string[] = [];
    (process.stdout as any).write = (chunk: string) => { stdout.push(String(chunk)); return true; };
    (process.stderr as any).write = (chunk: string) => { stderr.push(String(chunk)); return true; };
    try {
      await runCli(['--help']);
    } finally {
      (process.stdout as any).write = origStdoutWrite;
      (process.stderr as any).write = origStderrWrite;
    }
    const helpText = stdout.join('');
    // Commander lists subcommands on their own line; the description may
    // mention "daemon" legitimately, so only reject a subcommand listing.
    expect(helpText).not.toMatch(/^\s+daemon\s/m);
  });
});
