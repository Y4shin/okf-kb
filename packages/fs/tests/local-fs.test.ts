import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FsLocalFs } from '../src/local-fs.js';
import { DefaultUtility } from '../src/utility.js';
import { makeTmpBundle, cleanupTmpBundle, testManifest } from './helpers.js';
import type { Base } from '@okf-kb/core';
import { join } from 'node:path';

describe('FsLocalFs', () => {
  let space: string;
  let deps: Base;
  let localFs: FsLocalFs;

  beforeEach(async () => {
    space = await makeTmpBundle();
    deps = { space, manifest: testManifest, util: new DefaultUtility(testManifest) };
    localFs = new FsLocalFs(deps);
  });

  afterEach(async () => {
    await cleanupTmpBundle(space);
  });

  it('spaceRoot returns the bundle root', () => {
    expect(localFs.spaceRoot()).toEqual({ path: space });
  });

  it('dirFor resolves the manifest type->dir mapping', () => {
    expect(localFs.dirFor({ type: 'term' })).toEqual({ path: join(space, 'glossary') });
    expect(localFs.dirFor({ type: 'concept' })).toEqual({ path: join(space, 'concepts') });
    expect(localFs.dirFor({ type: 'decision' })).toEqual({ path: join(space, 'decisions') });
    expect(localFs.dirFor({ type: 'reference' })).toEqual({ path: join(space, 'reference') });
  });

  it('pathFor builds <space>/<dir>/<slug>.md', () => {
    expect(localFs.pathFor({ type: 'concept', slug: 'foo' })).toEqual({ path: join(space, 'concepts', 'foo.md') });
  });

  it('resolvePath handles an IdRef via pathFor', () => {
    expect(localFs.resolvePath({ ref: 'concept:foo' })).toEqual({ path: join(space, 'concepts', 'foo.md') });
  });

  it('resolvePath handles a PathRef as space-relative', () => {
    expect(localFs.resolvePath({ ref: 'concepts/foo.md' })).toEqual({ path: join(space, 'concepts/foo.md') });
  });

  it('resolveId returns an IdRef unchanged', () => {
    expect(localFs.resolveId({ ref: 'concept:foo' })).toEqual({ slug: 'foo', ty: 'concept' });
  });

  it('resolveId derives type+slug from a path in a known type-dir', () => {
    expect(localFs.resolveId({ ref: 'concepts/foo.md' })).toEqual({ slug: 'foo', ty: 'concept' });
  });

  it('resolveId throws for a path outside any known type-dir', () => {
    expect(() => localFs.resolveId({ ref: 'random/foo.md' })).toThrow();
  });
});
