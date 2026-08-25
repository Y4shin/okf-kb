// @okf-kb/daemon — mcp: mcpServerFromBindings(kb, bindings) — each binding → an MCP tool
// (name = `<group>.<method>`, inputSchema from the zod schema, handler calls
// kb.<group>.<method>(input)). Uses @modelcontextprotocol/sdk's McpServer.
// The MCP server is kept on its own /mcp path so its idiosyncrasies don't touch /trpc.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { Kb } from '@okf-kb/core';
import { EXCLUDED } from '@okf-kb/core';
import { flattenBindings, type FlatBinding } from '@okf-kb/protocol';
import { fullBindings, type AllGroups, type FullBindings } from '@okf-kb/protocol';

/**
 * mcpServerFromBindings(kb, bindings?) — build an McpServer where each binding
 * becomes a tool. The tool name is `<group>.<method>`; the inputSchema is the
 * binding's zod schema (passed directly to registerTool); the handler calls
 * kb.<group>.<method>(input) and wraps the result as text content.
 *
 * For no-arg methods (z.void/z.undefined), inputSchema is omitted (undefined)
 * so the tool takes no arguments.
 */
export function mcpServerFromBindings(
  kb: Kb<AllGroups>,
  bindings: FullBindings = fullBindings,
): McpServer {
  const server = new McpServer(
    { name: 'kb-daemon', version: '0.1.0' },
  );

  const flat = flattenBindings(bindings);
  for (const fb of flat) {
    registerOne(server, kb, fb);
  }

  return server;
}

function registerOne(server: McpServer, kb: Kb<AllGroups>, fb: FlatBinding): void {
  const groupObj = (kb as unknown as Record<string, Record<string, (i: unknown) => unknown>>)[fb.group];
  const methodFn = groupObj[fb.method];

  // Determine if this is a no-arg method (z.void or z.undefined → no inputSchema)
  const schema = fb.inputSchema as { _zod?: { def?: { type?: string } } } | undefined;
  const isVoid = schema?._zod?.def?.type === 'void' || schema?._zod?.def?.type === 'undefined';

  const config: {
    description?: string;
    inputSchema?: unknown;
  } = { description: fb.meta.desc };

  if (!isVoid) {
    config.inputSchema = fb.inputSchema;
  }

  server.registerTool(
    fb.qualifiedName,
    config as never,
    (async (args: unknown) => {
      const result = await Promise.resolve(methodFn.call(groupObj, args ?? undefined));
      return toCallToolResult(result);
    }) as never,
  );
}

/** Wrap a kb method result as a CallToolResult with text content. */
function toCallToolResult(result: unknown): CallToolResult {
  const text = typeof result === 'string'
    ? result
    : JSON.stringify(result, null, 2);
  return {
    content: [{ type: 'text', text }],
  };
}

// Re-export EXCLUDED so callers can build custom binding subsets.
export { EXCLUDED };
