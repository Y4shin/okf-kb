// FsRead — get()/list() over the typed dirs the manifest declares.
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import * as YAML from 'yaml';
import { parseRef, parseActor, formatActor } from '@okf-kb/core';
import type { Read, RefInput, ActorInput, Type, Tag, NoteView, ListEntry, Base } from '@okf-kb/core';
import { FrontmatterSchema } from '@okf-kb/core';
import { FsLocalFs } from './local-fs.js';

export function parseNoteFile(raw: string): { frontmatter: Record<string, unknown>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) {
    return { frontmatter: {}, body: raw };
  }
  const fm = (YAML.parse(m[1]) ?? {}) as Record<string, unknown>;
  return { frontmatter: fm, body: m[2] };
}

export class FsRead implements Read {
  private readonly localFs: FsLocalFs;

  constructor(private readonly deps: Base) {
    this.localFs = new FsLocalFs(deps);
  }

  async get(input: { ref: RefInput }): Promise<NoteView> {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    const { path } = this.localFs.resolvePath({ ref });
    const raw = await readFile(path, 'utf-8');
    const { frontmatter, body } = parseNoteFile(raw);
    const parsed = FrontmatterSchema.parse(frontmatter);
    return { ref, frontmatter: parsed, body };
  }

  async *list(input?: { type?: Type; tag?: Tag; status?: string; by?: ActorInput }): AsyncIterable<ListEntry> {
    const types = input?.type ? [input.type] : (Object.keys(this.deps.manifest.types) as Type[]);
    const byActor = input?.by !== undefined ? (typeof input.by === 'string' ? parseActor(input.by) : input.by) : undefined;

    for (const ty of types) {
      const { path: dir } = this.localFs.dirFor({ type: ty });
      let entries: string[];
      try {
        entries = await readdir(dir);
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (!entry.endsWith('.md') || entry === 'index.md') continue;
        const fullPath = join(dir, entry);
        const raw = await readFile(fullPath, 'utf-8');
        const { frontmatter } = parseNoteFile(raw);
        const parsedFm = FrontmatterSchema.safeParse(frontmatter);
        if (!parsedFm.success) continue;
        const fm = parsedFm.data;

        if (input?.tag && !(fm.tags ?? []).includes(input.tag)) continue;
        if (input?.status && fm.status !== input.status) continue;
        if (byActor && (!fm.generated || formatActor(fm.generated.by) !== formatActor(byActor))) continue;

        const slug = entry.replace(/\.md$/, '');
        const st = await stat(fullPath);
        yield {
          ref: { ty, slug },
          title: fm.title,
          description: fm.description,
          mtime: st.mtimeMs,
        };
      }
    }
  }
}

export function relPath(space: string, absPath: string): string {
  return relative(space, absPath);
}
