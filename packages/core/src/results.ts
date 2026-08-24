import { z } from 'zod';
import { IdRefSchema, RefSchema, RuleSchema } from './types.js';
import { FrontmatterSchema } from './frontmatter.js';

// ---- result shapes ----
export const CheckReportSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.object({ rule: RuleSchema, ref: RefSchema, msg: z.string() })),
});
export type CheckReport = z.infer<typeof CheckReportSchema>;
export const NoteViewSchema = z.object({ ref: RefSchema, frontmatter: FrontmatterSchema, body: z.string() });
export type NoteView = z.infer<typeof NoteViewSchema>;
export const SearchHitSchema = z.object({ ref: RefSchema, title: z.string(), snippet: z.string(), score: z.number(), mode: z.enum(['literal', 'graph', 'semantic']) });
export type SearchHit = z.infer<typeof SearchHitSchema>;
export const ListEntrySchema = z.object({ ref: RefSchema, title: z.string().optional(), description: z.string().optional(), mtime: z.number() });
export type ListEntry = z.infer<typeof ListEntrySchema>;
export const PutResultSchema = z.object({ ref: IdRefSchema, etag: z.string().optional(), changed: z.boolean(), warnings: z.array(z.string()) });
export type PutResult = z.infer<typeof PutResultSchema>;
export const DeleteResultSchema = z.object({ ref: RefSchema, removed: z.boolean() });
export type DeleteResult = z.infer<typeof DeleteResultSchema>;
