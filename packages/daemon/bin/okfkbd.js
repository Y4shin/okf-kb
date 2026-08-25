#!/usr/bin/env node
// @okf-kb/daemon — the `okfkbd` binary entry. Imports the compiled daemon from dist.
import { startDaemon } from '../dist/index.js';

const argv = process.argv.slice(2);

/** Parse `--port`/`-p` and `--space`/`-s` from argv, then start the daemon. */
async function main() {
  let port;
  let space;
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
  process.stderr.write(`okfkbd listening on ${handle.url}\n`);

  const shutdown = async () => {
    await handle.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
