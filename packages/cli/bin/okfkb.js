#!/usr/bin/env node
// @okf-kb/cli — the `okfkb` binary entry. Imports the compiled main from dist.
import { runCli } from '../dist/src/index.js';

const argv = process.argv.slice(2);
runCli(argv).then((code) => {
  process.exit(code);
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
