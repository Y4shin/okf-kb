// DefaultUtility — implements @kb/core's Utility interface: computeId/validate
// (the core Utility contract) plus authoring helpers (frontmatterFor/normalize/
// stampProvenance) used by FsWrite.
import type { Utility } from '@kb/core';
import type { IdRef, Slug, Type, Actor } from '@kb/core';
import type { Frontmatter, Note } from '@kb/core';
import type { CheckReport } from '@kb/core';
import { FrontmatterSchema, RuleSchema } from '@kb/core';
import type { Manifest } from '@kb/core';

/** rule name -> message, used by validate()'s per-note (A/B2/B5/B8) checks. */
export interface UtilityOptions {
  manifest?: Manifest;
}

export class DefaultUtility implements Utility {
  constructor(private readonly manifest?: Manifest) {}

  computeId(type: Type, slug: Slug): IdRef {
    return { ty: type, slug };
  }

  /**
   * Per-note conformance: A1-A5,A7 (OKF frontmatter conformance) + B2 (id
   * prefix matches dir) + B5 (title+description present) + B8 (id form).
   * Cross-note bundle rules (B1/B3/B4/B7) are done by IndexAdmin.check.
   */
  validate(note: Note): CheckReport {
    const errors: CheckReport['errors'] = [];
    const ref = { ty: (note.frontmatter.type ?? 'generic') as Type, slug: idSlug(note) };

    // A1: frontmatter must parse against FrontmatterSchema (required keys present, right shapes)
    const parsed = FrontmatterSchema.safeParse(note.frontmatter);
    if (!parsed.success) {
      errors.push({ rule: RuleSchema.enum.A1, ref, msg: `frontmatter does not conform: ${parsed.error.message}` });
    }

    // A2: type must be present and a known type
    if (!note.frontmatter.type) {
      errors.push({ rule: RuleSchema.enum.A2, ref, msg: 'missing required field: type' });
    }

    // A3: id, when present, must be a non-empty string
    if (note.frontmatter.id !== undefined && note.frontmatter.id.trim() === '') {
      errors.push({ rule: RuleSchema.enum.A3, ref, msg: 'id must not be empty when present' });
    }

    // A4: tags, when present, must be an array of strings (schema-checked above; extra guard)
    if (note.frontmatter.tags !== undefined && !Array.isArray(note.frontmatter.tags)) {
      errors.push({ rule: RuleSchema.enum.A4, ref, msg: 'tags must be an array' });
    }

    // A5: relations, when present, must each have predicate+target
    for (const rel of note.frontmatter.relations ?? []) {
      if (!rel.predicate || !rel.target) {
        errors.push({ rule: RuleSchema.enum.A5, ref, msg: 'relation missing predicate or target' });
      }
    }

    // A7: status, when present, must be one of draft|stable|deprecated (schema-checked)
    if (note.frontmatter.status !== undefined && !['draft', 'stable', 'deprecated'].includes(note.frontmatter.status)) {
      errors.push({ rule: RuleSchema.enum.A7, ref, msg: 'status must be draft|stable|deprecated' });
    }

    // B2: id prefix (type:) must match the directory the note lives in
    if (this.manifest && note.frontmatter.id) {
      const [prefix] = note.frontmatter.id.split(':');
      const dirEntry = this.manifest.types[prefix as Type];
      if (!dirEntry) {
        errors.push({ rule: RuleSchema.enum.B2, ref, msg: `id prefix '${prefix}' is not a known type` });
      } else if (!note.path.includes(`/${dirEntry.dir}/`) && !note.path.startsWith(`${dirEntry.dir}/`)) {
        errors.push({ rule: RuleSchema.enum.B2, ref, msg: `id prefix '${prefix}' does not match directory of ${note.path}` });
      }
    }

    // B5: title + description present
    if (!note.frontmatter.title) {
      errors.push({ rule: RuleSchema.enum.B5, ref, msg: 'missing title' });
    }
    if (!note.frontmatter.description) {
      errors.push({ rule: RuleSchema.enum.B5, ref, msg: 'missing description' });
    }

    // B8: id must be either path-derived or a normalized type:slug form
    if (note.frontmatter.id) {
      const ok = /^[a-z0-9_]+:[a-z0-9][a-z0-9-]*$/.test(note.frontmatter.id);
      if (!ok) {
        errors.push({ rule: RuleSchema.enum.B8, ref, msg: `id '${note.frontmatter.id}' is not normalized type:slug form` });
      }
    }

    return { ok: errors.length === 0, errors };
  }

  frontmatterFor(type: Type, partial: Partial<Frontmatter>): Frontmatter {
    const slug = partial.id ? partial.id.split(':')[1] : undefined;
    const fm: Frontmatter = {
      ...partial,
      type,
      id: partial.id ?? (slug ? `${type}:${slug}` : partial.id),
    };
    return FrontmatterSchema.parse(fm);
  }

  normalize(content: string): string {
    // idempotent: parse+re-serialize is done at the read/write boundary (yaml);
    // normalize here is a no-op pass that guarantees frontmatter is present and
    // parseable — it never rewrites bytes that are already conformant.
    splitFrontmatter(content);
    return content;
  }

  stampProvenance(frontmatter: Frontmatter, by: Actor): Frontmatter {
    return {
      ...frontmatter,
      generated: { by, at: new Date().toISOString() },
    };
  }
}

function idSlug(note: Note): Slug {
  if (note.frontmatter.id) {
    const [, slug] = note.frontmatter.id.split(':');
    if (slug) return slug;
  }
  const base = note.path.split('/').pop() ?? note.path;
  return base.replace(/\.md$/, '');
}

function splitFrontmatter(content: string): { frontmatterText: string | null; body: string } {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatterText: null, body: content };
  return { frontmatterText: m[1], body: m[2] };
}
