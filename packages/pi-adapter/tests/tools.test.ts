// tests/tools.test.ts — the round-trip test for the pi extension tools.
// Start a test daemon (ephemeral port, tmp space, FakeEmbedder via buildCommonDeps
// from @okf-kb/daemon — mirroring packages/daemon/tests/server.test.ts). Build the
// tRPC client, register tools, and assert end-to-end behavior.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeEmbedder } from '@okf-kb/fs';
import { startDaemon, type DaemonHandle } from '@okf-kb/daemon';
import { testManifest, note } from '../../fs/tests/helpers.js';
import { createKbTrpcClient } from '../extension/src/client.js';
import { registerKbTools } from '../extension/src/tools.js';
import { isRemoteKb } from '../extension/src/config.js';
import { piBindings, fullBindings, flattenBindings } from '@okf-kb/protocol';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

let handle: DaemonHandle;
let space: string;

beforeAll(async () => {
  space = await mkdtemp(join(tmpdir(), 'kb-pi-ext-test-'));
  for (const entry of Object.values(testManifest.types)) {
    await mkdir(join(space, entry.dir), { recursive: true });
  }
  await writeFile(join(space, '.gitkeep'), '');

  handle = await startDaemon({
    space,
    port: 0, // ephemeral
    token: 'test-daemon-token',
    embedder: new FakeEmbedder(),
    manifest: testManifest,
  });
});

afterAll(async () => {
  if (handle) await handle.close();
  if (space) await rm(space, { recursive: true, force: true });
});

/** A minimal stub ExtensionAPI that captures registerTool calls. */
function createStubPi(): ExtensionAPI & { tools: Map<string, ToolDefinition> } {
  const tools = new Map<string, ToolDefinition>();
  const pi = {
    tools,
    registerTool(tool: ToolDefinition) {
      tools.set(tool.name, tool);
    },
    on: () => {},
  } as unknown as ExtensionAPI & { tools: Map<string, ToolDefinition> };
  return pi;
}

/** Build a client pointing at the test daemon. */
function makeClient() {
  return createKbTrpcClient(handle.url, 'test-daemon-token');
}

describe('pi extension: tool registration', () => {
  it('registers exactly 8 tools (no kb_put/kb_delete)', () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client);

    const names = Array.from(pi.tools.keys()).sort();
    expect(names).toEqual([
      'kb_check_id',
      'kb_get',
      'kb_graph',
      'kb_list',
      'kb_resolve_id',
      'kb_resolve_path',
      'kb_search',
      'kb_update',
    ]);
    // Explicitly no write tools
    expect(names).not.toContain('kb_put');
    expect(names).not.toContain('kb_delete');
  });

  it('every tool spec references a real piBindings entry', () => {
    const flat = flattenBindings(piBindings);
    const qualifiedNames = new Set(flat.map((b) => b.qualifiedName));
    // The 8 tools map to these bindings
    const expected = [
      'read.get',
      'read.list',
      'search.searchUnified',
      'search.graph',
      'search.update',
      'search.checkId',
      'localFs.resolvePath',
      'localFs.resolveId',
    ];
    for (const qn of expected) {
      expect(qualifiedNames.has(qn)).toBe(true);
    }
    // piBindings must omit write.put and write.delete (they're EXCLUDED)
    const hasWritePut = flat.some((b) => b.qualifiedName === 'write.put');
    const hasWriteDelete = flat.some((b) => b.qualifiedName === 'write.delete');
    expect(hasWritePut).toBe(false);
    expect(hasWriteDelete).toBe(false);
  });
});

describe('pi extension: round-trip', () => {
  const refA = 'concept:round-trip-note-a';
  const refB = 'concept:round-trip-note-b';

  // Write notes natively (pi authors with native write) before tests.
  beforeAll(async () => {
    // Resolve the path via the daemon to write to the right place.
    const client = makeClient();
    const resA = await client.localFs.resolvePath.query({ ref: refA });
    const resB = await client.localFs.resolvePath.query({ ref: refB });

    const contentA = note(
      {
        type: 'concept',
        id: 'concept:round-trip-note-a',
        title: 'Round Trip Note A',
        description: 'A note about round trips for the pi extension test',
        tags: ['test', 'round-trip'],
        relations: [{ predicate: 'defines', target: 'concept:round-trip-note-b' }],
      },
      'This note describes a round trip concept. It links to note B.',
    );

    const contentB = note(
      {
        type: 'concept',
        id: 'concept:round-trip-note-b',
        title: 'Round Trip Note B',
        description: 'A linked note about round trips',
        tags: ['test'],
      },
      'This is note B, linked from note A.',
    );

    writeFileSync(resA.path, contentA);
    writeFileSync(resB.path, contentB);

    // Reindex both notes via kb_update (search.update)
    await client.search.update.mutate({ ref: refA, content: contentA });
    await client.search.update.mutate({ ref: refB, content: contentB });
  });

  it('kb_resolve_id resolves a ref to {slug, ty}', async () => {
    const client = makeClient();
    const res = await client.localFs.resolveId.query({ ref: refA });
    expect(res).toEqual({ slug: 'round-trip-note-a', ty: 'concept' });
  });

  it('kb_get returns the created note after native write + kb_update', async () => {
    const client = makeClient();
    const noteView = await client.read.get.query({ ref: refA });
    expect(noteView.ref).toEqual({ slug: 'round-trip-note-a', ty: 'concept' });
    expect(noteView.frontmatter.type).toBe('concept');
    expect(noteView.frontmatter.title).toBe('Round Trip Note A');
    expect(noteView.body).toContain('round trip concept');
  });

  it('kb_list returns the created notes', async () => {
    const client = makeClient();
    const entries = await client.read.list.query({ type: 'concept' });
    expect(Array.isArray(entries)).toBe(true);
    const slugs = entries.map((e: { ref: { slug: string } }) => e.ref.slug);
    expect(slugs).toContain('round-trip-note-a');
    expect(slugs).toContain('round-trip-note-b');
  });

  it('kb_search finds the created note (unified)', async () => {
    const client = makeClient();
    const hits = await client.search.searchUnified.query({ q: 'round trip', opts: { withGraph: true } });
    expect(Array.isArray(hits)).toBe(true);
    expect(hits.length).toBeGreaterThan(0);
    const titles = hits.map((h: { title: string }) => h.title);
    expect(titles.some((t) => t.includes('Round Trip'))).toBe(true);
  });

  it('kb_graph on a linked pair returns the edge', async () => {
    const client = makeClient();
    const neighbors = await client.search.graph.query({ ref: refA, dir: 'descendants' });
    expect(Array.isArray(neighbors)).toBe(true);
    // Note A has a relation defining note B, so descendants should include B
    const slugs = neighbors.map((r: { slug?: string }) => r.slug);
    expect(slugs).toContain('round-trip-note-b');
  });

  it('tool execute fn returns the same data as the tRPC client (end-to-end via pi execute)', async () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client);

    const getTool = pi.tools.get('kb_get')!;
    const result = await getTool.execute('test-id', { ref: refA }, undefined, undefined, {} as never);

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    expect(parsed.ref).toEqual({ slug: 'round-trip-note-a', ty: 'concept' });
    expect(parsed.frontmatter.title).toBe('Round Trip Note A');
    expect(parsed.body).toContain('round trip concept');
  });
});

describe('pi extension: error mapping', () => {
  it('kb_get throws a clear error when daemon is unreachable (pi contract: throw on failure)', async () => {
    // Build a client pointing at a dead URL (port that's not listening)
    const deadClient = createKbTrpcClient('http://127.0.0.1:1', 'test-daemon-token');
    const pi = createStubPi();
    registerKbTools(pi, deadClient);

    const getTool = pi.tools.get('kb_get')!;

    // pi's AgentToolResult has no isError field; the tool contract is "throw on failure"
    // so the pi runtime marks isError=true. The execute fn throws with a clear message.
    await expect(
      getTool.execute('test-id', { ref: 'concept:nonexistent' }, undefined, undefined, {} as never),
    ).rejects.toThrow(/KB daemon not running at http:\/\/127\.0\.0\.1:1|fetch|econnrefused|connect|network|unreachable|ECONN/i);
  });
});

// ============================================================
// isRemoteKb — string-based local/remote detection for KB_URL.
// Determines whether the adapter registers the Write tools (kb_put/kb_delete).
// The decision is a string check (hostname literal), NOT DNS resolution.
// ============================================================

describe('isRemoteKb', () => {
  it('returns false for loopback addresses', () => {
    expect(isRemoteKb('http://127.0.0.1:30700')).toBe(false);
    expect(isRemoteKb('http://localhost:30700')).toBe(false);
  });

  it('returns false for IPv6 loopback (::1)', () => {
    expect(isRemoteKb('http://[::1]:30700')).toBe(false);
  });

  it('returns false for a malformed URL (treat as local — do not activate Write)', () => {
    expect(isRemoteKb('not a url')).toBe(false);
    expect(isRemoteKb('')).toBe(false);
    expect(isRemoteKb('http://::1:30700')).toBe(false); // unbracketed IPv6 throws
  });

  it('returns true for a hostname (not a loopback literal)', () => {
    expect(isRemoteKb('http://kb.lan:30700')).toBe(true);
    expect(isRemoteKb('http://kb.test:30700')).toBe(true);
  });

  it('returns true for a non-loopback IP', () => {
    expect(isRemoteKb('http://192.168.1.10:30700')).toBe(true);
    expect(isRemoteKb('http://10.0.0.1:30700')).toBe(true);
  });

  it('returns true for 0.0.0.0 (not a loopback literal — treated as remote)', () => {
    expect(isRemoteKb('http://0.0.0.0:30700')).toBe(true);
  });
});

// ============================================================
// Remote case: registerKbTools(pi, client, fullBindings) registers 10 tools
// incl. kb_put/kb_delete. The round-trip proves kb_put → kb_get → kb_delete.
// Uses the same loopback test daemon but with fullBindings (simulates the remote
// branch where isRemoteKb=true → fullBindings).
// ============================================================

describe('pi extension: remote tool registration (fullBindings)', () => {
  it('registers exactly 10 tools incl kb_put and kb_delete', () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client, fullBindings);

    const names = Array.from(pi.tools.keys()).sort();
    expect(names).toHaveLength(10);
    expect(names).toContain('kb_put');
    expect(names).toContain('kb_delete');
    // Still has the original 8
    expect(names).toContain('kb_get');
    expect(names).toContain('kb_list');
    expect(names).toContain('kb_search');
    expect(names).toContain('kb_graph');
    expect(names).toContain('kb_update');
    expect(names).toContain('kb_check_id');
    expect(names).toContain('kb_resolve_path');
    expect(names).toContain('kb_resolve_id');
  });

  it('local case (piBindings) still registers exactly 8 tools — no kb_put/kb_delete', () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client, piBindings);

    const names = Array.from(pi.tools.keys()).sort();
    expect(names).toHaveLength(8);
    expect(names).not.toContain('kb_put');
    expect(names).not.toContain('kb_delete');
  });

  it('default bindings is piBindings (backwards compatible — no arg)', () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client);

    const names = Array.from(pi.tools.keys()).sort();
    expect(names).toHaveLength(8);
    expect(names).not.toContain('kb_put');
    expect(names).not.toContain('kb_delete');
  });
});

describe('pi extension: remote round-trip (kb_put/kb_delete via fullBindings)', () => {
  const ref = 'concept:remote-test';

  afterAll(async () => {
    // Clean up: delete the note via the daemon if it exists
    const client = makeClient();
    try {
      await client.write.delete.mutate({ ref });
    } catch {
      // already gone
    }
  });

  it('kb_put creates a note, kb_get returns it, kb_delete removes it', async () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client, fullBindings);

    const putTool = pi.tools.get('kb_put')!;
    const getTool = pi.tools.get('kb_get')!;
    const deleteTool = pi.tools.get('kb_delete')!;

    const content = note(
      {
        type: 'concept',
        id: 'concept:remote-test',
        title: 'Remote Test Note',
        description: 'A note created via kb_put (remote authoring path)',
        tags: ['test', 'remote'],
      },
      'This note was authored through the daemon\'s write.put via kb_put.',
    );

    // 1. kb_put creates the note
    const putResult = await putTool.execute('test-id', { ref, content }, undefined, undefined, {} as never);
    expect(putResult.content).toHaveLength(1);
    expect(putResult.content[0].type).toBe('text');

    // 2. kb_get retrieves it
    const getResult = await getTool.execute('test-id', { ref }, undefined, undefined, {} as never);
    const getText = (getResult.content[0] as { text: string }).text;
    const parsed = JSON.parse(getText);
    expect(parsed.ref).toEqual({ slug: 'remote-test', ty: 'concept' });
    expect(parsed.frontmatter.title).toBe('Remote Test Note');
    expect(parsed.body).toContain('kb_put');

    // 3. kb_delete removes it
    await deleteTool.execute('test-id', { ref }, undefined, undefined, {} as never);

    // 4. kb_get now throws (note is gone)
    await expect(
      getTool.execute('test-id', { ref }, undefined, undefined, {} as never),
    ).rejects.toThrow();
  });

  it('kb_check_id confirms the note after kb_put', async () => {
    const pi = createStubPi();
    const client = makeClient();
    registerKbTools(pi, client, fullBindings);

    const putTool = pi.tools.get('kb_put')!;
    const checkTool = pi.tools.get('kb_check_id')!;

    const content = note(
      {
        type: 'concept',
        id: 'concept:remote-test-checkid',
        title: 'Remote Test Check ID',
        description: 'A note for kb_check_id after kb_put',
        tags: ['test'],
      },
      'Content for check_id test.',
    );

    await putTool.execute('test-id', { ref: 'concept:remote-test-checkid', content }, undefined, undefined, {} as never);

    const checkResult = await checkTool.execute('test-id', { ref: 'concept:remote-test-checkid' }, undefined, undefined, {} as never);
    const checkText = (checkResult.content[0] as { text: string }).text;
    const parsed = JSON.parse(checkText);
    // checkId returns a CheckReport: { ok: boolean, errors: Array }
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.errors)).toBe(true);

    // Clean up
    const deleteTool = pi.tools.get('kb_delete')!;
    await deleteTool.execute('test-id', { ref: 'concept:remote-test-checkid' }, undefined, undefined, {} as never);
  });
});
