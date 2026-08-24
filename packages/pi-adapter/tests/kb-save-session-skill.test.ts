// tests/kb-save-session-skill.test.ts — content/structure test for the
// kb-save-session SKILL.md. This is NOT an LLM-judgment test; the real
// acceptance gate is a separate manual review of distilled-note quality
// (mode: hitl). This auto-gate asserts the session-distill workflow steps
// are present and correctly ordered in the skill's instructions, that it
// references kb-curate for shared rules, that it is pure markdown, and
// that it references the kb_* tools + native write/edit (NOT
// kb_put/kb_delete).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_PATH = join(__dirname, '..', 'skill', 'kb-save-session', 'SKILL.md');

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

describe('kb-save-session skill: frontmatter', () => {
  const text = loadSkill();

  it('has valid frontmatter with name === kb-save-session and a description', () => {
    const fm = parseFrontmatter(text);
    expect(fm.name).toBe('kb-save-session');
    expect(fm.description).toBeTruthy();
    expect(fm.description!.length).toBeGreaterThan(20);
  });

  it('description mentions saving a session to the KB / distilling', () => {
    const fm = parseFrontmatter(text);
    const lc = fm.description!.toLowerCase();
    expect(lc).toMatch(/save.*session.*kb|distil|capture.*learn|capture.*decid/);
  });
});

describe('kb-save-session skill: workflow steps present and ordered', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  // The canonical step sequence markers are the ## Step N headings. The
  // arch spec's Slice 2 workflow is:
  // 1. Extract (not verbatim / summarize then distill)
  // 2. Type-select (references kb-curate)
  // 3. kb_search (link if near-match)
  // 4. Author (native write, sources → session, generated.by, status: draft)
  // 5. Link relations (typed relation + prose markdown link)
  // 6. kb_update (reindex; daemon auto-maintains index.md + log/)
  // 7. kb_check_id (validate conformance)
  // 8. Re-distill → link, don't duplicate
  const headingIdx = (n: number): number => lc.indexOf(`## step ${n} `);

  const order = [
    { name: 'extract', idx: headingIdx(1) },
    { name: 'type-select', idx: headingIdx(2) },
    { name: 'kb_search', idx: headingIdx(3) },
    { name: 'author', idx: headingIdx(4) },
    { name: 'link-relations', idx: headingIdx(5) },
    { name: 'kb_update', idx: headingIdx(6) },
    { name: 'kb_check_id', idx: headingIdx(7) },
    { name: 're-distill', idx: headingIdx(8) },
  ];

  it('has all 8 step headings', () => {
    for (const s of order) {
      expect(s.idx, `${s.name} step heading not found`).toBeGreaterThanOrEqual(0);
    }
  });

  it('steps appear in the correct order (extract → type-select → kb_search → author → link → kb_update → kb_check_id → re-distill)', () => {
    for (let i = 1; i < order.length; i++) {
      expect(
        order[i].idx,
        `${order[i].name} (idx ${order[i].idx}) should come after ${order[i - 1].name} (idx ${order[i - 1].idx})`,
      ).toBeGreaterThan(order[i - 1].idx);
    }
  });

  it('Step 1 — Extract: not a verbatim dump / summarize then distill', () => {
    const start = lc.indexOf('## step 1 ');
    const end = lc.indexOf('## step 2 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step1 = lc.slice(start, end);
    // not a verbatim dump
    expect(step1).toMatch(/verbatim|not.*verbatim|don.?t.*verbatim|do not.*verbatim|not.*verbatim.*dump|verbatim dump/);
    // summarize then distill
    expect(step1).toMatch(/summarize.*then.*distil|summarise.*then.*distil|distil.*after.*summari/);
    // if nothing durable, say so and stop
    expect(step1).toMatch(/nothing.*durable|nothing.*extractable|no.*durable|nothing to distil|say so.*stop|say so and stop/);
  });

  it('Step 2 — Type-select: references kb-curate for type selection', () => {
    const start = lc.indexOf('## step 2 ');
    const end = lc.indexOf('## step 3 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step2 = lc.slice(start, end);
    // references kb-curate
    expect(step2).toMatch(/kb.?curate|see kb.?curate/);
    // mentions the types (or says "per kb-curate's rules")
    expect(step2).toMatch(/term.*concept.*decision.*reference.*generic|type selection.*kb.?curate|see kb.?curate.*type|type.*kb.?curate/);
  });

  it('Step 3 — kb_search: search before creating, link if near-match', () => {
    const start = lc.indexOf('## step 3 ');
    const end = lc.indexOf('## step 4 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step3 = lc.slice(start, end);
    // kb_search
    expect(step3).toContain('kb_search');
    // near-match → link instead of create
    expect(step3).toMatch(/near.?match|near match/);
    expect(step3).toMatch(/link.*instead of creat|instead of creat.*link|link.*not creat|link.*not duplicate/);
  });

  it('Step 4 — Author: native write, sources → session transcript/log, generated.by, status: draft', () => {
    const start = lc.indexOf('## step 4 ');
    const end = lc.indexOf('## step 5 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step4 = lc.slice(start, end);
    // native write/edit
    expect(step4).toMatch(/native write|native.*write.*edit/);
    // sources → session transcript/log
    expect(step4).toMatch(/session.*transcript|session.*log|transcript.*log|sources.*session/);
    // generated.by = pi/<version>/<model>
    expect(step4).toMatch(/generated\.by.*pi|pi\/<version>|pi\/<ver>|pi\/\d+\.\d+/);
    // status: draft
    expect(step4).toMatch(/status:?\s*draft|status.*draft/);
  });

  it('Step 5 — Link relations: typed relation + prose markdown link to existing concepts', () => {
    const start = lc.indexOf('## step 5 ');
    const end = lc.indexOf('## step 6 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step5 = lc.slice(start, end);
    // typed relation
    expect(step5).toMatch(/typed relation|typed.*rel|relation.*typed/);
    // prose markdown link
    expect(step5).toMatch(/prose.*link|markdown link|prose.*markdown/);
  });

  it('Step 6 — kb_update: reindex; daemon auto-maintains index.md + log/ + root log.md', () => {
    const start = lc.indexOf('## step 6 ');
    const end = lc.indexOf('## step 7 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step6 = lc.slice(start, end);
    // kb_update reindex
    expect(step6).toContain('kb_update');
    expect(step6).toMatch(/reindex|re.?index/);
    // daemon auto-maintains index.md + log/ + root log.md
    expect(step6).toMatch(/index\.md|auto.?maintain|auto maintain|daemon.*maintain/);
    expect(step6).toMatch(/log\/|log\.md|log\b/);
  });

  it('Step 7 — kb_check_id: validate conformance', () => {
    const start = lc.indexOf('## step 7 ');
    const end = lc.indexOf('## step 8 ');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const step7 = lc.slice(start, end);
    // kb_check_id
    expect(step7).toContain('kb_check_id');
    // validate / conformance
    expect(step7).toMatch(/valid|conformance/);
  });

  it('Step 8 — Re-distill: links, doesn\'t duplicate (kb_search finds prior notes)', () => {
    const start = lc.indexOf('## step 8 ');
    const end = lc.length;
    expect(start).toBeGreaterThanOrEqual(0);
    const step8 = lc.slice(start, end);
    // re-distilling the same session
    expect(step8).toMatch(/re.?distil|re distil|re-distil/);
    // link, don't duplicate
    expect(step8).toMatch(/link.*don.?t duplicate|link.*not.*duplicate|link.*instead of duplicat|link.*not.*duplicat/);
    // kb_search finds the prior notes
    expect(step8).toContain('kb_search');
    expect(step8).toMatch(/prior.*note|prior note|prior.*distil|previous.*note/);
  });
});

describe('kb-save-session skill: references kb-curate for shared rules', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('references kb-curate for type selection, provenance, lifecycle, governance (shared rules — not repeated)', () => {
    expect(lc).toMatch(/see kb.?curate|kb.?curate.*for.*type|kb.?curate.*provenance|kb.?curate.*lifecycle|kb.?curate.*governance/);
    // Should say "see kb-curate" or "per kb-curate" — defer, not repeat
    expect(lc).toMatch(/see kb.?curate|per kb.?curate|defer.*kb.?curate|kb.?curate.*rules/);
  });

  it('does NOT repeat the full type-selection list (defers to kb-curate)', () => {
    // The skill should not fully reproduce the 5-type glossary inline;
    // it should reference kb-curate for it. We check that it does NOT
    // contain the kb-curate signature phrase "the gauge type" which would
    // indicate it copied the full rules. (A brief mention of types is OK.)
    expect(lc).not.toMatch(/gauge type/);
  });
});

describe('kb-save-session skill: tool references', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('references kb_search, kb_update, and kb_check_id (at minimum)', () => {
    expect(lc).toContain('kb_search');
    expect(lc).toContain('kb_update');
    expect(lc).toContain('kb_check_id');
  });

  it('references native write/edit (model b)', () => {
    expect(lc).toMatch(/native write|native.*write.*edit|write\/edit/);
  });
});

describe('kb-save-session skill: pure markdown — no code / no daemon imports', () => {
  const text = loadSkill();

  it('does NOT contain @kb/fs imports or references', () => {
    const lc = text.toLowerCase();
    expect(lc).not.toContain('@kb/fs');
    expect(lc).not.toContain('import @kb/fs');
    expect(lc).not.toContain("require('@kb/fs')");
  });

  it('does NOT contain daemon imports or tRPC client creation', () => {
    const lc = text.toLowerCase();
    expect(lc).not.toContain('createtrpcclient');
    expect(lc).not.toContain('createkbtrpcclient');
    expect(lc).not.toContain('httpbatchlink');
    expect(lc).not.toContain('import \'@kb/daemon');
    expect(lc).not.toContain('import \'@kb/protocol');
    expect(lc).not.toContain('import "@kb/daemon');
    expect(lc).not.toContain('import "@kb/protocol');
  });
});

describe('kb-save-session skill: remote note references kb_put / kb_delete', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('references kb_put and kb_delete in the remote KB note (slice 3: when the KB is remote, author with kb_put/kb_delete)', () => {
    // Slice 3 adds a one-line note near the authoring step.
    expect(lc).toMatch(/kb_put/);
    expect(lc).toMatch(/kb_delete/);
    expect(lc).toMatch(/remote/);
    expect(lc).toMatch(/isremotekb/);
  });
});

describe('kb-save-session skill: example', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('includes a worked example: distilling a session that decided to use better-sqlite3', () => {
    expect(lc).toContain('example');
    // the example is about deciding to use better-sqlite3
    expect(lc).toContain('better-sqlite3');
    // produces a decision note: id like decision:use-better-sqlite3
    expect(lc).toMatch(/decision:use-better-sqlite3|decision:.*better-sqlite/);
    // generated.by in the example
    expect(lc).toMatch(/generated\.by.*pi|pi\/.*model|pi\/\d+\.\d+/);
    // status: draft in the example
    expect(lc).toMatch(/status:?\s*draft|status.*draft/);
    // sources → the session
    expect(lc).toContain('sources');
  });

  it('example includes a decided_in relation to a backing concept (concept:search) with a prose link', () => {
    expect(lc).toMatch(/decided_in/);
    expect(lc).toContain('concept:search');
    expect(lc).toMatch(/\[.*\]\(.*:.*\)|prose.*link|markdown link/);
  });
});
