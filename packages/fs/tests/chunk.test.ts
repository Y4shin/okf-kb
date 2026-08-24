import { describe, it, expect } from 'vitest';
import { splitByHeadings } from '../src/chunk.js';

describe('splitByHeadings', () => {
  it('splits a body with # A / ## B / ## C into 3 chunks with headingPath', () => {
    const body = '# A\ntext a\n## B\ntext b\n## C\ntext c';
    const chunks = splitByHeadings(body);
    expect(chunks).toHaveLength(3);
    expect(chunks[0].headingPath).toEqual(['A']);
    expect(chunks[0].text).toContain('text a');
    expect(chunks[1].headingPath).toEqual(['A', 'B']);
    expect(chunks[1].text).toContain('text b');
    expect(chunks[2].headingPath).toEqual(['A', 'C']);
    expect(chunks[2].text).toContain('text c');
  });

  it('uses the note title for content before any heading', () => {
    const body = 'intro text\n# A\nmore';
    const chunks = splitByHeadings(body, 'My Title');
    expect(chunks[0].headingPath).toEqual(['My Title']);
    expect(chunks[0].text).toContain('intro text');
  });

  it('handles a body with no headings at all', () => {
    const body = 'just some plain text';
    const chunks = splitByHeadings(body, 'Title');
    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('just some plain text');
  });
});
