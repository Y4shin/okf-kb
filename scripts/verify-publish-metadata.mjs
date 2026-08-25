#!/usr/bin/env node
// Verification test for publish metadata on all public packages.
// Seam: npm publish --dry-run tarball listing per package.

import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const PUBLIC_PACKAGES = ['core', 'protocol', 'fs', 'daemon', 'cli', 'auth'];
const REPO_ROOT = resolve(import.meta.dirname, '..');
let failures = 0;

function fail(message) {
  console.error(`FAIL: ${message}`);
  failures += 1;
}

function readPackage(pkg) {
  const path = resolve(REPO_ROOT, 'packages', pkg, 'package.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

function checkField(pkg, json, field, expected) {
  const actual = json[field];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${pkg}: expected ${field} = ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// 1. package.json metadata fields
for (const pkg of PUBLIC_PACKAGES) {
  const json = readPackage(pkg);
  checkField(pkg, json, 'files', ['dist']);
  checkField(pkg, json, 'license', 'MIT');
  checkField(pkg, json, 'publishConfig', { access: 'public' });
  const prepublishOnly = json.scripts?.prepublishOnly;
  if (prepublishOnly !== 'npm run build') {
    fail(`${pkg}: expected scripts.prepublishOnly = "npm run build", got ${JSON.stringify(prepublishOnly)}`);
  }
}

// 2. root LICENSE
const licensePath = resolve(REPO_ROOT, 'LICENSE');
if (!existsSync(licensePath)) {
  fail('root LICENSE file is missing');
} else {
  const licenseText = readFileSync(licensePath, 'utf8');
  if (!licenseText.includes('MIT License')) {
    fail('root LICENSE does not contain "MIT License"');
  }
  if (!licenseText.includes('Y4shin')) {
    fail('root LICENSE does not contain copyright holder "Y4shin"');
  }
  if (!licenseText.includes('2026')) {
    fail('root LICENSE does not contain year 2026');
  }
}

// 3. dry-run tarball contents: build first, then pack each public package
console.log('\nBuilding all packages...');
const build = spawnSync('npm', ['run', 'build'], {
  cwd: REPO_ROOT,
  stdio: 'pipe',
  shell: false,
});
if (build.status !== 0) {
  console.error(build.stdout.toString());
  console.error(build.stderr.toString());
  fail('npm run build failed');
  process.exit(1);
}
console.log('Build passed.\n');

const tarballCounts = [];

for (const pkg of PUBLIC_PACKAGES) {
  const pkgDir = resolve(REPO_ROOT, 'packages', pkg);
  const result = spawnSync('npm', ['publish', '--dry-run'], {
    cwd: pkgDir,
    stdio: 'pipe',
    shell: false,
  });
  const output = `${result.stdout.toString()}\n${result.stderr.toString()}`;
  if (result.status !== 0) {
    console.error(output);
    fail(`${pkg}: npm publish --dry-run exited with code ${result.status}`);
    continue;
  }

  const lines = output.split('\n');
  let inContents = false;
  const entries = [];
  for (const line of lines) {
    if (line.includes('Tarball Contents')) {
      inContents = true;
      continue;
    }
    if (line.includes('Tarball Details')) {
      inContents = false;
      continue;
    }
    if (inContents && line.startsWith('npm notice')) {
      // Format: npm notice <size> <path>
      const parts = line.replace(/^npm notice\s+/, '').trim().split(/\s+/);
      if (parts.length >= 2) {
        entries.push(parts[parts.length - 1]);
      }
    }
  }

  console.log(`\n📦 @okf-kb/${pkg} tarball entries (${entries.length}):`);
  for (const entry of entries) console.log(`  ${entry}`);

  const hasPackageJson = entries.includes('package.json');
  const hasLicense = entries.includes('LICENSE');
  const hasDist = entries.some((e) => e.startsWith('dist/'));
  const hasSrc = entries.some((e) => e.startsWith('src/'));
  const hasTests = entries.some((e) => e.startsWith('tests/'));
  const hasTsConfig = entries.includes('tsconfig.json');

  // bin entries are auto-included by npm when the package.json has a `bin`
  // field; they are required for daemon/cli and are not leaked source/tests.
  const unexpected = entries.filter(
    (e) =>
      e !== 'package.json' &&
      e !== 'LICENSE' &&
      e !== 'README.md' &&
      !e.startsWith('dist/') &&
      !e.startsWith('bin/')
  );

  if (!hasPackageJson) fail(`${pkg}: tarball is missing package.json`);
  if (!hasLicense) fail(`${pkg}: tarball is missing LICENSE`);
  if (!hasDist) fail(`${pkg}: tarball is missing dist/ entries`);
  if (hasSrc) fail(`${pkg}: tarball incorrectly includes src/`);
  if (hasTests) fail(`${pkg}: tarball incorrectly includes tests/`);
  if (hasTsConfig) fail(`${pkg}: tarball incorrectly includes tsconfig.json`);
  if (unexpected.length > 0) {
    fail(`${pkg}: tarball contains unexpected entries: ${unexpected.join(', ')}`);
  }

  tarballCounts.push({ pkg, count: entries.length });
}

console.log('\n=== tarball file counts ===');
for (const { pkg, count } of tarballCounts) {
  console.log(`@okf-kb/${pkg}: ${count}`);
}

if (failures > 0) {
  console.error(`\n${failures} failure(s) found.`);
  process.exit(1);
}

console.log('\nAll publish-metadata checks passed.');
