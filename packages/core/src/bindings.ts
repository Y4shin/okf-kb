// @kb/core — group interfaces, per-method input schemas (with .meta tags), and the
// GroupBindings<G> exhaustiveness-enforcement mapped type. The same Zod input schemas +
// GroupBindings records feed tRPC, MCP, and the CLI (one IDL, multiple projections).

import { z } from 'zod';
import { RefSchema, SlugSchema, TypeSchema, ActorSchema, TagSchema, VectorSchema } from './types.js';
import type { Ref, RefInput, Actor, ActorInput, Type, Slug, Tag } from './types.js';
import type { NoteView, SearchHit, ListEntry, PutResult, DeleteResult, CheckReport, } from './results.js';

// ============================================================
// Group interfaces — params use *Input where coercion is desired (Ref | string, Actor | string)
// ============================================================

export interface LocalFs {
  resolvePath(ref: RefInput): { path: string };
  resolveId(ref: RefInput): { slug: Slug; ty: Type };
  dirFor(type: Type): { path: string };
  pathFor(type: Type, slug: Slug): { path: string };
  spaceRoot(): { path: string };
}

export interface Read {
  get(ref: RefInput): Promise<NoteView>;
  list(opts?: { type?: Type; tag?: Tag; status?: string; by?: ActorInput }): AsyncIterable<ListEntry>;
}

export interface Search {
  searchText(q: string, opts?: { fields?: string[] }): Promise<SearchHit[]>;
  searchSemantic(q: string, k?: number): Promise<SearchHit[]>;
  searchUnified(q: string, opts?: { withGraph?: boolean }): Promise<SearchHit[]>;
  graph(ref: RefInput, dir: 'ancestors' | 'descendants' | 'neighbors'): Promise<Ref[]>;
  update(ref: RefInput, content: string): Promise<void>;
  checkId(ref: RefInput): Promise<CheckReport>;
}

export interface Write {
  put(ref: RefInput, content: string): Promise<PutResult>;
  delete(ref: RefInput): Promise<DeleteResult>;
}

export interface IndexAdmin {
  buildIndex(): Promise<void>;
  rebuildIndexes(): Promise<void>;
  check(): Promise<CheckReport>;
}

// ============================================================
// Per-method INPUT schemas (framework-ready: feed trpc/OpenAPI/MCP directly).
// Each carries .meta({doc,cli,...}) so CLI/HTTP/MCP generators read hints from the same schema.
// ============================================================

export const GetInputSchema = z.object({ ref: RefSchema }).meta({ doc: { desc: 'get a note by ref', group: 'read' }, cli: { positional: true, desc: 'note ref, e.g. concept:foo' } });
export const ListInputSchema = z.object({ type: TypeSchema.optional(), tag: TagSchema.optional(), status: z.string().optional(), by: ActorSchema.optional() }).meta({ doc: { desc: 'list notes', group: 'read' }, cli: { flag: '--type', short: '-t', desc: 'filter by type' } });
export const GraphInputSchema = z.object({ ref: RefSchema, dir: z.enum(['ancestors', 'descendants', 'neighbors']) }).meta({ doc: { desc: 'graph traversal', group: 'search' }, cli: { positional: true, desc: 'note ref' } });
export const PutInputSchema = z.object({ ref: RefSchema, content: z.string() }).meta({ doc: { desc: 'put a note (full markdown fm+body)', group: 'write' }, cli: { positional: true, desc: 'note ref' } });
export const DeleteInputSchema = z.object({ ref: RefSchema }).meta({ doc: { desc: 'delete a note', group: 'write' }, cli: { positional: true, desc: 'note ref' } });
export const SearchTextInputSchema = z.object({ q: z.string(), opts: z.object({ fields: z.array(z.string()).optional() }).optional() }).meta({ doc: { desc: 'literal text search', group: 'search' }, cli: { positional: true, desc: 'query' } });
export const SearchSemanticInputSchema = z.object({ q: z.string(), k: z.number().int().positive().optional() }).meta({ doc: { desc: 'semantic search', group: 'search' }, cli: { positional: true, desc: 'query' } });
export const SearchUnifiedInputSchema = z.object({ q: z.string(), opts: z.object({ withGraph: z.boolean().optional() }).optional() }).meta({ doc: { desc: 'unified (RRF) search', group: 'search' }, cli: { positional: true, desc: 'query' } });
export const SearchUpdateInputSchema = z.object({ ref: RefSchema, content: z.string() }).meta({ doc: { desc: 'incremental index refresh for one note', group: 'search' }, cli: { positional: true, desc: 'note ref' } });
export const CheckIdInputSchema = z.object({ ref: RefSchema }).meta({ doc: { desc: 'post-write conformance check for one note', group: 'search' }, cli: { positional: true, desc: 'note ref' } });
export const ResolvePathInputSchema = z.object({ ref: RefSchema }).meta({ doc: { desc: 'resolve a ref to a path', group: 'localFs' }, cli: { positional: true, desc: 'note ref' } });
export const ResolveIdInputSchema = z.object({ ref: RefSchema }).meta({ doc: { desc: 'resolve a ref to an id', group: 'localFs' }, cli: { positional: true, desc: 'note ref' } });
export const DirForInputSchema = z.object({ type: TypeSchema }).meta({ doc: { desc: 'directory for a type', group: 'localFs' }, cli: { flag: '--type', short: '-t', desc: 'type' } });
export const PathForInputSchema = z.object({ type: TypeSchema, slug: SlugSchema }).meta({ doc: { desc: 'path for a type+slug', group: 'localFs' } });
export const CheckInputSchema = z.void().meta({ doc: { desc: 'full-bundle integrity walk', group: 'indexAdmin' } });
export const BuildIndexInputSchema = z.void().meta({ doc: { desc: 'build the index', group: 'indexAdmin' } });
export const RebuildIndexesInputSchema = z.void().meta({ doc: { desc: 'rebuild all indexes', group: 'indexAdmin' } });

// ============================================================
// Consumer/wrapper sync enforcement — GroupBindings<G> mapped type.
// Adding a method to a group makes every consumer's binding record fail to compile until
// bound (or EXCLUDED). Schema drift: inputSchema output must === method param (rename a field
// -> _output Property mismatch). Verified under tsc --strict.
// ============================================================

/** Sentinel for a deliberately-omitted method: the mapped type still requires the key,
 * so omission is explicit, not silent. */
export const EXCLUDED = Symbol('EXCLUDED');
export type Excluded = typeof EXCLUDED;

export type MethodBinding<F extends (...a: any[]) => any> = {
  /** Zod schema whose z.infer output === the method's first param. Drift -> tsc error. */
  inputSchema: z.ZodType<Parameters<F>[0]>;
  meta: { desc: string; cli?: { positional?: boolean; flag?: string; short?: string; desc?: string; env?: string }; api?: { path?: string; query?: string; deprecated?: boolean }; mcp?: { hint?: string; completionFrom?: string } };
};

export type BindingEntry<F extends (...a: any[]) => any> = MethodBinding<F> | Excluded;

export type GroupBindings<G> = {
  [K in keyof G]: G[K] extends (...a: any[]) => any
    ? BindingEntry<Extract<G[K], (...a: any[]) => any>>
    : never;
};
