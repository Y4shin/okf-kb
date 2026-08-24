// openDb — .kb/index.db: vector index (chunks table, JSON-blob embeddings +
// JS cosine), literal index (FTS5), and graph index (graph_edges table). One db.
//
// Decision: sqlite-vec's vec0 virtual tables require a fixed embedding dimension
// per table, but @kb/fs supports pluggable embedders with differing dims
// (FakeEmbedder for tests vs TransformersEmbedder in prod). Rather than force a
// dimension choice (or one table per dim), embeddings are stored as JSON text
// blobs in a plain table and cosine similarity is computed in JS — the
// fallback the arch spec explicitly allows. sqlite-vec's native binary + rowid
// binding also required non-obvious bigint coercion (verified working in a
// throwaway spike), so this keeps the runtime dependency surface smaller.
import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface KbDb {
  raw: Database.Database;
  close(): void;
}

export function kbHome(space: string): string {
  return join(space, '.kb');
}

export function dbPath(space: string): string {
  return join(kbHome(space), 'index.db');
}

export function openDb(space: string): KbDb {
  const path = dbPath(space);
  mkdirSync(dirname(path), { recursive: true });
  const raw = new Database(path);
  migrate(raw);
  return {
    raw,
    close: () => raw.close(),
  };
}

function migrate(db: Database.Database): void {
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_path TEXT NOT NULL,
      heading_path TEXT NOT NULL,
      chunk_index INTEGER NOT NULL,
      text TEXT NOT NULL,
      embedding TEXT,
      dim INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_chunks_note_path ON chunks(note_path);

    CREATE TABLE IF NOT EXISTS graph_edges (
      source_path TEXT NOT NULL,
      target_path TEXT NOT NULL,
      predicate TEXT,
      dir TEXT NOT NULL DEFAULT 'relation'
    );
    CREATE INDEX IF NOT EXISTS idx_graph_source ON graph_edges(source_path);
    CREATE INDEX IF NOT EXISTS idx_graph_target ON graph_edges(target_path);
  `);

  const ftsExists = db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='notes_fts'`)
    .get();
  if (!ftsExists) {
    db.exec(`
      CREATE VIRTUAL TABLE notes_fts USING fts5(
        note_path UNINDEXED,
        title,
        description,
        tags,
        body
      );
    `);
  }
}

export function deleteChunksForNote(db: Database.Database, notePath: string): void {
  db.prepare('DELETE FROM chunks WHERE note_path = ?').run(notePath);
  db.prepare('DELETE FROM notes_fts WHERE note_path = ?').run(notePath);
  db.prepare('DELETE FROM graph_edges WHERE source_path = ?').run(notePath);
}
