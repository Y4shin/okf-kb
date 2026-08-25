// @okf-kb/protocol — binding RECORDS (runtime values) for all consumer projections.
// Pure: depends only on @okf-kb/core (the GroupBindings type + per-method *InputSchema).
// The daemon imports the runtime records + the router factory; the CLI imports only
// the AppRouter type. This keeps cli→protocol and daemon→protocol→fs acyclic.

import { z } from 'zod';
import {
  EXCLUDED,
  type GroupBindings,
  type LocalFs,
  type Read,
  type Search,
  type Write,
  type IndexAdmin,
  GetInputSchema,
  ListInputSchema,
  GraphInputSchema,
  PutInputSchema,
  DeleteInputSchema,
  SearchTextInputSchema,
  SearchSemanticInputSchema,
  SearchUnifiedInputSchema,
  SearchUpdateInputSchema,
  CheckIdInputSchema,
  ResolvePathInputSchema,
  ResolveIdInputSchema,
  DirForInputSchema,
  PathForInputSchema,
} from '@okf-kb/core';

// ============================================================
// Per-group binding records. GroupBindings<G> maps over the methods of a
// single group interface, enforcing exhaustiveness + schema drift per group.
// ============================================================

export const localFsBindings = {
  resolvePath: { inputSchema: ResolvePathInputSchema, meta: { desc: 'resolve a ref to a path' } },
  resolveId: { inputSchema: ResolveIdInputSchema, meta: { desc: 'resolve a ref to an id' } },
  dirFor: { inputSchema: DirForInputSchema, meta: { desc: 'directory for a type' } },
  pathFor: { inputSchema: PathForInputSchema, meta: { desc: 'path for a type+slug' } },
  spaceRoot: { inputSchema: z.undefined(), meta: { desc: 'the space root path' } },
} as const satisfies GroupBindings<LocalFs>;

export const readBindings = {
  get: { inputSchema: GetInputSchema, meta: { desc: 'get a note by ref' } },
  list: { inputSchema: ListInputSchema, meta: { desc: 'list notes' } },
} as const satisfies GroupBindings<Read>;

export const searchBindings = {
  searchText: { inputSchema: SearchTextInputSchema, meta: { desc: 'literal text search' } },
  searchSemantic: { inputSchema: SearchSemanticInputSchema, meta: { desc: 'semantic search' } },
  searchUnified: { inputSchema: SearchUnifiedInputSchema, meta: { desc: 'unified (RRF) search' } },
  graph: { inputSchema: GraphInputSchema, meta: { desc: 'graph traversal' } },
  update: { inputSchema: SearchUpdateInputSchema, meta: { desc: 'incremental index refresh for one note' } },
  checkId: { inputSchema: CheckIdInputSchema, meta: { desc: 'post-write conformance check for one note' } },
} as const satisfies GroupBindings<Search>;

export const writeBindings = {
  put: { inputSchema: PutInputSchema, meta: { desc: 'put a note (full markdown fm+body)' } },
  delete: { inputSchema: DeleteInputSchema, meta: { desc: 'delete a note' } },
} as const satisfies GroupBindings<Write>;

export const indexAdminBindings = {
  buildIndex: { inputSchema: z.undefined(), meta: { desc: 'build the index' } },
  rebuildIndexes: { inputSchema: z.undefined(), meta: { desc: 'rebuild all indexes' } },
  check: { inputSchema: z.undefined(), meta: { desc: 'full-bundle integrity walk' } },
} as const satisfies GroupBindings<IndexAdmin>;

// ============================================================
// fullBindings — all groups assembled. The daemon exposes all groups.
// ============================================================

/** The union of all 5 groups the daemon composes via the typestate builder. */
export type AllGroups = {
  localFs: LocalFs;
  read: Read;
  search: Search;
  write: Write;
  indexAdmin: IndexAdmin;
};

/** The assembled binding record type: each group → its GroupBindings. */
export type FullBindings = {
  localFs: GroupBindings<LocalFs>;
  read: GroupBindings<Read>;
  search: GroupBindings<Search>;
  write: GroupBindings<Write>;
  indexAdmin: GroupBindings<IndexAdmin>;
};

export const fullBindings = {
  localFs: localFsBindings,
  read: readBindings,
  search: searchBindings,
  write: writeBindings,
  indexAdmin: indexAdminBindings,
} as const satisfies FullBindings;

// ============================================================
// piBindings — the pi-facing surface OMITS Write (pi authors with native
// tools; the daemon's pi-facing client type simply doesn't expose Write).
// The daemon HAS Write; pi's client is built from this subset.
// ============================================================

/** piGroups: all groups EXCEPT write (pi omits Write.put/Write.delete). */
export type PiGroups = Omit<AllGroups, 'write'>;

/** piBindings: write group entries are EXCLUDED (the sentinel) so the
 * record still compiles against GroupBindings<Write> while omitting Write
 * from pi's client type. The router/MCP factory skips EXCLUDED entries. */
export const piBindings = {
  localFs: localFsBindings,
  read: readBindings,
  search: searchBindings,
  write: {
    put: EXCLUDED,
    delete: EXCLUDED,
  },
  indexAdmin: indexAdminBindings,
} as const satisfies FullBindings;
