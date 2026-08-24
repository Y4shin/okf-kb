// @kb/daemon — server test: start the daemon on an ephemeral port with a tmp
// space + FakeEmbedder + minimal manifest; assert health, tRPC read.get after
// write.put, 401 on missing/bad token, MCP tools/list + tools/call.
// Plus: configurable bind host, non-localhost-TLS safety gate, capabilities
// endpoint, and the KB_ALLOW_REMOTE_INSECURE escape hatch.
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTRPCProxyClient, httpBatchLink } from '@trpc/client';
import type { AppRouter } from '@kb/protocol';
import { FakeEmbedder } from '@kb/fs';
import { startDaemon, type DaemonHandle } from '../src/server.js';
import { testManifest, note } from '../../fs/tests/helpers.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

let handle: DaemonHandle;
let space: string;

/** Helper: stand up a tmp space + return it (caller closes the handle). */
async function makeSpace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kb-daemon-test-'));
  for (const entry of Object.values(testManifest.types)) {
    await mkdir(join(dir, entry.dir), { recursive: true });
  }
  await writeFile(join(dir, '.gitkeep'), '');
  return dir;
}

beforeAll(async () => {
  space = await makeSpace();
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

/** Restore env vars we may have touched after each test. */
const envKeys = ['KB_DAEMON_HOST', 'KB_ALLOW_REMOTE_INSECURE'] as const;
const savedEnv: Record<string, string | undefined> = {};
beforeAll(() => {
  for (const k of envKeys) savedEnv[k] = process.env[k];
});
afterEach(() => {
  for (const k of envKeys) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

function trpcClient(token?: string) {
  return createTRPCProxyClient<AppRouter>({
    links: [
      httpBatchLink({
        url: `${handle.url}/trpc`,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      }),
    ],
  });
}

describe('daemon health', () => {
  it('GET / returns 200 with health JSON', async () => {
    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('kb-daemon');
  });

  it('GET /.ping returns 200', async () => {
    const res = await fetch(`${handle.url}/.ping`);
    expect(res.status).toBe(200);
  });
});

describe('daemon tRPC', () => {
  it('write.put then read.get round-trips a note', async () => {
    const client = trpcClient('test-daemon-token');

    const content = note(
      {
        type: 'concept',
        id: 'concept:test-note',
        title: 'Test Note',
        description: 'A test note for the daemon',
        tags: ['test'],
      },
      'This is the body of the test note.',
    );

    const putResult = await client.write.put.mutate({ ref: 'concept:test-note', content });
    expect(putResult).toBeDefined();

    const noteView = await client.read.get.query({ ref: 'concept:test-note' });
    expect(noteView.ref).toEqual({ slug: 'test-note', ty: 'concept' });
    expect(noteView.frontmatter.type).toBe('concept');
    expect(noteView.body).toContain('This is the body of the test note.');
  });

  it('returns 401 without Bearer token', async () => {
    // Use a raw fetch (tRPC client throws on error)
    const res = await fetch(`${handle.url}/trpc/read.get`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ '0': { json: { ref: 'concept:test-note' } } }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with a bad token', async () => {
    const res = await fetch(`${handle.url}/trpc/read.get`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({ '0': { json: { ref: 'concept:test-note' } } }),
    });
    expect(res.status).toBe(401);
  });
});

describe('daemon MCP', () => {
  async function mcpClient(token?: string) {
    const client = new Client(
      { name: 'test-client', version: '0.1.0' },
      { capabilities: {} },
    );
    const transport = new StreamableHTTPClientTransport(
      new URL(`${handle.url}/mcp`),
      {
        requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : {},
      },
    );
    await client.connect(transport);
    return client;
  }

  it('lists tools (initialize + tools/list)', async () => {
    const client = await mcpClient('test-daemon-token');
    try {
      const result = await client.listTools();
      expect(result.tools).toBeDefined();
      expect(Array.isArray(result.tools)).toBe(true);
      const toolNames = result.tools.map((t) => t.name);
      // Should include read.get, write.put, etc.
      expect(toolNames).toContain('read.get');
      expect(toolNames).toContain('write.put');
      expect(toolNames).toContain('search.searchText');
    } finally {
      await client.close();
    }
  });

  it('calls a tool and returns the result', async () => {
    const client = await mcpClient('test-daemon-token');
    try {
      const result = await client.callTool({
        name: 'read.get',
        arguments: { ref: 'concept:test-note' },
      });
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      const text = (result.content[0] as { text: string }).text;
      const parsed = JSON.parse(text);
      expect(parsed.ref).toEqual({ slug: 'test-note', ty: 'concept' });
      expect(parsed.frontmatter.type).toBe('concept');
    } finally {
      await client.close();
    }
  });

  it('returns 401 without Bearer token', async () => {
    const res = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '0.1.0' },
        },
      }),
    });
    expect(res.status).toBe(401);
  });

  it('returns 401 with a bad token', async () => {
    const res = await fetch(`${handle.url}/mcp`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json, text/event-stream',
        authorization: 'Bearer wrong-token',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: { name: 'test-client', version: '0.1.0' },
        },
      }),
    });
    expect(res.status).toBe(401);
  });
});

// ============================================================
// Slice 1: configurable bind host, non-localhost-TLS safety gate,
// capabilities endpoint, KB_ALLOW_REMOTE_INSECURE escape hatch.
// ============================================================

describe('daemon bind host + safety gate', () => {
  it('startDaemon({ host: 127.0.0.1 }) listens (current behavior, unchanged)', async () => {
    const dir = await makeSpace();
    let h: DaemonHandle | undefined;
    try {
      h = await startDaemon({
        space: dir,
        port: 0,
        host: '127.0.0.1',
        token: 'test-token',
        embedder: new FakeEmbedder(),
        manifest: testManifest,
      });
      expect(h.host).toBe('127.0.0.1');
      // Prove it actually listens — GET / works.
      const res = await fetch(`${h.url}/`);
      expect(res.status).toBe(200);
    } finally {
      if (h) await h.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('startDaemon({ host: 0.0.0.0 }) without TLS/escape throws (does not listen)', async () => {
    const dir = await makeSpace();
    delete process.env.KB_ALLOW_REMOTE_INSECURE;
    await expect(startDaemon({
      space: dir,
      port: 0,
      host: '0.0.0.0',
      token: 'test-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    })).rejects.toThrow(/Refusing to bind non-localhost/);
    // The error message must name all 3 options.
    await expect(startDaemon({
      space: dir,
      port: 0,
      host: '0.0.0.0',
      token: 'test-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    })).rejects.toThrow(/reverse proxy/);
    await expect(startDaemon({
      space: dir,
      port: 0,
      host: '0.0.0.0',
      token: 'test-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    })).rejects.toThrow(/KB_DAEMON_TLS/);
    await expect(startDaemon({
      space: dir,
      port: 0,
      host: '0.0.0.0',
      token: 'test-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    })).rejects.toThrow(/KB_ALLOW_REMOTE_INSECURE/);
    await rm(dir, { recursive: true, force: true });
  });

  it('startDaemon({ host: 0.0.0.0 }) with KB_ALLOW_REMOTE_INSECURE=1 listens + warns', async () => {
    const dir = await makeSpace();
    // Capture stderr writes.
    const originalWrite = process.stderr.write.bind(process.stderr);
    let stderrOutput = '';
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrOutput += chunk.toString();
      return true;
    }) as typeof process.stderr.write;
    process.env.KB_ALLOW_REMOTE_INSECURE = '1';
    let h: DaemonHandle | undefined;
    try {
      h = await startDaemon({
        space: dir,
        port: 0,
        host: '0.0.0.0',
        token: 'test-token',
        embedder: new FakeEmbedder(),
        manifest: testManifest,
      });
      expect(h.host).toBe('0.0.0.0');
      // The warning should have been written to stderr.
      expect(stderrOutput).toContain('WARNING');
      expect(stderrOutput).toContain('sniffable');
    } finally {
      process.stderr.write = originalWrite;
      if (h) await h.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('startDaemon({ host: kb.lan }) (a hostname) without TLS/escape throws', async () => {
    const dir = await makeSpace();
    delete process.env.KB_ALLOW_REMOTE_INSECURE;
    await expect(startDaemon({
      space: dir,
      port: 0,
      host: 'kb.lan',
      token: 'test-token',
      embedder: new FakeEmbedder(),
      manifest: testManifest,
    })).rejects.toThrow(/Refusing to bind non-localhost/);
    await rm(dir, { recursive: true, force: true });
  });

  it('startDaemon({ host: ::1 }) listens (treated as local)', async () => {
    const dir = await makeSpace();
    let h: DaemonHandle | undefined;
    try {
      h = await startDaemon({
        space: dir,
        port: 0,
        host: '::1',
        token: 'test-token',
        embedder: new FakeEmbedder(),
        manifest: testManifest,
      });
      expect(h.host).toBe('::1');
    } finally {
      if (h) await h.close();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('startDaemon({ host: localhost }) listens (treated as local)', async () => {
    const dir = await makeSpace();
    let h: DaemonHandle | undefined;
    try {
      h = await startDaemon({
        space: dir,
        port: 0,
        host: 'localhost',
        token: 'test-token',
        embedder: new FakeEmbedder(),
        manifest: testManifest,
      });
      expect(h.host).toBe('localhost');
    } finally {
      if (h) await h.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('daemon capabilities endpoint', () => {
  it('GET / returns capabilities JSON with all 5 groups (not Bearer-gated)', async () => {
    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('kb-daemon');
    expect(body.version).toBe('0.1.0');
    expect(body.groups).toBeDefined();
    expect(Array.isArray(body.groups)).toBe(true);
    // The exact set of 5 groups (order-independent).
    expect(new Set(body.groups)).toEqual(
      new Set(['read', 'search', 'write', 'localFs', 'indexAdmin']),
    );
  });

  it('GET / returns 200 without a Bearer token (not gated)', async () => {
    // No authorization header at all.
    const res = await fetch(`${handle.url}/`);
    expect(res.status).toBe(200);
  });
});
