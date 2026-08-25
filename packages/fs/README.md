# @okf-kb/fs

Filesystem-backed implementations of the OKF knowledge-base groups.

`@okf-kb/fs` provides five concrete group classes:

- `FsLocalFs` — path and ID resolution inside the space
- `FsRead` — note retrieval and listing
- `FsSearch` — literal FTS5 search, semantic embedding search, and RRF-blended unified search
- `FsWrite` — note creation, update, and deletion
- `FsIndexAdmin` — index building, rebuilding, and integrity checks

It also exports `DefaultUtility`, `TransformersEmbedder`, `FakeEmbedder`, and chunking helpers.

## Install

```bash
npm install @okf-kb/fs
```

## Usage

```typescript
import { createKb } from '@okf-kb/core';
import {
  DefaultUtility,
  TransformersEmbedder,
  FsLocalFs,
  FsRead,
  FsSearch,
  FsWrite,
  FsIndexAdmin,
} from '@okf-kb/fs';

const util = new DefaultUtility();
const embedder = new TransformersEmbedder();
const manifest = { /* ... */ };

const kb = createKb({ space: '/path/to/space', manifest, util, embedder })
  .declare()
  .withRead()
  .withSearch()
  .withWrite()
  .withLocalFs()
  .withIndexAdmin()
  .build();
```

## Heavy dependencies

This package bundles the real embedding and search stack:

- `@xenova/transformers` (~transformer model cache)
- `better-sqlite3` (native SQLite with FTS5)

Together these add roughly **95 MB** to `node_modules` and include native compilation. The CLI intentionally does **not** depend on `@okf-kb/fs`; run the daemon separately and use the light `okfkb` client instead.

See the root [README](../../README.md) and [docs/setup-guide.md](../../docs/setup-guide.md) for setup details.
