// @kb/daemon — deps: buildCommonDeps(opts) -> CommonDeps.
// Resolve space = KB_HOME env or --space arg or env-paths('kb',{suffix:''}).data.
// Load manifest.yaml from the space root (yaml parse -> ManifestSchema.parse);
// if absent, a minimal default manifest (the 5 types + 8 predicates).
// Construct DefaultUtility. Construct TransformersEmbedder (real) — but allow
// inject FakeEmbedder for tests via opts.embedder.

import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import envPaths from 'env-paths';
import * as YAML from 'yaml';
import { ManifestSchema, type CommonDeps, type Manifest, type Embedder } from '@kb/core';
import { DefaultUtility, TransformersEmbedder } from '@kb/fs';

/** Options for buildCommonDeps. */
export interface BuildDepsOptions {
  /** Override the space root path. Default: KB_HOME env or env-paths('kb').data. */
  space?: string;
  /** Inject an embedder (test seam — FakeEmbedder). Default: TransformersEmbedder. */
  embedder?: Embedder;
  /** Override the manifest (test seam). Default: load <space>/manifest.yaml or default. */
  manifest?: Manifest;
}

/** The minimal default manifest: 5 types + 8 predicates (OKF §). */
export const defaultManifest: Manifest = {
  types: {
    term: { dir: 'glossary', question: 'what is X?' },
    concept: { dir: 'concepts', question: 'how does X work?' },
    decision: { dir: 'decisions', question: 'why X over Y?' },
    reference: { dir: 'reference', question: "what's the spec?" },
    generic: { dir: 'generic', question: 'uncategorized' },
  },
  predicates: ['defines', 'uses', 'depends_on', 'part_of', 'decided_in', 'constrains', 'supersedes', 'derived_from'],
};

/**
 * Build CommonDeps for the daemon.
 * - space: opts.space || KB_HOME env || env-paths('kb',{suffix:''}).data
 * - manifest: opts.manifest || load <space>/manifest.yaml || defaultManifest
 * - util: DefaultUtility(manifest)
 * - embedder: opts.embedder || TransformersEmbedder (real)
 */
export function buildCommonDeps(opts: BuildDepsOptions = {}): CommonDeps {
  const space = opts.space
    || process.env.KB_HOME
    || envPaths('kb', { suffix: '' }).data;

  const manifest = opts.manifest ?? loadManifest(space);
  const util = new DefaultUtility(manifest);
  const embedder = opts.embedder ?? new TransformersEmbedder();

  return { space, manifest, util, embedder };
}

/** Load manifest.yaml from the space root; fall back to defaultManifest if absent. */
function loadManifest(space: string): Manifest {
  const manifestPath = join(space, 'manifest.yaml');
  if (existsSync(manifestPath)) {
    // sync read via readFileSync for simplicity in the daemon bootstrap
    try {
      const raw = readFileSync(manifestPath, 'utf-8');
      const parsed = YAML.parse(raw);
      return ManifestSchema.parse(parsed);
    } catch {
      // corrupt manifest — fall through to default (daemon can still start)
      // but the caller (startDaemon) should surface a clearer error.
      return defaultManifest;
    }
  }
  return defaultManifest;
}

/** Async variant: load manifest.yaml from the space root (for explicit async callers). */
export async function loadManifestAsync(space: string): Promise<Manifest> {
  const manifestPath = join(space, 'manifest.yaml');
  if (existsSync(manifestPath)) {
    const raw = await readFile(manifestPath, 'utf-8');
    const parsed = YAML.parse(raw);
    return ManifestSchema.parse(parsed);
  }
  return defaultManifest;
}
