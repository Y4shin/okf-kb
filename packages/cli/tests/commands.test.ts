// @kb/cli — commands.test.ts: start a daemon on an ephemeral port with a tmp
// space + FakeEmbedder; run CLI commands against it via runCli (in-process,
// stubbed argv + stdout/stderr capture). Assert --json output is valid JSON,
// exit codes, round-trip, search, and check (conformant vs orphaned-glossary).
// Also one test that runs the built bin end-to-end via execSync.

import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { FakeEmbedder } from '@kb/fs';
import { startDaemon, type DaemonHandle } from '@kb/daemon';
import { testManifest, note } from '../../fs/tests/helpers.js';
import { runCli } from '../src/main.js';
import { createTrpcClient } from '../src/client.js';

let handle: DaemonHandle;
let space: string;

// --- stdout/stderr capture for in-process runCli calls ---
let stdoutCaptures: string[] = [];
let stderrCaptures: string[] = [];
const origStdoutWrite = process.stdout.write.bind(process.stdout);
const origStderrWrite = process.stderr.write.bind(process.stderr);

function captureStreams() {
  stdoutCaptures = [];
  stderrCaptures = [];
  (process.stdout as any).write = (chunk: string) => { stdoutCaptures.push(String(chunk)); return true; };
  (process.stderr as any).write = (chunk: string) => { stderrCaptures.push(String(chunk)); return true; };
}

function restoreStreams() {
  (process.stdout as any).write = origStdoutWrite;
  (process.stderr as any).write = origStderrWrite;
}

function getStdout(): string {
  return stdoutCaptures.join('');
}

function getStderr(): string {
  return stderrCaptures.join('');
}

beforeAll(async () => {
  space = await mkdtemp(join(tmpdir(), 'kb-cli-test-'));
  for (const entry of Object.values(testManifest.types)) {
    await mkdir(join(space, entry.dir), { recursive: true });
  }
  await writeFile(join(space, '.gitkeep'), '');

  handle = await startDaemon({
    space,
    port: 0,
    token: 'test-cli-token',
    embedder: new FakeEmbedder(),
    manifest: testManifest,
  });
});

afterAll(async () => {
  restoreStreams();
  if (handle) await handle.close();
  if (space) await rm(space, { recursive: true, force: true });
});

/** Run the CLI in-process with the given argv + captured streams. */
async function cli(...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  captureStreams();
  try {
    const fullArgs = [...args, '--url', handle.url, '--token', handle.token];
    const code = await runCli(fullArgs);
    return { code, stdout: getStdout(), stderr: getStderr() };
  } finally {
    restoreStreams();
  }
}

/** Run the CLI in-process against a specific daemon handle. */
async function cliAgainst(h: DaemonHandle, ...args: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  captureStreams();
  try {
    const code = await runCli([...args, '--url', h.url, '--token', h.token]);
    return { code, stdout: getStdout(), stderr: getStderr() };
  } finally {
    restoreStreams();
  }
}

/** Parse the JSON from captured stdout. */
function parseJsonOut(stdout: string): unknown {
  const trimmed = stdout.trim();
  return JSON.parse(trimmed);
}

describe('CLI — command registration from binding records', () => {
  it('every group method has a command (read.get, write.put, etc.)', async () => {
    const result = await cli('--help');
    expect(result.code).toBe(0);
    const helpText = result.stdout;
    expect(helpText).toContain('read.get');
    expect(helpText).toContain('read.list');
    expect(helpText).toContain('write.put');
    expect(helpText).toContain('write.delete');
    expect(helpText).toContain('search.search-text');
    expect(helpText).toContain('search.search-semantic');
    expect(helpText).toContain('search.search-unified');
    expect(helpText).toContain('search.graph');
    expect(helpText).toContain('local-fs.space-root');
    expect(helpText).toContain('index-admin.build-index');
    expect(helpText).toContain('index-admin.rebuild-indexes');
    expect(helpText).toContain('index-admin.check');
  });
});

describe('CLI — write.put + read.get round-trip + --json', () => {
  it('kb write.put --content puts a note, kb read.get retrieves it, --json is parseable', async () => {
    const content = note(
      { type: 'concept', id: 'concept:cli-test', title: 'CLI Test', description: 'test note', tags: ['cli'] },
      'Body of the CLI test note.',
    );

    const putResult = await cli('write.put', 'concept:cli-test', '--content', content, '--json');
    expect(putResult.code).toBe(0);
    const putJson = parseJsonOut(putResult.stdout);
    expect(putJson).toHaveProperty('ref');

    const getResult = await cli('read.get', 'concept:cli-test', '--json');
    expect(getResult.code).toBe(0);
    expect(() => JSON.parse(getResult.stdout.trim())).not.toThrow();
    const noteView = parseJsonOut(getResult.stdout) as { ref: unknown; frontmatter: { type: string }; body: string };
    expect(noteView.frontmatter.type).toBe('concept');
    expect(noteView.body).toContain('Body of the CLI test note.');
  });

  it('kb write.put writes the file to the tmp space pathFor and content is correct', async () => {
    const content = note(
      { type: 'term', id: 'term:disk-check', title: 'Disk Check', description: 'verify disk write' },
      'Content written to disk.',
    );

    const putResult = await cli('write.put', 'term:disk-check', '--content', content);
    expect(putResult.code).toBe(0);

    const expectedPath = join(space, 'glossary', 'disk-check.md');
    const diskContent = await readFile(expectedPath, 'utf-8');
    expect(diskContent).toContain('Content written to disk.');
    expect(diskContent).toContain('type: term');
  });
});

describe('CLI — search', () => {
  it('kb search.search-unified returns hits for a query', async () => {
    // Build the index first (the round-trip test created notes)
    await cli('index-admin.build-index');

    const result = await cli('search.search-unified', 'CLI test', '--json');
    expect(result.code).toBe(0);
    const hits = parseJsonOut(result.stdout);
    expect(Array.isArray(hits)).toBe(true);
  });
});

describe('CLI — check passes on conformant, fails on orphaned-glossary', () => {
  let conformantSpace: string;
  let conformantHandle: DaemonHandle;
  let orphanSpace: string;
  let orphanHandle: DaemonHandle;

  afterEach(async () => {
    if (conformantHandle) await conformantHandle.close();
    if (orphanHandle) await orphanHandle.close();
    if (conformantSpace) await rm(conformantSpace, { recursive: true, force: true });
    if (orphanSpace) await rm(orphanSpace, { recursive: true, force: true });
  });

  it('kb check passes (exit 0) on a conformant bundle', async () => {
    conformantSpace = await mkdtemp(join(tmpdir(), 'kb-cli-conf-'));
    for (const entry of Object.values(testManifest.types)) {
      await mkdir(join(conformantSpace, entry.dir), { recursive: true });
    }
    await writeFile(join(conformantSpace, '.gitkeep'), '');

    conformantHandle = await startDaemon({
      space: conformantSpace,
      port: 0,
      token: 'conf-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    });

    // Put a conformant pair: term linked from a concept
    const termContent = note({ type: 'term', id: 'term:widget', title: 'Widget', description: 'a part' }, 'A widget.');
    const conceptContent = note(
      { type: 'concept', id: 'concept:assembly', title: 'Assembly', description: 'uses widgets', relations: [{ predicate: 'uses', target: 'term:widget' }] },
      'Uses a [widget](/glossary/widget.md).',
    );

    await cliAgainst(conformantHandle, 'write.put', 'term:widget', '--content', termContent);
    await cliAgainst(conformantHandle, 'write.put', 'concept:assembly', '--content', conceptContent);

    const result = await cliAgainst(conformantHandle, 'index-admin.check', '--json');
    expect(result.code).toBe(0);
    const report = parseJsonOut(result.stdout) as { ok: boolean; errors: unknown[] };
    expect(report.ok).toBe(true);
  });

  it('kb check fails (non-0 exit) on an orphaned-glossary bundle (B7)', async () => {
    orphanSpace = await mkdtemp(join(tmpdir(), 'kb-cli-orphan-'));
    for (const entry of Object.values(testManifest.types)) {
      await mkdir(join(orphanSpace, entry.dir), { recursive: true });
    }
    await writeFile(join(orphanSpace, '.gitkeep'), '');

    orphanHandle = await startDaemon({
      space: orphanSpace,
      port: 0,
      token: 'orphan-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    });

    const orphanContent = note({ type: 'term', id: 'term:orphan', title: 'Orphan', description: 'never linked' }, 'An orphan.');
    await cliAgainst(orphanHandle, 'write.put', 'term:orphan', '--content', orphanContent);

    const result = await cliAgainst(orphanHandle, 'index-admin.check', '--json');
    expect(result.code).not.toBe(0);
    const report = parseJsonOut(result.stdout) as { ok: boolean; errors: { rule: string }[] };
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.rule === 'B7')).toBe(true);
  });
});

describe('CLI — error handling', () => {
  it('returns non-0 exit code when daemon is not running', async () => {
    captureStreams();
    try {
      const code = await runCli(['read.get', 'concept:foo', '--url', 'http://127.0.0.1:59999', '--token', 'bad', '--json']);
      expect(code).not.toBe(0);
      const err = getStderr();
      expect(err.length).toBeGreaterThan(0);
    } finally {
      restoreStreams();
    }
  });

  it('returns non-0 exit code on unknown command', async () => {
    captureStreams();
    try {
      const code = await runCli(['nonsense-command', '--url', handle.url, '--token', handle.token]);
      expect(code).not.toBe(0);
    } finally {
      restoreStreams();
    }
  });
});

describe('CLI — createTrpcClient', () => {
  it('returns a proxy typed AppRouter that reaches the daemon', async () => {
    const client = createTrpcClient(handle.url, handle.token);
    const noteView = await client.read.get.query({ ref: 'concept:cli-test' });
    expect(noteView.frontmatter.type).toBe('concept');
  });
});

describe('CLI — built bin end-to-end', () => {
  it('kb binary (child_process) round-trips write.put + read.get', async () => {
    // The CLI is already built (dist/ exists from the pre-test build step).
    const distExists = existsSync(join(process.cwd(), 'packages/cli/dist/src/index.js'));
    if (!distExists) {
      console.warn('Skipping built bin test: dist not found');
      return;
    }

    const content = note(
      { type: 'decision', id: 'decision:bin-test', title: 'Bin Test', description: 'execSync test' },
      'Body from the built binary.',
    );

    // Use spawn (no shell) to pass args with newlines correctly
    const { spawn } = await import('node:child_process');

    function runBin(args: string[]): Promise<string> {
      return new Promise((resolve, reject) => {
        const proc = spawn('node', ['packages/cli/bin/kb.js', ...args], {
          cwd: process.cwd(),
          stdio: ['ignore', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d; });
        proc.stderr.on('data', (d) => { stderr += d; });
        const timer = setTimeout(() => {
          proc.kill();
          reject(new Error('timeout'));
        }, 15000);
        proc.on('close', (code) => {
          clearTimeout(timer);
          if (code !== 0) {
            reject(new Error(`exit ${code}: ${stderr}`));
          } else {
            resolve(stdout);
          }
        });
      });
    }

    // write.put via the built bin
    const putOut = await runBin(['write.put', 'decision:bin-test', '--content', content, '--json', '--url', handle.url, '--token', handle.token]);
    expect(putOut).toContain('ref');

    // read.get via the built bin
    const getOut = await runBin(['read.get', 'decision:bin-test', '--json', '--url', handle.url, '--token', handle.token]);
    const noteView = JSON.parse(getOut.trim());
    expect(noteView.frontmatter.type).toBe('decision');
    expect(noteView.body).toContain('Body from the built binary.');
  });
});
