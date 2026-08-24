import { describe, it, expect } from 'vitest';
import { DefaultUtility } from '../src/utility.js';
import { testManifest } from './helpers.js';

describe('DefaultUtility', () => {
  const util = new DefaultUtility(testManifest);

  it('computeId builds an IdRef from type + slug', () => {
    expect(util.computeId('concept', 'foo')).toEqual({ ty: 'concept', slug: 'foo' });
  });

  it('frontmatterFor fills id = type:slug and defaults', () => {
    const fm = util.frontmatterFor('concept', { id: 'concept:foo', title: 'Foo', description: 'a concept' });
    expect(fm.id).toBe('concept:foo');
    expect(fm.type).toBe('concept');
    expect(fm.title).toBe('Foo');
  });

  it('stampProvenance sets generated.by and generated.at', () => {
    const fm = util.frontmatterFor('concept', { id: 'concept:foo', title: 'Foo', description: 'd' });
    const stamped = util.stampProvenance(fm, { kind: 'agent', producer: 'pi', version: '1.0' });
    expect(stamped.generated?.by).toEqual({ kind: 'agent', producer: 'pi', version: '1.0' });
    expect(typeof stamped.generated?.at).toBe('string');
    expect(new Date(stamped.generated!.at).toString()).not.toBe('Invalid Date');
  });

  it('normalize is idempotent', () => {
    const content = '---\ntype: concept\nid: concept:foo\n---\nbody text';
    const once = util.normalize(content);
    const twice = util.normalize(once);
    expect(twice).toBe(once);
  });

  it('validate catches a missing type (A2)', () => {
    const report = util.validate({
      id: '',
      path: 'concepts/foo.md',
      frontmatter: { title: 'Foo', description: 'd' } as never,
      body: 'body',
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.rule === 'A2')).toBe(true);
  });

  it('validate catches a bad id-prefix (B2): id prefix does not match the type-dir', () => {
    const report = util.validate({
      id: 'concept:foo',
      path: 'glossary/foo.md', // wrong dir for a 'concept' id
      frontmatter: { type: 'concept', id: 'concept:foo', title: 'Foo', description: 'd' } as never,
      body: 'body',
    });
    expect(report.ok).toBe(false);
    expect(report.errors.some((e) => e.rule === 'B2')).toBe(true);
  });
});
