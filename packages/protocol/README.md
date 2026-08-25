# @okf-kb/protocol

Turn a built `Kb` into a type-safe tRPC router and a flat binding list for MCP.

`@okf-kb/protocol` exports `buildRouter(kb)`, which walks the binding records (`fullBindings` and `piBindings`) and produces a tRPC router where each bound method becomes a `query` or `mutation` under its group namespace (`read.get`, `search.searchUnified`, `write.put`, etc.). It also exports the `AppRouter` type consumed by the CLI, plus `flattenBindings` for the daemon's MCP projection.

## Install

```bash
npm install @okf-kb/protocol
```

## Usage

```typescript
import { buildRouter, fullBindings, flattenBindings } from '@okf-kb/protocol';
import type { AppRouter } from '@okf-kb/protocol';

const router = buildRouter(kb, fullBindings);

// Flat list for MCP registration
const mcpBindings = flattenBindings(fullBindings);
```

The protocol layer is pure: it depends only on `@okf-kb/core`, `@trpc/server`, and `zod`. The CLI imports only the `AppRouter` type, so it stays light and does not pull in `@okf-kb/fs` or its heavy native dependencies.

See the root [README](../../README.md) for the full architecture.
