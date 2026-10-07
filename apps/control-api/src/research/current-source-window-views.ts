/** Read-side window facts from the already authenticated P05 seal. No analytics
 * are reconstructed from a sampled curve and no engine/storage job is started. */
import { z } from "zod";
import { CurrentSourceFoldPayloadSchema, type CurrentSourceProtocolDisclosure } from "./current-source.payload";

const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Ms = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const Decimal = z.string().regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(96);
const Absence = z.object({ kind: z.literal("ABSENT"), state: z.enum(["NOT_PUBLISHED", "NOT_APPLICABLE"]),
  reason_code: Reason }).strict();
const Account = z.object({ kind: z.literal("ACCOUNT_REPLAY"), state: z.literal("AVAILABLE"), reason_code: z.null(),
  source_ref: z.literal("RETAINED_WINDOW_ACCOUNT_V1"),
  metric_policy: z.literal("DISPLAY_POINTS_ARE_NOT_A_FULL_METRIC_POPULATION"),
}).strict();
const Fold = z.object({ source_ordinal: z.number().int().nonnegative().max(255), fold_id: z.string().min(1).max(160),
  start_utc_ms: Ms.nullable(), last_bar_utc_ms: Ms.nullable(),
  bounds_semantics: z.literal("FIRST_AND_LAST_ACTUAL_TRAINING_BAR_INCLUSIVE"),
  observation_count: z.number().int().nonnegative().max(2_000_000).nullable(),
  is_sharpe: Decimal.nullable(), is_sharpe_raw: Decimal.nullable(), is_trade_count: Decimal.nullable(),
  source_ref: z.literal("RETAINED_FOLD_IS_FACTS_V1"),
  curve: Absence,
}).strict();
const Folds = z.object({ kind: z.literal("FOLD_FACTS"), state: z.literal("AVAILABLE"), reason_code: z.null(),
  aggregation: z.literal("SEPARATE_TRAINING_WINDOWS_MAY_OVERLAP_NOT_ONE_ACCOUNT"),
  folds: z.array(Fold).min(1).max(256),
}).strict();
export const ResearchCurrentSourceWindowViewsSchema = z.object({
  schema_version: z.literal("research.current-source-window-views.v1"),
  is: z.union([Account, Folds, Absence]), holdout: z.union([Account, Absence]),
}).strict().superRefine((value, ctx) => {
  if ((value.is.kind === "ACCOUNT_REPLAY") !== (value.holdout.kind === "ACCOUNT_REPLAY"))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Three Window must publish its independent windows together" });
  if (value.is.kind === "FOLD_FACTS") {
    const rows = value.is.folds;
    if (value.holdout.state !== "NOT_APPLICABLE" || rows.some((r, i) => r.source_ordinal !== i
      || r.curve.state !== "NOT_PUBLISHED" || r.start_utc_ms !== null && r.last_bar_utc_ms !== null && r.start_utc_ms > r.last_bar_utc_ms)
      || new Set(rows.map(r => r.fold_id)).size !== rows.length)
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Fold IS is independently scoped; WFO has no independent holdout" });
  }
});

export function currentSourceWindowViews(protocol: CurrentSourceProtocolDisclosure | undefined,
  folds: { sourceOrdinal: number; payload: unknown }[], fullSample = false) {
  const account = { kind: "ACCOUNT_REPLAY" as const, state: "AVAILABLE" as const, reason_code: null,
    source_ref: "RETAINED_WINDOW_ACCOUNT_V1" as const,
    metric_policy: "DISPLAY_POINTS_ARE_NOT_A_FULL_METRIC_POPULATION" as const };
  const absent = (reason_code: string, state: "NOT_PUBLISHED" | "NOT_APPLICABLE" = "NOT_PUBLISHED") =>
    ({ kind: "ABSENT" as const, state, reason_code });
  return ResearchCurrentSourceWindowViewsSchema.parse({ schema_version: "research.current-source-window-views.v1",
    is: protocol ? account : fullSample ? absent("FULL_SAMPLE_CALIBRATION_HAS_NO_SEPARATE_IS_WINDOW", "NOT_APPLICABLE") : folds.length ? {
      kind: "FOLD_FACTS", state: "AVAILABLE", reason_code: null,
      aggregation: "SEPARATE_TRAINING_WINDOWS_MAY_OVERLAP_NOT_ONE_ACCOUNT",
      folds: [...folds].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal).map(row => {
        const fold = CurrentSourceFoldPayloadSchema.parse(row.payload), facts = fold.fold_facts;
        return { source_ordinal: row.sourceOrdinal, fold_id: fold.fold_id,
          start_utc_ms: fold.train_start_utc_ms, last_bar_utc_ms: fold.train_end_utc_ms,
          bounds_semantics: "FIRST_AND_LAST_ACTUAL_TRAINING_BAR_INCLUSIVE",
          observation_count: facts?.train_bars ?? null, is_sharpe: facts?.oos_score?.is_sharpe ?? null,
          is_sharpe_raw: facts?.oos_score?.is_sharpe_raw ?? null, is_trade_count: facts?.oos_score?.is_trade_count ?? null,
          source_ref: "RETAINED_FOLD_IS_FACTS_V1",
          curve: absent("WFO_RETAINED_FOLD_HAS_NO_SEPARATE_IS_ACCOUNT_CURVE"),
        };
      }),
    } : absent("RETAINED_NO_IN_SAMPLE_WINDOW_FACTS"),
    holdout: protocol ? account : absent("WFO_PROTOCOL_HAS_NO_INDEPENDENT_HOLDOUT", "NOT_APPLICABLE"),
  });
}
