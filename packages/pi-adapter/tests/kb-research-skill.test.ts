// tests/kb-research-skill.test.ts — content/structure test for the kb-research SKILL.md.
// This is NOT an LLM-judgment test; the real acceptance gate is a separate manual
// review of synthesized-note and source quality (mode: hitl). This auto-gate asserts
// the topic-research workflow steps are present and correctly ordered in the skill's
// instructions, that the skill references kb-curate for shared rules, and that it is
// pure markdown with no @okf-kb/fs/daemon code and no kb_put/kb_delete.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_PATH = join(__dirname, '..', 'skill', 'kb-research', 'SKILL.md');

/** Load the raw SKILL.md text. */
function loadSkill(): string {
  return readFileSync(SKILL_PATH, 'utf-8');
}

/** Parse the YAML frontmatter (between the first two `---` lines) into a record. */
function parseFrontmatter(text: string): Record<string, string> {
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) throw new Error('No frontmatter found in SKILL.md');
  const yaml = match[1];
  const record: Record<string, string> = {};
  for (const line of yaml.split('\n')) {
    const m = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (m) record[m[1]] = m[2].trim();
  }
  return record;
}

describe('kb-research skill: frontmatter', () => {
  const text = loadSkill();

  it('has valid frontmatter with name === kb-research and a description', () => {
    const fm = parseFrontmatter(text);
    expect(fm.name).toBe('kb-research');
    expect(fm.description).toBeTruthy();
    expect(fm.description!.length).toBeGreaterThan(20);
  });
});

describe('kb-research skill: workflow steps present and ordered', () => {
  const text = loadSkill();

  // Helper: find the 0-based index of a step heading in the text.
  // The headings (## Step N — <name>) are the canonical sequence markers;
  // intro/summary text may mention concepts out of order, so we use headings.
  const headingIdx = (n: number): number => text.indexOf(`## Step ${n} `);

  it('steps appear in the correct order: research → synthesize → attribute → provenance → cross-link → kb_update → kb_check_id', () => {
    const order = [
      { name: 'research', idx: headingIdx(1) },
      { name: 'synthesize', idx: headingIdx(2) },
      { name: 'attribute', idx: headingIdx(3) },
      { name: 'provenance', idx: headingIdx(4) },
      { name: 'cross-link', idx: headingIdx(5) },
      { name: 'reindex-validate', idx: headingIdx(6) },
    ];

    for (const s of order) {
      expect(s.idx, `${s.name} step heading not found`).toBeGreaterThanOrEqual(0);
    }

    for (let i = 1; i < order.length; i++) {
      expect(
        order[i].idx,
        `${order[i].name} (idx ${order[i].idx}) should come after ${order[i - 1].name} (idx ${order[i - 1].idx})`,
      ).toBeGreaterThan(order[i - 1].idx);
    }
  });

  it('Step 1 — Research: mentions web_search/fetch_content (web) + read/grep (repo), credibility signals (author, last_modified)', () => {
    const start = text.indexOf('## Step 1 ');
    const end = text.indexOf('## Step 2 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step1 = text.slice(start, end).toLowerCase();
    // web channels
    expect(step1).toContain('web_search');
    expect(step1).toContain('fetch_content');
    // repo channels
    expect(step1).toMatch(/read.*grep|grep.*read|read\/grep/);
    // credibility signals
    expect(step1).toContain('author');
    expect(step1).toContain('last_modified');
    // url / resource
    expect(step1).toMatch(/url|resource/);
  });

  it('Step 2 — Synthesize: reference/concept/term types; a reference note per key source', () => {
    const start = text.indexOf('## Step 2 ');
    const end = text.indexOf('## Step 3 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step2 = text.slice(start, end).toLowerCase();
    expect(step2).toContain('reference');
    expect(step2).toContain('concept');
    expect(step2).toContain('term');
    // a reference note per key source
    expect(step2).toMatch(/reference.*per.*key.*source|reference note per key source|per key source/);
    // native write/edit (not kb_put/kb_delete)
    expect(step2).toMatch(/native write|write\/edit|write.*edit.*native/);
  });

  it('Step 3 — Attribute: sources with URL + title/author/last_modified; unsupported claims marked/omitted; conflicting sources separate entries', () => {
    const start = text.indexOf('## Step 3 ');
    const end = text.indexOf('## Step 4 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step3 = text.slice(start, end).toLowerCase();
    // sources entries with resource (URL) + title/author/last_modified
    expect(step3).toContain('resource');
    expect(step3).toContain('url');
    expect(step3).toMatch(/title|author|last_modified/);
    // unsupported claims → marked or omitted
    expect(step3).toMatch(/not supported.*marked.*omitted|unsupported.*marked|unsupported.*omitted|marked or omitted|marked.*omitted/);
    // conflicting sources → separate entries
    expect(step3).toMatch(/conflict.*separate|separate.*source|separate.*entries/);
    // paywalled/inaccessible → note it
    expect(step3).toMatch(/paywall|inaccessible|inaccessible source/);
  });

  it('Step 4 — Provenance: generated.by, draft, unverified; references kb-curate', () => {
    const start = text.indexOf('## Step 4 ');
    const end = text.indexOf('## Step 5 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step4 = text.slice(start, end).toLowerCase();
    expect(step4).toMatch(/generated\.by|generated by/);
    expect(step4).toMatch(/pi\/.*version.*model|pi\/<version>|pi\/<ver>|pi\/\d+\.\d+/);
    expect(step4).toContain('draft');
    expect(step4).toContain('unverified');
    // never self-promote
    expect(step4).toMatch(/self.?promote|never.*promote.*draft/);
    // references kb-curate
    expect(step4).toContain('kb-curate');
  });

  it('Step 5 — Cross-link: kb_search before create; link-don\'t-duplicate; references kb-curate', () => {
    const start = text.indexOf('## Step 5 ');
    const end = text.indexOf('## Step 6 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step5 = text.slice(start, end).toLowerCase();
    expect(step5).toContain('kb_search');
    expect(step5).toMatch(/kb_search.*before creat|search.*before creat|before creat.*search/);
    expect(step5).toMatch(/link.*don.?t duplicate|link.*not.*duplicate|link.*instead of duplicat/);
    // near-match → link
    expect(step5).toMatch(/near.?match|near match/);
    // references kb-curate
    expect(step5).toContain('kb-curate');
  });

  it('Step 6 — Reindex & Validate: kb_update reindex, kb_check_id validate; daemon auto-maintains index.md/log', () => {
    const start = text.indexOf('## Step 6 ');
    const end = text.indexOf('---', start + 10); // next section or end
    expect(start).toBeGreaterThanOrEqual(0);
    // the step 6 section extends to the next '---' divider
    const sectionEnd = text.indexOf('\n---\n', start);
    const step6 = text.slice(start, sectionEnd > start ? sectionEnd : undefined).toLowerCase();
    expect(step6).toContain('kb_update');
    expect(step6).toContain('kb_check_id');
    expect(step6).toMatch(/reindex|re.?index/);
    expect(step6).toMatch(/conformance|validate|validation/);
    // daemon auto-maintains index.md / log
    expect(step6).toMatch(/index\.md|auto.?maintain/);
    expect(step6).toMatch(/log\/|log\.md|auto.?maintain/);
  });
});

describe('kb-research skill: edge cases', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('says: no sources found → don\'t fabricate', () => {
    expect(lc).toMatch(/no sources found|no source.*found|don.?t fabricate|do not fabricate/);
    expect(lc).toMatch(/fabricate|do not invent|don.?t invent/);
  });

  it('says: narrow with the user if topic too broad', () => {
    expect(lc).toMatch(/too broad|narrow with the user|narrow.*user/);
  });

  it('says: paywalled/inaccessible source → note it', () => {
    expect(lc).toMatch(/paywall|inaccessible|inaccessible source/);
    expect(lc).toMatch(/note it|note.*inaccessible/);
  });
});

describe('kb-research skill: references kb-curate for shared rules', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('references kb-curate for type selection, provenance, and lifecycle rules', () => {
    expect(lc).toContain('kb-curate');
    // mentions deferring to kb-curate for shared rules
    expect(lc).toMatch(/see kb-curate for type selection|see kb-curate for.*provenance|see kb-curate for.*lifecycle|kb-curate for type selection.*provenance.*lifecycle/);
  });

  it('does not repeat the full type-selection / lifecycle rules (defers to kb-curate)', () => {
    // The skill should reference kb-curate rather than re-listing the 5 types
    // as a standalone rule section (it mentions reference/concept/term in
    // the synthesize step, but should defer the full type-selection to
    // kb-curate).
    // It should contain the phrase "see kb-curate" at least once.
    expect(lc).toMatch(/see kb-curate|per kb-curate|kb-curate.*rule/);
  });
});

describe('kb-research skill: tool references', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('references the kb_* tools (at minimum kb_search, kb_update, kb_check_id)', () => {
    expect(lc).toContain('kb_search');
    expect(lc).toContain('kb_update');
    expect(lc).toContain('kb_check_id');
  });

  it('references pi web_search and fetch_content for web research', () => {
    expect(lc).toContain('web_search');
    expect(lc).toContain('fetch_content');
  });

  it('references native read/grep for repo research', () => {
    expect(lc).toMatch(/read.*grep|grep.*read|read\/grep|native read/);
  });

  it('references native write/edit for authoring', () => {
    expect(lc).toMatch(/native write|write\/edit|write.*edit.*native/);
  });
});

describe('kb-research skill: no code / no daemon imports', () => {
  const text = loadSkill();

  it('does NOT contain @okf-kb/fs imports or references', () => {
    expect(text.toLowerCase()).not.toContain('@okf-kb/fs');
    expect(text.toLowerCase()).not.toContain('import @okf-kb/fs');
    expect(text.toLowerCase()).not.toContain("require('@okf-kb/fs')");
  });

  it('does NOT contain daemon imports or tRPC client creation', () => {
    const lc = text.toLowerCase();
    expect(lc).not.toContain('createtrpcclient');
    expect(lc).not.toContain('createkbtrpcclient');
    expect(lc).not.toContain('httpbatchlink');
    expect(lc).not.toContain('import \'@okf-kb/daemon');
    expect(lc).not.toContain('import \'@okf-kb/protocol');
    expect(lc).not.toContain('import "@okf-kb/daemon');
    expect(lc).not.toContain('import "@okf-kb/protocol');
  });

  it('references kb_put and kb_delete in the remote KB note (slice 3: when the KB is remote, author with kb_put/kb_delete)', () => {
    // Slice 3 adds a one-line note near the synthesize step.
    const lc = text.toLowerCase();
    expect(lc).toMatch(/kb_put/);
    expect(lc).toMatch(/kb_delete/);
    expect(lc).toMatch(/remote/);
    expect(lc).toMatch(/isremotekb/);
  });
});

describe('kb-research skill: example', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('includes a worked example researching "sqlite-vec vs sqlite-fts5 for vector search"', () => {
    expect(lc).toContain('example');
    expect(lc).toContain('sqlite-vec');
    expect(lc).toContain('fts5');
    expect(lc).toContain('vector search');
  });

  it('example produces a reference:sqlite-vec note with sources → sqlite-vec docs URL, generated.by, status: draft', () => {
    expect(lc).toMatch(/reference:sqlite-vec/);
    // generated.by in the example
    expect(lc).toMatch(/generated\.by.*pi|pi\/.*model|pi\/\d+\.\d+/);
    // status: draft in the example
    expect(lc).toMatch(/status:?\s*draft|status.*draft/);
    // sources with a URL (github or sqlite docs)
    expect(lc).toMatch(/sources.*resource|resource.*url|https?:\/\//);
  });

  it('example produces a concept:vector-search-in-kb note cross-linked to the reference note', () => {
    expect(lc).toMatch(/concept:vector-search-in-kb/);
    // cross-link — a relation to the reference note
    expect(lc).toMatch(/references|cross.?link|relation/);
  });
});
