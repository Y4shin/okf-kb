import { describe, it, expect, afterEach } from 'vitest';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { FsIndexAdmin } from '../src/index-admin.js';
import { FsSearch } from '../src/search.js';
import { FakeEmbedder } from '../src/embedder.js';
import { DefaultUtility } from '../src/utility.js';
import { makeTmpBundle, cleanupTmpBundle, testManifest, note } from './helpers.js';
import type { CommonDeps } from '@okf-kb/core';

describe('FsIndexAdmin.buildIndex / rebuildIndexes', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) await cleanup();
    cleanup = undefined;
  });

  it('buildIndex walks notes written directly to disk (bypassing put) and makes them searchable + rebuilds index.md', async () => {
    const space = await makeTmpBundle();
    const deps: CommonDeps = { space, manifest: testManifest, util: new DefaultUtility(testManifest), embedder: new FakeEmbedder() };
    const admin = new FsIndexAdmin(deps);
    const search = new FsSearch(deps);
    cleanup = async () => {
      admin.close();
      search.close();
      await cleanupTmpBundle(space);
    };

    // write a note directly to disk, skipping FsWrite.put (and thus skipping search.update)
    await mkdir(join(space, 'concepts'), { recursive: true });
    await writeFile(
      join(space, 'concepts', 'direct.md'),
      note({ type: 'concept', id: 'concept:direct', title: 'Direct Note', description: 'written straight to disk' }, '\nDirect note body content about oceans and tides.\n'),
      'utf-8',
    );

    await admin.buildIndex();

    const hits = await search.searchSemantic({ q: 'oceans tides' });
    expect(hits.some((h) => 'slug' in h.ref && h.ref.slug === 'direct')).toBe(true);

    const indexMd = await readFile(join(space, 'concepts', 'index.md'), 'utf-8');
    expect(indexMd).toContain('Direct Note');
  });

  it('rebuildIndexes drops and rebuilds vectors + index.md', async () => {
    const space = await makeTmpBundle();
    const deps: CommonDeps = { space, manifest: testManifest, util: new DefaultUtility(testManifest), embedder: new FakeEmbedder() };
    const admin = new FsIndexAdmin(deps);
    const search = new FsSearch(deps);
    cleanup = async () => {
      admin.close();
      search.close();
      await cleanupTmpBundle(space);
    };

    await mkdir(join(space, 'concepts'), { recursive: true });
    await writeFile(
      join(space, 'concepts', 'a.md'),
      note({ type: 'concept', id: 'concept:a', title: 'A', description: 'd' }, '\nAbout rivers and streams.\n'),
      'utf-8',
    );
    await admin.buildIndex();
    await admin.rebuildIndexes();

    const hits = await search.searchText({ q: 'rivers' });
    expect(hits.length).toBeGreaterThan(0);
  });
});
