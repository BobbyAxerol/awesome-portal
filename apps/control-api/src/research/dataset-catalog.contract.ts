/**
 * CG-P08-04 · the research dataset catalog Screen 02 selects from.
 *
 * Read-only and bounded: datasets, timeframes, availability and — where the
 * approved reader's storage layout is mounted — symbols with their
 * month-partition coverage. No path, row, price or source handle crosses
 * into the browser; exact bar availability remains the preflight's job.
 */

import { z } from "zod";

const Identifier = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/);

const SymbolRowSchema = z.object({
  symbol: z.string().regex(/^[A-Z0-9][A-Z0-9_-]{1,31}$/),
  contract_kind: z.enum(["PERPETUAL", "QUARTERLY"]).nullable(),
  coverage: z.object({
    first_month: z.string().regex(/^\d{4}-\d{2}$/),
    last_month: z.string().regex(/^\d{4}-\d{2}$/),
    months: z.number().int().positive().max(1200),
    granularity: z.literal("MONTH_PARTITION"),
  }).strict().nullable(),
}).strict();

export const ResearchDatasetCatalogSchema = z.object({
  schema_version: z.literal("research.dataset-catalog.v1"),
  datasets: z.array(z.object({
    dataset_id: Identifier,
    venue: z.string().min(1).max(64),
    availability: z.enum(["available", "unavailable"]),
    unavailable_reason: z.string().max(400).nullable(),
    source_class: z.string().min(1).max(64),
    usage_scopes: z.array(z.string().min(1).max(64)).max(8),
    excluded_scopes: z.array(z.string().min(1).max(64)).max(8),
    source_timezone: z.string().min(1).max(128),
    calendar_policy: z.enum(["CRYPTO_24_7", "SOURCE_DECLARED"]),
    timeframes: z.array(z.string().regex(/^[1-9][0-9]*(?:min|m|h|D|d)$/)).max(16),
    symbols: z.object({
      state: z.enum(["PUBLISHED", "NOT_PUBLISHED"]),
      reason: z.string().min(1).max(300).nullable(),
      items: z.array(SymbolRowSchema).max(256),
      total: z.number().int().nonnegative().nullable(),
      truncated: z.boolean(),
    }).strict(),
  }).strict()).max(16),
  coverage_rule: z.string().min(1).max(400),
}).strict();

export type ResearchDatasetCatalog = z.infer<typeof ResearchDatasetCatalogSchema>;

export const ResearchDatasetCatalogQuerySchema = z.object({
  workspace_id: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/).optional(),
}).strict();
