# @okf-kb/core

The foundation of the OKF knowledge base. Pure TypeScript + Zod — no filesystem, no network, no heavy models.

`@okf-kb/core` defines the `Kb` typestate builder, the group interfaces (`LocalFs`, `Read`, `Search`, `Write`, `IndexAdmin`), and per-method input schemas that are Zod-verified. It also exports the `GroupBindings<G>` mapped type, which enforces that every group method has a matching schema — the same source of truth used by the tRPC router, the MCP server, and the CLI.

## Install

```bash
npm install @okf-kb/core
```

## Usage

Build a typed knowledge-base shape by declaring the groups you need:

```typescript
import { createKb } from '@okf-kb/core';

const kb = createKb({ space: '/path/to/space', manifest, util, embedder })
  .usingSpace('/path/to/space')
  .usingManifest(manifest)
  .usingUtil(util)
  .usingEmbedder(embedder)
  .declare()
  .withRead()
  .withSearch()
  .withWrite()
  .withLocalFs()
  .withIndexAdmin()
  .build();
```

Implement the `Embedder`, `Utility`, and group interfaces elsewhere (for example, in `@okf-kb/fs`) and pass them into the builder. The typestate gates ensure you can only declare a group when its required dependencies are present.

See the root [README](../../README.md) and [docs/setup-guide.md](../../docs/setup-guide.md) for deployment details.
