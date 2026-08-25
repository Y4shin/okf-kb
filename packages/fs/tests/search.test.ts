import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FsWrite } from '../src/write.js';
import { FsSearch } from '../src/search.js';
import { FakeEmbedder } from '../src/embedder.js';
import { DefaultUtility } from '../src/utility.js';
import { makeTmpBundle, cleanupTmpBundle, testManifest, note } from './helpers.js';
import type { CommonDeps } from '@okf-kb/core';

describe('FsSearch', () => {
  let space: string;
  let deps: CommonDeps;
  let write: FsWrite;
  let search: FsSearch;

  beforeEach(async () => {
    space = await makeTmpBundle();
    deps = { space, manifest: testManifest, util: new DefaultUtility(testManifest), embedder: new FakeEmbedder() };
    search = new FsSearch(deps);
    write = new FsWrite(deps, search);
  });

  afterEach(async () => {
    search.close();
    await cleanupTmpBundle(space);
  });

  it('searchSemantic returns a note for a relevant query after put+update', async () => {
    const content = note(
      { type: 'concept', title: 'Photosynthesis', description: 'how plants make energy from light' },
      '\nPhotosynthesis converts sunlight water and carbon dioxide into glucose and oxygen.\n',
    );
    await write.put({ ref: 'concept:photosynthesis', content });

    const hits = await search.searchSemantic({ q: 'sunlight glucose oxygen plants' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].ref).toEqual({ ty: 'concept', slug: 'photosynthesis' });
    expect(hits[0].mode).toBe('semantic');
  });

  it('searchText returns a note via FTS5 literal match', async () => {
    const content = note(
      { type: 'concept', title: 'Quantum Tunneling', description: 'particles crossing barriers' },
      '\nQuantum tunneling is a phenomenon in physics.\n',
    );
    await write.put({ ref: 'concept:quantum-tunneling', content });

    const hits = await search.searchText({ q: 'tunneling' });
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].ref).toEqual({ ty: 'concept', slug: 'quantum-tunneling' });
    expect(hits[0].mode).toBe('literal');
  });

  it('searchUnified RRF-blends literal-only and semantic-only hits so both appear', async () => {
    // Note A: distinctive literal phrase, but embeds far from the query in FakeEmbedder space
    const contentA = note(
      { type: 'concept', title: 'Zephyrfrobnicate', description: 'a nonsense literal-only marker word' },
      '\nZephyrfrobnicate is a unique literal token used only here.\n',
    );
    await write.put({ ref: 'concept:zephyr', content: contentA });

    // Note B: shares vocabulary with the query for semantic similarity
    const contentB = note(
      { type: 'concept', title: 'Gravity Basics', description: 'gravity mass force attraction' },
      '\nGravity is the force of attraction between masses due to their mass.\n',
    );
    await write.put({ ref: 'concept:gravity', content: contentB });

    const unified = await search.searchUnified({ q: 'gravity mass attraction force zephyrfrobnicate' });
    const refs = unified.map((h) => h.ref);
    expect(refs).toContainEqual({ ty: 'concept', slug: 'zephyr' });
    expect(refs).toContainEqual({ ty: 'concept', slug: 'gravity' });
  });

  it('excludes status:deprecated notes by default; includeDeprecated includes them', async () => {
    // a stable note and a deprecated note, both matching the query
    const stable = note(
      { type: 'concept', title: 'Current vector store', description: 'the current approach', status: 'stable' },
      '\nThe current vector store uses json blobs and cosine.\n',
    );
    const deprecated = note(
      { type: 'concept', title: 'Old vector store', description: 'the old approach', status: 'deprecated' },
      '\nThe old vector store used sqlite-vec vec0.\n',
    );
    await write.put({ ref: 'concept:current-vector-store', content: stable });
    await write.put({ ref: 'concept:old-vector-store', content: deprecated });

    // default: deprecated excluded
    const def = await search.searchUnified({ q: 'vector store' });
    const slugsDefault = def.map((h) => ('slug' in h.ref ? h.ref.slug : h.ref.path));
    expect(slugsDefault).toContain('current-vector-store');
    expect(slugsDefault).not.toContain('old-vector-store');

    // with includeDeprecated: the deprecated note appears
    const inc = await search.searchUnified({ q: 'vector store', opts: { includeDeprecated: true } });
    const slugsInc = inc.map((h) => ('slug' in h.ref ? h.ref.slug : h.ref.path));
    expect(slugsInc).toContain('current-vector-store');
    expect(slugsInc).toContain('old-vector-store');
  });

  it('graph returns ancestors/descendants/neighbors for typed relations + prose links', async () => {
    const termContent = note(
      { type: 'term', title: 'Widget', description: 'a small part', id: 'term:widget' },
      '\nA widget is a small part used in assembly.\n',
    );
    await write.put({ ref: 'term:widget', content: termContent });

    const conceptContent = note(
      {
        type: 'concept',
        title: 'Assembly Line',
        description: 'uses widgets',
        id: 'concept:assembly-line',
        relations: [{ predicate: 'uses', target: 'term:widget' }],
      },
      '\nThe assembly line uses a [widget](/glossary/widget.md) at every station.\n',
    );
    await write.put({ ref: 'concept:assembly-line', content: conceptContent });

    const descendants = await search.graph({ ref: 'concept:assembly-line', dir: 'descendants' });
    expect(descendants).toContainEqual({ ty: 'term', slug: 'widget' });

    const ancestors = await search.graph({ ref: 'term:widget', dir: 'ancestors' });
    expect(ancestors).toContainEqual({ ty: 'concept', slug: 'assembly-line' });

    const neighbors = await search.graph({ ref: 'concept:assembly-line', dir: 'neighbors' });
    expect(neighbors).toContainEqual({ ty: 'term', slug: 'widget' });
  });

  it('graph filters by predicate', async () => {
    const termContent = note({ type: 'term', title: 'Widget', description: 'part', id: 'term:widget' }, '\nA widget.\n');
    await write.put({ ref: 'term:widget', content: termContent });

    const conceptContent = note(
      {
        type: 'concept',
        title: 'Assembly',
        description: 'x',
        id: 'concept:assembly',
        relations: [
          { predicate: 'uses', target: 'term:widget' },
          { predicate: 'depends_on', target: 'term:widget' },
        ],
      },
      '\nUses a [widget](/glossary/widget.md).\n',
    );
    await write.put({ ref: 'concept:assembly', content: conceptContent });

    const usesOnly = await search.graph({ ref: 'concept:assembly', dir: 'descendants', predicate: 'uses' } as never);
    expect(usesOnly.length).toBeGreaterThan(0);
    const dependsOnly = await search.graph({ ref: 'concept:assembly', dir: 'descendants', predicate: 'depends_on' } as never);
    expect(dependsOnly.length).toBeGreaterThan(0);
  });
});
