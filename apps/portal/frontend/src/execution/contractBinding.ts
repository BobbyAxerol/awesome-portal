/**
 * C-PI04-01 — compile-time binding to the generated contracts.
 *
 * The readers in this folder take `unknown` and narrow, which is the right
 * shape for a boundary: a malformed document must produce `null`, not a crash.
 * The cost is that they cannot catch a RENAME. `str(body.missed_events)`
 * compiles perfectly after the field becomes `missed_event_count`, and returns
 * null forever.
 *
 * So the field names each reader depends on are pinned here against the
 * generated declarations. Nothing in this file runs. If codex renames a field,
 * regenerating the declarations makes `tsc` fail on the assertion below that
 * names it — at build time, in the frontend, with the field in the error.
 *
 * Only fields a reader actually reads are listed. A pin on a field nobody uses
 * is a false alarm waiting to happen, and would train the next person to delete
 * assertions here rather than fix the reader.
 */
import type { components as Realtime } from "@portal/contracts-realtime";
import type { components as Analytics } from "@portal/contracts-analytics";
import type { components as Governance } from "@portal/contracts-governance";
import type { components as CommandCenter } from "@portal/contracts-command-center";

/** Fails to compile unless `K` is a key of `T`. */
type Requires<T, K extends keyof T> = K;

/* --------------------------------------------------------------------------
 * Realtime — subscription.ts / sse.ts
 * ------------------------------------------------------------------------ */

type Gap = Realtime["schemas"]["ProjectionGapEvent"];

export type _GapFields = Requires<
  Gap,
  | "reason"
  | "last_good_cursor"
  | "missed_events"
  // Added by PRE-IAM-04 and consumed by C-PI04-02. Pinned because the whole
  // cursor_ahead recovery reads the first of these and the resnapshot target
  // reads the third.
  | "latest_available_sequence"
  | "earliest_available_sequence"
  | "active_epoch_id"
  | "resnapshot_not_before"
>;

/* --------------------------------------------------------------------------
 * Analytics — analytics.ts
 * ------------------------------------------------------------------------ */

export type _FunnelFields = Requires<
  Analytics["schemas"]["OrderFunnelData"],
  "order_id" | "stages" | "event_count" | "returned_event_count" | "has_more" | "window"
>;

export type _FunnelStageFields = Requires<
  Analytics["schemas"]["FunnelStage"],
  "stage" | "state" | "events" | "event_count" | "returned_event_count" | "truncated"
>;

export type _LedgerFields = Requires<
  Analytics["schemas"]["CapitalLedgerData"],
  "portfolio_id" | "buckets" | "entry_count" | "returned_entry_count" | "has_more" | "window"
>;

export type _PreviewFields = Requires<
  Analytics["schemas"]["CapitalPreviewData"],
  // The screen names these pairs; it never subtracts one from another. Pinned
  // so a rename cannot silently blank a money line.
  | "portfolio_id"
  | "currency"
  | "requested_amount"
  | "allocated_before"
  | "allocated_after"
  | "available_before"
  | "available_after"
  | "allocation_headroom_before"
  | "allocation_headroom_after"
>;

export type _InsightFields = Requires<
  Analytics["schemas"]["InsightBatchData"],
  "portfolio_id" | "items" | "requested_count" | "ready_count" | "error_count"
>;

export type _ExposureFields = Requires<
  Analytics["schemas"]["BindingExposureData"],
  "binding_id" | "buckets" | "account_count" | "expected_account_count" | "population_completeness"
>;

export type _CorrelationFields = Requires<
  Analytics["schemas"]["CorrelationData"],
  "portfolio_id" | "labels" | "clusters" | "representation"
>;

/* --------------------------------------------------------------------------
 * Governance — api/rows.ts, Paper Exit
 * ------------------------------------------------------------------------ */

export type _EligibilityFields = Requires<
  // The bundled governance declaration contains two schemas named
  // `Eligibility`: the unprefixed one belongs to the R1 approval workflow,
  // while Paper Exit is emitted as `$defs-Eligibility`.
  Governance["schemas"]["$defs-Eligibility"],
  // Five capabilities, not three. The two Paper Exit ones were the gap that
  // let extend and reject render as unconditionally safe.
  | "can_approve"
  | "can_approve_with_condition"
  | "can_deny"
  | "can_extend_observation"
  | "can_reject"
  | "separation_of_duties"
>;

export type _PaperExitPlanFields = Requires<
  Governance["schemas"]["PaperExitDecisionPlanRequest"],
  "schema_version" | "workspace_id" | "request_key" | "command_type" | "target" | "expected_review_version" | "payload"
>;

export type _DecisionFields = Requires<
  Governance["schemas"]["Decision"],
  "outcome" | "extension_days" | "resulting_state" | "review_version_before" | "review_version_after"
>;

/* --------------------------------------------------------------------------
 * Command Center — commandCenter.ts
 * ------------------------------------------------------------------------ */

export type _TriageFields = Requires<
  CommandCenter["schemas"]["TriageItem"],
  "id" | "kind" | "title" | "summary" | "severity" | "sla_state" | "href" | "action_label" | "rank"
>;

export type _NeedsYouFields = Requires<
  CommandCenter["schemas"]["NeedsYouPanel"],
  | "panel_state"
  | "authority"
  | "freshness_state"
  // The three that make a bounded count honest.
  | "exact_total"
  | "total_count"
  | "observed_total_count"
  | "returned_count"
  | "truncated"
  | "items"
>;

export type _PinFields = Requires<
  CommandCenter["schemas"]["Pin"],
  "slot" | "entity_id" | "label" | "href" | "target_label" | "target_state" | "target_authority" | "target_freshness_state"
>;

export type _FleetCellFields = Requires<
  CommandCenter["schemas"]["FleetCell"],
  "code" | "label" | "value" | "href"
>;
