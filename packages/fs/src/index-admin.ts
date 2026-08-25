// FsIndexAdmin — full rebuilds (buildIndex/rebuildIndexes) and the full-bundle
// integrity walk (check).
import { readFile } from 'node:fs/promises';
import type { IndexAdmin, CheckReport, CommonDeps, Type } from '@okf-kb/core';
import { FsSearch } from './search.js';
import { FsWrite } from './write.js';
import { walkBundleNotes } from './walk.js';
import { runChecks } from './check.js';

export class FsIndexAdmin implements IndexAdmin {
  private readonly search: FsSearch;
  private readonly write: FsWrite;

  constructor(private readonly deps: CommonDeps) {
    this.search = new FsSearch(deps);
    this.write = new FsWrite(deps, this.search);
  }

  close(): void {
    this.search.close();
  }

  async buildIndex(): Promise<void> {
    const notes = await walkBundleNotes(this.deps.space, this.deps.manifest);
    for (const note of notes) {
      const raw = await readFile(`${this.deps.space}/${note.path}`, 'utf-8');
      await this.search.update({ ref: note.ref, content: raw });
    }
    for (const ty of Object.keys(this.deps.manifest.types) as Type[]) {
      // reuse FsWrite's private index.md maintenance by calling through delete/put-adjacent
      // logic is private; trigger via a no-op put-equivalent is avoided — walk dirs directly.
      await this.rebuildIndexMdFor(ty);
    }
  }

  async rebuildIndexes(): Promise<void> {
    await this.buildIndex();
  }

  async check(): Promise<CheckReport> {
    const notes = await walkBundleNotes(this.deps.space, this.deps.manifest);
    return runChecks(notes, this.deps.manifest);
  }

  private async rebuildIndexMdFor(type: Type): Promise<void> {
    const dir = this.deps.manifest.types[type]?.dir;
    if (!dir) return;
    const { readdir, writeFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { parseNoteFile } = await import('./read.js');
    const full = join(this.deps.space, dir);
    let files: string[];
    try {
      files = await readdir(full);
    } catch {
      return;
    }
    const entries: string[] = [];
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      try {
        const raw = await readFile(join(full, file), 'utf-8');
        const { frontmatter } = parseNoteFile(raw);
        const title = (frontmatter.title as string) ?? file.replace(/\.md$/, '');
        entries.push(`- [${title}](./${file})`);
      } catch {
        // skip unreadable
      }
    }
    entries.sort();
    await writeFile(join(full, 'index.md'), `# Index\n\n${entries.join('\n')}\n`, 'utf-8');
  }
}
