// tests/tools.test.ts — the round-trip test for the pi extension tools.
// Start a test daemon (ephemeral port, tmp space, FakeEmbedder via buildCommonDeps
// from @kb/daemon — mirroring packages/daemon/tests/server.test.ts). Build the
// tRPC client, register tools, and assert end-to-end behavior.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeEmbedder } from '@kb/fs';
import { startDaemon, type DaemonHandle } from '@kb/daemon';
import { testManifest, note } from '../../fs/tests/helpers.js';
import { createKbTrpcClient } from '../extension/src/client.js';
import { registerKbTools } from '../extension/src/tools.js';
import { piBindings, flattenBindings } from '@kb/protocol';
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
  it('kb_get returns an error result when daemon is unreachable', async () => {
    // Build a client pointing at a dead URL (port that's not listening)
    const deadClient = createKbTrpcClient('http://127.0.0.1:1', 'test-daemon-token');
    const pi = createStubPi();
    registerKbTools(pi, deadClient);

    const getTool = pi.tools.get('kb_get')!;
    const result = await getTool.execute('test-id', { ref: 'concept:nonexistent' }, undefined, undefined, {} as never);

    // The tool should return error content (caught the network error)
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    const text = (result.content[0] as { text: string }).text;
    expect(text.length).toBeGreaterThan(0);
    // Should contain a clear message about the connection failure
    expect(text.toLowerCase()).toMatch(/fetch|econnrefused|connect|network|unreachable|error/);
  });
});
