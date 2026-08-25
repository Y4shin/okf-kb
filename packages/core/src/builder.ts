// @okf-kb/core — the typestate builder.
// createKb(deps) -> KbCollector (phase 1: DI collection) -> declare() -> Composer (phase 2: output declaration, gated) -> build() -> Kb<G>.
// The gate is a TYPE, not a class: Composer<C,G> is a conditional-intersection type so each gated
// withX exists on the public type iff C carries its required inputs. The runtime ComposerImpl
// (public ctor, all methods present, impl detail) is lifted into the public Composer type via lift().

import type { CommonDeps, Manifest, Utility, Embedder, Base } from './manifest.js';
import type { Read, Search, Write, IndexAdmin, LocalFs } from './bindings.js';

export type Kb<G extends {}> = G;

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

// make* stubs — real impls live in @okf-kb/fs (slice 2). The builder only assembles interfaces;
// these return shells whose methods throw 'impl in @okf-kb/fs' if called before @okf-kb/fs is wired.
// (Stubs must NOT throw at withX-construction time, only when a method is invoked.)
function notImpl(): never { throw new Error('impl in @okf-kb/fs'); }
function shell<T extends object>(methods: Record<string, (...a: any[]) => any>): T {
  const o: any = {};
  for (const name of Object.keys(methods)) o[name] = (...a: any[]) => notImpl();
  return o as T;
}
function makeRead(_d: Partial<CommonDeps>): Read {
  return shell<Read>({ get: 0 as any, list: 0 as any });
}
function makeSearch(_d: Partial<CommonDeps>): Search {
  return shell<Search>({ searchText: 0 as any, searchSemantic: 0 as any, searchUnified: 0 as any, graph: 0 as any, update: 0 as any, checkId: 0 as any });
}
function makeWrite(_d: Partial<CommonDeps>): Write {
  return shell<Write>({ put: 0 as any, delete: 0 as any });
}
function makeIndexAdmin(_d: Partial<CommonDeps>): IndexAdmin {
  return shell<IndexAdmin>({ buildIndex: 0 as any, rebuildIndexes: 0 as any, check: 0 as any });
}
function makeLocalFs(_d: Partial<CommonDeps>): LocalFs {
  return shell<LocalFs>({ resolvePath: 0 as any, resolveId: 0 as any, dirFor: 0 as any, pathFor: 0 as any, spaceRoot: 0 as any });
}

// ---- the gate: a conditional-intersection TYPE (not a class/interface-merge) ----
// TS forbids merged declarations with differing type-parameter constraints (TS2428);
// conditional-intersection types have no such limit. Each withX exists on the public type
// iff C carries its required inputs.
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

// lift the runtime ComposerImpl (all methods present) into the public Composer type.
function lift<C extends {}, G extends {}>(c: ComposerImpl<C, G>): Composer<C, G> { return c as unknown as Composer<C, G>; }

// ---- phase 1: Collector (DI collection; no output methods) ----
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

// createKb must be generic over the call site — a fixed Partial<...> leaks field optionality into C
// and keeps every gate closed even when the caller passed the fields.
export function createKb<T extends Partial<CommonDeps>>(deps: T): KbCollector<T>;
export function createKb(): KbCollector<{}>;
export function createKb<T extends Partial<CommonDeps>>(deps?: T): KbCollector<T | {}> {
  return (deps ? KbCollector.start(deps) : KbCollector.startEmpty()) as unknown as KbCollector<T | {}>;
}
