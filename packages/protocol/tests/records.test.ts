// @kb/protocol — records test: fullBindings has every method of every group.
// A missing method would fail tsc (GroupBindings enforces exhaustiveness); this
// runtime test counts keys as a belt-and-suspenders check.
import { describe, it, expect } from 'vitest';
import { fullBindings, piBindings } from '@kb/protocol';
import { EXCLUDED } from '@kb/core';

describe('fullBindings', () => {
  it('localFs has all 5 methods', () => {
    expect(Object.keys(fullBindings.localFs).sort()).toEqual([
      'dirFor',
      'pathFor',
      'resolveId',
      'resolvePath',
      'spaceRoot',
    ]);
  });

  it('read has get + list', () => {
    expect(Object.keys(fullBindings.read).sort()).toEqual(['get', 'list']);
  });

  it('search has all 6 methods', () => {
    expect(Object.keys(fullBindings.search).sort()).toEqual([
      'checkId',
      'graph',
      'searchSemantic',
      'searchText',
      'searchUnified',
      'update',
    ]);
  });

  it('write has put + delete', () => {
    expect(Object.keys(fullBindings.write).sort()).toEqual(['delete', 'put']);
  });

  it('indexAdmin has buildIndex + rebuildIndexes + check', () => {
    expect(Object.keys(fullBindings.indexAdmin).sort()).toEqual([
      'buildIndex',
      'check',
      'rebuildIndexes',
    ]);
  });

  it('total method count across all groups', () => {
    const all = [
      ...Object.keys(fullBindings.localFs),
      ...Object.keys(fullBindings.read),
      ...Object.keys(fullBindings.search),
      ...Object.keys(fullBindings.write),
      ...Object.keys(fullBindings.indexAdmin),
    ];
    expect(all.length).toBe(5 + 2 + 6 + 2 + 3); // 18
  });

  it('every entry has inputSchema + meta.desc', () => {
    for (const groupRec of Object.values(fullBindings)) {
      for (const entry of Object.values(groupRec as object)) {
        if (entry === EXCLUDED) continue;
        const b = entry as { inputSchema: unknown; meta: { desc: string } };
        expect(b.inputSchema).toBeDefined();
        expect(typeof b.meta.desc).toBe('string');
        expect(b.meta.desc.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('piBindings', () => {
  it('omits Write (put + delete are EXCLUDED)', () => {
    expect(piBindings.write.put).toBe(EXCLUDED);
    expect(piBindings.write.delete).toBe(EXCLUDED);
  });

  it('keeps all other groups intact', () => {
    expect(Object.keys(piBindings.localFs).length).toBe(5);
    expect(Object.keys(piBindings.read).length).toBe(2);
    expect(Object.keys(piBindings.search).length).toBe(6);
    expect(Object.keys(piBindings.indexAdmin).length).toBe(3);
  });
});
