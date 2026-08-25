// walkBundleNotes — shared helper: walk every .md in the manifest's typed
// dirs and load frontmatter+body+relative path, for bundle-wide integrity checks.
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type { Manifest, Ref, Type } from '@okf-kb/core';
import { parseNoteFile } from './read.js';
import type { BundleNote } from './check.js';

export async function walkBundleNotes(space: string, manifest: Manifest): Promise<BundleNote[]> {
  const notes: BundleNote[] = [];
  for (const [ty, entry] of Object.entries(manifest.types) as Array<[Type, { dir: string }]>) {
    const dir = join(space, entry.dir);
    let entries: string[];
    try {
      entries = await readdir(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      const fullPath = join(dir, file);
      const raw = await readFile(fullPath, 'utf-8');
      const { frontmatter, body } = parseNoteFile(raw);
      const relativePath = relative(space, fullPath);
      const slug = file.replace(/\.md$/, '');
      const ref: Ref = { ty, slug };
      notes.push({ ref, path: relativePath, frontmatter, body });
    }
  }
  return notes;
}
