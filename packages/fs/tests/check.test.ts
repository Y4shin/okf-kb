import { describe, it, expect, afterEach } from 'vitest';
import { FsWrite } from '../src/write.js';
import { FsIndexAdmin } from '../src/index-admin.js';
import { FakeEmbedder } from '../src/embedder.js';
import { DefaultUtility } from '../src/utility.js';
import { makeTmpBundle, cleanupTmpBundle, testManifest, note } from './helpers.js';
import type { CommonDeps } from '@kb/core';

async function buildBundle(): Promise<{ space: string; deps: CommonDeps; write: FsWrite; admin: FsIndexAdmin }> {
  const space = await makeTmpBundle();
  const deps: CommonDeps = { space, manifest: testManifest, util: new DefaultUtility(testManifest), embedder: new FakeEmbedder() };
  const write = new FsWrite(deps);
  const admin = new FsIndexAdmin(deps);
  return { space, deps, write, admin };
}

describe('check() — full-bundle integrity walk', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    if (cleanup) await cleanup();
    cleanup = undefined;
  });

  it('returns ok:true on a conformant minimal bundle (term linked from a concept)', async () => {
    const { space, write, admin } = await buildBundle();
    cleanup = async () => {
      write.close();
      admin.close();
      await cleanupTmpBundle(space);
    };

    await write.put({
      ref: 'term:widget',
      content: note({ type: 'term', id: 'term:widget', title: 'Widget', description: 'a small part' }, '\nA widget is a small part.\n'),
    });
    await write.put({
      ref: 'concept:assembly',
      content: note(
        {
          type: 'concept',
          id: 'concept:assembly',
          title: 'Assembly',
          description: 'uses widgets',
          relations: [{ predicate: 'uses', target: 'term:widget' }],
        },
        '\nUses a [widget](/glossary/widget.md).\n',
      ),
    });
    await write.put({
      ref: 'decision:use-widgets',
      content: note(
        { type: 'decision', id: 'decision:use-widgets', title: 'Use Widgets', description: 'why we use widgets' },
        '\nWe decided to use widgets.\n',
      ),
    });

    const report = await admin.check();
    expect(report.ok).toBe(true);
    expect(report.errors).toEqual([]);
  });

  it('returns ok:false with a B7 error on an orphaned glossary term', async () => {
    const { space, write, admin } = await buildBundle();
    cleanup = async () => {
      write.close();
      admin.close();
      await cleanupTmpBundle(space);
    };

    // a term defined but never linked from anywhere
    await write.put({
      ref: 'term:orphan',
      content: note({ type: 'term', id: 'term:orphan', title: 'Orphan', description: 'never linked' }, '\nAn orphaned term.\n'),
    });

    const report = await admin.check();
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.rule === 'B7')).toBe(true);
  });

  it('returns a B3 error when a relation target is missing (dead relation)', async () => {
    const { space, write, admin } = await buildBundle();
    cleanup = async () => {
      write.close();
      admin.close();
      await cleanupTmpBundle(space);
    };

    await write.put({
      ref: 'concept:broken',
      content: note(
        {
          type: 'concept',
          id: 'concept:broken',
          title: 'Broken',
          description: 'points nowhere',
          relations: [{ predicate: 'uses', target: 'term:does-not-exist' }],
        },
        '\nRefers to nothing real.\n',
      ),
    });

    const report = await admin.check();
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.rule === 'B3')).toBe(true);
  });
});
