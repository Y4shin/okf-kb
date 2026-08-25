// runChecks — bundle integrity rules (A1-A5,A7 per-note conformance handled by
// DefaultUtility.validate; this module runs the cross-note bundle rules B1,
// B3, B4, B7, B8 used by IndexAdmin.check and (per-note subset) Search.checkId).
import type { CheckReport, Manifest, Ref, Type } from '@okf-kb/core';
import { RuleSchema, FrontmatterSchema } from '@okf-kb/core';

export interface BundleNote {
  ref: Ref;
  path: string; // relative to space root
  frontmatter: Record<string, unknown>;
  body: string;
}

/** Extract standard markdown links (`[text](path.md)` / `[text](/path.md)`) from prose. */
export function extractMarkdownLinks(body: string): string[] {
  const links: string[] = [];
  const re = /\[[^\]]*\]\(([^)\s]+\.md)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    links.push(m[1]);
  }
  return links;
}

function refKey(ref: Ref): string {
  return 'slug' in ref ? `${ref.ty}:${ref.slug}` : ref.path;
}

/**
 * Full-bundle integrity walk. Runs the rules the manifest's integrity_checks
 * list enables (if the manifest doesn't specify a list, all supported rules run).
 */
export function runChecks(notes: BundleNote[], manifest: Manifest, enabledRules?: string[]): CheckReport {
  const errors: CheckReport['errors'] = [];
  const enabled = (rule: string) => !enabledRules || enabledRules.includes(rule);

  const idOwners = new Map<string, BundleNote[]>();
  const byPath = new Map<string, BundleNote>();
  const linkedTermIds = new Set<string>();

  for (const note of notes) {
    byPath.set(note.path, note);
    const id = note.frontmatter.id as string | undefined;
    if (id) {
      if (!idOwners.has(id)) idOwners.set(id, []);
      idOwners.get(id)!.push(note);
    }
  }

  // B1: id must be unique across the bundle
  if (enabled('B1')) {
    for (const [id, owners] of idOwners) {
      if (owners.length > 1) {
        for (const owner of owners) {
          errors.push({ rule: RuleSchema.enum.B1, ref: owner.ref, msg: `duplicate id '${id}' shared by ${owners.length} notes` });
        }
      }
    }
  }

  for (const note of notes) {
    const fm = FrontmatterSchema.safeParse(note.frontmatter);
    const relations = fm.success ? (fm.data.relations ?? []) : [];

    // B3: every relation target must exist (as an id or a path)
    if (enabled('B3')) {
      for (const rel of relations) {
        const targetExists =
          idOwners.has(rel.target) ||
          byPath.has(rel.target) ||
          byPath.has(rel.target.replace(/^\//, ''));
        if (!targetExists) {
          errors.push({ rule: RuleSchema.enum.B3, ref: note.ref, msg: `relation target '${rel.target}' does not exist` });
        } else {
          // record term links for B7: a 'defines' predicate marks the term itself;
          // any relation *to* a term counts as it being linked/used.
          linkedTermIds.add(rel.target);
        }
      }
    }

    // B4: no dead relative markdown links in prose
    if (enabled('B4')) {
      for (const link of extractMarkdownLinks(note.body)) {
        const normalized = link.replace(/^\//, '');
        if (!byPath.has(normalized) && !byPath.has(link)) {
          errors.push({ rule: RuleSchema.enum.B4, ref: note.ref, msg: `dead markdown link '${link}'` });
        } else {
          linkedTermIds.add(normalized);
        }
      }
    }

    // B8: id form is either path-derived (absent id) or normalized type:slug
    if (enabled('B8') && note.frontmatter.id !== undefined) {
      const id = note.frontmatter.id as string;
      if (!/^[a-z0-9_]+:[a-z0-9][a-z0-9-]*$/.test(id)) {
        errors.push({ rule: RuleSchema.enum.B8, ref: note.ref, msg: `id '${id}' is not normalized type:slug form` });
      }
    }
  }

  // B7: orphaned glossary terms (a term defined but never linked) — HARD ERROR
  if (enabled('B7')) {
    const termType: Type = 'term';
    for (const note of notes) {
      if (note.frontmatter.type !== termType) continue;
      const id = note.frontmatter.id as string | undefined;
      const key = id ?? note.path;
      const isLinked =
        linkedTermIds.has(key) ||
        (id !== undefined && linkedTermIds.has(id)) ||
        linkedTermIds.has(note.path) ||
        linkedTermIds.has(`/${note.path}`);
      if (!isLinked) {
        errors.push({ rule: RuleSchema.enum.B7, ref: note.ref, msg: `orphaned glossary term: '${refKey(note.ref)}' is defined but never linked` });
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
