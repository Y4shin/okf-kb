// FsSearch — literal (FTS5), semantic (embedder + cosine), unified (RRF blend),
// and graph traversal over the sqlite `.kb/index.db`.
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import type Database from 'better-sqlite3';
import { parseRef, formatRef } from '@kb/core';
import type { Search, RefInput, Ref, SearchHit, CheckReport, CommonDeps } from '@kb/core';
import { splitByHeadings } from './chunk.js';
import { openDb, deleteChunksForNote, type KbDb } from './db.js';
import { parseNoteFile } from './read.js';
import { extractMarkdownLinks, runChecks, type BundleNote } from './check.js';
import { FsLocalFs } from './local-fs.js';
import { walkBundleNotes } from './walk.js';

function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

interface ChunkRow {
  id: number;
  note_path: string;
  heading_path: string;
  text: string;
  embedding: string | null;
}

export class FsSearch implements Search {
  private readonly db: KbDb;
  private readonly localFs: FsLocalFs;

  constructor(private readonly deps: CommonDeps) {
    this.db = openDb(deps.space);
    this.localFs = new FsLocalFs(deps);
  }

  close(): void {
    this.db.close();
  }

  private pathToRef(notePath: string): Ref {
    try {
      return this.localFs.resolveId({ ref: { path: notePath } });
    } catch {
      return { path: notePath };
    }
  }

  private async noteTitle(notePath: string): Promise<string> {
    try {
      const raw = await readFile(join(this.deps.space, notePath), 'utf-8');
      const { frontmatter } = parseNoteFile(raw);
      return (frontmatter.title as string) ?? notePath;
    } catch {
      return notePath;
    }
  }

  async searchText(input: { q: string; opts?: { fields?: string[] } }): Promise<SearchHit[]> {
    const rows = this.db.raw
      .prepare(`SELECT note_path, title, snippet(notes_fts, -1, '', '', '...', 12) as snip, bm25(notes_fts) as score FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT 20`)
      .all(matchQuery(input.q)) as Array<{ note_path: string; title: string; snip: string; score: number }>;
    return rows.map((r) => ({
      ref: this.pathToRef(r.note_path),
      title: r.title ?? r.note_path,
      snippet: r.snip ?? '',
      score: -r.score, // bm25: lower is better -> invert so higher score = better
      mode: 'literal' as const,
    }));
  }

  async searchSemantic(input: { q: string; k?: number }): Promise<SearchHit[]> {
    const k = input.k ?? 10;
    const qVec = await this.deps.embedder.embed(input.q);
    const rows = this.db.raw.prepare(`SELECT id, note_path, heading_path, text, embedding FROM chunks`).all() as ChunkRow[];

    const bestPerNote = new Map<string, { score: number; text: string; headingPath: string }>();
    for (const row of rows) {
      if (!row.embedding) continue;
      const vec = JSON.parse(row.embedding) as number[];
      const score = cosine(qVec, vec);
      const existing = bestPerNote.get(row.note_path);
      if (!existing || score > existing.score) {
        bestPerNote.set(row.note_path, { score, text: row.text, headingPath: row.heading_path });
      }
    }

    const ranked = [...bestPerNote.entries()].sort((a, b) => b[1].score - a[1].score).slice(0, k);
    const hits: SearchHit[] = [];
    for (const [notePath, best] of ranked) {
      hits.push({
        ref: this.pathToRef(notePath),
        title: await this.noteTitle(notePath),
        snippet: best.text.slice(0, 200),
        score: best.score,
        mode: 'semantic',
      });
    }
    return hits;
  }

  async searchUnified(input: { q: string; opts?: { withGraph?: boolean } }): Promise<SearchHit[]> {
    const [literal, semantic] = await Promise.all([this.searchText({ q: input.q }), this.searchSemantic({ q: input.q })]);
    const K = 60;
    const rrf = new Map<string, { score: number; hit: SearchHit }>();

    const addRanked = (hits: SearchHit[]) => {
      hits.forEach((hit, i) => {
        const key = formatRef(hit.ref);
        const inc = 1 / (K + i + 1);
        const existing = rrf.get(key);
        if (existing) {
          existing.score += inc;
        } else {
          rrf.set(key, { score: inc, hit });
        }
      });
    };
    addRanked(literal);
    addRanked(semantic);

    const blended = [...rrf.values()].sort((a, b) => b.score - a.score).map((e) => ({ ...e.hit, score: e.score }));

    if (input.opts?.withGraph) {
      for (const entry of blended) {
        try {
          const neighbors = await this.graph({ ref: entry.ref, dir: 'neighbors' });
          (entry as SearchHit & { graphContext?: Ref[] }).graphContext = neighbors;
        } catch {
          // graph attachment is best-effort context, not a rank signal — tolerate failure
        }
      }
    }

    return blended;
  }

  async graph(input: { ref: RefInput; dir: 'ancestors' | 'descendants' | 'neighbors'; predicate?: string }): Promise<Ref[]> {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    const { path } = this.localFs.resolvePath({ ref });
    const notePath = relative(this.deps.space, path);

    const predicateClause = input.predicate ? ` AND predicate = @predicate` : '';
    const params: Record<string, string> = { path: notePath };
    if (input.predicate) params.predicate = input.predicate;

    if (input.dir === 'neighbors') {
      const outRows = this.db.raw.prepare(`SELECT DISTINCT target_path as p FROM graph_edges WHERE source_path = @path${predicateClause}`).all(params) as Array<{ p: string }>;
      const inRows = this.db.raw.prepare(`SELECT DISTINCT source_path as p FROM graph_edges WHERE target_path = @path${predicateClause}`).all(params) as Array<{ p: string }>;
      const seen = new Set<string>();
      const result: Ref[] = [];
      for (const row of [...outRows, ...inRows]) {
        if (seen.has(row.p)) continue;
        seen.add(row.p);
        result.push(this.pathToRef(row.p));
      }
      return result;
    }

    // ancestors: transitively walk targets that point TO this note (things that reference/decide/constrain it)
    // descendants: transitively walk targets this note points to
    const column = input.dir === 'ancestors' ? 'target_path' : 'source_path';
    const otherColumn = input.dir === 'ancestors' ? 'source_path' : 'target_path';
    const visited = new Set<string>([notePath]);
    const queue = [notePath];
    const result: Ref[] = [];
    while (queue.length) {
      const current = queue.shift()!;
      const rows = this.db.raw
        .prepare(`SELECT DISTINCT ${otherColumn} as p FROM graph_edges WHERE ${column} = @path${predicateClause}`)
        .all({ path: current, ...(input.predicate ? { predicate: input.predicate } : {}) }) as Array<{ p: string }>;
      for (const row of rows) {
        if (visited.has(row.p)) continue;
        visited.add(row.p);
        result.push(this.pathToRef(row.p));
        queue.push(row.p);
      }
    }
    return result;
  }

  async update(input: { ref: RefInput; content: string }): Promise<void> {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    const { path } = this.localFs.resolvePath({ ref });
    const notePath = relative(this.deps.space, path);
    const { frontmatter, body } = parseNoteFile(input.content);

    deleteChunksForNote(this.db.raw, notePath);

    const title = (frontmatter.title as string) ?? notePath;
    const description = (frontmatter.description as string) ?? '';
    const tags = Array.isArray(frontmatter.tags) ? (frontmatter.tags as string[]).join(' ') : '';

    this.db.raw
      .prepare(`INSERT INTO notes_fts(note_path, title, description, tags, body) VALUES (?, ?, ?, ?, ?)`)
      .run(notePath, title, description, tags, body);

    const chunks = splitByHeadings(body, title);
    const insertChunk = this.db.raw.prepare(
      `INSERT INTO chunks(note_path, heading_path, chunk_index, text, embedding, dim) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    let idx = 0;
    for (const chunk of chunks) {
      const embedText = [chunk.headingPath.join(' > '), chunk.text].filter(Boolean).join('\n');
      const vec = await this.deps.embedder.embed(embedText || title);
      insertChunk.run(notePath, JSON.stringify(chunk.headingPath), idx++, chunk.text, JSON.stringify(vec), vec.length);
    }

    // graph edges: typed relations + prose markdown links
    const insertEdge = this.db.raw.prepare(`INSERT INTO graph_edges(source_path, target_path, predicate, dir) VALUES (?, ?, ?, ?)`);
    const relations = Array.isArray(frontmatter.relations) ? (frontmatter.relations as Array<{ predicate: string; target: string }>) : [];
    for (const rel of relations) {
      insertEdge.run(notePath, rel.target.replace(/^\//, ''), rel.predicate, 'relation');
    }
    for (const link of extractMarkdownLinks(body)) {
      insertEdge.run(notePath, link.replace(/^\//, ''), null, 'link');
    }
  }

  async checkId(input: { ref: RefInput }): Promise<CheckReport> {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    const { path } = this.localFs.resolvePath({ ref });
    const relPath = relative(this.deps.space, path);
    const raw = await readFile(path, 'utf-8');
    const { frontmatter, body } = parseNoteFile(raw);

    const perNote = this.deps.util.validate({ id: (frontmatter.id as string) ?? '', path: relPath, frontmatter: frontmatter as unknown as Parameters<typeof this.deps.util.validate>[0]['frontmatter'], body });

    // B3 (relation targets exist) + B7 (orphaned term) per-note, using the full bundle for context.
    const bundle = await walkBundleNotes(this.deps.space, this.deps.manifest);
    const bundleReport = runChecks(bundle, this.deps.manifest, ['B3', 'B4', 'B7']);
    const relevant = bundleReport.errors.filter((e) => formatRef(e.ref) === formatRef(ref));

    return { ok: perNote.ok && relevant.length === 0, errors: [...perNote.errors, ...relevant] };
  }
}

function matchQuery(q: string): string {
  // FTS5 MATCH syntax: quote the query to treat it as a phrase-ish token match,
  // tolerant of punctuation in the raw query.
  const escaped = q.replace(/"/g, '""');
  return `"${escaped}"`;
}

export type { BundleNote };
