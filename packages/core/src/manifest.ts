import { z } from 'zod';
import type { IdRef, Slug, Type, Actor, Vector } from './types.js';
import { TypeSchema, PredicateSchema } from './types.js';
import type { CheckReport } from './results.js';
import type { Frontmatter, Note } from './frontmatter.js';

// ---- DI seam ----
export interface Utility {
  computeId(type: Type, slug: Slug): IdRef;
  validate(note: Note): CheckReport;
  // authoring helpers used by @okf-kb/fs Write (arch spec: frontmatter/normalize/provenance)
  frontmatterFor(type: Type, partial: Partial<Frontmatter>): Frontmatter;
  normalize(content: string): string;
  stampProvenance(frontmatter: Frontmatter, by: Actor): Frontmatter;
}
export interface Embedder { embed(text: string): Promise<Vector> }
export const ManifestSchema = z.object({
  types: z.record(TypeSchema, z.object({ dir: z.string(), question: z.string() })),
  predicates: z.array(PredicateSchema),
});
export type Manifest = z.infer<typeof ManifestSchema>;

// ---- common deps ----
export interface CommonDeps { space: string; manifest: Manifest; util: Utility; embedder: Embedder }
export type Base = Pick<CommonDeps, 'space' | 'manifest' | 'util'>;
