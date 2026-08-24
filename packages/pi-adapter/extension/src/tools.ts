// extension/src/tools.ts — registerKbTools(pi, client, bindings): register KB tools
// from a binding subset. Each tool maps a daemon tRPC procedure → a pi tool.
// Tool args are typebox (pi's format), hand-mirrored from the daemon's Zod inputSchemas.
// The bindings loop is the structural gate: it iterates the full subset so a new
// daemon method makes bindings fail tsc until bound or EXCLUDED.
//
// Local (default): piBindings (omits write) → 8 tools, NO kb_put/kb_delete.
// Remote: fullBindings (includes write) → 10 tools incl kb_put/kb_delete.
// The agent authors via kb_put/kb_delete through the daemon when remote.

import { Type } from 'typebox';
import { StringEnum } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { piBindings, fullBindings, flattenBindings } from '@kb/protocol';
import type { FlatBinding, FullBindings } from '@kb/protocol';

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

// kb_search: search.searchUnified({q, opts?{withGraph?, includeDeprecated?}})
// Deprecated notes are excluded by default; set opts.includeDeprecated to include them.
const SearchParams = Type.Object({
  q: Type.String({ description: 'Search query' }),
  opts: Type.Optional(Type.Object({
    withGraph: Type.Optional(Type.Boolean({ description: 'Attach graph-neighbor context to each hit' })),
    includeDeprecated: Type.Optional(Type.Boolean({ description: 'Include status:deprecated notes (excluded by default)' })),
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

// kb_put: write.put({ref, content}) — mutation. The daemon stamps provenance +
// validates + maintains index.md/log + reindexes. Used when the KB is remote
// (the agent can't write to the daemon's bundle with native write/edit).
const PutParams = Type.Object({
  ref: RefParam,
  content: Type.String({ description: 'Full note markdown (frontmatter + body)' }),
});

// kb_delete: write.delete({ref}) — mutation. Removes the note from the daemon bundle.
const DeleteParams = Type.Object({ ref: RefParam });

// ============================================================
// Tool registration map: qualified name → {kb tool name, typebox params, label}
// 10 tool specs total. The local case (piBindings) filters out kb_put/kb_delete
// (write group EXCLUDED); the remote case (fullBindings) registers all 10.
// No indexAdmin tools in v1 (the daemon has them but pi doesn't expose them).
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
  // Write group — only registered when `bindings` includes `write` (fullBindings / remote).
  // With piBindings (local), `write.put` is EXCLUDED → filtered out by the binding gate.
  { name: 'kb_put', label: 'KB Put', parameters: PutParams, qualifiedName: 'write.put' },
  { name: 'kb_delete', label: 'KB Delete', parameters: DeleteParams, qualifiedName: 'write.delete' },
];

// ============================================================
// Structural gate: iterate fullBindings and verify every tool spec references
// a real binding. This catches a missing/renamed daemon method at compile time.
// We use fullBindings (all groups incl write) so kb_put/kb_delete specs validate.
// At runtime, registerKbTools filters TOOL_SPECS by whether the spec's group is
// present (non-EXCLUDED) in the passed bindings set.
// ============================================================

const _fullFlatBindings: FlatBinding[] = flattenBindings(fullBindings);
const _fullBindingByName = new Map(_fullFlatBindings.map((b) => [b.qualifiedName, b]));
// Compile-time check: every tool spec's qualifiedName must exist in fullBindings.
for (const spec of TOOL_SPECS) {
  const b = _fullBindingByName.get(spec.qualifiedName);
  if (!b) {
    throw new Error(`Tool spec ${spec.name} references unknown binding ${spec.qualifiedName}`);
  }
}

/**
 * Register KB tools with the pi extension API, filtered by the binding set.
 *
 * - **Local** (`piBindings`, default): omits `write` group → 8 tools, no
 *   `kb_put`/`kb_delete`. pi authors with native write/edit.
 * - **Remote** (`fullBindings`): includes `write` group → 10 tools incl
 *   `kb_put`/`kb_delete`. The agent authors through the daemon.
 *
 * Each tool calls the daemon via the tRPC client and returns a text result.
 * Errors are caught and re-thrown with a clear message (pi contract: throw on
 * failure).
 *
 * @param pi       The pi ExtensionAPI.
 * @param client   The tRPC proxy client (PiAppRouter locally, AppRouter remotely).
 * @param bindings The binding set: `piBindings` (local, default) or `fullBindings` (remote).
 */
export function registerKbTools(pi: ExtensionAPI, client: KbClient, bindings: FullBindings = piBindings): void {
  // Flatten the passed bindings (skips EXCLUDED entries) to determine which
  // groups/methods are available. A tool spec is registered only if its
  // qualifiedName exists in this set — piBindings (local) omits write.put/
  // write.delete (EXCLUDED), fullBindings (remote) includes them.
  const activeBindings: FlatBinding[] = flattenBindings(bindings);
  const activeByName = new Map(activeBindings.map((b) => [b.qualifiedName, b]));

  for (const spec of TOOL_SPECS) {
    const binding = activeByName.get(spec.qualifiedName);
    if (!binding) continue; // this group/method is EXCLUDED in the passed bindings → skip

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
