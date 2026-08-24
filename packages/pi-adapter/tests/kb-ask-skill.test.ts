// tests/kb-ask-skill.test.ts — content/structure test for the kb-ask SKILL.md.
// This is NOT an LLM-judgment test; the real acceptance gate is a separate manual
// review of answer/citation quality (mode: hitl). This auto-gate asserts the RAG
// steps are present and correctly ordered in the skill's instructions.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SKILL_PATH = join(__dirname, '..', 'skill', 'kb-ask', 'SKILL.md');

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

describe('kb-ask skill: frontmatter', () => {
  const text = loadSkill();

  it('has valid frontmatter with name === kb-ask and a description', () => {
    const fm = parseFrontmatter(text);
    expect(fm.name).toBe('kb-ask');
    expect(fm.description).toBeTruthy();
    expect(fm.description!.length).toBeGreaterThan(20);
  });
});

describe('kb-ask skill: RAG steps present and ordered', () => {
  const text = loadSkill();

  // Helper: find the 0-based index of a step marker in the text.
  // A "step marker" is a heading or keyword that uniquely identifies the step.
  // We search for the most distinctive phrase for each step.
  const indexOf = (needle: string): number => text.toLowerCase().indexOf(needle.toLowerCase());

  const steps = {
    retrieve: indexOf('kb_search'),
    lifecycleFilter: indexOf('lifecycle'),
    contextBudget: indexOf('contextbudgettokens'),
    citations: indexOf('formatref'),
    verifyBeforeEmit: indexOf('verify'),
    iDontKnow: indexOf("i don't know"),
    stateless: indexOf('stateless'),
  };

  it('has a retrieve step mentioning kb_search, withGraph, and k≈8', () => {
    expect(steps.retrieve).toBeGreaterThanOrEqual(0);
    // The retrieve step mentions withGraph
    expect(text.toLowerCase()).toContain('withgraph');
    // k≈8 — either the literal "k≈8" or "k = 8" or "k=8" or "top 8"
    expect(/k\s*[≈=]\s*8|top.?8|k\s*≈\s*8/i.test(text)).toBe(true);
  });

  it('has a lifecycle-filter step: exclude deprecated, flag stale_after, include draft/unverified with marker', () => {
    expect(steps.lifecycleFilter).toBeGreaterThanOrEqual(0);
    const lc = text.toLowerCase();
    // Exclude deprecated
    expect(lc).toContain('deprecated');
    expect(lc).toMatch(/exclude.*deprecated|deprecated.*exclude/);
    // Flag stale_after
    expect(lc).toContain('stale_after');
    expect(lc).toMatch(/flag.*stale|stale.*flag|past.*freshness|freshness.*date/);
    // Include draft/unverified with a marker
    expect(lc).toContain('draft');
    expect(lc).toContain('unverified');
    expect(lc).toMatch(/\[draft\]|\[unverified\]/);
  });

  it('has a context-budget step mentioning contextBudgetTokens / 4000 / .kb/config', () => {
    expect(steps.contextBudget).toBeGreaterThanOrEqual(0);
    const lc = text.toLowerCase();
    expect(lc).toContain('contextbudgettokens');
    expect(lc).toContain('4000');
    expect(lc).toContain('.kb/config');
  });

  it('has a citations step mentioning [Title](formatRef(ref)) and formatRef', () => {
    expect(steps.citations).toBeGreaterThanOrEqual(0);
    const lc = text.toLowerCase();
    expect(lc).toContain('formatref');
    // The citation form [Title](concept:foo) or formatRef(ref)
    expect(lc).toMatch(/\[title\]\(.*formatref|formatref\(ref\)|\[title\]\(concept:/);
  });

  it('has a verify-before-emit step mentioning kb_get / kb_resolve_id and re-verify', () => {
    expect(steps.verifyBeforeEmit).toBeGreaterThanOrEqual(0);
    const lc = text.toLowerCase();
    // Mentions kb_get or kb_resolve_id
    expect(lc).toMatch(/kb_get|kb_resolve_id/);
    // Mentions re-verify (either the word "re-verify" or "re-verify on emit")
    expect(lc).toMatch(/re-verify|reverify|re-verify on emit/);
    // No hallucinated links
    expect(lc).toMatch(/no hallucinated|hallucinated/);
  });

  it('has an "I don\'t know" step mentioning cosine floor (~0.25), zero hits after filter, and names what was tried', () => {
    expect(steps.iDontKnow).toBeGreaterThanOrEqual(0);
    const lc = text.toLowerCase();
    // Cosine floor
    expect(lc).toMatch(/cosine.*0\.25|0\.25.*cosine|score floor|floor.*0\.25/);
    // Zero hits after lifecycle filtering
    expect(lc).toMatch(/zero hits|no hit clears|zero.*remain/);
    // Names what was tried
    expect(lc).toMatch(/name.*what was tried|what was tried|names.*tried/);
  });

  it('has a stateless note', () => {
    expect(steps.stateless).toBeGreaterThanOrEqual(0);
  });

  it('steps appear in the correct order: retrieve → lifecycle → budget → citations → verify → refuse → stateless', () => {
    // Use the step headings (## Step N — <name>) for ordering, since intro
    // text may mention concepts out of order. The headings are the canonical
    // sequence markers.
    const headingIdx = (n: number): number => text.indexOf(`Step ${n} `);
    const order = [
      { name: 'retrieve', idx: headingIdx(1) },
      { name: 'lifecycle', idx: headingIdx(2) },
      { name: 'contextBudget', idx: headingIdx(3) },
      { name: 'citations', idx: headingIdx(5) },
      { name: 'verify', idx: headingIdx(6) },
      { name: "i-don't-know", idx: headingIdx(7) },
      { name: 'stateless', idx: headingIdx(8) },
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
});

describe('kb-ask skill: tool references', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('references the 8 kb_* tool names (at minimum kb_search, kb_get, kb_resolve_id)', () => {
    expect(lc).toContain('kb_search');
    expect(lc).toContain('kb_get');
    expect(lc).toContain('kb_resolve_id');
  });

  it('references the other relevant kb_* tools', () => {
    expect(lc).toContain('kb_list');
    expect(lc).toContain('kb_graph');
    expect(lc).toContain('kb_update');
    expect(lc).toContain('kb_check_id');
    expect(lc).toContain('kb_resolve_path');
  });
});

describe('kb-ask skill: no code / no daemon imports', () => {
  const text = loadSkill();

  it('does NOT contain code blocks that import @kb/fs', () => {
    // The skill is pure markdown instructions. It must not import @kb/fs or
    // call the daemon directly in code blocks.
    expect(text.toLowerCase()).not.toContain('@kb/fs');
    expect(text.toLowerCase()).not.toContain('import @kb/fs');
    expect(text.toLowerCase()).not.toContain('require(\'@kb/fs\')');
  });

  it('does NOT contain code blocks that directly call the daemon or create a tRPC client', () => {
    // The skill teaches the agent to call the kb_* tools, not to build its
    // own daemon client.
    expect(text.toLowerCase()).not.toContain('createtrpcclient');
    expect(text.toLowerCase()).not.toContain('createkbtrpcclient');
    expect(text.toLowerCase()).not.toContain('httpbatchlink');
    // Should not instruct importing the daemon or protocol
    expect(text.toLowerCase()).not.toContain('import \'@kb/daemon');
    expect(text.toLowerCase()).not.toContain('import \'@kb/protocol');
    expect(text.toLowerCase()).not.toContain('import "@kb/daemon');
    expect(text.toLowerCase()).not.toContain('import "@kb/protocol');
  });
});

describe('kb-ask skill: governance and authoring notes', () => {
  const text = loadSkill();
  const lc = text.toLowerCase();

  it('includes governance: never self-promotes draft→stable, deprecates only with consent, provenance non-negotiable', () => {
    expect(lc).toMatch(/self.?promote|never.*promote.*draft/);
    expect(lc).toMatch(/deprecat.*consent|consent.*deprecat/);
    expect(lc).toMatch(/provenance.*non.?negotiable|non.?negotiable.*provenance/);
  });

  it('includes authoring note (model b): native write/edit, frontmatter, generated.by, kb_update reindex, kb_check_id validate', () => {
    expect(lc).toContain('kb_update');
    expect(lc).toContain('kb_check_id');
    expect(lc).toMatch(/generated\.by|generated by/);
    expect(lc).toContain('frontmatter');
  });
});
