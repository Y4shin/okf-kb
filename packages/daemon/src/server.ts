// @kb/daemon — server: startDaemon(opts) -> {url, close()}.
// Build CommonDeps, build Kb via the typestate builder, build the tRPC router
// via buildRouter(kb) from @kb/protocol, mount /trpc + /mcp + GET / (health),
// bind 127.0.0.1 only. Bearer auth on both /trpc and /mcp.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createKb } from '@kb/core';
import { FsLocalFs, FsRead, FsSearch, FsWrite, FsIndexAdmin } from '@kb/fs';
import type { AllGroups } from '@kb/protocol';
import { flattenBindings, fullBindings } from '@kb/protocol';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildCommonDeps, type BuildDepsOptions } from './deps.js';
import { getOrMintToken } from './auth.js';
import { createTrpcHandler, AuthError, checkBearer } from './trpc.js';
import { mcpServerFromBindings } from './mcp.js';

export interface StartDaemonOptions extends BuildDepsOptions {
  /** Port to bind (0 = ephemeral). Default: KB_PORT env or 0. */
  port?: number;
  /** Override the auth token (test seam). Default: getOrMintToken(). */
  token?: string;
}

export interface DaemonHandle {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

/**
 * Start the daemon: build Kb, mount /trpc + /mcp + GET / (health), bind 127.0.0.1.
 * Returns {url, port, token, close()}.
 */
export async function startDaemon(opts: StartDaemonOptions = {}): Promise<DaemonHandle> {
  const token = opts.token ?? getOrMintToken();
  const port = opts.port ?? (process.env.KB_PORT ? parseInt(process.env.KB_PORT, 10) : 0);

  // Build CommonDeps + Kb
  const deps = buildCommonDeps(opts);
  const kb = createKb(deps)
    .declare()
    .withRead()
    .withSearch()
    .withWrite()
    .withLocalFs()
    .withIndexAdmin()
    .build() as AllGroups;

  // Wire the real Fs* implementations into the kb object (the builder's stubs throw).
  // The typestate builder assembles the group *shape*; we replace the stubs with real impls.
  // (The builder's make* stubs throw 'impl in @kb/fs'; we construct the real Fs* classes here.)
  const realKb: AllGroups = {
    localFs: new FsLocalFs(deps),
    read: new FsRead(deps),
    search: new FsSearch(deps),
    write: new FsWrite(deps, new FsSearch(deps)),
    indexAdmin: new FsIndexAdmin(deps),
  };
  void kb; // the builder proves the shape; we use realKb

  // tRPC handler
  const trpcHandler = createTrpcHandler(realKb as never, token);

  // MCP: create a new server per request (stateless mode — each request is independent)
  // The McpServer can only be connected to one transport at a time, so we create
  // a fresh server + transport per /mcp POST. The binding registration is cheap.
  function createMcpServer() {
    return mcpServerFromBindings(realKb as never, fullBindings);
  }

  // HTTP server
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = req.url ?? '/';

    try {
      if (url === '/' || url === '/ping' || url === '/.ping') {
        // Health page
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'kb-daemon', version: '0.1.0' }));
        return;
      }

      if (url.startsWith('/trpc')) {
        // tRPC handler — check auth first (createTrpcHandler also checks, but
        // we do it here so we can return a clean 401 before entering tRPC)
        if (!checkBearer(req, token)) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        try {
          trpcHandler(req, res);
        } catch (e) {
          if (e instanceof AuthError) {
            res.writeHead(401, { 'content-type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unauthorized' }));
            return;
          }
          throw e;
        }
        return;
      }

      if (url.startsWith('/mcp')) {
        // MCP handler — check Bearer auth
        if (!checkBearer(req, token)) {
          res.writeHead(401, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unauthorized' }));
          return;
        }
        // Use the StreamableHTTPServerTransport in stateless mode (one transport per request).
        // Read the body for POST requests.
        const body = await readBody(req);
        const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
        const mcpServer = createMcpServer();
        await mcpServer.connect(transport);
        await transport.handleRequest(req, res, body);
        await mcpServer.close();
        await transport.close();
        return;
      }

      // 404 for unknown paths
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
    } catch (err) {
      if (!res.headersSent) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'Internal server error', message: String(err) }));
      }
    }
  });

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const actualUrl = `http://127.0.0.1:${actualPort}`;
      resolve({
        url: actualUrl,
        port: actualPort,
        token,
        close: async () => {
          // Close the Fs* resources (search db, etc.)
          if (realKb.search && typeof (realKb.search as unknown as { close?: () => void }).close === 'function') {
            (realKb.search as unknown as { close: () => void }).close();
          }
          if (realKb.write && typeof (realKb.write as unknown as { close?: () => void }).close === 'function') {
            (realKb.write as unknown as { close: () => void }).close();
          }
          if (realKb.indexAdmin && typeof (realKb.indexAdmin as unknown as { close?: () => void }).close === 'function') {
            (realKb.indexAdmin as unknown as { close: () => void }).close();
          }
          return new Promise<void>((r) => server.close(() => r()));
        },
      });
    });
  });
}

/** Read the request body as a parsed JSON object (for MCP POST). */
function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      if (!data) return resolve(undefined);
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', reject);
  });
}
