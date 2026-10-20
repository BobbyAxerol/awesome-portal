/**
 * Fleet over the Manager DATASET (FE-012 sort/group by current stage, FE-027 current stage and days in stage): the pure
 * model. No React. It decides three things and nothing else:
 *
 * 1. WHEN the dataset can be the source: only for one environment (`datasetScopeOf`): the dataset pins one economic profile and
 *    the All lens spans several. Never a guessed environment.
 * 2. WHAT is asked: filters are the server's (`datasetQuery`): health is `EQ` for one word and `IN` for several, the owner is
 *    `EQ`, the lens narrows the stages with `stage_filter`, the search is `q`. Nothing is narrowed client-side over a partial
 *    page.
 * 3. WHAT a row prints: the current stage is the producer's scalar, never derived from `stage_presence`; `entered_at_ms` and
 *    `days_in_stage` are `Not published (FE-027)` with the typed reason from `stage_lifecycle_reasons` unless the producer
 *    publishes them; a row with no single stage says why.
 */
import type { ManagerDatasetFilter, ManagerDatasetQuery, ManagerDatasetSort } from "../../../api/managerDatasetQuery";
import type { ManagerDataset, ManagerEnvironment, ManagerGroup, ManagerGroupField, ManagerRow, ManagerSortField, ManagerStage } from "../../readers/managerDataset";
import type { ExecStage } from "../../urlState";
import { PAGE_LIMIT, healthView, stageLabel, type UnpublishedFact } from "./fleetModel";

/** The request that owns days in stage and entry time (the stage lifecycle). */
export const FE_STAGE_ENTRY: UnpublishedFact = { fe: "FE-027", what: "Days in stage" };

/* ── when ──────────────────────────────────────────────────────────────── */

export interface DatasetScope {
  environment: ManagerEnvironment;
  /** Empty: every stage of the environment (so a lens that is the whole environment sends none). */
  stageFilter: readonly ManagerStage[];
}

const ENVIRONMENT_OF: Readonly<Record<ExecStage, ManagerEnvironment>> = { paper: "paper", sandbox: "sandbox", canary: "live", live: "live" };
const STAGES_OF: Readonly<Record<ManagerEnvironment, number>> = { paper: 1, sandbox: 1, live: 2 };

/**
 * The environment a lens/stage selection lives in, or `null` when it spans more than one (or none is chosen): the dataset serves
 * one environment at a time, so the All lens and a mixed selection stay on the fleet read.
 */
export function datasetScopeOf(stages: readonly ExecStage[], archived: boolean): DatasetScope | null {
  if (archived || stages.length === 0) return null;
  const environments = new Set(stages.map((stage) => ENVIRONMENT_OF[stage]));
  if (environments.size !== 1) return null;
  const environment = [...environments][0]!;
  const words = [...new Set(stages)].map((stage) => stage.toUpperCase() as ManagerStage).sort();
  return { environment, stageFilter: words.length === STAGES_OF[environment] ? [] : words };
}

/* ── what is asked ─────────────────────────────────────────────────────── */

export interface DatasetSortOption { id: string; label: string; value: string | null; keys: readonly ManagerDatasetSort[]; field: ManagerSortField | null }

/**
 * The sorts the control offers, each only when the dataset states it can sort on the field (`query_options.sort_fields`). The
 * first is the server's own order (nothing sent). Stages sort by their NAME, not by risk (`query_policy.stage_order`), and a row
 * with no single stage comes last in both directions (`null_order`), so the labels say so.
 */
export const DATASET_SORT_OPTIONS: readonly DatasetSortOption[] = [
  { id: "default", label: "Server order", value: null, keys: [], field: null },
  { id: "name", label: "Name, A to Z", value: "name:asc", keys: [{ field: "name", direction: "asc" }], field: "name" },
  { id: "stage-asc", label: "Current stage, A to Z", value: "current_stage:asc", keys: [{ field: "current_stage", direction: "asc" }, { field: "alpha_id", direction: "asc" }], field: "current_stage" },
  { id: "stage-desc", label: "Current stage, Z to A", value: "current_stage:desc", keys: [{ field: "current_stage", direction: "desc" }, { field: "alpha_id", direction: "asc" }], field: "current_stage" },
];

export function datasetSortOptions(offered: readonly ManagerSortField[] | null): readonly DatasetSortOption[] {
  return DATASET_SORT_OPTIONS.filter((option) => option.field === null || (offered !== null && offered.includes(option.field)));
}

export const datasetSortOf = (sort: string | null, options: readonly DatasetSortOption[]): DatasetSortOption =>
  options.find((option) => option.value !== null && option.value === sort) ?? DATASET_SORT_OPTIONS[0]!;

/** The groupings the control offers, each only when the dataset states it can group by the field (`query_options.group_fields`). */
export const DATASET_GROUP_OPTIONS: readonly { id: string; label: string; field: ManagerGroupField | null }[] = [
  { id: "none", label: "Group: none", field: null },
  { id: "current_stage", label: "Group: Current stage", field: "current_stage" },
];

export function datasetGroupOptions(offered: readonly ManagerGroupField[] | null): typeof DATASET_GROUP_OPTIONS {
  return DATASET_GROUP_OPTIONS.filter((option) => option.field === null || (offered !== null && offered.includes(option.field)));
}

/** `group=current_stage` in the URL; anything else is no grouping. */
export const groupFieldOf = (raw: string | null): ManagerGroupField | null =>
  DATASET_GROUP_OPTIONS.find((option) => option.field !== null && option.field === raw)?.field ?? null;

export interface DatasetFilters {
  scope: DatasetScope;
  q: string | null;
  owner: string | null;
  /** One or more health words: one is `EQ`, several are `IN`. */
  healths: readonly string[];
  sort: string | null;
  group: ManagerGroupField | null;
  workspaceId?: string;
}

/** `health=A,B` in the URL. */
export const parseHealths = (raw: string | null): readonly string[] =>
  [...new Set((raw ?? "").split(",").map((part) => part.trim()).filter((part) => part !== ""))].sort();
export const serializeHealths = (values: readonly string[]): string | null => (values.length === 0 ? null : [...values].sort().join(","));

export function datasetQuery(filters: DatasetFilters, offered: readonly ManagerSortField[] | null, after?: string | null): ManagerDatasetQuery {
  const query: ManagerDatasetQuery = { surface: "FLEET", environment: filters.scope.environment, limit: PAGE_LIMIT };
  if (filters.workspaceId) query.workspaceId = filters.workspaceId;
  if (filters.q) { query.q = filters.q; query.qMode = "CONTAINS"; }
  if (filters.scope.stageFilter.length > 0) query.stageFilter = filters.scope.stageFilter;
  const list: ManagerDatasetFilter[] = [];
  if (filters.owner) list.push({ field: "owner_user_id", op: "EQ", value: filters.owner });
  if (filters.healths.length === 1) list.push({ field: "health", op: "EQ", value: filters.healths[0]! });
  else if (filters.healths.length > 1) list.push({ field: "health", op: "IN", values: filters.healths });
  if (list.length > 0) query.filters = list;
  const sort = datasetSortOf(filters.sort, datasetSortOptions(offered));
  if (sort.keys.length > 0) query.sort = sort.keys;
  if (filters.group !== null) query.groupBy = [filters.group];
  if (after) query.after = after;
  return query;
}

/** Stable identity of a query without its cursor: when it changes the loaded pages are dropped. */
export const datasetKey = (filters: DatasetFilters, offered: readonly ManagerSortField[] | null): string => JSON.stringify(datasetQuery(filters, offered));

/* ── what a row prints ─────────────────────────────────────────────────── */

export interface StageView {
  kind: "single" | "several" | "unpublished";
  /** The published stage word, a published set, or nothing. */
  code: string | null;
  label: string;
  /** The typed reason when the row has no single stage. */
  reason: string | null;
  /** The stages the row shows (a set, in published order; not a rank). */
  presence: readonly string[];
}

export function stageViewOf(row: ManagerRow): StageView {
  if (row.currentStage !== null) {
    return { kind: "single", code: row.currentStage, label: stageLabel(row.currentStage), reason: null, presence: row.stagePresence };
  }
  const reason = row.stageLifecycleReasons.currentStage;
  const presence = row.stagePresence.map(stageLabel);
  return reason === "STAGE_FIELD_NOT_PUBLISHED"
    ? { kind: "unpublished", code: null, label: "Not published (FE-027)", reason, presence }
    : { kind: "several", code: null, label: "No single stage", reason, presence };
}

export interface InStageView {
  /** `Not published (FE-027)`, or the published days. */
  text: string;
  /** The typed reason or the exact clock, for the title. */
  detail: string;
  published: boolean;
}

/** Days in stage. Published numbers print as published; otherwise `Not published (FE-027)` with the reason from the row. */
export function inStageOf(row: ManagerRow, utcStamp: (ms: number) => string): InStageView {
  if (row.daysInStage !== null && row.enteredAtMs !== null) {
    return { text: row.daysInStage === 1 ? "1 day" : `${row.daysInStage} days`, detail: `In this stage since ${utcStamp(row.enteredAtMs)}`, published: true };
  }
  const reason = row.stageLifecycleReasons.daysInStage ?? row.stageLifecycleReasons.enteredAtMs ?? "STAGE_ENTRY_TIME_NOT_PUBLISHED";
  return { text: `Not published (${FE_STAGE_ENTRY.fe})`, detail: reason, published: false };
}

/** A group key as a label: a stage is its word, no value is the typed "no single stage"; other fields print their text. */
export function groupLabel(group: ManagerGroup): string {
  return group.key.map((part) => {
    if (part.value === null) return part.field === "current_stage" ? "No single stage" : "Not available";
    return part.field === "current_stage" ? stageLabel(part.value) : part.value;
  }).join(", ");
}

/** Health text for the filter menu and the chip: a known word keeps its label, an unknown one is its own words. */
export const healthWord = (code: string): string => healthView(code).label;

/* ── honest counts ─────────────────────────────────────────────────────── */

/**
 * "Showing N of M": N is what is on screen, M is `authorized_filtered_count` of the newest page (rows the caller may see,
 * after the filters). A cap on the rows kept in the DOM is named. Never a count the server did not send.
 */
export function datasetCountLine(shown: number, loaded: number, total: number | null, hasMore: boolean, capped: boolean): string | null {
  if (total === null) return null;
  const noun = total === 1 ? "row" : "rows";
  if (shown < loaded) return `Showing the first ${shown} of ${total} ${noun}; ${loaded} are loaded.`;
  // At the DOM cap no further page is offered, so the line must not promise one.
  if (hasMore) return capped ? `Showing ${shown} of ${total} ${noun}.` : `Showing ${shown} of ${total} ${noun}. Load more for the rest.`;
  return shown === total ? `Showing all ${total} ${noun}` : `Showing ${shown} of ${total} ${noun}`;
}

export type { ManagerDataset };
