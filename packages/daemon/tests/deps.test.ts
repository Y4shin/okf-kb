// @kb/daemon — deps test: buildCommonDeps resolves space, loads manifest,
// constructs DefaultUtility + embedder. Test the manifest loading paths.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { FakeEmbedder } from '@kb/fs';
import { buildCommonDeps, defaultManifest, loadManifestAsync } from '../src/deps.js';
import { testManifest } from '../../fs/tests/helpers.js';

describe('buildCommonDeps', () => {
  let space: string;
  const savedKbHome = process.env.KB_HOME;

  beforeEach(async () => {
    space = await mkdtemp(join(tmpdir(), 'kb-deps-test-'));
    delete process.env.KB_HOME;
  });

  afterEach(async () => {
    if (savedKbHome === undefined) delete process.env.KB_HOME;
    else process.env.KB_HOME = savedKbHome;
    await rm(space, { recursive: true, force: true });
  });

  it('uses opts.space when provided', () => {
    const deps = buildCommonDeps({ space, embedder: new FakeEmbedder(), manifest: testManifest });
    expect(deps.space).toBe(space);
  });

  it('falls back to KB_HOME env when no opts.space', () => {
    process.env.KB_HOME = space;
    const deps = buildCommonDeps({ embedder: new FakeEmbedder(), manifest: testManifest });
    expect(deps.space).toBe(space);
  });

  it('constructs DefaultUtility from manifest', () => {
    const deps = buildCommonDeps({ space, embedder: new FakeEmbedder(), manifest: testManifest });
    expect(deps.util).toBeDefined();
    expect(typeof deps.util.computeId).toBe('function');
  });

  it('uses the injected embedder', () => {
    const embedder = new FakeEmbedder(64);
    const deps = buildCommonDeps({ space, embedder, manifest: testManifest });
    expect(deps.embedder).toBe(embedder);
  });

  it('falls back to defaultManifest when no manifest.yaml in space', () => {
    const deps = buildCommonDeps({ space, embedder: new FakeEmbedder() });
    expect(deps.manifest).toEqual(defaultManifest);
  });

  it('loads manifest.yaml from space root when present', async () => {
    const manifestYaml = `
types:
  term:
    dir: glossary
    question: "what is X?"
  concept:
    dir: concepts
    question: "how does X work?"
  decision:
    dir: decisions
    question: "why X over Y?"
  reference:
    dir: reference
    question: "what's the spec?"
  generic:
    dir: generic
    question: "uncategorized"
predicates:
  - defines
  - uses
  - depends_on
  - part_of
  - decided_in
  - constrains
  - supersedes
  - derived_from
`;
    await writeFile(join(space, 'manifest.yaml'), manifestYaml);

    const deps = buildCommonDeps({ space, embedder: new FakeEmbedder() });
    expect(deps.manifest.types.term.dir).toBe('glossary');
    expect(deps.manifest.predicates).toHaveLength(8);
  });
});

describe('loadManifestAsync', () => {
  it('returns defaultManifest when no manifest.yaml exists', async () => {
    const space = await mkdtemp(join(tmpdir(), 'kb-deps-async-'));
    try {
      const manifest = await loadManifestAsync(space);
      expect(manifest).toEqual(defaultManifest);
    } finally {
      await rm(space, { recursive: true, force: true });
    }
  });
});
