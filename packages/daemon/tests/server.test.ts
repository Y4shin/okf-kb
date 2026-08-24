// @kb/daemon — server test: start the daemon on an ephemeral port with a tmp
// space + FakeEmbedder + minimal manifest; assert health, tRPC read.get after
// write.put, 401 on missing/bad token, MCP tools/list + tools/call.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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

beforeAll(async () => {
  space = await mkdtemp(join(tmpdir(), 'kb-daemon-test-'));
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
