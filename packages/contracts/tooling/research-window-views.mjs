/** Generated additive Overview read model. Existing immutable inputs stay intact. */
const object = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const ms = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const decimal = { type: "string", pattern: "^-?(?:0|[1-9][0-9]*)(?:\\.[0-9]+)?$", maxLength: 96 };
export const windowViewComponents = {
  WindowViewAbsence: object({ kind: { const: "ABSENT" }, state: { enum: ["NOT_PUBLISHED", "NOT_APPLICABLE"] },
    reason_code: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" } }),
  WindowAccountView: object({ kind: { const: "ACCOUNT_REPLAY" }, state: { const: "AVAILABLE" }, reason_code: { type: "null" },
    source_ref: { const: "RETAINED_WINDOW_ACCOUNT_V1" },
    metric_policy: { const: "DISPLAY_POINTS_ARE_NOT_A_FULL_METRIC_POPULATION" } }),
  WindowFoldFacts: object({ kind: { const: "FOLD_FACTS" }, state: { const: "AVAILABLE" }, reason_code: { type: "null" },
    aggregation: { const: "SEPARATE_TRAINING_WINDOWS_MAY_OVERLAP_NOT_ONE_ACCOUNT" },
    folds: { type: "array", minItems: 1, maxItems: 256, items: object({
      source_ordinal: { type: "integer", minimum: 0, maximum: 255 }, fold_id: { type: "string", minLength: 1, maxLength: 160 },
      start_utc_ms: nullable(ms), last_bar_utc_ms: nullable(ms),
      bounds_semantics: { const: "FIRST_AND_LAST_ACTUAL_TRAINING_BAR_INCLUSIVE" },
      observation_count: nullable({ type: "integer", minimum: 0, maximum: 2_000_000 }),
      is_sharpe: nullable(decimal), is_sharpe_raw: nullable(decimal), is_trade_count: nullable(decimal),
      source_ref: { const: "RETAINED_FOLD_IS_FACTS_V1" }, curve: ref("WindowViewAbsence"),
    }) } }),
  WindowViews: object({ schema_version: { const: "research.current-source-window-views.v1" },
    is: { oneOf: [ref("WindowAccountView"), ref("WindowFoldFacts"), ref("WindowViewAbsence")] },
    holdout: { oneOf: [ref("WindowAccountView"), ref("WindowViewAbsence")] } }),
};
