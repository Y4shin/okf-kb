// Test helpers: build a tmp bundle dir + a manifest, matching the
// okf-format-adaptation type->dir mapping.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Manifest } from '@okf-kb/core';

export const testManifest: Manifest = {
  types: {
    term: { dir: 'glossary', question: 'what is X?' },
    concept: { dir: 'concepts', question: 'how does X work?' },
    decision: { dir: 'decisions', question: 'why X over Y?' },
    reference: { dir: 'reference', question: "what's the spec?" },
    generic: { dir: 'generic', question: 'uncategorized' },
  },
  predicates: ['defines', 'uses', 'depends_on', 'part_of', 'decided_in', 'constrains', 'supersedes', 'derived_from'],
};

export async function makeTmpBundle(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'kb-fs-test-'));
  for (const entry of Object.values(testManifest.types)) {
    await mkdir(join(dir, entry.dir), { recursive: true });
  }
  await writeFile(join(dir, '.gitkeep'), '');
  return dir;
}

export async function cleanupTmpBundle(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true });
}

export function note(fm: Record<string, unknown>, body: string): string {
  const lines = Object.entries(fm).map(([k, v]) => `${k}: ${yamlValue(v)}`);
  return `---\n${lines.join('\n')}\n---\n${body}`;
}

function yamlValue(v: unknown): string {
  if (Array.isArray(v)) {
    if (v.length === 0) return '[]';
    if (typeof v[0] === 'object') {
      return `\n${v.map((item) => `  - ${Object.entries(item as object).map(([k, val], i) => (i === 0 ? `${k}: ${val}` : `\n    ${k}: ${val}`)).join('')}`).join('\n')}`;
    }
    return `[${v.map((x) => JSON.stringify(x)).join(', ')}]`;
  }
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
