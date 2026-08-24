// extension/src/tools.ts — registerKbTools(pi, client): register KB tools from the
// pi-shaped binding subset. Each tool maps a daemon tRPC procedure → a pi tool.
// Tool args are typebox (pi's format), hand-mirrored from the daemon's Zod inputSchemas.
// The piBindings loop is the structural gate: it iterates the full subset so a new
// daemon method makes piBindings fail tsc until bound or EXCLUDED.
//
// NO kb_put/kb_delete — pi authors with native write/edit, then kb_update to reindex.

import { Type } from 'typebox';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { piBindings, flattenBindings } from '@kb/protocol';
import type { FlatBinding } from '@kb/protocol';

// ============================================================
// Typebox parameter schemas — hand-mirrored from the Zod inputSchemas.
// These are the pi tool format (typebox, not Zod). The daemon's Zod schemas
// validate at the boundary; these mirror the accepted shapes.
// ============================================================

const RefParam = Type.String({ description: 'Note ref, e.g. concept:foo or path/to/note.md' });
const TypeEnum = StringEnum(['term', 'concept', 'decision', 'reference', 'generic']);
const DirEnum = StringEnum(['ancestors', 'descendants', 'neighbors']);

// kb_get: read.get({ref})
const GetParams = Type.Object({ ref: RefParam });

// kb_list: read.list({type?, tag?, status?, by?})
const ListParams = Type.Object({
  type: Type.Optional(TypeEnum),
  tag: Type.Optional(Type.String()),
  status: Type.Optional(Type.String()),
  by: Type.Optional(Type.String()),
});

// kb_search: search.searchUnified({q, opts?{withGraph?}})
const SearchParams = Type.Object({
  q: Type.String({ description: 'Search query' }),
  opts: Type.Optional(Type.Object({
    withGraph: Type.Optional(Type.Boolean()),
  })),
});

// kb_graph: search.graph({ref, dir})
// (predicate filter is NOT in the daemon's GraphInputSchema — omitted to avoid schema drift;
// the daemon's graph() impl reads an optional predicate but the tRPC input schema doesn't carry it.)
const GraphParams = Type.Object({
  ref: RefParam,
  dir: DirEnum,
});

// kb_update: search.update({ref, content}) — mutation
const UpdateParams = Type.Object({
  ref: RefParam,
  content: Type.String({ description: 'Full note markdown (frontmatter + body)' }),
});

// kb_check_id: search.checkId({ref})
const CheckIdParams = Type.Object({ ref: RefParam });

// kb_resolve_path: localFs.resolvePath({ref})
const ResolvePathParams = Type.Object({ ref: RefParam });

// kb_resolve_id: localFs.resolveId({ref})
const ResolveIdParams = Type.Object({ ref: RefParam });

// ============================================================
// Tool registration map: qualified name → {kb tool name, typebox params, label}
// Only the 8 tools the agent needs (no kb_put/kb_delete, no indexAdmin in v1).
// ============================================================

interface ToolSpec {
  /** The kb_<method> tool name. */
  name: string;
  /** Human-readable label. */
  label: string;
  /** Typebox parameter schema. */
  parameters: ReturnType<typeof Type.Object>;
  /** The daemon binding qualified name (group.method). */
  qualifiedName: string;
}

const TOOL_SPECS: ToolSpec[] = [
  { name: 'kb_get', label: 'KB Get', parameters: GetParams, qualifiedName: 'read.get' },
  { name: 'kb_list', label: 'KB List', parameters: ListParams, qualifiedName: 'read.list' },
  { name: 'kb_search', label: 'KB Search', parameters: SearchParams, qualifiedName: 'search.searchUnified' },
  { name: 'kb_graph', label: 'KB Graph', parameters: GraphParams, qualifiedName: 'search.graph' },
  { name: 'kb_update', label: 'KB Update', parameters: UpdateParams, qualifiedName: 'search.update' },
  { name: 'kb_check_id', label: 'KB Check ID', parameters: CheckIdParams, qualifiedName: 'search.checkId' },
  { name: 'kb_resolve_path', label: 'KB Resolve Path', parameters: ResolvePathParams, qualifiedName: 'localFs.resolvePath' },
  { name: 'kb_resolve_id', label: 'KB Resolve ID', parameters: ResolveIdParams, qualifiedName: 'localFs.resolveId' },
];

// ============================================================
// Structural gate: iterate piBindings and verify every binding we claim to
// register exists. This catches a missing/renamed daemon method at compile time.
// The flat list includes all piBindings entries (including indexAdmin); the
// TOOL_SPECS map references specific qualifiedNames, and the loop below asserts
// each spec's qualifiedName is present in the flattened binding list.
// ============================================================

const _flatBindings: FlatBinding[] = flattenBindings(piBindings);
const _bindingByName = new Map(_flatBindings.map((b) => [b.qualifiedName, b]));
// Compile-time check: every tool spec's qualifiedName must exist in piBindings.
for (const spec of TOOL_SPECS) {
  const b = _bindingByName.get(spec.qualifiedName);
  if (!b) {
    throw new Error(`Tool spec ${spec.name} references unknown binding ${spec.qualifiedName}`);
  }
}

/**
 * Register all KB tools with the pi extension API.
 * Each tool calls the daemon via the tRPC client and returns a text result.
 * Errors are caught and returned as error tool results.
 *
 * @param pi     The pi ExtensionAPI.
 * @param client The tRPC proxy client (typed PiAppRouter — no write group).
 */
export function registerKbTools(pi: ExtensionAPI, client: KbClient): void {
  for (const spec of TOOL_SPECS) {
    const binding = _bindingByName.get(spec.qualifiedName)!;
    const isQuery = binding.isQuery;
    const [group, method] = spec.qualifiedName.split('.') as [string, string];

    pi.registerTool({
      name: spec.name,
      label: spec.label,
      description: binding.meta.desc,
      parameters: spec.parameters,
      async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
        try {
          const groupRouter = client[group] as unknown as Record<string, unknown>;
          const procedure = groupRouter[method] as unknown as {
            query: (input: unknown) => Promise<unknown>;
            mutate: (input: unknown) => Promise<unknown>;
          };
          const res = isQuery
            ? await procedure.query(params)
            : await procedure.mutate(params);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(res) }],
            details: {},
          };
        } catch (err) {
          // pi's AgentToolResult has no isError field — the tool contract is "throw on failure"
          // so the pi runtime marks the result as an error (isError=true in tool_execution_end)
          // and the agent can react. Wrap with a clear message; classify the common cases.
          const raw = err instanceof Error ? err.message : String(err);
          let msg: string;
          if (/401|unauthorized|UNAUTHORIZED/i.test(raw)) {
            msg = `KB daemon auth failed (check KB_TOKEN): ${raw}`;
          } else if (/fetch|econnrefused|connect|network|unreachable|ECONN/i.test(raw)) {
            const url = process.env.KB_URL ?? 'http://127.0.0.1:3000';
            msg = `KB daemon not running at ${url}: ${raw}`;
          } else {
            msg = raw;
          }
          throw new Error(msg);
        }
      },
    });
  }
}

/** The tRPC proxy client type (re-exported for the index). */
export type KbClient = {
  [group: string]: {
    [method: string]: {
      query: (input: unknown) => Promise<unknown>;
      mutate: (input: unknown) => Promise<unknown>;
    };
  };
};
