import { describe, it, expect } from 'vitest';
import {
  RefSchema, SlugSchema, ActorSchema, FrontmatterSchema,
  parseRef, formatRef, parseActor, formatActor,
  createKb,
  type Ref, type IdRef, type PathRef,
} from '../src/index.js';

const manifest = { types: {} as any, predicates: [] };
const util = {
  computeId: (t: any, s: string) => ({ slug: s, ty: t }),
  validate: () => ({ ok: true, errors: [] }),
  frontmatterFor: (_t: any, p: any) => ({ type: _t, ...p }) as any,
  normalize: (c: string) => c,
  stampProvenance: (f: any) => f,
} as any;
const embedder = { embed: async () => [] } as any;

describe('Ref / Actor schemas (runtime coercion)', () => {
  it('parses type:slug -> IdRef', () => {
    const r = RefSchema.parse('concept:foo');
    expect(r).toEqual({ slug: 'foo', ty: 'concept' });
    const _ok: Ref = r;
    void _ok;
  });

  it('parses a path -> PathRef', () => {
    const r = RefSchema.parse('concepts/foo.md');
    expect(r).toEqual({ path: 'concepts/foo.md' });
    expect('path' in r).toBe(true);
  });

  it('rejects a bad slug', () => {
    expect(() => SlugSchema.parse('BAD SLUG')).toThrow();
  });

  it('rejects an unknown type in an IdRef-shaped object', () => {
    expect(() => RefSchema.parse({ slug: 'foo', ty: 'notatype' as any })).toThrow();
  });

  it('round-trips formatRef(parseRef(s)) for an id ref', () => {
    expect(formatRef(parseRef('concept:foo'))).toBe('concept:foo');
  });

  it('parseRef of a path with no colon -> PathRef', () => {
    const r = parseRef('glossary/term.md');
    expect('path' in r).toBe(true);
  });
});

describe('Actor schema (runtime coercion)', () => {
  it('parses pi/<version>/<model> -> agent actor', () => {
    const a = ActorSchema.parse('pi/0.80.10/claude-opus-4.5');
    expect(a).toEqual({ kind: 'agent', producer: 'pi', version: '0.80.10', model: 'claude-opus-4.5' });
  });

  it('round-trips via formatActor', () => {
    const s = 'pi/0.80.10/claude-opus-4.5';
    expect(formatActor(ActorSchema.parse(s))).toBe(s);
  });

  it('parses human:<id> and process:<id>', () => {
    expect(ActorSchema.parse('human:pplattner')).toEqual({ kind: 'human', id: 'pplattner' });
    expect(ActorSchema.parse('process:kb-daemon')).toEqual({ kind: 'process', id: 'kb-daemon' });
  });

  it('formatActor for human/process uses the kind prefix', () => {
    expect(formatActor(parseActor('human:pplattner'))).toBe('human:pplattner');
    expect(formatActor(parseActor('process:kb-daemon'))).toBe('process:kb-daemon');
  });

  it('throws on a bad actor string', () => {
    expect(() => ActorSchema.parse('justoneword')).toThrow();
  });
});

describe('FrontmatterSchema (.passthrough — OKF §11)', () => {
  it('preserves unknown keys', () => {
    const fm = FrontmatterSchema.parse({ type: 'concept', unknownKey: 'x', another: 42 });
    expect((fm as any).unknownKey).toBe('x');
    expect((fm as any).another).toBe(42);
    expect(fm.type).toBe('concept');
  });
});

describe('typestate builder', () => {
  it('full shape: all five groups present', () => {
    const kb = createKb({ space: './kb', manifest, util, embedder }).declare()
      .withRead().withSearch().withWrite().withLocalFs().withIndexAdmin().build();
    expect(kb).toHaveProperty('read');
    expect(kb).toHaveProperty('search');
    expect(kb).toHaveProperty('write');
    expect(kb).toHaveProperty('localFs');
    expect(kb).toHaveProperty('indexAdmin');
  });

  it('pi shape: only localFs + search (no read/write/indexAdmin)', () => {
    const kb = createKb({ space: './kb', manifest, util, embedder }).declare()
      .withLocalFs().withSearch().build();
    expect(kb).toHaveProperty('localFs');
    expect(kb).toHaveProperty('search');
    expect(kb).not.toHaveProperty('read');
    expect(kb).not.toHaveProperty('write');
    expect(kb).not.toHaveProperty('indexAdmin');
  });

  it('no-arg createKb -> empty collector (no groups until deps are added)', () => {
    const kb = createKb().usingSpace('./kb').usingManifest(manifest).usingUtil(util).usingEmbedder(embedder)
      .declare().withRead().withSearch().build();
    expect(kb).toHaveProperty('read');
    expect(kb).toHaveProperty('search');
    expect(kb).not.toHaveProperty('write');
  });
});
