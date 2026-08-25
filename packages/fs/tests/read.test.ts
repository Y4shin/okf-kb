import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FsWrite } from '../src/write.js';
import { FsRead } from '../src/read.js';
import { FakeEmbedder } from '../src/embedder.js';
import { DefaultUtility } from '../src/utility.js';
import { makeTmpBundle, cleanupTmpBundle, testManifest, note } from './helpers.js';
import type { CommonDeps } from '@okf-kb/core';

describe('FsRead', () => {
  let space: string;
  let deps: CommonDeps;
  let write: FsWrite;
  let read: FsRead;

  beforeEach(async () => {
    space = await makeTmpBundle();
    deps = { space, manifest: testManifest, util: new DefaultUtility(testManifest), embedder: new FakeEmbedder() };
    write = new FsWrite(deps);
    read = new FsRead(deps);
  });

  afterEach(async () => {
    write.close();
    await cleanupTmpBundle(space);
  });

  it('get returns a NoteView', async () => {
    await write.put({ ref: 'concept:foo', content: note({ type: 'concept', title: 'Foo', description: 'd' }, '\nbody\n') });
    const view = await read.get({ ref: 'concept:foo' });
    expect(view.ref).toEqual({ ty: 'concept', slug: 'foo' });
    expect(view.frontmatter.title).toBe('Foo');
    expect(view.body.trim()).toBe('body');
  });

  it('list yields entries and filters by type', async () => {
    await write.put({ ref: 'concept:foo', content: note({ type: 'concept', title: 'Foo', description: 'd' }, '\nbody\n') });
    await write.put({ ref: 'term:bar', content: note({ type: 'term', title: 'Bar', description: 'd' }, '\nbody\n') });

    const all: Array<{ ty?: string; slug?: string }> = [];
    for await (const entry of read.list()) {
      all.push(entry.ref as never);
    }
    expect(all.length).toBeGreaterThanOrEqual(2);

    const concepts: Array<{ ty?: string; slug?: string }> = [];
    for await (const entry of read.list({ type: 'concept' })) {
      concepts.push(entry.ref as never);
    }
    expect(concepts).toEqual([{ ty: 'concept', slug: 'foo' }]);
  });
});
