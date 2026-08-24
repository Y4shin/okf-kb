// @kb/protocol — buildRouter(kb): a tRPC router where each binding → a
// publicProcedure.input(b.inputSchema).query/.mutation that calls kb.<group>.<method>(input).
// The router is BUILT here (runtime) so the daemon and any in-process caller share one impl;
// the CLI imports only `type AppRouter` (no runtime dep on the server libs beyond the type).

import { initTRPC } from '@trpc/server';
import type { Kb } from '@kb/core';
import { EXCLUDED } from '@kb/core';
import { fullBindings } from './records.js';
import type { AllGroups, FullBindings } from './records.js';

// query vs mutation: read-like methods are queries; write-like are mutations.
const QUERY_METHODS = new Set([
  'get', 'list', 'searchText', 'searchSemantic', 'searchUnified',
  'graph', 'checkId', 'check', 'resolvePath', 'resolveId', 'dirFor', 'pathFor', 'spaceRoot',
]);

const MUTATION_METHODS = new Set([
  'put', 'delete', 'update', 'buildIndex', 'rebuildIndexes',
]);

/** A flat binding entry: the qualified name (group.method) + the binding record. */
export interface FlatBinding {
  group: string;
  method: string;
  qualifiedName: string; // "<group>.<method>"
  inputSchema: unknown; // z.ZodType
  meta: { desc: string; [k: string]: unknown };
  isQuery: boolean;
}

/**
 * Flatten a FullBindings record into a list of bindings, skipping EXCLUDED entries.
 * Accepts the assembled fullBindings or piBindings shape.
 */
export function flattenBindings(bindings: FullBindings): FlatBinding[] {
  const out: FlatBinding[] = [];
  for (const [group, groupRec] of Object.entries(bindings)) {
    for (const [method, entry] of Object.entries(groupRec as object)) {
      if (entry === EXCLUDED) continue;
      const b = entry as { inputSchema: unknown; meta: { desc: string } };
      const isQuery = QUERY_METHODS.has(method) || !MUTATION_METHODS.has(method);
      out.push({
        group, method,
        qualifiedName: `${group}.${method}`,
        inputSchema: b.inputSchema,
        meta: b.meta,
        isQuery,
      });
    }
  }
  return out;
}

/**
 * buildRouter(kb) — given a built Kb (the mother object with localFs/read/search/
 * write/indexAdmin groups), return a tRPC router where each binding → a
 * publicProcedure.input(b.inputSchema).query/.mutation that calls kb.<group>.<method>(input).
 *
 * Each group becomes a nested sub-router so the client addresses procedures as
 * `read.get`, `write.put`, etc.
 */
export function buildRouter(kb: Kb<AllGroups>) {
  const t = initTRPC.create();
  const flat = flattenBindings(fullBindings);

  // group → procedures
  const groupProcedures: Record<string, Record<string, unknown>> = {};
  for (const fb of flat) {
    const groupObj = (kb as unknown as Record<string, Record<string, (i: unknown) => unknown>>)[fb.group];
    const methodFn = groupObj[fb.method];
    const proc = fb.isQuery
      ? t.procedure
          .input(fb.inputSchema as never)
          .query(({ input }) => methodFn.call(groupObj, input))
      : t.procedure
          .input(fb.inputSchema as never)
          .mutation(({ input }) => methodFn.call(groupObj, input));
    (groupProcedures[fb.group] ??= {})[fb.method] = proc;
  }

  // Build nested router: each group → a sub-router of its procedures.
  const nested: Record<string, unknown> = {};
  for (const [group, procs] of Object.entries(groupProcedures)) {
    nested[group] = t.router(procs as never);
  }
  return t.router(nested as never);
}

/** The AppRouter type — the CLI imports this as a type for createTRPCProxyClient<AppRouter>(). */
export type AppRouter = ReturnType<typeof buildRouter>;
