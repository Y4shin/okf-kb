// Type-level negatives — every @ts-expect-error below MUST fire (i.e. the line is a real type error).
// `typecheck:negatives` runs tsc on this file; if any @ts-expect-error is UNUSED (the line is
// actually fine), tsc errors with "Unused '@ts-expect-error' directive" and the strictness test
// fails. Mirrors reference/core-usage.prototype.ts forbidden paths.

import { createKb, type Read } from '../src/index.js';

const manifest = { types: {} as any, predicates: [] };
const util = { computeId: (t: any, s: string) => ({ slug: s, ty: t }), validate: () => ({ ok: true, errors: [] }), frontmatterFor: (_t: any, p: any) => ({ type: _t, ...p }) as any, normalize: (c: string) => c, stampProvenance: (f: any) => f } as any;
const embedder = { embed: async () => [] } as any;

// (a) withSearch needs embedder; util+space+manifest alone -> not on the type.
createKb({ space: './kb', manifest, util }).declare()
  // @ts-expect-error withSearch needs embedder; not set
  .withSearch();

// (b) withRead needs util; space+manifest alone -> not on the type.
createKb({ space: './kb', manifest }).declare()
  // @ts-expect-error withRead needs util; not set
  .withRead();

// (c) a number is NOT a valid RefInput (Ref | string only).
async function noNumber(read: Read) {
  // @ts-expect-error get takes RefInput (Ref|string), not a number
  await read.get(42);
}
void noNumber;
void manifest; void util; void embedder;
