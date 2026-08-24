// FsLocalFs — resolves refs/types to filesystem paths using the manifest's
// type -> dir map.
import { join } from 'node:path';
import { parseRef, formatRef } from '@kb/core';
import type { LocalFs, RefInput, Type, Slug, Base } from '@kb/core';

export class FsLocalFs implements LocalFs {
  constructor(private readonly deps: Base) {}

  resolvePath(input: { ref: RefInput }): { path: string } {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    if ('slug' in ref) {
      return this.pathFor({ type: ref.ty, slug: ref.slug });
    }
    return { path: join(this.deps.space, ref.path) };
  }

  resolveId(input: { ref: RefInput }): { slug: Slug; ty: Type } {
    const ref = typeof input.ref === 'string' ? parseRef(input.ref) : input.ref;
    if ('slug' in ref) {
      return { slug: ref.slug, ty: ref.ty };
    }
    // PathRef: try to derive type from the known type-dirs in the manifest.
    for (const [ty, entry] of Object.entries(this.deps.manifest.types)) {
      const prefix = `${entry.dir}/`;
      if (ref.path.startsWith(prefix)) {
        const rest = ref.path.slice(prefix.length).replace(/\.md$/, '');
        if (rest && !rest.includes('/')) {
          return { slug: rest, ty: ty as Type };
        }
      }
    }
    throw new Error(`cannot resolve id from path '${ref.path}': not in a known type directory (${formatRef(ref)})`);
  }

  dirFor(input: { type: Type }): { path: string } {
    const entry = this.deps.manifest.types[input.type];
    if (!entry) throw new Error(`unknown type '${input.type}'`);
    return { path: join(this.deps.space, entry.dir) };
  }

  pathFor(input: { type: Type; slug: Slug }): { path: string } {
    const { path: dir } = this.dirFor({ type: input.type });
    return { path: join(dir, `${input.slug}.md`) };
  }

  spaceRoot(): { path: string } {
    return { path: this.deps.space };
  }
}
