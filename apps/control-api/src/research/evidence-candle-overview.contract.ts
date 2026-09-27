/** E16-R1 bounded market overview shared by P11, P13 and P17. */

import { z } from "zod";

const DecimalSchema = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const UtcMsSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);

export const ResearchEvidenceCandleOverviewSchema = z.object({
  source_bar_count: z.number().int().positive().max(2_000_000),
  emitted_bucket_count: z.number().int().positive().max(12),
  bucket_bars: z.number().int().positive().max(2_000_000),
  sampling: z.enum(["FULL", "OHLC_BUCKET_V1"]),
  envelope: z.object({
    max_high: DecimalSchema,
    max_high_at_utc_ms: UtcMsSchema,
    min_low: DecimalSchema,
    min_low_at_utc_ms: UtcMsSchema,
  }).strict(),
  values: z.array(z.object({
    first_ordinal: z.number().int().nonnegative().max(2_000_000),
    last_ordinal: z.number().int().nonnegative().max(2_000_000),
    open_utc_ms: UtcMsSchema,
    close_utc_ms: UtcMsSchema,
    open: DecimalSchema,
    high: DecimalSchema,
    low: DecimalSchema,
    close: DecimalSchema,
    volume: DecimalSchema.nullable(),
    transitions: z.number().int().nonnegative().max(2_000_000),
  }).strict()).min(1).max(12),
}).strict().superRefine((value, context) => {
  if (value.emitted_bucket_count !== value.values.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview bucket count is inconsistent" });
  }
  if ((value.sampling === "FULL") !== (value.bucket_bars === 1)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview sampling is inconsistent" });
  }
  if (Math.ceil(value.source_bar_count / value.bucket_bars) !== value.emitted_bucket_count) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview bucket geometry is inconsistent" });
  }
  if (
    value.values[0]?.first_ordinal !== 0
    || value.values.at(-1)?.last_ordinal !== value.source_bar_count - 1
  ) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview does not cover the declared source range" });
  }
  for (let index = 0; index < value.values.length; index += 1) {
    const row = value.values[index]!;
    if (row.first_ordinal > row.last_ordinal || row.open_utc_ms > row.close_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview bucket bounds are inconsistent" });
    }
    if (row.last_ordinal - row.first_ordinal + 1 > value.bucket_bars) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview bucket exceeds its declared width" });
    }
    if (index > 0 && row.first_ordinal !== value.values[index - 1]!.last_ordinal + 1) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview buckets are not contiguous" });
    }
    if (index > 0 && row.open_utc_ms <= value.values[index - 1]!.close_utc_ms) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "candle overview timestamps are not strictly chronological" });
    }
  }
});

export type ResearchEvidenceCandleOverview = z.infer<typeof ResearchEvidenceCandleOverviewSchema>;
