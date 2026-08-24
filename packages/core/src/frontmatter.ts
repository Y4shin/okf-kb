import { z } from 'zod';
import { ActorSchema, IsoDateSchema, PredicateSchema, TypeSchema, TagSchema } from './types.js';

// ---- frontmatter families ----
export const SourceSchema = z.object({
  id: z.string().optional(), resource: z.string(), title: z.string().optional(),
  author: ActorSchema.optional(), usage_count: z.number().optional(), last_modified: IsoDateSchema.optional(),
});
export type Source = z.infer<typeof SourceSchema>;
export const GeneratedSchema = z.object({ by: ActorSchema, at: IsoDateSchema });
export type Generated = z.infer<typeof GeneratedSchema>;
export const VerifiedEntrySchema = z.object({ by: ActorSchema, at: IsoDateSchema });
export type VerifiedEntry = z.infer<typeof VerifiedEntrySchema>;
export const RelationSchema = z.object({ predicate: PredicateSchema, target: z.string() });
export type Relation = z.infer<typeof RelationSchema>;
export const FrontmatterSchema = z.object({
  id: z.string().optional(), type: TypeSchema, title: z.string().optional(), description: z.string().optional(),
  tags: z.array(TagSchema).optional(), relations: z.array(RelationSchema).optional(),
  generated: GeneratedSchema.optional(), verified: z.array(VerifiedEntrySchema).optional(),
  sources: z.array(SourceSchema).optional(), status: z.enum(['draft', 'stable', 'deprecated']).optional(),
  stale_after: IsoDateSchema.optional(),
}).passthrough();                       // OKF §11: tolerate unknown keys
export type Frontmatter = z.infer<typeof FrontmatterSchema>;
export interface Note { id: string; path: string; frontmatter: Frontmatter; body: string }      // internal
