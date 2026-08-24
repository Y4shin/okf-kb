// scripts/install-pi.mjs — symlink the pi extension + skill into ~/.pi/agent/
// for dev. Creates the ~/.pi/agent/ tree if needed.
// Usage: npm run install:pi

import { symlink, mkdir, lstat, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';

const piAgentDir = join(homedir(), '.pi', 'agent');
const extSrc = join(process.cwd(), 'extension');

const extDest = join(piAgentDir, 'extensions', 'pi-kb');

// Each skill dir in packages/pi-adapter/skill/ gets its own symlink into
// ~/.pi/agent/skills/<name>. Glob all skill subdirectories so new skills
// are picked up automatically without editing this list.
import { readdir } from 'node:fs/promises';
const skillDir = join(process.cwd(), 'skill');
const skills = (await readdir(skillDir, { withFileTypes: true }))
  .filter((e) => e.isDirectory())
  .map((e) => e.name);

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
for (const name of skills) {
  await safeSymlink(join(process.cwd(), 'skill', name), join(piAgentDir, 'skills', name));
}
console.log('Done.');
