// @okf-kb/core — Zod-verified, string-coercing, framework-ready.
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
