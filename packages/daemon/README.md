# @okf-kb/daemon

Run the OKF knowledge base as an HTTP daemon.

`@okf-kb/daemon` exports `startDaemon()`, which assembles a `Kb` from `@okf-kb/fs`, builds the tRPC router from `@okf-kb/protocol`, and serves three endpoints:

- `/trpc` — tRPC procedures (Bearer auth)
- `/mcp` — Model Context Protocol over HTTP (Bearer auth)
- `GET /` — health + capabilities

Bearer auth is handled via `@okf-kb/auth`: the daemon resolves the same token the `okfkb` CLI uses.

## Install

```bash
npm install -g @okf-kb/daemon
```

## Usage

Run the binary:

```bash
okfkbd
# KB_HOME defaults to ~/.kb; KB_PORT defaults to 30700
```

Or start it programmatically:

```typescript
import { startDaemon } from '@okf-kb/daemon';

const { url, token, close } = await startDaemon({
  port: 30700,
  host: '127.0.0.1',
});
```

The package also exposes `buildCommonDeps`, `defaultManifest`, and `loadManifestAsync` for custom daemon wiring.

For deployment, TLS, and remote access, see the root [README](../../README.md) and [docs/setup-guide.md](../../docs/setup-guide.md).
