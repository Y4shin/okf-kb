// scripts/install-pi.mjs — symlink the pi extension + skill into ~/.pi/agent/
// for dev. Creates the ~/.pi/agent/ tree if needed.
// Usage: npm run install:pi

import { symlink, mkdir, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const piAgentDir = join(homedir(), '.pi', 'agent');
const extSrc = join(process.cwd(), 'extension');
const skillSrc = join(process.cwd(), 'skill', 'kb-ask');

const extDest = join(piAgentDir, 'extensions', 'pi-kb');
const skillDest = join(piAgentDir, 'skills', 'kb-ask');

async function safeSymlink(target, path) {
  try {
    await lstat(path);
    await rm(path);
  } catch {
    // doesn't exist — fine
  }
  await symlink(target, path, 'dir');
  console.log(`  linked ${path} -> ${target}`);
}

await mkdir(join(piAgentDir, 'extensions'), { recursive: true });
await mkdir(join(piAgentDir, 'skills'), { recursive: true });

console.log('Installing pi extension + skill into ~/.pi/agent/ ...');
await safeSymlink(extSrc, extDest);
await safeSymlink(skillSrc, skillDest);
console.log('Done.');
