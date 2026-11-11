/**
 * V2 manager reader, part 2: the manager DATASET body
 * (`portal.execution.manager-dataset.v1`, `components/schemas/ManagerDataset` of
 * `packages/contracts/openapi/execution-manager-models.openapi.json`; answered by
 * `executionManagerFundOverviewGetV1`, `...FleetGetV1`, `...Portfolio360GetV1`, `...Alpha360GetV1`,
 * `...Account360GetV1`, `...Deployment360GetV1`).
 *
 * What it reads: the envelope (surface, environment, authorities, clocks, quality), `selected_window`,
 * `query_options` (closed enums, the sort/metric/group/partition consistency the schema writes as `allOf`),
 * the `page` and cursor envelope, `items` (rows, children, metrics, per-partition metrics), `groups`,
 * `capital_statements` and `statement_scope`, the four `scores` slots, `funding_bucket_pnl` and `lineage`.
 *
 * What it does NOT read: `score_details`, `composition_details`, `regime_details` (the score, composition and regime
 * publications, other families). They are optional in the schema; here they are accepted only as bounded arrays of
 * objects with the right `slot`, COUNTED (`unreadDetails`) and never surfaced (named looser group MD-L1). The
 * `ManagerScorePublication`, `ManagerCompositionPublication`, `ManagerRegimePublication` and the score-revision
 * bodies are not covered.
 *
 * FE-CAT-3 (the Fleet ALL lens): `environment: "ALL"` is NAVIGATION across separately authorized environments, never consolidated
 * money. An ALL body carries `environment_coverage` (one typed entry per environment: INCLUDED with its own snapshot, clocks, quality
 * and counts, or UNAVAILABLE with a closed reason) and every row names its own environment. The reader refuses an ALL-shaped key on a
 * single-environment body and a single-environment body that claims ALL; it never sums, joins or re-labels anything across environments.
 *
 * Boundary rules (consumer-review-2026-10-18, review2/04 and 06):
 * - the body is `unknown` until every check passes. One bad row, metric, partition or group voids the whole read;
 *   a silently dropped row would make a count or a fleet table a lie. There is no partial trust;
 * - a readable body of another `schema_version` is `unsupported_shape`, never fed to this reader's types;
 * - money and every other figure is an exact decimal STRING (see managerMetric.ts). Times are safe-integer UTC
 *   epoch milliseconds, never ISO strings;
 * - `ALL` is never a window: `selected_window.requested === "ALL"` has `resolved: null` and reason
 *   `ALL_HISTORY_WINDOW_NOT_PUBLISHED`, and reads as `{kind: "gap"}`, a state with no `fromMs`/`toMs` to draw;
 * - there is no cross-currency total: partitions stay separate and in published order, a figure inside a partition
 *   cannot name another currency, and a row-level money figure that names a currency IS one partition's figure (MD-S5,
 *   identity, the producer's MD-8), never a sum; a partition's identity is its domain, currency, basis and native profile;
 * - `current_stage` is the producer's scalar (BE-P4): the reader never derives a stage, an entry time or a day count, it
 *   only refuses a published combination the clocks and the stage set contradict (MD-S13);
 * - an absent metric, score or window is a typed absence with its reason, never `0`; an unknown word is a refusal,
 *   never a success state;
 * - the contract is closed: a key the schema does not name voids the read; sizes are bounded.
 *
 * The result of `readManagerDataset(raw)` is the typed read, `unsupported_shape` for a readable body of another
 * schema, or `null` for a malformed body. It never throws.
 */
import type { UtcEpochMs } from "../../screenDataContract";
import {
  boundedCount,
  clockMs,
  exactValue,
  hasAll,
  hasOnly,
  managerText,
  nullableText,
  oneOf,
  readMsWindow,
  readPartitionedMetricsList,
  readManagerMetric,
  readManagerQuality,
  record,
  type ManagerEconomicDomain,
  type ManagerMetricRead,
  type ManagerPartitionedMetrics,
  type ManagerQuality,
  type MsWindow,
} from "./managerMetric";

export const MANAGER_DATASET_SCHEMA = "portal.execution.manager-dataset.v1";

export const MANAGER_SURFACES = ["FUND", "FLEET", "PORTFOLIO", "ALPHA", "ACCOUNT", "DEPLOYMENT"] as const;
export type ManagerSurface = (typeof MANAGER_SURFACES)[number];
export const MANAGER_ENVIRONMENTS = ["paper", "sandbox", "live"] as const;
export type ManagerEnvironment = (typeof MANAGER_ENVIRONMENTS)[number];
/** `ALL` is the Fleet-only fan-out (FE-CAT-3). Every other read pins one environment. */
export const MANAGER_ALL = "ALL" as const;
export type ManagerEnvironmentScope = ManagerEnvironment | typeof MANAGER_ALL;
/** The economic domain every partition of an environment carries (the store's rule: live is ACTUAL). */
export const ENVIRONMENT_DOMAIN: Readonly<Record<ManagerEnvironment, ManagerEconomicDomain>> = { paper: "PAPER", sandbox: "SANDBOX", live: "ACTUAL" };
/** Why an environment contributed nothing to an ALL read (closed; `NOT_AVAILABLE_TO_VIEWER` merges "no grant" with "nothing visible"). */
export const MANAGER_COVERAGE_REASONS = [
  "NOT_AVAILABLE_TO_VIEWER", "NOT_CONFIGURED", "POLICY_PENDING", "PUBLICATION_NOT_QUALIFIED", "SOURCE_UNAVAILABLE", "CHANGED_DURING_READ", "SCOPE_LIMIT_EXCEEDED",
] as const;
export type ManagerCoverageReason = (typeof MANAGER_COVERAGE_REASONS)[number];
export const MANAGER_STAGES = ["PAPER", "SANDBOX", "CANARY", "LIVE"] as const;
export type ManagerStage = (typeof MANAGER_STAGES)[number];

/** `query_options.metric_keys` / `items[].metrics` property names: the closed enum of the schema. */
export const MANAGER_METRIC_KEYS = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score"] as const;
export type ManagerMetricKey = (typeof MANAGER_METRIC_KEYS)[number];
/** `economic_partition_required_for`: the five money-bearing keys. */
export const MANAGER_PARTITIONED_METRIC_KEYS = ["allocation", "net_pnl", "unrealized_pnl", "balance_total", "equity_30d_end_value"] as const;
export type ManagerPartitionedMetricKey = (typeof MANAGER_PARTITIONED_METRIC_KEYS)[number];
/** `window.independent_metrics`. */
export const MANAGER_INDEPENDENT_WINDOW_KEYS = ["allocation", "balance_total", "unrealized_pnl"] as const;
export const MANAGER_GROUP_FIELDS = ["portfolio_id", "owner_user_id", "alpha_id", "stage_presence", "current_stage", "venue", "health", "source_state", "lifecycle"] as const;
export type ManagerGroupField = (typeof MANAGER_GROUP_FIELDS)[number];
export const MANAGER_SORT_FIELDS = [
  "alpha_id", "alpha_version_id", "name", "owner_user_id", "portfolio_id", "lifecycle", "venue", "health", "source_state", "allocation", "net_pnl",
  "unrealized_pnl", "balance_total", "equity_30d_end_value", "return_30d_pct", "score", "stage_presence", "current_stage",
] as const;
export type ManagerSortField = (typeof MANAGER_SORT_FIELDS)[number];
export const MANAGER_WINDOW_PRESETS = ["7D", "30D", "90D"] as const;

export const ALL_HISTORY_WINDOW_NOT_PUBLISHED = "ALL_HISTORY_WINDOW_NOT_PUBLISHED";
export const EXACT_METRIC_WINDOW_NOT_PUBLISHED = "EXACT_METRIC_WINDOW_NOT_PUBLISHED";
const WINDOW_REASONS = [EXACT_METRIC_WINDOW_NOT_PUBLISHED, ALL_HISTORY_WINDOW_NOT_PUBLISHED] as const;
export const MANAGER_STATEMENT_SCOPE = "AUTHORIZED_RESOURCE_SELECTED_STAGES_BEFORE_TABLE_FILTERS";

/** Row `stage_lifecycle_reasons.current_stage`: why the row has no single stage (closed). */
export const CURRENT_STAGE_REASONS = ["MULTIPLE_ACTIVE_STAGES", "STAGE_FIELD_NOT_PUBLISHED"] as const;
export type CurrentStageReason = (typeof CURRENT_STAGE_REASONS)[number];
/** The one reason `entered_at_ms` / `days_in_stage` carry today, and `stage_lifecycle.entry_time`. */
export const STAGE_ENTRY_TIME_NOT_PUBLISHED = "STAGE_ENTRY_TIME_NOT_PUBLISHED";
/** `stage_lifecycle.entry_time` once the producer binds exact snapshot transitions (Codex 82947ceb2): rows then carry the entry time where a transition fact binds, and keep the absence where none does. */
export const STAGE_TIMING_PUBLISHED = "EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED";
/** Milliseconds per day: `days_in_stage == floor((as_of_ms - entered_at_ms) / MS_PER_DAY)` (BE-P4, producer rule). */
export const MS_PER_DAY = 86_400_000;
/** Schema `days_in_stage` maximum. */
export const MAX_DAYS_IN_STAGE = 10_000_000;
/** Response root constant `stage_lifecycle` (BE-P4): what `current_stage` means, printable as a caption. */
export const MANAGER_STAGE_LIFECYCLE = {
  currentStageRule: "SINGLE_ACTIVE_MEMBER_STAGE_IN_SELECTED_ENVIRONMENT",
  covers: "DEPLOYED_STAGES_OF_SELECTED_ENVIRONMENT_ONLY",
  entryTime: STAGE_ENTRY_TIME_NOT_PUBLISHED,
} as const;

/** Schema `items` maxItems / `page.limit` maximum / `groups` maxItems. */
export const MAX_ITEMS = 200;
export const MAX_GROUPS = 200;
/** Package 5: the most groups one query can have (10k authorized rows, at most four stage memberships each). */
export const MAX_GROUP_POPULATION = 40_000;
/** Schema `children` maxItems per row. */
export const MAX_CHILDREN_PER_ROW = 10_000;
/**
 * READER BOUND, not a schema fact: the most children one body may carry in all. The route promises at most
 * `maximum_response_bytes` = 1 MiB and a child is over 100 bytes, so more than this cannot be one honest body (MD-S8).
 */
export const MAX_CHILDREN_TOTAL = 10_000;
/** Schema `page.authorized_filtered_count` maximum; `groups[].unique_row_count` maximum. */
export const MAX_FILTERED_COUNT = 10_000;
/** Schema `page.*_cursor` maxLength. */
export const MAX_CURSOR = 4096;
/** Schema `dataset.quality.reasons` maxItems. */
export const MAX_DATASET_REASONS = 32;
/** Schema `score_details` / `composition_details` / `regime_details` maxItems. */
export const MAX_DETAILS = 128;
/** The route's promise (`query_policy.maximum_response_bytes`), read as a constant. */
export const MAX_RESPONSE_BYTES = 1_048_576;
/** `snapshot_id` and `lineage.*`: the schema pins them to `^sha256:[a-f0-9]{64}$`. */
const SHA256_REF = /^sha256:[a-f0-9]{64}$/;
const digestRef = (value: unknown): string | null => (typeof value === "string" && SHA256_REF.test(value) ? value : null);

/* ───────────────────────── types ───────────────────────── */

/** `selected_window`. `ALL` is a gap, never a window: it has no bounds to draw. */
export type ManagerSelectedWindow =
  | { kind: "window"; requested: "7D" | "30D" | "90D" | MsWindow; resolved: MsWindow }
  | { kind: "gap"; requested: "ALL"; reasonCode: typeof ALL_HISTORY_WINDOW_NOT_PUBLISHED };

export interface ManagerWindowPreset {
  value: "7D" | "30D" | "90D" | "ALL";
  /** `null` when the window is not published for the preset; never an invented range. */
  resolved: MsWindow | null;
  dataState: "METRIC_SPECIFIC" | "NOT_PUBLISHED";
  reasonCode: string | null;
}

export interface ManagerQueryOptions {
  temporalMode: "CURRENT_ONLY";
  search: { fields: readonly "name"[]; modes: readonly ("PREFIX" | "CONTAINS")[] };
  sortFields: readonly ManagerSortField[];
  groupFields: readonly ManagerGroupField[];
  /** The metric keys rows carry: exactly the set `items[].metrics` must hold. */
  metricKeys: readonly ManagerMetricKey[];
  economicPartitionRequiredFor: readonly ManagerPartitionedMetricKey[];
  window: {
    customSupported: true;
    independentMetrics: readonly (typeof MANAGER_INDEPENDENT_WINDOW_KEYS)[number][];
    presets: readonly ManagerWindowPreset[];
  };
  /** Fields the contract states it cannot publish, with the published reason (BE-P4: the two stage-entry fields). */
  unavailableFields: readonly { field: "days_in_stage" | "entered_at_ms"; reasonCode: typeof STAGE_ENTRY_TIME_NOT_PUBLISHED }[];
}

export interface ManagerPage {
  limit: number;
  returnedCount: number;
  authorizedFilteredCount: number;
  /** Opaque, bound to the filter by the server. `null` is "no further page". */
  nextCursor: string | null;
  previousCursor: string | null;
}

export interface ManagerRowChild {
  alphaId: string;
  alphaVersionId: string;
  portfolioId: string;
  deploymentId: string;
  accountId: string;
  stage: ManagerStage;
  bindingRef: string | null;
  /**
   * BE-B1: the UTC time this deployment's allocation took effect, from the allocation facts of exactly this deployment when they all state one time.
   * ABSENT (the property is not there) = not published: never inferred from the capital ledger, the row or the partition figure here.
   */
  allocationEffectiveAtMs?: UtcEpochMs;
}

export type ManagerRowMetrics = Readonly<Partial<Record<ManagerMetricKey, ManagerMetricRead>>>;

/** One environment's part in an ALL read. INCLUDED carries its own facts; UNAVAILABLE carries a reason and nothing else (never a count). */
export type ManagerEnvironmentCoverage =
  | {
    environment: ManagerEnvironment; availability: "INCLUDED"; snapshotId: string; asOfMs: UtcEpochMs; recordedThroughMs: UtcEpochMs;
    factsThroughMs: UtcEpochMs | null; quality: ManagerQuality; authorizedFilteredCount: number; returnedCount: number;
  }
  | { environment: ManagerEnvironment; availability: "UNAVAILABLE"; reasonCode: ManagerCoverageReason };

export interface ManagerRow {
  rowKey: string;
  /** ALL reads only: the environment this row belongs to (absent on a single-environment read, whose environment is the dataset's). */
  environment?: ManagerEnvironment;
  alphaId: string;
  alphaVersionId: string;
  portfolioId: string;
  name: string | null;
  ownerUserId: string | null;
  lifecycle: string | null;
  venue: string | null;
  health: string | null;
  sourceState: string | null;
  /** A set, in published (lexical) order: not a risk rank (`query_policy.stage_order`). */
  stagePresence: readonly ManagerStage[];
  /**
   * The ONE deployed stage of this row in the selected environment, or `null` (see `stageLifecycleReasons.currentStage`
   * for why). Read before any stage filter; not a rank. Never derived here from `stagePresence`.
   */
  currentStage: ManagerStage | null;
  /** `null` is "not published" (BE-P4: always, until a stage-transition source lands), never 0 or "now". */
  enteredAtMs: UtcEpochMs | null;
  /** Whole days, `null` is "not published" (never 0). Never derived from `valid_from_ms` or a decision date. */
  daysInStage: number | null;
  /** A reason exactly when its value is `null`. */
  stageLifecycleReasons: {
    currentStage: CurrentStageReason | null;
    enteredAtMs: typeof STAGE_ENTRY_TIME_NOT_PUBLISHED | null;
    daysInStage: typeof STAGE_ENTRY_TIME_NOT_PUBLISHED | null;
  };
  children: readonly ManagerRowChild[];
  /** Exactly the keys of `queryOptions.metricKeys`. */
  metrics: ManagerRowMetrics;
  /** Per-partition figures; the only place a money figure is complete (see `economicPartitionRequiredFor`). */
  economicPartitions: readonly ManagerPartitionedMetrics[];
}

/** Package 5: who an alpha group is, from the same authorized group (never a join to the row page). A null name or owner carries its reason. */
export interface ManagerGroupAttribution {
  alphaId: string;
  name: string | null;
  ownerUserId: string | null;
  nameReasonCode: "GROUP_NAME_NOT_PUBLISHED" | "GROUP_NAME_AMBIGUOUS" | null;
  ownerReasonCode: "GROUP_OWNER_NOT_PUBLISHED" | "GROUP_OWNER_AMBIGUOUS" | null;
}

export interface ManagerGroup {
  /** Present only on a group keyed by alpha_id, when the producer publishes it. */
  attribution?: ManagerGroupAttribution;
  key: readonly { field: ManagerGroupField; value: string | null }[];
  uniqueRowCount: number;
  totalsScope: "FULL_AUTHORIZED_FILTERED_QUERY";
  economicPartitions: readonly ManagerPartitionedMetrics[];
}

export type ManagerScoreSlotStatus =
  | "policy_pending" | "available" | "provisional" | "unbound" | "invalid_data" | "stale" | "partial_costs" | "partial_components"
  | "insufficient_data" | "window_not_published" | "partial_coverage" | "incomparable_basis" | "no_allocation";

/** A score slot: a value only for `available` / `provisional`; everything else is a typed absence, never `0`. */
export type ManagerScoreSlot =
  | { kind: "value"; status: "available" | "provisional"; exact: string; zero: boolean; provisional: boolean }
  | { kind: "absent"; status: ManagerScoreSlotStatus; reasonCode: string | null };

export interface ManagerScores {
  raw: ManagerScoreSlot;
  composition: ManagerScoreSlot;
  directNav: ManagerScoreSlot;
  /** The regime slot never carries a value on a dataset. */
  regime: { kind: "absent"; status: string; reasonCode: string | null };
  reasonCode: string;
  calculationPath: "PRECOMPUTED_ONLY";
}

/** WP-K slice 6: what the server applied to the GROUPS (present only when a group sort or filter was asked). */
export interface ManagerGroupQuery {
  sort: readonly { metricKey: string; direction: "asc" | "desc" }[];
  filters: readonly { metricKey: string; op: "GTE" | "LTE" | "IS_NULL"; value: string | null }[];
  /** Which partition each group's metric was read in: the pinned one, or the group's only one (several partitions and no pin = no comparable value). */
  partitionBasis: "PINNED_PARTITION" | "SINGLE_PARTITION_ONLY";
  groupsBeforeFilter: number;
  groupsReturned: number;
}

export interface ManagerDataset {
  /** Present only when the query named a group sort or filter. */
  groupQuery?: ManagerGroupQuery;
  /** Package 5: where this page of groups sits in all authorized filtered groups (cursors are opaque, bound to the query). Absent = the producer does not page groups. */
  groupPage?: ManagerPage;
  /** True when the producer publishes stage timing (`entry_time` EXACT_SNAPSHOT_TRANSITION_WHEN_PUBLISHED): a row's `enteredAtMs` / `daysInStage` are then the snapshot-bound transition, or the typed absence on a row no fact binds. Absent = the legacy pin. */
  stageTimingPublished?: true;
  surface: ManagerSurface;
  workspaceId: string;
  /** What `currentStage` means (constants of the response, BE-P4); print them, do not re-derive them. */
  stageLifecycle: typeof MANAGER_STAGE_LIFECYCLE;
  environment: ManagerEnvironmentScope;
  /** ALL reads only (absent otherwise): exactly paper, sandbox, live, in that order. A missing environment is typed here, never absent. */
  environmentCoverage?: readonly ManagerEnvironmentCoverage[];
  snapshotId: string;
  asOfMs: UtcEpochMs;
  recordedThroughMs: UtcEpochMs;
  /** `null` is "the source states no facts clock", not "now". */
  factsThroughMs: UtcEpochMs | null;
  quality: ManagerQuality;
  /** `null` is "no window was requested"; see `ManagerSelectedWindow` for ALL. */
  selectedWindow: ManagerSelectedWindow | null;
  queryOptions: ManagerQueryOptions;
  page: ManagerPage;
  items: readonly ManagerRow[];
  groups: readonly ManagerGroup[];
  /** Capital figures per partition, before the table filters (`statementScope`). Never totalled across partitions. */
  capitalStatements: readonly ManagerPartitionedMetrics[];
  statementScope: typeof MANAGER_STATEMENT_SCOPE;
  scores: ManagerScores;
  fundingBucketPnl: { kind: "absent"; reasonCode: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" };
  lineage: { reducerRevision: "manager-model.v1"; sourceSetRef: string; revision: string; supersedesRevision: string | null };
  /** Counts of the details arrays this reader accepted without reading their content. */
  unreadDetails: { scoreDetails: number; compositionDetails: number; regimeDetails: number };
  /** True when `next_cursor` names a further page. */
  hasMore: boolean;
}

/** What a reader hands back for a readable body that is not this schema. */
export interface UnsupportedManagerShape {
  kind: "unsupported_shape";
  schemaVersion: string | null;
}

export type ManagerDatasetRead = { kind: "dataset"; dataset: ManagerDataset } | UnsupportedManagerShape;

/* ───────────────────────── readers ───────────────────────── */

const ROOT_REQUIRED = [
  "schema_version", "selected_window", "query_options", "surface", "workspace_id", "stage_lifecycle", "environment", "record_authority", "source_authority",
  "snapshot_id", "as_of_ms", "recorded_through_ms", "facts_through_ms", "quality", "coverage", "economic_aggregation", "query_policy", "page",
  "items", "groups", "capital_statements", "statement_scope", "scores", "funding_bucket_pnl", "lineage",
] as const;
const ROOT_OPTIONAL = ["score_details", "composition_details", "regime_details", "environment_coverage", "group_query", "group_page"] as const;

const ENVIRONMENT_STAGES: Readonly<Record<ManagerEnvironment, readonly ManagerStage[]>> = {
  paper: ["PAPER"],
  sandbox: ["SANDBOX"],
  live: ["CANARY", "LIVE"],
};

function uniqueEnumList<T extends string>(raw: unknown, allowed: readonly T[], max: number): readonly T[] | null {
  if (!Array.isArray(raw) || raw.length > max) return null;
  const out: T[] = [];
  for (const entry of raw) {
    const word = oneOf(entry, allowed);
    if (word === null || out.includes(word)) return null;
    out.push(word);
  }
  return out;
}

const sameSet = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((word) => b.includes(word));
const intersect = <T extends string>(universe: readonly T[], within: readonly string[]): readonly T[] => universe.filter((word) => within.includes(word));
const isConst = (value: unknown, expected: unknown): boolean => JSON.stringify(value) === JSON.stringify(expected);

/**
 * `selected_window`. `ALL` has `resolved: null` and reason `ALL_HISTORY_WINDOW_NOT_PUBLISHED`: a GAP, never a window.
 * Any other request has a resolved window and no reason. `null` (anyOf) is "no window requested".
 */
export function readManagerSelectedWindow(raw: unknown): ManagerSelectedWindow | null | undefined {
  if (raw === null) return null;
  const window = record(raw);
  const keys = ["requested", "resolved", "selection_basis", "reason_code"] as const;
  if (window === null || !hasOnly(window, keys) || !hasAll(window, keys) || window.selection_basis !== "EXACT_PUBLISHED_METRIC_WINDOW_ONLY") return undefined;
  if (window.requested === "ALL") {
    return window.resolved === null && window.reason_code === ALL_HISTORY_WINDOW_NOT_PUBLISHED
      ? { kind: "gap", requested: "ALL", reasonCode: ALL_HISTORY_WINDOW_NOT_PUBLISHED }
      : undefined;
  }
  const preset = oneOf(window.requested, MANAGER_WINDOW_PRESETS);
  const requested = preset ?? readMsWindow(window.requested);
  const resolved = readMsWindow(window.resolved);
  if (requested === null || resolved === null || window.reason_code !== null) return undefined;
  return { kind: "window", requested, resolved };
}

function readPreset(raw: unknown, expected: ManagerWindowPreset["value"]): ManagerWindowPreset | null {
  const preset = record(raw);
  const keys = ["value", "resolved", "data_state", "reason_code"] as const;
  if (preset === null || !hasOnly(preset, keys) || !hasAll(preset, keys) || preset.value !== expected) return null;
  const dataState = oneOf(preset.data_state, ["METRIC_SPECIFIC", "NOT_PUBLISHED"] as const);
  if (dataState === null) return null;
  const resolved = preset.resolved === null ? null : readMsWindow(preset.resolved);
  if (preset.resolved !== null && resolved === null) return null;
  const reasonCode = preset.reason_code === null ? null : oneOf(preset.reason_code, WINDOW_REASONS);
  if (preset.reason_code !== null && reasonCode === null) return null;
  if (dataState === "METRIC_SPECIFIC") {
    // A published window has bounds and no reason.
    if (resolved === null || reasonCode !== null) return null;
  } else if (reasonCode === null || resolved !== null) {
    // A window the source does not publish names why, and has no bounds (the schema allows bounds here; MD-S9).
    return null;
  }
  if (expected === "ALL" && (resolved !== null || reasonCode !== ALL_HISTORY_WINDOW_NOT_PUBLISHED)) return null;
  return { value: expected, resolved, dataState, reasonCode };
}

function readQueryOptions(raw: unknown): ManagerQueryOptions | null {
  const options = record(raw);
  const keys = [
    "temporal_mode", "search", "sort_fields", "group_fields", "metric_keys", "economic_partition_required_for", "window", "stage_environment",
    "unavailable_fields",
  ] as const;
  if (options === null || !hasOnly(options, keys) || !hasAll(options, keys) || options.temporal_mode !== "CURRENT_ONLY") return null;

  // search: closed; the constants are checked, not surfaced.
  const search = record(options.search);
  const searchKeys = ["fields", "modes", "maximum_text_length", "normalization"] as const;
  if (search === null || !hasOnly(search, searchKeys) || !hasAll(search, searchKeys)) return null;
  if (search.maximum_text_length !== 160 || search.normalization !== "JS_TO_LOWER_CASE_NO_UNICODE_NORMALIZATION") return null;
  const searchFields = uniqueEnumList(search.fields, ["name"] as const, 1);
  const searchModes = uniqueEnumList(search.modes, ["PREFIX", "CONTAINS"] as const, 2);
  if (searchFields === null || searchModes === null) return null;
  // Schema allOf: no search field means no mode; a search field means both modes.
  if (searchFields.length === 0 ? searchModes.length !== 0 : searchModes.length !== 2) return null;

  const sortFields = uniqueEnumList(options.sort_fields, MANAGER_SORT_FIELDS, MANAGER_SORT_FIELDS.length);
  const groupFields = uniqueEnumList(options.group_fields, MANAGER_GROUP_FIELDS, MANAGER_GROUP_FIELDS.length);
  const metricKeys = uniqueEnumList(options.metric_keys, MANAGER_METRIC_KEYS, MANAGER_METRIC_KEYS.length);
  const required = uniqueEnumList(options.economic_partition_required_for, MANAGER_PARTITIONED_METRIC_KEYS, MANAGER_PARTITIONED_METRIC_KEYS.length);
  if (sortFields === null || groupFields === null || metricKeys === null || required === null) return null;
  // Schema allOf, written once per key: a search field iff `name` is sortable; a metric key iff it is sortable; a group
  // field iff it is sortable; a partition requirement iff it is a metric key.
  if ((searchFields.length === 1) !== sortFields.includes("name")) return null;
  if (!sameSet(metricKeys, intersect(MANAGER_METRIC_KEYS, sortFields))) return null;
  if (!sameSet(groupFields, intersect(MANAGER_GROUP_FIELDS, sortFields))) return null;
  if (!sameSet(required, intersect(MANAGER_PARTITIONED_METRIC_KEYS, metricKeys))) return null;

  const window = record(options.window);
  const windowKeys = ["custom_supported", "interpretation", "independent_metrics", "presets"] as const;
  if (window === null || !hasOnly(window, windowKeys) || !hasAll(window, windowKeys)) return null;
  if (window.custom_supported !== true || window.interpretation !== "MATCH_ONLY_NO_READ_TIME_CALCULATION") return null;
  const independent = uniqueEnumList(window.independent_metrics, MANAGER_INDEPENDENT_WINDOW_KEYS, MANAGER_INDEPENDENT_WINDOW_KEYS.length);
  if (independent === null || !sameSet(independent, intersect(MANAGER_INDEPENDENT_WINDOW_KEYS, metricKeys))) return null;
  // Exactly the four presets, in order: 7D, 30D, 90D, ALL.
  if (!Array.isArray(window.presets) || window.presets.length !== 4) return null;
  const order = ["7D", "30D", "90D", "ALL"] as const;
  const presets: ManagerWindowPreset[] = [];
  for (const [index, entry] of window.presets.entries()) {
    const preset = readPreset(entry, order[index]!);
    if (preset === null) return null;
    presets.push(preset);
  }

  const stageEnvironment = [
    { environment: "paper", stages: ["PAPER"] },
    { environment: "sandbox", stages: ["SANDBOX"] },
    { environment: "live", stages: ["CANARY", "LIVE"] },
  ];
  if (!isConst(options.stage_environment, stageEnvironment)) return null;

  // BE-P4: `current_stage` is published; the two entry-time fields are the ones the contract cannot publish, in this order.
  // Both entry-time fields listed as unavailable (the legacy pin, and the published timing fixture), or none (a producer that states timing for every row).
  if (!Array.isArray(options.unavailable_fields) || (options.unavailable_fields.length !== 2 && options.unavailable_fields.length !== 0)) return null;
  const unavailableFields: { field: "days_in_stage" | "entered_at_ms"; reasonCode: typeof STAGE_ENTRY_TIME_NOT_PUBLISHED }[] = [];
  const expected = [["days_in_stage", STAGE_ENTRY_TIME_NOT_PUBLISHED], ["entered_at_ms", STAGE_ENTRY_TIME_NOT_PUBLISHED]] as const;
  for (const [index, entry] of options.unavailable_fields.entries()) {
    const field = record(entry);
    if (field === null || !hasOnly(field, ["field", "reason_code"]) || field.field !== expected[index]![0] || field.reason_code !== expected[index]![1]) return null;
    unavailableFields.push({ field: expected[index]![0], reasonCode: expected[index]![1] });
  }

  return {
    temporalMode: "CURRENT_ONLY",
    search: { fields: searchFields, modes: searchModes },
    sortFields,
    groupFields,
    metricKeys,
    economicPartitionRequiredFor: required,
    window: { customSupported: true, independentMetrics: independent, presets },
    unavailableFields,
  };
}

const COVERAGE_KEYS = [
  "environment", "availability", "reason_code", "snapshot_id", "as_of_ms", "recorded_through_ms", "facts_through_ms", "quality", "authorized_filtered_count", "returned_count",
] as const;

/** One `environment_coverage` entry: INCLUDED has every fact and no reason; UNAVAILABLE has a reason and every fact null (schema `if/then/else`). */
const GROUP_METRIC_KEY = /^[a-z][a-z0-9_]{1,63}$/;
const GROUP_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
/** GQ-1 one sort at most, eight filters at most, each operator once per metric, GTE / LTE carry an exact decimal and IS_NULL none, the counts add up. */
function readGroupQuery(raw: unknown): ManagerGroupQuery | null {
  const q = record(raw);
  if (q === null || !hasOnly(q, ["sort", "filters", "partition_basis", "groups_before_filter", "groups_returned"]) || !hasAll(q, ["sort", "filters", "partition_basis", "groups_before_filter", "groups_returned"])) return null;
  const basis = oneOf(q.partition_basis, ["PINNED_PARTITION", "SINGLE_PARTITION_ONLY"] as const);
  const count = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 && v <= MAX_GROUP_POPULATION ? v : null);
  const before = count(q.groups_before_filter);
  const returned = count(q.groups_returned);
  if (returned !== null && returned > MAX_GROUPS) return null;
  if (basis === null || before === null || returned === null || returned > before || !Array.isArray(q.sort) || q.sort.length > 1 || !Array.isArray(q.filters) || q.filters.length > 8) return null;
  const sort: { metricKey: string; direction: "asc" | "desc" }[] = [];
  for (const entry of q.sort) {
    const s = record(entry);
    const direction = s === null ? null : oneOf(s.direction, ["asc", "desc"] as const);
    if (s === null || !hasOnly(s, ["metric_key", "direction"]) || typeof s.metric_key !== "string" || !GROUP_METRIC_KEY.test(s.metric_key) || direction === null) return null;
    sort.push({ metricKey: s.metric_key, direction });
  }
  const filters: { metricKey: string; op: "GTE" | "LTE" | "IS_NULL"; value: string | null }[] = [];
  const seen = new Set<string>();
  for (const entry of q.filters) {
    const f = record(entry);
    const op = f === null ? null : oneOf(f.op, ["GTE", "LTE", "IS_NULL"] as const);
    if (f === null || !hasOnly(f, ["metric_key", "op", "value"]) || typeof f.metric_key !== "string" || !GROUP_METRIC_KEY.test(f.metric_key) || op === null) return null;
    const value = op === "IS_NULL" ? (f.value === undefined ? null : undefined) : typeof f.value === "string" && GROUP_DECIMAL.test(f.value) && f.value.length <= 128 ? f.value : undefined;
    if (value === undefined || seen.has(`${f.metric_key}:${op}`)) return null;
    seen.add(`${f.metric_key}:${op}`);
    filters.push({ metricKey: f.metric_key, op, value });
  }
  return { sort, filters, partitionBasis: basis, groupsBeforeFilter: before, groupsReturned: returned };
}

function readCoverageEntry(raw: unknown, expected: ManagerEnvironment): ManagerEnvironmentCoverage | null {
  const entry = record(raw);
  if (entry === null || !hasOnly(entry, COVERAGE_KEYS) || !hasAll(entry, COVERAGE_KEYS) || entry.environment !== expected) return null;
  const availability = oneOf(entry.availability, ["INCLUDED", "UNAVAILABLE"] as const);
  if (availability === "UNAVAILABLE") {
    const reasonCode = oneOf(entry.reason_code, MANAGER_COVERAGE_REASONS);
    const nulls = [entry.snapshot_id, entry.as_of_ms, entry.recorded_through_ms, entry.facts_through_ms, entry.quality, entry.authorized_filtered_count, entry.returned_count];
    return reasonCode === null || nulls.some((value) => value !== null) ? null : { environment: expected, availability, reasonCode };
  }
  if (availability !== "INCLUDED" || entry.reason_code !== null) return null;
  const snapshotId = digestRef(entry.snapshot_id);
  const asOfMs = clockMs(entry.as_of_ms);
  const recordedThroughMs = clockMs(entry.recorded_through_ms);
  const factsThroughMs = entry.facts_through_ms === null ? null : clockMs(entry.facts_through_ms);
  const quality = readManagerQuality(entry.quality, MAX_DATASET_REASONS);
  const authorizedFilteredCount = boundedCount(entry.authorized_filtered_count, MAX_FILTERED_COUNT);
  const returnedCount = boundedCount(entry.returned_count, MAX_ITEMS);
  if (
    snapshotId === null || asOfMs === null || recordedThroughMs === null || (entry.facts_through_ms !== null && factsThroughMs === null) || quality === null
    || authorizedFilteredCount === null || returnedCount === null || returnedCount > authorizedFilteredCount
  ) return null;
  return { environment: expected, availability, snapshotId, asOfMs, recordedThroughMs, factsThroughMs, quality, authorizedFilteredCount, returnedCount };
}

function readCoverage(raw: unknown): readonly ManagerEnvironmentCoverage[] | null {
  if (!Array.isArray(raw) || raw.length !== MANAGER_ENVIRONMENTS.length) return null;
  const out: ManagerEnvironmentCoverage[] = [];
  for (const [index, entry] of raw.entries()) {
    const read = readCoverageEntry(entry, MANAGER_ENVIRONMENTS[index]!);
    if (read === null) return null;
    out.push(read);
  }
  return out;
}

/** The ALL key of a row: environment first, then the single-environment key parts. One row of one environment. */
export const allRowKey = (environment: ManagerEnvironment, row: { alphaId: string; alphaVersionId: string; portfolioId: string }): string =>
  JSON.stringify([environment, row.alphaId, row.alphaVersionId, row.portfolioId]);

function readCursor(raw: unknown): string | null | undefined {
  return raw === null ? null : managerText(raw, MAX_CURSOR) ?? undefined;
}

function readPage(raw: unknown, bounds: { items: number; filtered: number } = { items: MAX_ITEMS, filtered: MAX_FILTERED_COUNT }): ManagerPage | null {
  const page = record(raw);
  const keys = ["limit", "returned_count", "authorized_filtered_count", "next_cursor", "previous_cursor"] as const;
  if (page === null || !hasOnly(page, keys) || !hasAll(page, keys)) return null;
  const limit = boundedCount(page.limit, bounds.items);
  const returnedCount = boundedCount(page.returned_count, bounds.items);
  const authorizedFilteredCount = boundedCount(page.authorized_filtered_count, bounds.filtered);
  const nextCursor = readCursor(page.next_cursor);
  const previousCursor = readCursor(page.previous_cursor);
  if (limit === null || limit < 1 || returnedCount === null || authorizedFilteredCount === null || nextCursor === undefined || previousCursor === undefined) return null;
  // Not in the schema (MD-S7, the producer's MD-1): a page holds at most `limit` rows and no more rows than the filtered
  // query has, and a NON-EMPTY page with no cursor either way IS the whole result, so its count is the total. Otherwise
  // "N of M" would be a lie. An EMPTY page is exempt (a valid `after` cursor on the last row answers 0 of M with no
  // cursor): the schema states the empty case exactly (no rows <=> returned_count 0).
  if (returnedCount > limit || returnedCount > authorizedFilteredCount) return null;
  if (returnedCount > 0 && nextCursor === null && previousCursor === null && returnedCount !== authorizedFilteredCount) return null;
  return { limit, returnedCount, authorizedFilteredCount, nextCursor, previousCursor };
}

const CHILD_KEYS = ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id", "stage", "binding_ref"] as const;
const CHILD_OPTIONAL_KEYS = ["allocation_effective_at_ms"] as const;

function readChild(raw: unknown, allowedStages: readonly ManagerStage[]): ManagerRowChild | null {
  const child = record(raw);
  if (child === null || !hasOnly(child, [...CHILD_KEYS, ...CHILD_OPTIONAL_KEYS]) || !hasAll(child, CHILD_KEYS)) return null;
  // Optional UTC-ms integer; present and invalid (a string, a fraction, a negative, null) voids the child, which voids the row.
  const hasAllocationTime = Object.prototype.hasOwnProperty.call(child, "allocation_effective_at_ms");
  const allocationEffectiveAtMs = hasAllocationTime ? clockMs(child.allocation_effective_at_ms) : null;
  if (hasAllocationTime && (allocationEffectiveAtMs === null || !Number.isSafeInteger(child.allocation_effective_at_ms))) return null;
  const alphaId = managerText(child.alpha_id);
  const alphaVersionId = managerText(child.alpha_version_id);
  const portfolioId = managerText(child.portfolio_id);
  const deploymentId = managerText(child.deployment_id);
  const accountId = managerText(child.account_id);
  const stage = oneOf(child.stage, allowedStages);
  const bindingRef = nullableText(child.binding_ref);
  if (alphaId === null || alphaVersionId === null || portfolioId === null || deploymentId === null || accountId === null || stage === null || bindingRef === undefined) return null;
  return { alphaId, alphaVersionId, portfolioId, deploymentId, accountId, stage, bindingRef, ...(allocationEffectiveAtMs === null ? {} : { allocationEffectiveAtMs }) };
}

const ROW_KEYS = [
  "row_key", "alpha_id", "alpha_version_id", "portfolio_id", "name", "owner_user_id", "lifecycle", "venue", "health", "source_state",
  "stage_presence", "current_stage", "entered_at_ms", "days_in_stage", "stage_lifecycle_reasons", "children", "metrics", "economic_partitions",
] as const;

function readRowMetrics(raw: unknown, metricKeys: readonly ManagerMetricKey[]): ManagerRowMetrics | null {
  const bag = record(raw);
  if (bag === null) return null;
  const keys = Object.keys(bag);
  // The schema's `propertyNames` enum and the root `allOf`: exactly the keys `query_options.metric_keys` names.
  if (keys.length !== metricKeys.length || !keys.every((key) => (metricKeys as readonly string[]).includes(key))) return null;
  const out: Partial<Record<ManagerMetricKey, ManagerMetricRead>> = {};
  for (const key of metricKeys) {
    const metric = readManagerMetric(bag[key]);
    if (metric === null) return null;
    out[key] = metric;
  }
  return out;
}

/** Structural equality of two reads (plain data: strings, numbers, booleans, null, arrays, objects). Key order does not matter. */
function sameRead(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null || Array.isArray(a) !== Array.isArray(b)) return false;
  const left = a as Record<string, unknown>;
  const right = b as Record<string, unknown>;
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => Object.prototype.hasOwnProperty.call(right, key) && sameRead(left[key], right[key]));
}

/**
 * MD-S5 (rewritten after BE-P1/MD-8). A row-level money figure that names a currency is the figure of exactly ONE partition
 * listed on that row: it is deep-equal to the same-key metric of some partition, never a total.
 *
 * The old rule ("the headline's currency is the currency of EVERY partition that publishes the key") refused a legitimate
 * body: when a query pins one `economic_partition`, a row that also has facts in another currency still lists both
 * partitions and its headline is the pinned partition's figure. Identity says what the old rule was after (no
 * cross-currency total: a sum of USDT and EUR equals neither partition's metric) and it is the producer's real invariant
 * (`MANAGER_HEADLINE_NOT_A_PARTITION_FIGURE`). Only the five partitioned (money) keys are judged, as the producer does; a
 * headline that names no currency (an absence, a ratio) is not a money figure and needs no partition.
 */
function headlineIsAPartitionFigure(metrics: ManagerRowMetrics, partitions: readonly ManagerPartitionedMetrics[]): boolean {
  for (const key of MANAGER_PARTITIONED_METRIC_KEYS) {
    const headline = metrics[key];
    if (headline === undefined || headline.currency === null) continue;
    if (!partitions.some((entry) => sameRead(entry.metrics.get(key), headline))) return false;
  }
  return true;
}

/**
 * The lifecycle scalars of a row (BE-P4). Schema `allOf`: a value is `null` exactly when its reason is set; a published
 * `current_stage` is the row's only `stage_presence`; no presence means `STAGE_FIELD_NOT_PUBLISHED`, otherwise a missing
 * `current_stage` means `MULTIPLE_ACTIVE_STAGES`; `days_in_stage` needs `entered_at_ms`. NOT the reader's rule: a presence of
 * one stage with `current_stage: null` is legal (a stage filter hides the other stage), so it is accepted and never "fixed".
 * The reader's own rules (MD-S13, the producer's Zod arithmetic) are in `stageEntryArithmetic`.
 */
function readStageLifecycle(
  row: Record<string, unknown>, stagePresence: readonly ManagerStage[], allowedStages: readonly ManagerStage[],
): Pick<ManagerRow, "currentStage" | "enteredAtMs" | "daysInStage" | "stageLifecycleReasons"> | null {
  const currentStage = row.current_stage === null ? null : oneOf(row.current_stage, allowedStages);
  const enteredAtMs = row.entered_at_ms === null ? null : clockMs(row.entered_at_ms);
  const daysInStage = row.days_in_stage === null ? null : boundedCount(row.days_in_stage, MAX_DAYS_IN_STAGE);
  if ((row.current_stage !== null && currentStage === null) || (row.entered_at_ms !== null && enteredAtMs === null) || (row.days_in_stage !== null && daysInStage === null)) return null;

  const reasons = record(row.stage_lifecycle_reasons);
  const reasonKeys = ["current_stage", "entered_at_ms", "days_in_stage"] as const;
  if (reasons === null || !hasOnly(reasons, reasonKeys) || !hasAll(reasons, reasonKeys)) return null;
  const stageReason = reasons.current_stage === null ? null : oneOf(reasons.current_stage, CURRENT_STAGE_REASONS);
  const enteredReason = reasons.entered_at_ms === null ? null : oneOf(reasons.entered_at_ms, [STAGE_ENTRY_TIME_NOT_PUBLISHED] as const);
  const daysReason = reasons.days_in_stage === null ? null : oneOf(reasons.days_in_stage, [STAGE_ENTRY_TIME_NOT_PUBLISHED] as const);
  if ((reasons.current_stage !== null && stageReason === null) || (reasons.entered_at_ms !== null && enteredReason === null) || (reasons.days_in_stage !== null && daysReason === null)) return null;

  // A value is null exactly when its reason is set.
  if ((currentStage === null) !== (stageReason !== null) || (enteredAtMs === null) !== (enteredReason !== null) || (daysInStage === null) !== (daysReason !== null)) return null;
  // Days exist only with an entry time.
  if (daysInStage !== null && enteredAtMs === null) return null;
  // A published stage is the row's only stage; a missing one is explained by the presence (none: not published, else several).
  if (currentStage !== null && (stagePresence.length !== 1 || stagePresence[0] !== currentStage)) return null;
  if (currentStage === null && stageReason !== (stagePresence.length === 0 ? "STAGE_FIELD_NOT_PUBLISHED" : "MULTIPLE_ACTIVE_STAGES")) return null;
  return { currentStage, enteredAtMs, daysInStage, stageLifecycleReasons: { currentStage: stageReason, enteredAtMs: enteredReason, daysInStage: daysReason } };
}

/**
 * MD-S13 (stricter than the schema, the producer's Zod rules, named and counted in the conformance suite): the entry time
 * and the day count exist only for a row with a published stage; the entry time is not after the cutoff; and
 * `days_in_stage == floor((as_of_ms - entered_at_ms) / 86 400 000)`. JSON Schema cannot state arithmetic. Nothing here
 * ever computes a day count: it only refuses a published one that disagrees with the clocks.
 */
function stageEntryArithmetic(lifecycle: Pick<ManagerRow, "currentStage" | "enteredAtMs" | "daysInStage">, asOfMs: number): boolean {
  const { currentStage, enteredAtMs, daysInStage } = lifecycle;
  if (enteredAtMs !== null && currentStage === null) return false;
  if (daysInStage === null) return true;
  return currentStage !== null && enteredAtMs !== null && enteredAtMs <= asOfMs && daysInStage === Math.floor((asOfMs - enteredAtMs) / MS_PER_DAY);
}

function readRow(raw: unknown, scope: ManagerEnvironmentScope, metricKeys: readonly ManagerMetricKey[], asOfMs: number): ManagerRow | null {
  const row = record(raw);
  if (row === null || !hasOnly(row, [...ROW_KEYS, "environment"]) || !hasAll(row, ROW_KEYS)) return null;
  // ALL: every row names its own environment, and is judged against THAT environment. Otherwise no row names one (an ALL key on a
  // single-environment body is a body of another question).
  const rowEnvironment = Object.prototype.hasOwnProperty.call(row, "environment") ? oneOf(row.environment, MANAGER_ENVIRONMENTS) : null;
  if (scope === MANAGER_ALL ? rowEnvironment === null : Object.prototype.hasOwnProperty.call(row, "environment")) return null;
  const environment: ManagerEnvironment = scope === MANAGER_ALL ? rowEnvironment! : scope;
  const rowKey = managerText(row.row_key, 2048);
  const alphaId = managerText(row.alpha_id);
  const alphaVersionId = managerText(row.alpha_version_id);
  const portfolioId = managerText(row.portfolio_id);
  const name = nullableText(row.name);
  const ownerUserId = nullableText(row.owner_user_id);
  const lifecycle = nullableText(row.lifecycle);
  const venue = nullableText(row.venue);
  const health = nullableText(row.health);
  const sourceState = nullableText(row.source_state);
  if (
    rowKey === null || alphaId === null || alphaVersionId === null || portfolioId === null || name === undefined || ownerUserId === undefined
    || lifecycle === undefined || venue === undefined || health === undefined || sourceState === undefined
  ) return null;

  const allowedStages = ENVIRONMENT_STAGES[environment];
  // A set: no stage repeats (MD-S10). The environment pins which stages a row may be in (schema allOf, one per environment).
  const stagePresence = uniqueEnumList(row.stage_presence, allowedStages, MANAGER_STAGES.length);
  if (stagePresence === null) return null;
  const stage = readStageLifecycle(row, stagePresence, allowedStages);
  if (stage === null || !stageEntryArithmetic(stage, asOfMs)) return null;
  if (!Array.isArray(row.children) || row.children.length > MAX_CHILDREN_PER_ROW) return null;
  const children: ManagerRowChild[] = [];
  for (const entry of row.children) {
    const child = readChild(entry, allowedStages);
    if (child === null) return null;
    children.push(child);
  }
  const metrics = readRowMetrics(row.metrics, metricKeys);
  const economicPartitions = readPartitionedMetricsList(row.economic_partitions, "row");
  if (metrics === null || economicPartitions === null || !headlineIsAPartitionFigure(metrics, economicPartitions)) return null;
  if (scope === MANAGER_ALL) {
    // The key is the identity of one row of one environment, and its figures are of that environment's own economic domain: a Live row
    // never carries a Paper partition (and the reverse), so a cell can never print another environment's money under this row.
    if (rowKey !== allRowKey(environment, { alphaId, alphaVersionId, portfolioId })) return null;
    if (economicPartitions.some((entry) => entry.partition.economicDomain !== ENVIRONMENT_DOMAIN[environment])) return null;
  }
  return { rowKey, ...(scope === MANAGER_ALL ? { environment } : {}), alphaId, alphaVersionId, portfolioId, name, ownerUserId, lifecycle, venue, health, sourceState, stagePresence, ...stage, children, metrics, economicPartitions };
}

function readGroup(raw: unknown, groupFields: readonly ManagerGroupField[], filteredCount: number): ManagerGroup | null {
  const group = record(raw);
  const keys = ["key", "unique_row_count", "totals_scope", "economic_partitions"] as const;
  if (group === null || !hasOnly(group, [...keys, "attribution"]) || !hasAll(group, keys) || group.totals_scope !== "FULL_AUTHORIZED_FILTERED_QUERY") return null;
  if (!Array.isArray(group.key) || group.key.length > 2) return null;
  const key: { field: ManagerGroupField; value: string | null }[] = [];
  for (const entry of group.key) {
    const part = record(entry);
    if (part === null || !hasOnly(part, ["field", "value"]) || !hasAll(part, ["field", "value"])) return null;
    // The schema says any text; a group over a field the dataset cannot group by contradicts `query_options` (MD-S11).
    const field = oneOf(part.field, groupFields);
    const value = nullableText(part.value);
    if (field === null || value === undefined || key.some((seen) => seen.field === field)) return null;
    key.push({ field, value });
  }
  // The group cannot hold more unique rows than the query it totals over.
  const uniqueRowCount = boundedCount(group.unique_row_count, MAX_FILTERED_COUNT);
  const economicPartitions = readPartitionedMetricsList(group.economic_partitions);
  if (uniqueRowCount === null || uniqueRowCount > filteredCount || economicPartitions === null) return null;
  let attribution: ManagerGroupAttribution | undefined;
  if (Object.prototype.hasOwnProperty.call(group, "attribution")) {
    const a = readGroupAttribution(group.attribution);
    // The attribution is about the group's own alpha: it needs an alpha_id key, and says the same id.
    if (a === null || key.find((part) => part.field === "alpha_id")?.value !== a.alphaId) return null;
    attribution = a;
  }
  return { ...(attribution === undefined ? {} : { attribution }), key, uniqueRowCount, totalsScope: "FULL_AUTHORIZED_FILTERED_QUERY", economicPartitions };
}

function readGroupAttribution(raw: unknown): ManagerGroupAttribution | null {
  const a = record(raw);
  const keys = ["alpha_id", "name", "owner_user_id", "name_reason_code", "owner_reason_code"] as const;
  if (a === null || !hasOnly(a, keys) || !hasAll(a, keys)) return null;
  const alphaId = managerText(a.alpha_id);
  const name = nullableText(a.name);
  const owner = nullableText(a.owner_user_id);
  const nameReason = a.name_reason_code === null ? null : oneOf(a.name_reason_code, ["GROUP_NAME_NOT_PUBLISHED", "GROUP_NAME_AMBIGUOUS"] as const);
  const ownerReason = a.owner_reason_code === null ? null : oneOf(a.owner_reason_code, ["GROUP_OWNER_NOT_PUBLISHED", "GROUP_OWNER_AMBIGUOUS"] as const);
  if (alphaId === null || name === undefined || owner === undefined) return null;
  // A value and its reason exclude each other: a missing name or owner always says why, a present one never carries a reason.
  if ((name === null) !== (nameReason !== null) || (owner === null) !== (ownerReason !== null)) return null;
  return { alphaId, name, ownerUserId: owner, nameReasonCode: nameReason as ManagerGroupAttribution["nameReasonCode"], ownerReasonCode: ownerReason as ManagerGroupAttribution["ownerReasonCode"] };
}

const SLOT_STATUSES: Readonly<Record<"raw" | "composition" | "direct_nav", readonly ManagerScoreSlotStatus[]>> = {
  raw: ["policy_pending", "available", "provisional", "unbound", "invalid_data", "stale", "partial_costs", "partial_components", "insufficient_data", "window_not_published"],
  composition: ["policy_pending", "available", "provisional", "partial_coverage", "incomparable_basis", "no_allocation", "invalid_data", "window_not_published"],
  direct_nav: ["policy_pending", "available", "provisional", "unbound", "invalid_data", "stale", "partial_costs", "partial_components", "insufficient_data", "window_not_published"],
};

function readScoreSlot(raw: unknown, slot: keyof typeof SLOT_STATUSES): ManagerScoreSlot | null {
  const body = record(raw);
  if (body === null || !hasOnly(body, ["value", "status", "reason_code"]) || !hasAll(body, ["value", "status"])) return null;
  const status = oneOf(body.status, SLOT_STATUSES[slot]);
  if (status === null) return null;
  if (status === "available" || status === "provisional") {
    // A value status has a value (the schema's decimal pattern, up to 128 characters) and no window reason.
    const value = exactValue(body.value);
    if (value === null || Object.prototype.hasOwnProperty.call(body, "reason_code")) return null;
    return { kind: "value", status, exact: value.exact, zero: value.zero, provisional: status === "provisional" };
  }
  if (body.value !== null) return null;
  if (status === "window_not_published") {
    const reasonCode = oneOf(body.reason_code, WINDOW_REASONS);
    return reasonCode === null ? null : { kind: "absent", status, reasonCode };
  }
  // Any other status carries no `reason_code` key at all (schema `not required`).
  return Object.prototype.hasOwnProperty.call(body, "reason_code") ? null : { kind: "absent", status, reasonCode: null };
}

const SCORE_REASONS = [
  "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED", "QUALIFIED_PRECOMPUTED_SCORE", EXACT_METRIC_WINDOW_NOT_PUBLISHED, ALL_HISTORY_WINDOW_NOT_PUBLISHED,
] as const;
const REGIME_STATUSES = ["unavailable", "supported", "weak_support", "out_of_support", "insufficient_data", "stale", "unbound"] as const;
const REGIME_REASONS = ["REGIME_POLICY_SOURCE_OR_AUTHORIZED_SLICE_NOT_QUALIFIED", "REGIME_IS_PER_ALPHA_OR_DEPLOYMENT_ONLY"] as const;

function readScores(raw: unknown, selected: ManagerSelectedWindow | null): ManagerScores | null {
  const scores = record(raw);
  const keys = ["raw", "composition", "direct_nav", "regime", "reason_code", "calculation_path"] as const;
  if (scores === null || !hasOnly(scores, keys) || !hasAll(scores, keys) || scores.calculation_path !== "PRECOMPUTED_ONLY") return null;
  const rawSlot = readScoreSlot(scores.raw, "raw");
  const composition = readScoreSlot(scores.composition, "composition");
  const directNav = readScoreSlot(scores.direct_nav, "direct_nav");
  const reasonCode = oneOf(scores.reason_code, SCORE_REASONS);
  if (rawSlot === null || composition === null || directNav === null || reasonCode === null) return null;

  const regime = record(scores.regime);
  if (regime === null || !hasOnly(regime, ["value", "status", "reason_code"]) || !hasAll(regime, ["value", "status"]) || regime.value !== null) return null;
  const regimeStatus = oneOf(regime.status, REGIME_STATUSES);
  const regimeReason = regime.reason_code === undefined || regime.reason_code === null ? null : oneOf(regime.reason_code, REGIME_REASONS);
  if (regimeStatus === null || (regime.reason_code !== undefined && regime.reason_code !== null && regimeReason === null)) return null;

  // Schema allOf: window-not-published slots, the selected window and the window reasons agree.
  const slots = [rawSlot, composition, directNav];
  const notPublished = slots.filter((slot) => slot.kind === "absent" && slot.status === "window_not_published");
  // Any slot without its window needs a selected window to say which one (schema allOf, `anyOf` of the three).
  if (notPublished.length > 0 && selected === null) return null;
  // `scores.reason_code` is a window reason exactly when ALL THREE slots are window_not_published (schema allOf, `allOf`
  // of the three); then it is the window's reason. With one or two slots missing the window, it is not a window reason.
  const allNotPublished = notPublished.length === slots.length;
  if ((SCORE_REASONS.indexOf(reasonCode) >= 2) !== allNotPublished) return null;
  const expected = selected !== null && selected.kind === "gap" ? ALL_HISTORY_WINDOW_NOT_PUBLISHED : EXACT_METRIC_WINDOW_NOT_PUBLISHED;
  for (const slot of notPublished) if (slot.kind === "absent" && slot.reasonCode !== expected) return null;
  if (allNotPublished && reasonCode !== expected) return null;

  return { raw: rawSlot, composition, directNav, regime: { kind: "absent", status: regimeStatus, reasonCode: regimeReason }, reasonCode, calculationPath: "PRECOMPUTED_ONLY" };
}

/** An optional details array is counted, not read (MD-L1): bounded, objects only, each naming the slot it belongs to. */
function countDetails(raw: Record<string, unknown>, key: (typeof ROOT_OPTIONAL)[number], slots: readonly string[]): number | null {
  if (!Object.prototype.hasOwnProperty.call(raw, key)) return 0;
  const list = raw[key];
  if (!Array.isArray(list) || list.length > MAX_DETAILS) return null;
  for (const entry of list) {
    const detail = record(entry);
    if (detail === null || typeof detail.slot !== "string" || !slots.includes(detail.slot)) return null;
  }
  return list.length;
}

function readLineage(raw: unknown): ManagerDataset["lineage"] | null {
  const lineage = record(raw);
  const keys = ["reducer_revision", "source_set_ref", "revision", "supersedes_revision"] as const;
  if (lineage === null || !hasOnly(lineage, keys) || !hasAll(lineage, keys) || lineage.reducer_revision !== "manager-model.v1") return null;
  const sourceSetRef = digestRef(lineage.source_set_ref);
  const revision = digestRef(lineage.revision);
  const supersedesRevision = lineage.supersedes_revision === null ? null : digestRef(lineage.supersedes_revision);
  return sourceSetRef === null || revision === null || (lineage.supersedes_revision !== null && supersedesRevision === null)
    ? null
    : { reducerRevision: "manager-model.v1", sourceSetRef, revision, supersedesRevision };
}

function readFundingBucket(raw: unknown): ManagerDataset["fundingBucketPnl"] | null {
  const bucket = record(raw);
  return bucket !== null && hasOnly(bucket, ["value", "reason_code"]) && bucket.value === null && bucket.reason_code === "LOT_ATTRIBUTION_METHOD_NOT_APPROVED"
    ? { kind: "absent", reasonCode: "LOT_ATTRIBUTION_METHOD_NOT_APPROVED" }
    : null;
}

/**
 * The producer's ALL invariants the schema cannot state (MANAGER_ALL_*): the page counts ROWS and its totals are the sums of the INCLUDED
 * entries (the only sum ALL makes; never money); each entry's returned count is the rows of that environment on this page; an
 * environment that is UNAVAILABLE holds no row; and a body that lost an environment is never COMPLETE.
 */
function coverageAddsUp(coverage: readonly ManagerEnvironmentCoverage[], items: readonly ManagerRow[], page: ManagerPage, quality: ManagerQuality): boolean {
  let filtered = 0;
  let returned = 0;
  let missing = 0;
  for (const entry of coverage) {
    const rows = items.filter((row) => row.environment === entry.environment).length;
    if (entry.availability === "INCLUDED") {
      filtered += entry.authorizedFilteredCount;
      returned += entry.returnedCount;
      if (rows !== entry.returnedCount) return false;
    } else {
      missing += 1;
      if (rows !== 0) return false;
    }
  }
  return filtered === page.authorizedFilteredCount && returned === page.returnedCount && !(missing > 0 && quality.completeness === "COMPLETE");
}

function readDataset(root: Record<string, unknown>): ManagerDataset | null {
  if (!hasOnly(root, [...ROOT_REQUIRED, ...ROOT_OPTIONAL]) || !hasAll(root, ROOT_REQUIRED)) return null;
  if (
    root.record_authority !== "PORTAL_PROJECTION" || root.source_authority !== "TRADING_SYSTEM" || root.coverage !== "AUTHORIZED_ONLY"
    || root.economic_aggregation !== "PARTITIONED_ONLY" || root.statement_scope !== MANAGER_STATEMENT_SCOPE
  ) return null;
  // BE-P4 constant: what `current_stage` means. Exact, so a changed rule is a new contract, not a re-labelled column.
  const stageLifecycle = record(root.stage_lifecycle);
  if (
    stageLifecycle === null || !hasOnly(stageLifecycle, ["current_stage_rule", "covers", "entry_time"]) || !hasAll(stageLifecycle, ["current_stage_rule", "covers", "entry_time"])
    || stageLifecycle.current_stage_rule !== MANAGER_STAGE_LIFECYCLE.currentStageRule || stageLifecycle.covers !== MANAGER_STAGE_LIFECYCLE.covers
    || (stageLifecycle.entry_time !== MANAGER_STAGE_LIFECYCLE.entryTime && stageLifecycle.entry_time !== STAGE_TIMING_PUBLISHED)
  ) return null;
  const queryPolicy = record(root.query_policy);
  if (
    queryPolicy === null || !hasOnly(queryPolicy, ["null_order", "stage_order", "maximum_response_bytes"]) || queryPolicy.null_order !== "LAST_BOTH_DIRECTIONS"
    || queryPolicy.stage_order !== "LEXICAL_SET_NOT_RISK_RANK" || queryPolicy.maximum_response_bytes !== MAX_RESPONSE_BYTES
  ) return null;

  const surface = oneOf(root.surface, MANAGER_SURFACES);
  const environment = oneOf(root.environment, [...MANAGER_ENVIRONMENTS, MANAGER_ALL] as const);
  const workspaceId = managerText(root.workspace_id);
  const snapshotId = digestRef(root.snapshot_id);
  const asOfMs = clockMs(root.as_of_ms);
  const recordedThroughMs = clockMs(root.recorded_through_ms);
  const factsThroughMs = root.facts_through_ms === null ? null : clockMs(root.facts_through_ms);
  if (
    surface === null || environment === null || workspaceId === null || snapshotId === null || asOfMs === null || recordedThroughMs === null
    || (root.facts_through_ms !== null && factsThroughMs === null)
  ) return null;
  const quality = readManagerQuality(root.quality, MAX_DATASET_REASONS);
  const selectedWindow = readManagerSelectedWindow(root.selected_window);
  const queryOptions = readQueryOptions(root.query_options);
  const page = readPage(root.page);
  if (quality === null || selectedWindow === undefined || queryOptions === null || page === null) return null;
  // Stage timing: the policy value says the producer binds exact snapshot transitions. The published fixture still lists both entry-time fields beside it and the
  // producer may list none; the two are read independently (no tie is invented), and each ROW says whether a transition bound.
  const stageTimingPublished = stageLifecycle.entry_time === STAGE_TIMING_PUBLISHED;
  // FE-CAT-3: the coverage list belongs to ALL and only to ALL; an ALL body carries no window (a window resolves against ONE cutoff).
  const groupQuery = Object.prototype.hasOwnProperty.call(root, "group_query") ? readGroupQuery(root.group_query) : undefined;
  if (groupQuery === null) return null;
  const groupPage = Object.prototype.hasOwnProperty.call(root, "group_page") ? readPage(root.group_page, { items: MAX_GROUPS, filtered: MAX_GROUP_POPULATION }) : undefined;
  if (groupPage === null) return null;
  const hasCoverage = Object.prototype.hasOwnProperty.call(root, "environment_coverage");
  if ((environment === MANAGER_ALL) !== hasCoverage || (environment === MANAGER_ALL && selectedWindow !== null)) return null;
  const environmentCoverage = hasCoverage ? readCoverage(root.environment_coverage) : null;
  if (hasCoverage && environmentCoverage === null) return null;

  if (!Array.isArray(root.items) || root.items.length > MAX_ITEMS || root.items.length !== page.returnedCount) return null;
  const items: ManagerRow[] = [];
  const rowKeys = new Set<string>();
  let children = 0;
  for (const entry of root.items) {
    const row = readRow(entry, environment, queryOptions.metricKeys, asOfMs);
    // A row appears once (MD-S10): the schema states no uniqueness, and a repeated row would be counted twice.
    if (row === null || rowKeys.has(row.rowKey)) return null;
    rowKeys.add(row.rowKey);
    children += row.children.length;
    if (children > MAX_CHILDREN_TOTAL) return null;
    items.push(row);
  }

  if (!Array.isArray(root.groups) || root.groups.length > MAX_GROUPS) return null;
  const groups: ManagerGroup[] = [];
  const groupKeys = new Set<string>();
  for (const entry of root.groups) {
    const group = readGroup(entry, queryOptions.groupFields, page.authorizedFilteredCount);
    // Two groups with one key would be added together by anyone who totals them (MD-S11).
    const identity = group === null ? "" : JSON.stringify(group.key);
    if (group === null || groupKeys.has(identity)) return null;
    groupKeys.add(identity);
    groups.push(group);
  }

  // The page says how many groups this body carries; the group query's `groups_returned` is the same number (never a count of the whole population).
  if (groupPage !== undefined && groupPage.returnedCount !== groups.length) return null;
  if (groupQuery !== undefined && groupQuery.groupsReturned !== groups.length) return null;
  if (groupPage !== undefined && groupQuery !== undefined && groupQuery.groupsBeforeFilter < groupPage.authorizedFilteredCount) return null;

  const capitalStatements = readPartitionedMetricsList(root.capital_statements);
  const scores = readScores(root.scores, selectedWindow);
  const fundingBucketPnl = readFundingBucket(root.funding_bucket_pnl);
  const lineage = readLineage(root.lineage);
  const scoreDetails = countDetails(root, "score_details", ["RAW", "DIRECT_NAV"]);
  const compositionDetails = countDetails(root, "composition_details", ["COMPOSITION"]);
  const regimeDetails = countDetails(root, "regime_details", ["REGIME"]);
  if (
    capitalStatements === null || scores === null || fundingBucketPnl === null || lineage === null || scoreDetails === null
    || compositionDetails === null || regimeDetails === null
  ) return null;

  if (environmentCoverage !== null && !coverageAddsUp(environmentCoverage, items, page, quality)) return null;

  return {
    surface, workspaceId, stageLifecycle: MANAGER_STAGE_LIFECYCLE, environment, ...(environmentCoverage === null ? {} : { environmentCoverage }), ...(groupQuery === undefined ? {} : { groupQuery }), ...(groupPage === undefined ? {} : { groupPage }), ...(stageTimingPublished ? { stageTimingPublished: true as const } : {}), snapshotId, asOfMs, recordedThroughMs, factsThroughMs, quality, selectedWindow, queryOptions, page, items, groups,
    capitalStatements, statementScope: MANAGER_STATEMENT_SCOPE, scores, fundingBucketPnl, lineage,
    unreadDetails: { scoreDetails, compositionDetails, regimeDetails }, hasMore: page.nextCursor !== null,
  };
}

/**
 * Manager dataset body -> typed read.
 *
 * `null` is "malformed" and must render as unavailable. A body of another schema is `unsupported_shape`. The result is
 * the contract's facts and nothing a screen could confuse with a total it made up.
 */
export function readManagerDataset(raw: unknown): ManagerDatasetRead | null {
  try {
    const root = record(raw);
    if (root === null) return null;
    const version = typeof root.schema_version === "string" ? root.schema_version : null;
    if (version !== MANAGER_DATASET_SCHEMA) return { kind: "unsupported_shape", schemaVersion: version };
    const dataset = readDataset(root);
    return dataset === null ? null : { kind: "dataset", dataset };
  } catch {
    // A hostile object (a throwing getter) is a malformed body, not a crash.
    return null;
  }
}
