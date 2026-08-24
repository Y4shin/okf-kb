// extension/src/index.ts — the pi extension default factory.
// On session_start: resolve config, build the tRPC client, register KB tools.
// Resource setup is deferred to session_start (per the extensions doc — don't
// start resources in the factory).

import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { resolveKbConfig } from './config.js';
import { createKbTrpcClient } from './client.js';
import { registerKbTools } from './tools.js';

export { resolveKbConfig } from './config.js';
export { createKbTrpcClient } from './client.js';
export type { PiAppRouter } from './client.js';
export { registerKbTools } from './tools.js';

/**
 * The pi extension factory. Defer client/tool setup to session_start
 * (per the extensions doc — don't start resources in the factory).
 */
export default function (pi: ExtensionAPI): void {
  pi.on('session_start', async (_event, _ctx) => {
    const cfg = resolveKbConfig();
    const client = createKbTrpcClient(cfg.url, cfg.token);
    registerKbTools(pi, client);
  });
}
