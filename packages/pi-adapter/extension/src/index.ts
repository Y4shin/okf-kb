// extension/src/index.ts — the pi extension default factory.
// On session_start: resolve config, determine local vs remote (isRemoteKb),
// build the tRPC client with the right router type, register KB tools with the
// right binding set. Resource setup is deferred to session_start (per the
// extensions doc — don't start resources in the factory).

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolveKbConfig, isRemoteKb } from './config.js';
import { createKbTrpcClient } from './client.js';
import { registerKbTools } from './tools.js';
import { piBindings, fullBindings } from '@kb/protocol';
import type { PiAppRouter, AppRouter } from '@kb/protocol';

export { resolveKbConfig, isRemoteKb } from './config.js';
export { createKbTrpcClient } from './client.js';
export type { PiAppRouter, AppRouter } from './client.js';
export { registerKbTools } from './tools.js';

/**
 * The pi extension factory. Defer client/tool setup to session_start
 * (per the extensions doc — don't start resources in the factory).
 *
 * At session_start, resolves KB_URL and decides:
 * - **Local** (`isRemoteKb === false`): PiAppRouter client + piBindings → 8 tools
 *   (no kb_put/kb_delete). pi authors with native write/edit. (Default, unchanged.)
 * - **Remote** (`isRemoteKb === true`): AppRouter client + fullBindings → 10 tools
 *   incl kb_put/kb_delete. The agent authors through the daemon.
 *
 * The decision is made ONCE at session_start (not per-call).
 */
export default function (pi: ExtensionAPI): void {
  pi.on('session_start', async (_event, _ctx) => {
    const cfg = resolveKbConfig();
    if (isRemoteKb(cfg.url)) {
      // Remote: full router + fullBindings → 10 tools incl kb_put/kb_delete.
      const client = createKbTrpcClient<AppRouter>(cfg.url, cfg.token);
      registerKbTools(pi, client, fullBindings);
    } else {
      // Local: pi-shaped router (no write) + piBindings → 8 tools. (Default, unchanged.)
      const client = createKbTrpcClient<PiAppRouter>(cfg.url, cfg.token);
      registerKbTools(pi, client, piBindings);
    }
  });
}
