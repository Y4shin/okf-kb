// @okf-kb/daemon — server: startDaemon(opts) -> {url, host, port, token, close()}.
// Build CommonDeps, build Kb via the typestate builder, build the tRPC router
// via buildRouter(kb) from @okf-kb/protocol, mount /trpc + /mcp + GET / (health +
// capabilities), bind 127.0.0.1 by default. Bearer auth on both /trpc and /mcp.
// Non-localhost binds require TLS (or the KB_ALLOW_REMOTE_INSECURE escape hatch).

import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { FsLocalFs, FsRead, FsSearch, FsWrite, FsIndexAdmin } from '@okf-kb/fs';
import type { AllGroups } from '@okf-kb/protocol';
import { fullBindings } from '@okf-kb/protocol';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { buildCommonDeps, type BuildDepsOptions } from './deps.js';
import { getOrMintToken } from '@okf-kb/auth';
import { createTrpcHandler, AuthError, checkBearer } from './trpc.js';
import { mcpServerFromBindings } from './mcp.js';

export interface StartDaemonOptions extends BuildDepsOptions {
  /** Port to bind (0 = ephemeral). Default: KB_PORT env or 30700. */
  port?: number;
  /** Override the auth token (test seam). Default: getOrMintToken(). */
  token?: string;
  /** Bind host. Default: KB_DAEMON_HOST env or '127.0.0.1'. */
  host?: string;
  /** Opt-in direct TLS (secondary path; the recommended path is a reverse proxy). */
  tls?: { cert: string; key: string };
}

export interface DaemonHandle {
  url: string;
  host: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

/**
 * Start the daemon: build Kb, mount /trpc + /mcp + GET / (health + capabilities),
 * bind the resolved host (default 127.0.0.1). Non-localhost binds require TLS
 * or the KB_ALLOW_REMOTE_INSECURE escape hatch. Returns {url, host, port, token, close()}.
 */
export async function startDaemon(opts: StartDaemonOptions = {}): Promise<DaemonHandle> {
  const token = opts.token ?? getOrMintToken();
  const port = opts.port ?? (process.env.KB_PORT ? parseInt(process.env.KB_PORT, 10) : 30700);
  const host = opts.host ?? process.env.KB_DAEMON_HOST ?? '127.0.0.1';
  // Direct TLS (secondary path — recommended: keep the daemon on 127.0.0.1 behind a TLS reverse proxy).
  // opts.tls wins; else fall back to KB_DAEMON_TLS_CERT + KB_DAEMON_TLS_KEY env (file paths).
  const tls = opts.tls ?? (
    process.env.KB_DAEMON_TLS_CERT && process.env.KB_DAEMON_TLS_KEY
      ? { cert: process.env.KB_DAEMON_TLS_CERT, key: process.env.KB_DAEMON_TLS_KEY }
      : undefined
  );

  // Non-localhost safety gate (string check — NOT DNS resolution).
  // A hostname that resolves to loopback is still treated as non-local (safe over-permissive).
  const isLocal = ['127.0.0.1', 'localhost', '::1'].includes(host);
  if (!isLocal && !tls && process.env.KB_ALLOW_REMOTE_INSECURE !== '1') {
    throw new Error(
      `Refusing to bind non-localhost (${host}) without TLS. Either:\n` +
      '  (recommended) keep the daemon on 127.0.0.1 and put a TLS reverse proxy (caddy/nginx) on 0.0.0.0, OR\n' +
      '  set KB_DAEMON_TLS_CERT + KB_DAEMON_TLS_KEY for direct TLS, OR\n' +
      '  set KB_ALLOW_REMOTE_INSECURE=1 to bypass (NOT recommended — the token is sniffable).',
    );
  }
  if (!isLocal && !tls && process.env.KB_ALLOW_REMOTE_INSECURE === '1') {
    process.stderr.write(
      'WARNING: remote daemon without TLS — the Bearer token is sniffable on the network. ' +
      'Use a TLS reverse proxy or KB_DAEMON_TLS_*.\n',
    );
  }

  // Build CommonDeps + the real Fs* implementations.
  // The typestate builder (createKb) assembles group *shapes* with stubs that throw;
  // the daemon constructs the real Fs* classes directly (the builder's purpose is
  // compile-time type gating, which the Fs* classes satisfy via `implements`).
  const deps = buildCommonDeps(opts);

  // Construct the real Fs* implementations directly (the typestate builder's
  // stubs throw; the Fs* classes implement the @okf-kb/core group interfaces).
  const realKb: AllGroups = {
    localFs: new FsLocalFs(deps),
    read: new FsRead(deps),
    search: new FsSearch(deps),
    write: new FsWrite(deps, new FsSearch(deps)),
    indexAdmin: new FsIndexAdmin(deps),
  };

  // tRPC handler
  const trpcHandler = createTrpcHandler(realKb as never, token);

  // MCP: create a new server per request (stateless mode — each request is independent)
  // The McpServer can only be connected to one transport at a time, so we create
  // a fresh server + transport per /mcp POST. The binding registration is cheap.
  function createMcpServer() {
    return mcpServerFromBindings(realKb as never, fullBindings);
  }

  // Capabilities groups — derived from fullBindings keys so it can't drift.
  const groups = Object.keys(fullBindings);

  // HTTP server (plain HTTP, or HTTPS if `tls` is set — secondary path).
  const createServer = tls
    ? () => createHttpsServer(
        { cert: readFileSync(tls.cert), key: readFileSync(tls.key) },
        requestHandler,
      )
    : () => createHttpServer(requestHandler);
  const server = createServer();

  // Request handler (referenced above for both http and https server creation).
  async function requestHandler(req: IncomingMessage, res: ServerResponse) {
    const url = req.url ?? '/';

    try {
      if (url === '/' || url === '/ping' || url === '/.ping') {
        // Health + capabilities (NOT Bearer-gated — the groups list is non-sensitive).
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'kb-daemon', version: '0.1.0', groups }));
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
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(port, host, () => {
      const addr = server.address();
      const actualPort = typeof addr === 'object' && addr ? addr.port : port;
      const scheme = tls ? 'https' : 'http';
      const actualUrl = `${scheme}://${host}:${actualPort}`;
      resolve({
        url: actualUrl,
        host,
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
