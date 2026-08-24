import { z } from 'zod';
import {
  createKb, Read, Search, Write, LocalFs, IndexAdmin, Manifest, Utility, Embedder,
  Ref, RefSchema, IdRef, PathRef, RefInput, Actor, ActorSchema, parseRef, formatRef, parseActor, formatActor,
  ListEntry, PutResult, DeleteResult, SearchHit, CheckReport, Rule,
  GetInputSchema, PutInputSchema, GraphInputSchema,
} from './core';

const manifest: Manifest = { types: {} as any, predicates: [] };
const util: Utility = { computeId: (t, s: string) => ({ slug: s, ty: t }), validate: () => ({ ok: true, errors: [] }) };
const embedder: Embedder = { embed: async () => [] };

// === runtime coercion: a raw string parses to a structured Ref ===
const refFromStr = RefSchema.parse('concept:foo');           // -> IdRef { slug:'foo', ty:'concept' }
const _refOk: Ref = refFromStr;                              // parse returns the Ref union
const refFromPath = RefSchema.parse('concepts/foo.md');      // -> PathRef
const _refOk2: Ref = refFromPath;
void _refOk; void _refOk2;
if ('slug' in refFromStr) { const _id: IdRef = refFromStr; void _id; }   // narrow when needed
if ('path' in refFromPath) { const _p: PathRef = refFromPath; void _p; }

// invalid input -> throws (defensive parsing at the boundary)
let _threw = false;
try { RefSchema.parse({ slug: 'BAD SLUG', ty: 'concept' }); }   // slug fails the regex
catch { _threw = true; }
void _threw;

// Actor coercion
const aFromStr = ActorSchema.parse('pi/0.80.10/claude-opus-4.5');
const _aOk: Actor = aFromStr;
const _piBack: string = formatActor(aFromStr);
void _aOk; void _piBack;

// === framework-readiness: JSON Schema via z.toJSONSchema (Zod v4) ===
const _jsonSchema = (z as any).toJSONSchema ? (z as any).toJSONSchema(GetInputSchema) : null;
void _jsonSchema;

// === consumers (compose; no coercion differences — params still accept Ref|string) ===
const cli = createKb({ space: './kb', manifest, util, embedder }).declare()
  .withRead().withSearch().withWrite().withLocalFs().withIndexAdmin().build();
const piKb = createKb({ space: './kb', manifest, util, embedder }).declare()
  .withLocalFs().withSearch().build();

// === string accepted at the call site (RefInput = Ref | string) ===
async function use(v: Read, w: Write, s: Search, lf: LocalFs) {
  await v.get('concept:foo');                       // raw string — auto-coerced at boundary by RefSchema.parse
  const _g: NoteView_t = await v.get({ slug: 'foo', ty: 'concept' });   // structured also fine
  for await (const e of v.list({ by: 'human:pplattner' })) { const _e: ListEntry = e; void _e; }   // raw Actor string
  for await (const e of v.list({ by: parseActor('pi/1/x') })) { const _e: ListEntry = e; void _e; }  // structured Actor
  const hits: SearchHit[] = await s.searchUnified('x');
  const _h0ref: Ref = hits[0].ref;
  const linked: Ref[] = await s.graph('concept:foo', 'ancestors');   // raw ref string
  await s.update('concept:foo', '---\ntype: concept\n---\nbody');
  const rep: CheckReport = await s.checkId('concept:foo');
  const _r0: Rule | undefined = rep.errors[0]?.rule;
  const put: PutResult = await w.put('concept:foo', '---\ntype: concept\n---\nbody');
  const _changed: boolean = put.changed;
  const del: DeleteResult = await w.delete('concept:foo');
  void del; void _g; void _h0ref; void linked;
}
void use;

// (type alias used above to avoid importing NoteView in a tight spot)
type NoteView_t = { ref: Ref; frontmatter: Readonly<any>; body: string };

// === forbidden ===
createKb({ space: './kb', manifest, util }).declare()
  // @ts-expect-error withSearch needs embedder; not set
  .withSearch();
createKb({ space: './kb', manifest }).declare()
  // @ts-expect-error withRead needs util; not set
  .withRead();

// a number is NOT a valid RefInput (Ref | string only)
async function noNumber() {
  // @ts-expect-error get takes RefInput (Ref|string), not a number
  await cli.read.get(42);
}
void noNumber;
