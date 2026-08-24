// @kb/cli — main entry: parse argv, route to `kb daemon` or a group command.
// Resolve the daemon URL (KB_URL env or --url flag or http://127.0.0.1:30700)
// + token (KB_TOKEN env or keyring via @kb/daemon's getOrMintToken).
// On unknown command / missing daemon -> clear error + exit 1.

import { Command, CommanderError } from 'commander';
import { getOrMintToken } from '@kb/daemon';
import { createTrpcClient } from './client.js';
import { registerAllCommands, type CommandContext } from './commands.js';

/** Global option keys that are stripped from argv before passing to commander. */
const GLOBAL_FLAG_KEYS = new Set(['--url', '--token', '--json', '-u', '--help', '-h']);

/**
 * runCli(argv) — parse, route to `kb daemon` or a group command.
 * Returns the exit code (0 success, 1 error).
 */
export async function runCli(argv: string[]): Promise<number> {
  // `kb daemon` is special — it runs the daemon directly via @kb/daemon.startDaemon.
  if (argv[0] === 'daemon') {
    return runDaemon(argv.slice(1));
  }

  // `kb config` is special — prints config info, no daemon call needed.
  if (argv[0] === 'config') {
    return runConfig(argv.slice(1));
  }

  // Pre-parse global options (--url, --token, --json) from argv.
  // These can appear before or after the subcommand; we extract them and pass
  // the remaining argv (subcommand + its args) to commander.
  const { globalOpts, subcommandArgv } = extractGlobalOpts(argv);
  const url = globalOpts.url ?? process.env.KB_URL ?? 'http://127.0.0.1:30700';
  const token = globalOpts.token ?? process.env.KB_TOKEN ?? getOrMintToken();
  const json = globalOpts.json ?? false;

  // Create the tRPC client
  const client = createTrpcClient(url, token);

  // All other commands go through commander with generated subcommands.
  const program = new Command();
  program
    .name('kb')
    .description('kb — knowledge base CLI (tRPC client of the daemon)')
    .helpOption('-h, --help', 'show help')
    .exitOverride(); // prevent commander from calling process.exit directly

  // Register all generated commands from the binding records
  const ctx: CommandContext = { client, json, url };
  registerAllCommands(program, ctx);

  // Parse the subcommand argv (global opts already stripped)
  try {
    await program.parseAsync(subcommandArgv, { from: 'user' });
    return 0;
  } catch (err) {
    if (err instanceof CommanderError) {
      return (err as CommanderError).exitCode ?? 1;
    }
    // CommandExitError from a check failure (exit code in the error)
    if (err instanceof Error && err.name === 'CommandExitError') {
      const exitCode = (err as unknown as { exitCode: number }).exitCode;
      return exitCode;
    }
    // Runtime error from a command action (tRPC call failed, etc.)
    const message = err instanceof Error ? err.message : String(err);
    if (json) {
      process.stderr.write(JSON.stringify({ error: message }) + '\n');
    } else {
      process.stderr.write(`Error: ${message}\n`);
    }
    return 1;
  }
}

/** Extract global options from argv, returning them + the remaining subcommand argv. */
function extractGlobalOpts(argv: string[]): { globalOpts: { url?: string; token?: string; json?: boolean }; subcommandArgv: string[] } {
  const globalOpts: { url?: string; token?: string; json?: boolean } = {};
  const subcommandArgv: string[] = [];

  let i = 0;
  while (i < argv.length) {
    const a = argv[i];

    // --url <val> or --url=<val>
    if (a === '--url' || a === '-u') {
      globalOpts.url = argv[i + 1];
      i += 2;
      continue;
    } else if (a.startsWith('--url=')) {
      globalOpts.url = a.slice(6);
      i++;
      continue;
    }

    // --token <val> or --token=<val>
    if (a === '--token') {
      globalOpts.token = argv[i + 1];
      i += 2;
      continue;
    } else if (a.startsWith('--token=')) {
      globalOpts.token = a.slice(9);
      i++;
      continue;
    }

    // --json
    if (a === '--json') {
      globalOpts.json = true;
      i++;
      continue;
    }

    // --help / -h — pass through to commander for subcommand help
    if (a === '--help' || a === '-h') {
      subcommandArgv.push(a);
      i++;
      continue;
    }

    // Everything else is subcommand argv
    subcommandArgv.push(a);
    i++;
  }

  return { globalOpts, subcommandArgv };
}

/** `kb daemon` — runs the daemon via @kb/daemon.startDaemon. */
async function runDaemon(argv: string[]): Promise<number> {
  const { startDaemon } = await import('@kb/daemon');

  // Parse --port and --space from argv. If --port is not given, leave port undefined so
  // startDaemon applies its own default (KB_PORT env or 30700) — passing port:0 would
  // force an ephemeral port and break the client's default-URL assumption.
  let port: number | undefined;
  let space: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port' || a === '-p') {
      port = parseInt(argv[++i], 10);
    } else if (a.startsWith('--port=')) {
      port = parseInt(a.slice(7), 10);
    } else if (a === '--space' || a === '-s') {
      space = argv[++i];
    } else if (a.startsWith('--space=')) {
      space = a.slice(8);
    }
  }

  const handle = await startDaemon({ port, space });
  process.stderr.write(`kb daemon listening on ${handle.url}\n`);

  // Keep running until the process is killed
  return new Promise<number>((resolve) => {
    process.on('SIGINT', async () => {
      await handle.close();
      resolve(0);
    });
    process.on('SIGTERM', async () => {
      await handle.close();
      resolve(0);
    });
  });
}

/** `kb config` — prints KB_URL, KB_HOME, token presence. */
async function runConfig(argv: string[]): Promise<number> {
  const url = process.env.KB_URL ?? 'http://127.0.0.1:30700';
  const kbHome = process.env.KB_HOME ?? '(not set)';
  const token = process.env.KB_TOKEN ?? getOrMintToken();
  const tokenPresent = token ? 'yes' : 'no';

  // Check for --json flag
  const json = argv.includes('--json');

  if (json) {
    process.stdout.write(JSON.stringify({
      url,
      kbHome,
      tokenPresent,
    }, null, 2) + '\n');
  } else {
    process.stdout.write(`KB_URL: ${url}\n`);
    process.stdout.write(`KB_HOME: ${kbHome}\n`);
    process.stdout.write(`Token present: ${tokenPresent}\n`);
  }
  return 0;
}
