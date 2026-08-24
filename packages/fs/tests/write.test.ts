import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import { FsWrite } from '../src/write.js';
import { FsRead } from '../src/read.js';
import { FakeEmbedder } from '../src/embedder.js';
import { DefaultUtility } from '../src/utility.js';
import { makeTmpBundle, cleanupTmpBundle, testManifest, note } from './helpers.js';
import type { CommonDeps } from '@kb/core';

describe('FsWrite', () => {
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

  it('put writes the file with stamped frontmatter', async () => {
    const content = note({ type: 'concept', title: 'Foo', description: 'a concept' }, '\nSome body text.\n');
    const result = await write.put({ ref: 'concept:foo', content });
    expect(result.ref).toEqual({ ty: 'concept', slug: 'foo' });
    expect(result.changed).toBe(true);

    const written = await readFile(join(space, 'concepts', 'foo.md'), 'utf-8');
    expect(written).toContain('id: concept:foo');
    expect(written).toContain('Some body text.');
  });

  it("creates/updates the dir's index.md", async () => {
    const content = note({ type: 'concept', title: 'Foo', description: 'd' }, '\nbody\n');
    await write.put({ ref: 'concept:foo', content });
    const indexMd = await readFile(join(space, 'concepts', 'index.md'), 'utf-8');
    expect(indexMd).toContain('Foo');
  });

  it('appends to log/<date>.md and rolls root log.md', async () => {
    const content = note({ type: 'concept', title: 'Foo', description: 'd' }, '\nbody\n');
    await write.put({ ref: 'concept:foo', content });

    const date = new Date().toISOString().slice(0, 10);
    const dayLog = await readFile(join(space, 'log', `${date}.md`), 'utf-8');
    expect(dayLog).toContain('concept:foo');

    const rootLog = await readFile(join(space, 'log.md'), 'utf-8');
    expect(rootLog).toContain('concept:foo');
  });

  it('delete removes the file and updates index.md/log', async () => {
    const content = note({ type: 'concept', title: 'Foo', description: 'd' }, '\nbody\n');
    await write.put({ ref: 'concept:foo', content });

    const result = await write.delete({ ref: 'concept:foo' });
    expect(result.removed).toBe(true);

    await expect(access(join(space, 'concepts', 'foo.md'))).rejects.toThrow();
    const indexMd = await readFile(join(space, 'concepts', 'index.md'), 'utf-8');
    expect(indexMd).not.toContain('Foo');
  });

  it('round-trips: put then get returns the same body + frontmatter, unknown keys preserved', async () => {
    const content = note(
      { type: 'concept', title: 'Foo', description: 'd', custom_extra_key: 'kept' },
      '\nBody content here.\n',
    );
    await write.put({ ref: 'concept:foo', content });

    const view = await read.get({ ref: 'concept:foo' });
    expect(view.body.trim()).toBe('Body content here.');
    expect((view.frontmatter as Record<string, unknown>).custom_extra_key).toBe('kept');
    expect(view.frontmatter.title).toBe('Foo');
  });
});
