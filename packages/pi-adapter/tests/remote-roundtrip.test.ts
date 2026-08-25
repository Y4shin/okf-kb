// remote-roundtrip.test.ts — end-to-end test of the remote authoring path.
// Start a test daemon on loopback (buildCommonDeps + FakeEmbedder, tmp space,
// ephemeral port, token). Register the remote tool set (fullBindings → 10 tools
// incl kb_put/kb_delete) via createKbTrpcClient<AppRouter>. Exercise kb_put →
// kb_get → kb_check_id → (file exists on daemon's bundle) → kb_delete.
//
// This simulates the remote branch: isRemoteKb would be false for loopback, so
// we force the remote path by passing fullBindings directly (the point is to
// exercise the 10-tool remote registration + the kb_put→kb_get round-trip
// through the daemon's Write).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeEmbedder } from '@okf-kb/fs';
import { startDaemon, type DaemonHandle } from '@okf-kb/daemon';
import { testManifest, note } from '../../fs/tests/helpers.js';
import { createKbTrpcClient } from '../extension/src/client.js';
import { registerKbTools } from '../extension/src/tools.js';
import { fullBindings, flattenBindings, type AppRouter } from '@okf-kb/protocol';
import type { ExtensionAPI, ToolDefinition } from '@earendil-works/pi-coding-agent';

let handle: DaemonHandle;
let space: string;

beforeAll(async () => {
  space = await mkdtemp(join(tmpdir(), 'kb-remote-roundtrip-'));
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

/** Build a remote (fullBindings) client pointing at the test daemon. */
function makeRemoteClient() {
  return createKbTrpcClient<AppRouter>(handle.url, 'test-daemon-token');
}

const REF = 'concept:remote-test';

/** A valid OKF note with provenance frontmatter. */
function remoteNoteContent(): string {
  return note(
    {
      type: 'concept',
      id: 'concept:remote-test',
      title: 'Remote Round-Trip Test Note',
      description: 'A note authored via kb_put through the remote daemon path.',
      tags: ['test', 'remote'],
      generated: {
        by: 'pi/0.80.10/test-model',
        at: '2025-01-15T00:00:00.000Z',
      },
      status: 'draft',
    },
    'This note was authored through the daemon\'s write.put via kb_put (remote path).',
  );
}

describe('remote round-trip: tool registration', () => {
  it('registers exactly 10 tools incl kb_put and kb_delete (fullBindings / remote)', () => {
    const pi = createStubPi();
    const client = makeRemoteClient();
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

  it('fullBindings includes the write group (write.put + write.delete)', () => {
    const flat = flattenBindings(fullBindings);
    const qualifiedNames = new Set(flat.map((b) => b.qualifiedName));
    expect(qualifiedNames.has('write.put')).toBe(true);
    expect(qualifiedNames.has('write.delete')).toBe(true);
  });
});

describe('remote round-trip: kb_put → kb_get → kb_check_id → kb_delete', () => {
  afterAll(async () => {
    // Clean up: delete the note via the daemon if it exists
    const client = makeRemoteClient();
    try {
      await client.write.delete.mutate({ ref: REF });
    } catch {
      // already gone
    }
  });

  it('kb_put creates a note through the daemon\'s Write.put', async () => {
    const pi = createStubPi();
    const client = makeRemoteClient();
    registerKbTools(pi, client, fullBindings);

    const putTool = pi.tools.get('kb_put')!;
    const content = remoteNoteContent();

    const result = await putTool.execute('test-id', { ref: REF, content }, undefined, undefined, {} as never);
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe('text');
    // The put result is a PutResult: { ref, changed, warnings }
    const parsed = JSON.parse((result.content[0] as { text: string }).text);
    expect(parsed.ref).toEqual({ ty: 'concept', slug: 'remote-test' });
    expect(parsed.changed).toBe(true);
  });

  it('kb_get returns the note with generated.by set and status: draft', async () => {
    const pi = createStubPi();
    const client = makeRemoteClient();
    registerKbTools(pi, client, fullBindings);

    const getTool = pi.tools.get('kb_get')!;
    const result = await getTool.execute('test-id', { ref: REF }, undefined, undefined, {} as never);
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);

    expect(parsed.ref).toEqual({ slug: 'remote-test', ty: 'concept' });
    expect(parsed.frontmatter.type).toBe('concept');
    expect(parsed.frontmatter.title).toBe('Remote Round-Trip Test Note');
    expect(parsed.frontmatter.status).toBe('draft');
    // generated.by is set — the ActorSchema coerces the string 'pi/0.80.10/test-model'
    // into { kind: 'agent', producer: 'pi', version: '0.80.10', model: 'test-model' }.
    expect(parsed.frontmatter.generated).toBeDefined();
    expect(parsed.frontmatter.generated.by).toBeDefined();
    // The by can be the coerced object form (read.get parses frontmatter via FrontmatterSchema).
    const by = parsed.frontmatter.generated.by;
    if (typeof by === 'object') {
      expect(by.producer).toBe('pi');
      expect(by.kind).toBe('agent');
    } else {
      // Or the string form if serialization preserved it.
      expect(String(by)).toMatch(/pi/);
    }
    expect(parsed.body).toContain('kb_put');
  });

  it('kb_check_id confirms the note passes conformance', async () => {
    const pi = createStubPi();
    const client = makeRemoteClient();
    registerKbTools(pi, client, fullBindings);

    const checkTool = pi.tools.get('kb_check_id')!;
    const result = await checkTool.execute('test-id', { ref: REF }, undefined, undefined, {} as never);
    const text = (result.content[0] as { text: string }).text;
    const parsed = JSON.parse(text);
    // CheckReport: { ok: boolean, errors: Array }
    expect(parsed.ok).toBe(true);
    expect(Array.isArray(parsed.errors)).toBe(true);
  });

  it('the note file exists on the daemon\'s bundle path (NOT the test\'s local disk)', async () => {
    // The daemon's bundle is the tmp `space` we passed to startDaemon.
    // The note (concept:remote-test) → concepts/remote-test.md under that space.
    const notePath = join(space, 'concepts', 'remote-test.md');
    // The file must exist on the daemon's bundle.
    await expect(access(notePath)).resolves.toBeUndefined();

    // Read it and confirm the content landed (with frontmatter).
    const written = await readFile(notePath, 'utf-8');
    expect(written).toContain('id: concept:remote-test');
    expect(written).toContain('Remote Round-Trip Test Note');
    expect(written).toContain('kb_put');
  });

  it('kb_delete removes the note; kb_get after → not found / throws', async () => {
    const pi = createStubPi();
    const client = makeRemoteClient();
    registerKbTools(pi, client, fullBindings);

    const deleteTool = pi.tools.get('kb_delete')!;
    const getTool = pi.tools.get('kb_get')!;

    // Delete
    await deleteTool.execute('test-id', { ref: REF }, undefined, undefined, {} as never);

    // kb_get now throws (note is gone — readFile fails)
    await expect(
      getTool.execute('test-id', { ref: REF }, undefined, undefined, {} as never),
    ).rejects.toThrow();

    // The file is gone from the daemon's bundle too.
    const notePath = join(space, 'concepts', 'remote-test.md');
    await expect(access(notePath)).rejects.toThrow();
  });
});
