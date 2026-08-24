// @kb/core — Zod-verified, string-coercing, framework-ready.
// Every type is a Zod schema; TS types are z.infer. Coercing schemas (Ref, Actor)
// accept a raw string and transform it, so method params typed `RefInput`/`ActorInput`
// accept either the structured form OR a raw string. Schemas are exported so
// trpc / OpenAPI (zod-to-openapi, z.toJSONSchema) / MCP tool-input can consume them.

import { z } from 'zod';

// ---- branded-ish primitives (now with real validation) ----
export const SlugSchema = z.string().regex(/^[a-z0-9][a-z0-9-]*$/);
export type Slug = z.infer<typeof SlugSchema>;
export const IsoDateSchema = z.string().datetime();
export type IsoDate = z.infer<typeof IsoDateSchema>;
export const TagSchema = z.string();
export type Tag = z.infer<typeof TagSchema>;
export const VectorSchema = z.array(z.number());
export type Vector = z.infer<typeof VectorSchema>;

// ---- enums ----
export const TypeSchema = z.enum(['term', 'concept', 'decision', 'reference', 'generic']);
export type Type = z.infer<typeof TypeSchema>;
export const PredicateSchema = z.enum([
  'defines', 'uses', 'depends_on', 'part_of',
  'decided_in', 'constrains', 'supersedes', 'derived_from',
]);
export type Predicate = z.infer<typeof PredicateSchema>;
export const RuleSchema = z.enum([
  'A1', 'A2', 'A3', 'A4', 'A5', 'A7',
  'B1', 'B2', 'B3', 'B4', 'B5', 'B7', 'B8',
]);
export type Rule = z.infer<typeof RuleSchema>;

// ---- Ref (coerces a raw string) ----
export const IdRefSchema = z.object({ slug: SlugSchema, ty: TypeSchema });
export type IdRef = z.infer<typeof IdRefSchema>;
export const PathRefSchema = z.object({ path: z.string() });
export type PathRef = z.infer<typeof PathRefSchema>;

export function parseRef(s: string): IdRef | PathRef {
  const i = s.indexOf(':');
  const known: Type[] = ['term', 'concept', 'decision', 'reference', 'generic'];
  if (i > 0) {
    const ty = s.slice(0, i) as Type;
    if (known.includes(ty)) return { slug: s.slice(i + 1), ty };
  }
  return { path: s };
}
export const RefSchema = z.union([IdRefSchema, PathRefSchema, z.string().transform(parseRef)]);
export type Ref = z.infer<typeof RefSchema>;          // output: IdRef | PathRef
export type RefInput = Ref | string;                  // method-param form (accepts a raw string)
export function formatRef(ref: Ref): string { return 'slug' in ref ? `${ref.ty}:${ref.slug}` : ref.path; }

// ---- Actor (coerces a raw string; agent-agnostic; pi = producer:'pi') ----
export const AgentActorSchema = z.object({ kind: z.literal('agent'), producer: z.string(), version: z.string(), model: z.string().optional() });
export const HumanActorSchema = z.object({ kind: z.literal('human'), id: z.string() });
export const ProcessActorSchema = z.object({ kind: z.literal('process'), id: z.string() });
export type AgentActor = z.infer<typeof AgentActorSchema>;
export type HumanActor = z.infer<typeof HumanActorSchema>;
export type ProcessActor = z.infer<typeof ProcessActorSchema>;

export function parseActor(s: string): AgentActor | HumanActor | ProcessActor {
  if (s.startsWith('human:')) return { kind: 'human', id: s.slice('human:'.length) };
  if (s.startsWith('process:')) return { kind: 'process', id: s.slice('process:'.length) };
  const [producer, version, ...rest] = s.split('/');
  if (!producer || !version) throw new Error('bad actor: ' + s);
  return { kind: 'agent', producer, version, model: rest.length ? rest.join('/') : undefined };
}
export const ActorSchema = z.union([AgentActorSchema, HumanActorSchema, ProcessActorSchema, z.string().transform(parseActor)]);
export type Actor = z.infer<typeof ActorSchema>;
export type ActorInput = Actor | string;
export function formatActor(a: Actor): string {
  if (a.kind === 'human') return 'human:' + a.id;
  if (a.kind === 'process') return 'process:' + a.id;
  let s = `${a.producer}/${a.version}`;
  if (a.model) s += '/' + a.model;
  return s;
}

// ---- frontmatter families ----
export const SourceSchema = z.object({
  id: z.string().optional(), resource: z.string(), title: z.string().optional(),
  author: ActorSchema.optional(), usage_count: z.number().optional(), last_modified: IsoDateSchema.optional(),
});
export type Source = z.infer<typeof SourceSchema>;
export const GeneratedSchema = z.object({ by: ActorSchema, at: IsoDateSchema });
export type Generated = z.infer<typeof GeneratedSchema>;
export const VerifiedEntrySchema = z.object({ by: ActorSchema, at: IsoDateSchema });
export type VerifiedEntry = z.infer<typeof VerifiedEntrySchema>;
export const RelationSchema = z.object({ predicate: PredicateSchema, target: z.string() });
export type Relation = z.infer<typeof RelationSchema>;
export const FrontmatterSchema = z.object({
  id: z.string().optional(), type: TypeSchema, title: z.string().optional(), description: z.string().optional(),
  tags: z.array(TagSchema).optional(), relations: z.array(RelationSchema).optional(),
  generated: GeneratedSchema.optional(), verified: z.array(VerifiedEntrySchema).optional(),
  sources: z.array(SourceSchema).optional(), status: z.enum(['draft', 'stable', 'deprecated']).optional(),
  stale_after: IsoDateSchema.optional(),
}).passthrough();                       // OKF §11: tolerate unknown keys
export type Frontmatter = z.infer<typeof FrontmatterSchema>;
export interface Note { id: string; path: string; frontmatter: Frontmatter; body: string }      // internal

// ---- result shapes ----
export const CheckReportSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.object({ rule: RuleSchema, ref: RefSchema, msg: z.string() })),
});
export type CheckReport = z.infer<typeof CheckReportSchema>;
export const NoteViewSchema = z.object({ ref: RefSchema, frontmatter: FrontmatterSchema, body: z.string() });
export type NoteView = z.infer<typeof NoteViewSchema>;
export const SearchHitSchema = z.object({ ref: RefSchema, title: z.string(), snippet: z.string(), score: z.number(), mode: z.enum(['literal', 'graph', 'semantic']) });
export type SearchHit = z.infer<typeof SearchHitSchema>;
export const ListEntrySchema = z.object({ ref: RefSchema, title: z.string().optional(), description: z.string().optional(), mtime: z.number() });
export type ListEntry = z.infer<typeof ListEntrySchema>;
export const PutResultSchema = z.object({ ref: IdRefSchema, etag: z.string().optional(), changed: z.boolean(), warnings: z.array(z.string()) });
export type PutResult = z.infer<typeof PutResultSchema>;
export const DeleteResultSchema = z.object({ ref: RefSchema, removed: z.boolean() });
export type DeleteResult = z.infer<typeof DeleteResultSchema>;

// ---- DI seam ----
export interface Utility { computeId(type: Type, slug: Slug): IdRef; validate(note: Note): CheckReport }
export interface Embedder { embed(text: string): Promise<Vector> }
export const ManifestSchema = z.object({
  types: z.record(TypeSchema, z.object({ dir: z.string(), question: z.string() })),
  predicates: z.array(PredicateSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// ---- common deps ----
export interface CommonDeps { space: string; manifest: Manifest; util: Utility; embedder: Embedder }
type Base = Pick<CommonDeps, 'space' | 'manifest' | 'util'>;

// ---- group interfaces (params use *Input where coercion is desired) ----
export interface LocalFs {
  resolvePath(ref: RefInput): PathRef;
  resolveId(ref: RefInput): IdRef;
  dirFor(type: Type): PathRef;
  pathFor(type: Type, slug: Slug): PathRef;
  spaceRoot(): PathRef;
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
export interface IndexAdmin { buildIndex(): Promise<void>; rebuildIndexes(): Promise<void>; check(): Promise<CheckReport> }

// ---- per-method INPUT schemas (framework-ready: feed trpc/OpenAPI/MCP directly) ----
export const GetInputSchema = z.object({ ref: RefSchema });
export const GraphInputSchema = z.object({ ref: RefSchema, dir: z.enum(['ancestors', 'descendants', 'neighbors']) });
export const PutInputSchema = z.object({ ref: RefSchema, content: z.string() });
export const SearchTextInputSchema = z.object({ q: z.string(), opts: z.object({ fields: z.array(z.string()).optional() }).optional() });

// ---- runtime impl (impl detail; parses via the schemas at the boundary) ----
class ComposerImpl<C extends {}, G extends {}> {
  constructor(private deps: Partial<CommonDeps>, private parts: G) {}
  withRead():       ComposerImpl<C, G & { readonly read: Read }>        { return new ComposerImpl(this.deps, { ...this.parts, read:       makeRead(this.deps) }); }
  withSearch():     ComposerImpl<C, G & { readonly search: Search }>    { return new ComposerImpl(this.deps, { ...this.parts, search:     makeSearch(this.deps) }); }
  withWrite():      ComposerImpl<C, G & { readonly write: Write }>      { return new ComposerImpl(this.deps, { ...this.parts, write:      makeWrite(this.deps) }); }
  withIndexAdmin(): ComposerImpl<C, G & { readonly indexAdmin: IndexAdmin }> { return new ComposerImpl(this.deps, { ...this.parts, indexAdmin: makeIndexAdmin(this.deps) }); }
  withLocalFs():    ComposerImpl<C, G & { readonly localFs: LocalFs }>  { return new ComposerImpl(this.deps, { ...this.parts, localFs:    makeLocalFs(this.deps) }); }
  build(): G { return this.parts; }
}
function makeRead(d: Partial<CommonDeps>): Read { throw new Error('stub'); }
function makeSearch(d: Partial<CommonDeps>): Search { throw new Error('stub'); }
function makeWrite(d: Partial<CommonDeps>): Write { throw new Error('stub'); }
function makeIndexAdmin(d: Partial<CommonDeps>): IndexAdmin { throw new Error('stub'); }
function makeLocalFs(d: Partial<CommonDeps>): LocalFs { throw new Error('stub'); }

// ---- the gate ----
export type Composer<C extends {}, G extends {}> =
  { build(): G } &
  (C extends Base ? {
    withRead():    Composer<C, G & { readonly read: Read }>;
    withWrite():   Composer<C, G & { readonly write: Write }>;
    withLocalFs(): Composer<C, G & { readonly localFs: LocalFs }>;
  } : {}) &
  (C extends CommonDeps ? {
    withSearch():     Composer<C, G & { readonly search: Search }>;
    withIndexAdmin(): Composer<C, G & { readonly indexAdmin: IndexAdmin }>;
  } : {});
function lift<C extends {}, G extends {}>(c: ComposerImpl<C, G>): Composer<C, G> { return c as unknown as Composer<C, G>; }

// ---- phase 1: Collector ----
export class KbCollector<C extends {} = {}> {
  private constructor(private deps: Partial<CommonDeps>) {}
  static start<T extends Partial<CommonDeps>>(deps: T): KbCollector<T> { return new KbCollector(deps); }
  static startEmpty(): KbCollector<{}> { return new KbCollector({}); }
  usingSpace(s: string): KbCollector<C & { space: string }>           { return new KbCollector({ ...(this.deps as CommonDeps), space: s }); }
  usingManifest(m: Manifest): KbCollector<C & { manifest: Manifest }> { return new KbCollector({ ...(this.deps as CommonDeps), manifest: m }); }
  usingUtil(u: Utility): KbCollector<C & { util: Utility }>           { return new KbCollector({ ...(this.deps as CommonDeps), util: u }); }
  usingEmbedder(e: Embedder): KbCollector<C & { embedder: Embedder }> { return new KbCollector({ ...(this.deps as CommonDeps), embedder: e }); }
  declare(): Composer<C, {}> { return lift(new ComposerImpl(this.deps, {})); }
}
export function createKb<T extends Partial<CommonDeps>>(deps: T): KbCollector<T>;
export function createKb(): KbCollector<{}>;
export function createKb<T extends Partial<CommonDeps>>(deps?: T): KbCollector<T | {}> {
  return (deps ? KbCollector.start(deps) : KbCollector.startEmpty()) as unknown as KbCollector<T | {}>;
}
