// @kb/cli — public entry. Re-exports runCli (the main).
export { runCli } from './main.js';
export { createTrpcClient } from './client.js';
export type { AppRouter } from './client.js';
export { registerAllCommands, registerBindingCommand, type CommandContext } from './commands.js';
