// Type-level negatives — every @ts-expect-error below MUST fire (i.e. the line is a real type error).
// `typecheck:negatives` runs tsc on this file; if any @ts-expect-error is UNUSED (the line is
// actually fine), tsc errors with "Unused '@ts-expect-error' directive" and the strictness test
// fails. Mirrors reference/core-usage.prototype.ts forbidden paths + GroupBindings exhaustiveness.

import { createKb, type Read, type LocalFs, type GroupBindings, EXCLUDED } from '../src/index.js';
import { z } from 'zod';
import { GetInputSchema, ListInputSchema } from '../src/index.js';

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

// (c) a number is NOT a valid RefInput (Ref | string only). get takes { ref: RefInput }.
async function noNumber(read: Read) {
  await read.get({
    // @ts-expect-error get's input.ref takes RefInput (Ref|string), not a number
    ref: 42,
  });
}
void noNumber;

// (d) GroupBindings exhaustiveness: omitting a method key -> tsc error (missing key).
// A record typed GroupBindings<Read> that forgets `list` fails to compile.
// @ts-expect-error Property 'list' is missing — a forgotten method is not silent (the mapped type requires every key of G)
const _missingMethod: GroupBindings<Read> = {
  get: { inputSchema: GetInputSchema, meta: { desc: 'get' } },
};

// (e) GroupBindings schema drift: an inputSchema whose z.infer output != method param -> tsc error.
const _drifted: GroupBindings<Read> = {
  get: { inputSchema: GetInputSchema, meta: { desc: 'get' } },
  list: {
    meta: { desc: 'list' },
    // @ts-expect-error _output mismatch: list's param is { type?; tag?; status?; by? }, not { wrong: number }
    inputSchema: z.object({ wrong: z.number() }),
  },
};

// (f) GroupBindings accepts the EXCLUDED sentinel for a deliberately-omitted method (no error here).
const _excludedOk: GroupBindings<LocalFs> = {
  resolvePath: { inputSchema: z.void() as any, meta: { desc: 'rp' } },
  resolveId: { inputSchema: z.void() as any, meta: { desc: 'ri' } },
  dirFor: { inputSchema: z.void() as any, meta: { desc: 'df' } },
  pathFor: { inputSchema: z.void() as any, meta: { desc: 'pf' } },
  spaceRoot: EXCLUDED,
};
void _missingMethod; void _drifted; void _excludedOk;
void manifest; void util; void embedder; void ListInputSchema;
