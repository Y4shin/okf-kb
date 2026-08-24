// @kb/cli — commands: generate a commander command per binding record.
// Loops fullBindings -> flattenBindings; for each binding, reads meta.cli
// (positional vs --flag/-x, desc) and registers a commander subcommand that
// parses args -> input object -> calls the tRPC client method -> prints result.

import { readFileSync } from 'node:fs';
import { Command } from 'commander';
import { flattenBindings, fullBindings } from '@kb/protocol';
import type { FlatBinding } from '@kb/protocol';
import type { AppRouter } from '@kb/protocol';
import { createTrpcClient } from './client.js';

/** The tRPC client proxy type (read.<method>.query / write.<method>.mutate). */
type ClientProxy = ReturnType<typeof createTrpcClient>;

/** Context shared across all generated commands. */
export interface CommandContext {
  client: ClientProxy;
  json: boolean;
  url: string;
}

/** A field descriptor extracted from the inputSchema shape + meta. */
interface FieldDescriptor {
  name: string;
  positional: boolean;
  flag?: string;
  short?: string;
  booleanFlag?: boolean;
  desc?: string;
  optional: boolean;
}

/**
 * Register a single binding as a commander subcommand on the parent program.
 *
 * For each FlatBinding (group.method):
 * - Read meta.cli for positional vs flag hints + descriptions.
 * - Build a commander command with the right args.
 * - On invocation, parse args -> input object matching the inputSchema,
 *   call the tRPC client method (query/mutation), print the result.
 *
 * For no-arg methods (z.undefined() schema: buildIndex, rebuildIndexes, check,
 * spaceRoot), no input args are registered and the call is made with undefined.
 */
export function registerBindingCommand(parent: Command, fb: FlatBinding, ctx: CommandContext): void {
  const cmdName = toKebab(fb.qualifiedName);
  const schemaMeta = readSchemaMeta(fb);
  const desc = fb.meta.desc ?? schemaMeta?.desc ?? fb.qualifiedName;
  const cmd = parent.command(cmdName).description(desc).exitOverride();

  const fields = extractFields(fb, schemaMeta);

  // Register options/args on the commander command
  const positionalOrder: string[] = [];
  for (const f of fields) {
    if (f.positional) {
      positionalOrder.push(f.name);
      const argSpec = f.optional ? `[${f.name}]` : `<${f.name}>`;
      cmd.argument(argSpec, f.desc ?? `${f.name}`);
    } else if (f.flag) {
      const flags = f.booleanFlag
        ? (f.short ? `${f.flag}, ${f.short}` : f.flag)
        : (f.short ? `${f.flag}, ${f.short} <value>` : `${f.flag} <value>`);
      cmd.option(flags, f.desc ?? `${f.name}`);
    } else {
      cmd.option(`--${f.name} <value>`, f.desc ?? `${f.name}`);
    }
  }

  // Special flags for the put command: --file and --content
  if (fb.group === 'write' && fb.method === 'put') {
    cmd.option('--file <path>', 'read content from a file');
    cmd.option('--content <str>', 'inline content string');
  }

  // Special flags for search-unified: --with-graph, --include-deprecated
  if (fb.group === 'search' && fb.method === 'searchUnified') {
    cmd.option('--with-graph', 'include graph context in results');
    cmd.option('--include-deprecated', 'include status:deprecated notes (excluded by default)');
  }

  // Special flags for search-text: --fields, --include-deprecated
  if (fb.group === 'search' && fb.method === 'searchText') {
    cmd.option('--fields <fields>', 'comma-separated fields to search');
    cmd.option('--include-deprecated', 'include status:deprecated notes (excluded by default)');
  }

  // Special flags for search-semantic: --k, --include-deprecated
  if (fb.group === 'search' && fb.method === 'searchSemantic') {
    cmd.option('--k <n>', 'number of results', undefined);
    cmd.option('--include-deprecated', 'include status:deprecated notes (excluded by default)');
  }

  cmd.action(async (...args: unknown[]) => {
    const opts = (args[args.length - 2] as Record<string, unknown>) ?? {};
    const input = buildInput(fb, fields, positionalOrder, args, opts);

    try {
      const result = await callClient(ctx.client, fb, input);
      const exitCode = printResult(result, ctx.json, fb);
      if (exitCode !== 0) {
        throw new CommandExitError(exitCode);
      }
    } catch (err) {
      if (err instanceof CommandExitError) throw err;
      printError(err, ctx.json);
      throw err;
    }
  });
}

/** Read the .meta() from the inputSchema (if it has cli hints). */
function readSchemaMeta(fb: FlatBinding): { positional?: boolean; flag?: string; short?: string; desc?: string; env?: string } | undefined {
  const schema = fb.inputSchema as { meta?: () => unknown } | undefined;
  if (schema && typeof schema.meta === 'function') {
    const m = schema.meta() as { cli?: { positional?: boolean; flag?: string; short?: string; desc?: string; env?: string } } | undefined;
    return m?.cli;
  }
  return undefined;
}

/** Detect if a schema is z.undefined() (no-arg methods). */
function isUndefinedSchema(schema: unknown): boolean {
  const s = schema as { _zod?: { def?: { type?: string } } };
  return s?._zod?.def?.type === 'undefined';
}

/** Get the .shape() of a ZodObject, or undefined if not a ZodObject. */
function getZodShape(schema: unknown): Record<string, unknown> | undefined {
  const s = schema as { _zod?: { def?: { type?: string; shape?: Record<string, unknown> } }; shape?: Record<string, unknown> };
  if (s?._zod?.def?.type === 'object') {
    return s._zod.def.shape;
  }
  return undefined;
}

/** Check if a Zod schema is optional. */
function isZodOptional(schema: unknown): boolean {
  const s = schema as { _zod?: { def?: { type?: string } }; isOptional?: () => boolean };
  if (typeof s.isOptional === 'function') return s.isOptional();
  return s?._zod?.def?.type === 'optional';
}

/** Check if a field should be a boolean flag. */
function isBooleanField(schema: unknown): boolean {
  const s = schema as { _zod?: { def?: { type?: string; innerType?: { _zod?: { def?: { type?: string } } } } } };
  let inner = s;
  if (s?._zod?.def?.type === 'optional') {
    inner = s._zod.def.innerType as typeof s;
  }
  return inner?._zod?.def?.type === 'boolean';
}

/** Check if a field is a nested object schema (like `opts`). */
function isObjectField(schema: unknown): boolean {
  const s = schema as { _zod?: { def?: { type?: string; innerType?: { _zod?: { def?: { type?: string } } } } } };
  let inner = s;
  if (s?._zod?.def?.type === 'optional') {
    inner = s._zod.def.innerType as typeof s;
  }
  return inner?._zod?.def?.type === 'object';
}

/** Fields that are handled specially and should not be auto-registered. */
function isSpecialField(fb: FlatBinding, name: string): boolean {
  // `opts` is always special (handled by --with-graph, --fields, etc.)
  if (name === 'opts') return true;
  // `content` on write.put is handled by --file/--content
  if (fb.group === 'write' && fb.method === 'put' && name === 'content') return true;
  // `k` on search.searchSemantic is handled by the special --k flag
  if (fb.group === 'search' && fb.method === 'searchSemantic' && name === 'k') return true;
  return false;
}

/** Extract field descriptors from the binding's inputSchema shape + meta. */
function extractFields(fb: FlatBinding, schemaMeta: ReturnType<typeof readSchemaMeta>): FieldDescriptor[] {
  if (isUndefinedSchema(fb.inputSchema)) {
    return [];
  }

  const shape = getZodShape(fb.inputSchema);
  if (!shape) return [];

  const fields: FieldDescriptor[] = [];
  const fieldNames = Object.keys(shape).filter((name) => !isSpecialField(fb, name));

  for (let i = 0; i < fieldNames.length; i++) {
    const name = fieldNames[i];
    const fieldSchema = shape[name];
    const optional = isZodOptional(fieldSchema);

    if (schemaMeta?.positional) {
      // For positional schemas: required fields are positional, optional fields are flags.
      // Exception: if only one required field and it has a positional meta, it's positional.
      // For schemas like graph (ref + dir, both required), both are positional.
      if (!optional) {
        fields.push({
          name,
          positional: true,
          desc: schemaMeta.desc ?? name,
          optional: false,
        });
      } else {
        // Optional fields become --<name> flags
        fields.push({
          name,
          positional: false,
          flag: `--${name}`,
          booleanFlag: isBooleanField(fieldSchema),
          desc: name,
          optional: true,
        });
      }
    } else if (schemaMeta?.flag && i === 0) {
      // The first field uses the meta's flag; subsequent fields get --<name>
      fields.push({
        name,
        positional: false,
        flag: schemaMeta.flag,
        short: schemaMeta.short,
        booleanFlag: isBooleanField(fieldSchema),
        desc: schemaMeta.desc ?? name,
        optional,
      });
    } else {
      // Default: --<name> flag form
      fields.push({
        name,
        positional: false,
        flag: `--${name}`,
        booleanFlag: isBooleanField(fieldSchema),
        desc: name,
        optional,
      });
    }
  }

  return fields;
}

/** Build the input object from commander's parsed args + options. */
function buildInput(
  fb: FlatBinding,
  fields: FieldDescriptor[],
  positionalOrder: string[],
  actionArgs: unknown[],
  opts: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (fields.length === 0 && !hasSpecialOpts(fb)) {
    return undefined;
  }

  const input: Record<string, unknown> = {};

  // Positional args are at the front of actionArgs (before opts + cmdObj)
  const positionalValues = actionArgs.slice(0, positionalOrder.length);
  for (let i = 0; i < positionalOrder.length; i++) {
    const fieldName = positionalOrder[i];
    input[fieldName] = positionalValues[i];
  }

  // Options from commander (camelCased keys)
  for (const f of fields) {
    if (f.positional) continue;
    const optKey = camelCase(f.name);
    const val = opts[optKey];
    if (val !== undefined && val !== null) {
      if (f.booleanFlag) {
        input[f.name] = true;
      } else {
        input[f.name] = val;
      }
    }
  }

  // Special handling for put: --file / --content
  if (fb.group === 'write' && fb.method === 'put') {
    if (opts.file) {
      input.content = readFileSync(opts.file as string, 'utf-8');
    } else if (opts.content) {
      input.content = opts.content;
    }
  }

  // For search-unified: --with-graph -> opts: { withGraph: true }; --include-deprecated -> opts.includeDeprecated
  if (fb.group === 'search' && fb.method === 'searchUnified') {
    const opt: { withGraph?: boolean; includeDeprecated?: boolean } = {};
    if (opts.withGraph) opt.withGraph = true;
    if (opts.includeDeprecated) opt.includeDeprecated = true;
    if (Object.keys(opt).length) input.opts = opt;
  }

  // For search-text: --fields "a,b" -> opts: { fields: [...] }; --include-deprecated -> opts.includeDeprecated
  if (fb.group === 'search' && fb.method === 'searchText') {
    const opt: { fields?: string[]; includeDeprecated?: boolean } = {};
    if (opts.fields) opt.fields = (opts.fields as string).split(',').map((s) => s.trim());
    if (opts.includeDeprecated) opt.includeDeprecated = true;
    if (Object.keys(opt).length) input.opts = opt;
  }

  // For search-semantic: --k <n> -> k: number; --include-deprecated -> includeDeprecated
  if (fb.group === 'search' && fb.method === 'searchSemantic') {
    if (opts.k) {
      input.k = parseInt(opts.k as string, 10);
    }
  }

  // For search.update: content is the 2nd positional (positionalOrder = ['ref', 'content'])
  // Already handled by positional extraction above

  return input;
}

/** Check if the binding has special opts handling (not in the shape). */
function hasSpecialOpts(fb: FlatBinding): boolean {
  return (
    (fb.group === 'write' && fb.method === 'put') ||
    (fb.group === 'search' && (fb.method === 'searchUnified' || fb.method === 'searchText' || fb.method === 'searchSemantic'))
  );
}

/** Call the tRPC client method (query or mutation) for the given binding. */
async function callClient(client: ClientProxy, fb: FlatBinding, input: Record<string, unknown> | undefined): Promise<unknown> {
  const groupObj = (client as unknown as Record<string, Record<string, { query: (i: unknown) => Promise<unknown>; mutate: (i: unknown) => Promise<unknown> }>>)[fb.group];
  if (!groupObj || !groupObj[fb.method]) {
    throw new Error(`Unknown procedure: ${fb.qualifiedName}`);
  }
  const proc = groupObj[fb.method];
  if (fb.isQuery) {
    return proc.query(input);
  } else {
    return proc.mutate(input);
  }
}

/** Custom error to signal a non-zero exit code from a command action. */
class CommandExitError extends Error {
  readonly exitCode: number;
  constructor(exitCode: number) {
    super(`exit ${exitCode}`);
    this.name = 'CommandExitError';
    this.exitCode = exitCode;
  }
}

/** Print the result (JSON via --json, or a human format). Returns exit code (0 ok, 1 check failed). */
function printResult(result: unknown, json: boolean, fb: FlatBinding): number {
  // For check methods: if ok is false, exit non-0
  if (fb.group === 'indexAdmin' && fb.method === 'check') {
    const report = result as { ok?: boolean };
    if (report && report.ok === false) {
      if (json) {
        process.stdout.write(JSON.stringify(result, null, 2) + '\n');
      } else {
        process.stdout.write(JSON.stringify(result, null,  2) + '\n');
      }
      return 1;
    }
  }

  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  } else {
    if (typeof result === 'string') {
      process.stdout.write(result + '\n');
    } else {
      process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    }
  }
  return 0;
}

/** Print an error (JSON via --json, or human format). */
function printError(err: unknown, json: boolean): void {
  const message = err instanceof Error ? err.message : String(err);
  if (json) {
    process.stderr.write(JSON.stringify({ error: message }) + '\n');
  } else {
    process.stderr.write(`Error: ${message}\n`);
  }
}

/** Convert a qualified name (group.method) to kebab-case: localFs.spaceRoot -> local-fs.space-root */
function toKebab(qualifiedName: string): string {
  return qualifiedName
    .split('.')
    .map((part) => part.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase())
    .join('.');
}

/** Convert a kebab-case or snake_case name to camelCase. */
function camelCase(name: string): string {
  return name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

/**
 * Register ALL binding commands on a commander program.
 * This is the main loop: for each binding in fullBindings, register a command.
 */
export function registerAllCommands(program: Command, ctx: CommandContext): void {
  const flat = flattenBindings(fullBindings);
  for (const fb of flat) {
    registerBindingCommand(program, fb, ctx);
  }
}

/** Re-export for tests + consumers. */
export type { AppRouter };
