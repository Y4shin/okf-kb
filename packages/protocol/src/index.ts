// @kb/protocol — public entry. Re-exports the binding records (fullBindings,
// piBindings), the router factory (buildRouter), the AppRouter type, and the
// flattenBindings helper used by the daemon's MCP projection.
export { fullBindings, piBindings } from './records.js';
export type { AllGroups, PiGroups, FullBindings } from './records.js';
export { buildRouter, buildPiRouter, flattenBindings } from './router.js';
export type { AppRouter, FlatBinding, PiAppRouter } from './router.js';
