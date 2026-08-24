// FsWrite — put()/delete(): parse+validate, compute/stamp id + provenance,
// write to disk, maintain index.md + log/<date>.md + root log.md, and trigger
// Search.update.
import { mkdir, readFile, writeFile, rm, readdir } from 'node:fs/promises';
import { join, relative, dirname } from 'node:path';
import * as YAML from 'yaml';
import { parseRef, parseActor, formatRef } from '@kb/core';
import type { Write, RefInput, CommonDeps, PutResult, DeleteResult, Type } from '@kb/core';
import { FrontmatterSchema } from '@kb/core';
import { FsLocalFs } from './local-fs.js';
import { FsSearch } from './search.js';
import { parseNoteFile } from './read.js';

export class FsWrite implements Write {
  private readonly localFs: FsLocalFs;
  private readonly search: FsSearch;
  private readonly ownsSearch: boolean;

  constructor(private readonly deps: CommonDeps, search?: FsSearch) {
    this.localFs = new FsLocalFs(deps);
    this.search = search ?? new FsSearch(deps);
    this.ownsSearch = !search;
  }

  close(): void {
    if (this.ownsSearch) this.search.close();
  }

  async put(input: { ref: RefInput; content: string }): Promise<PutResult> {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    const warnings: string[] = [];

    const { frontmatter: rawFm, body } = parseNoteFile(input.content);
    const parsed = FrontmatterSchema.safeParse(rawFm);
    if (!parsed.success) {
      throw new Error(`invalid frontmatter: ${parsed.error.message}`);
    }
    let fm = parsed.data;

    // compute/stamp id (type:slug)
    let idRef: { ty: typeof fm.type; slug: string };
    if ('slug' in ref) {
      idRef = { ty: ref.ty, slug: ref.slug };
    } else {
      const resolved = this.localFs.resolveId({ ref });
      idRef = { ty: resolved.ty, slug: resolved.slug };
    }
    if (!fm.type) {
      fm = { ...fm, type: idRef.ty };
      warnings.push('type missing from frontmatter; inferred from ref');
    }
    if (!fm.id) {
      fm = { ...fm, id: `${idRef.ty}:${idRef.slug}` };
    }

    // stamp provenance if the content declares an actor via a `generated.by` string
    // (we don't invent an actor here; if omitted, generated is left as-is/undefined)

    const { path } = this.localFs.pathFor({ type: idRef.ty, slug: idRef.slug });
    await mkdir(dirname(path), { recursive: true });

    let changed = true;
    try {
      const existingRaw = await readFile(path, 'utf-8');
      const rebuilt = serializeNote(fm, body);
      changed = existingRaw !== rebuilt;
    } catch {
      changed = true;
    }

    const finalContent = serializeNote(fm, body);
    await writeFile(path, finalContent, 'utf-8');

    await this.updateIndexMd(idRef.ty);
    await this.appendLog(`Update`, idRef, fm.title ?? idRef.slug);
    await this.search.update({ ref: { ty: idRef.ty, slug: idRef.slug }, content: finalContent });

    return { ref: { ty: idRef.ty, slug: idRef.slug }, changed, warnings };
  }

  async delete(input: { ref: RefInput }): Promise<DeleteResult> {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    const { path } = this.localFs.resolvePath({ ref });
    let removed = false;
    let ty: string | undefined;
    let title = 'slug' in ref ? ref.slug : ref.path;
    try {
      if ('slug' in ref) ty = ref.ty;
      else {
        const resolved = this.localFs.resolveId({ ref });
        ty = resolved.ty;
        title = resolved.slug;
      }
      await rm(path);
      removed = true;
    } catch {
      removed = false;
    }

    if (removed && ty) {
      await this.updateIndexMd(ty as never);
      await this.appendLog('Deprecation', { ty, slug: title }, title);
    }

    return { ref, removed };
  }

  private async updateIndexMd(type: Type): Promise<void> {
    const dir = join(this.deps.space, this.deps.manifest.types[type]?.dir ?? type);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      return;
    }
    const entries: string[] = [];
    for (const file of files) {
      if (!file.endsWith('.md') || file === 'index.md') continue;
      try {
        const raw = await readFile(join(dir, file), 'utf-8');
        const { frontmatter } = parseNoteFile(raw);
        const title = (frontmatter.title as string) ?? file.replace(/\.md$/, '');
        entries.push(`- [${title}](./${file})`);
      } catch {
        // skip unreadable files
      }
    }
    entries.sort();
    const content = `# Index\n\n${entries.join('\n')}\n`;
    await writeFile(join(dir, 'index.md'), content, 'utf-8');
  }

  private async appendLog(kind: string, ref: { ty: string; slug: string }, title: string): Promise<void> {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const entry = `- **${kind}** \`${ref.ty}:${ref.slug}\` — ${title} (${now.toISOString()})\n`;

    const logDir = join(this.deps.space, 'log');
    await mkdir(logDir, { recursive: true });
    const dayFile = join(logDir, `${date}.md`);
    let dayContent = '';
    try {
      dayContent = await readFile(dayFile, 'utf-8');
    } catch {
      dayContent = `# ${date}\n\n`;
    }
    dayContent = dayContent.startsWith(`# ${date}`) ? dayContent : `# ${date}\n\n${dayContent}`;
    const [header, ...rest] = dayContent.split('\n\n');
    dayContent = `${header}\n\n${entry}${rest.join('\n\n')}`;
    await writeFile(dayFile, dayContent, 'utf-8');

    const rootLogPath = join(this.deps.space, 'log.md');
    let rootLog = '';
    try {
      rootLog = await readFile(rootLogPath, 'utf-8');
    } catch {
      rootLog = '# Log\n\n';
    }
    const ROLL_N = 20;
    const lines = rootLog.split('\n').filter((l) => l.startsWith('- '));
    const newLines = [entry.trimEnd(), ...lines].slice(0, ROLL_N);
    await writeFile(rootLogPath, `# Log\n\n${newLines.join('\n')}\n`, 'utf-8');
  }
}

function serializeNote(fm: Record<string, unknown>, body: string): string {
  const yamlText = YAML.stringify(fm).trimEnd();
  return `---\n${yamlText}\n---\n${body.startsWith('\n') ? body : `\n${body}`}`;
}
