/**
 * Fleet over the Manager DATASET (FE-012 sort/group by current stage, FE-027 current stage and days in stage): the pure
 * model. No React. It decides three things and nothing else:
 *
 * 1. WHEN the dataset can be the source: for one environment, or (FE-CAT-3) for `ALL` when the lens spans several: the All lens and a
 *    mixed stage selection ask the dataset in ALL mode, which returns the authorized rows of every environment, each labelled, with
 *    per-environment coverage and NO combined money. The screen uses it only when the dataset answers ALL-shaped (the reader and
 *    `datasetQueryMismatch` refuse anything else); otherwise today's fleet read stays. Never a guessed environment.
 * 2. WHAT is asked: filters are the server's (`datasetQuery`): health is `EQ` for one word and `IN` for several, the owner is
 *    `EQ`, the lens narrows the stages with `stage_filter`, the search is `q`. Nothing is narrowed client-side over a partial
 *    page.
 * 3. WHAT a row prints: the current stage is the producer's scalar, never derived from `stage_presence`; `entered_at_ms` and
 *    `days_in_stage` are `Not published (FE-027)` with the typed reason from `stage_lifecycle_reasons` unless the producer
 *    publishes them; a row with no single stage says why.
 */
import type { ManagerDatasetFilter, ManagerDatasetQuery, ManagerDatasetSort } from "../../../api/managerDatasetQuery";
import {
  MANAGER_ALL, type ManagerCoverageReason, type ManagerDataset, type ManagerEnvironment, type ManagerEnvironmentCoverage, type ManagerEnvironmentScope,
  type ManagerGroup, type ManagerGroupField, type ManagerRow, type ManagerSortField, type ManagerStage,
} from "../../readers/managerDataset";
import type { ManagerEconomicDomain, ManagerMetricRead } from "../../readers/managerMetric";
import type { ExecStage } from "../../urlState";
import type { FlagKind } from "../../flagKinds";
import { PAGE_LIMIT, healthView, humanize, stageLabel, type UnpublishedFact } from "./fleetModel";
import { askableSorts, isMoneyField, rangeFilters, type BasisOption, type EvidenceFilter, type Range, type SortKey } from "./fleetMetricsModel";

/** The request that owns days in stage and entry time (the stage lifecycle). */
export const FE_STAGE_ENTRY: UnpublishedFact = { fe: "FE-027", what: "Days in stage" };

/* ── when ──────────────────────────────────────────────────────────────── */

export interface DatasetScope {
  /** One environment, or `ALL`: the authorized rows of every environment, each labelled (FE-CAT-3). */
  environment: ManagerEnvironmentScope;
  /** Empty: every stage of the environment (so a lens that is the whole environment sends none). */
  stageFilter: readonly ManagerStage[];
}

const ENVIRONMENT_OF: Readonly<Record<ExecStage, ManagerEnvironment>> = { paper: "paper", sandbox: "sandbox", canary: "live", live: "live" };
const STAGES_OF: Readonly<Record<ManagerEnvironment, number>> = { paper: 1, sandbox: 1, live: 2 };

/**
 * The environment a lens/stage selection lives in; `ALL` when it spans more than one or none is chosen (the All lens, a mixed
 * selection): navigation across separately labelled environments, never one consolidated book. `null` only for the Archived lens,
 * which asks for nothing.
 */
export function datasetScopeOf(stages: readonly ExecStage[], archived: boolean): DatasetScope | null {
  if (archived) return null;
  if (stages.length === 0) return { environment: MANAGER_ALL, stageFilter: [] };
  const environments = new Set(stages.map((stage) => ENVIRONMENT_OF[stage]));
  if (environments.size !== 1) return { environment: MANAGER_ALL, stageFilter: [...new Set(stages)].map((stage) => stage.toUpperCase() as ManagerStage).sort() };
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
  // QBTS needs no basis (a score is not money): high to low puts the strongest first, a version with no score comes last either way.
  { id: "qbts-desc", label: "QBTS, high to low", value: "score:desc", keys: [{ field: "score", direction: "desc" }], field: "score" },
  { id: "qbts-asc", label: "QBTS, low to high", value: "score:asc", keys: [{ field: "score", direction: "asc" }], field: "score" },
];

export function datasetSortOptions(offered: readonly ManagerSortField[] | null): readonly DatasetSortOption[] {
  return DATASET_SORT_OPTIONS.filter((option) => option.field === null || (offered !== null && offered.includes(option.field)));
}

export const datasetSortOf = (sort: string | null, options: readonly DatasetSortOption[]): DatasetSortOption =>
  options.find((option) => option.value !== null && option.value === sort) ?? DATASET_SORT_OPTIONS[0]!;

/**
 * The groupings the control offers, each only when the dataset states it can group by the field (`query_options.group_fields`).
 * Guide section 8.2 names portfolio, stage, owner and health; one level (the contract allows two, the control offers one).
 */
export const DATASET_GROUP_OPTIONS: readonly { id: string; label: string; field: ManagerGroupField | null }[] = [
  { id: "none", label: "Group: none", field: null },
  { id: "portfolio_id", label: "Group: Portfolio", field: "portfolio_id" },
  { id: "current_stage", label: "Group: Current stage", field: "current_stage" },
  // Membership groups (guide 8.2): an alpha in several stages is in each of them; the groups are never added into a total.
  { id: "stage_presence", label: "Group: Stage presence", field: "stage_presence" },
  { id: "owner_user_id", label: "Group: Owner", field: "owner_user_id" },
  { id: "alpha_id", label: "Group: Alpha", field: "alpha_id" },
  { id: "venue", label: "Group: Venue", field: "venue" },
  { id: "health", label: "Group: Health", field: "health" },
  { id: "source_state", label: "Group: Source state", field: "source_state" },
  { id: "lifecycle", label: "Group: Lifecycle", field: "lifecycle" },
];

export function datasetGroupOptions(offered: readonly ManagerGroupField[] | null): typeof DATASET_GROUP_OPTIONS {
  return DATASET_GROUP_OPTIONS.filter((option) => option.field === null || (offered !== null && offered.includes(option.field)));
}

/** `group=current_stage` in the URL; anything else is no grouping. */
const GROUP_ALIAS: Readonly<Record<string, string>> = { portfolio: "portfolio_id", stage: "current_stage", presence: "stage_presence", owner: "owner_user_id", alpha: "alpha_id", source: "source_state" };
export const groupFieldOf = (raw: string | null): ManagerGroupField | null => {
  const wanted = raw === null ? null : (GROUP_ALIAS[raw] ?? raw);
  return DATASET_GROUP_OPTIONS.find((option) => option.field !== null && option.field === wanted)?.field ?? null;
};

export interface DatasetFilters {
  scope: DatasetScope;
  q: string | null;
  owner: string | null;
  /** One or more health words: one is `EQ`, several are `IN`. */
  healths: readonly string[];
  sort: string | null;
  group: ManagerGroupField | null;
  /** The second grouping level (`then=` in the URL); only meaningful with a `group` and never the same field. */
  then?: ManagerGroupField | null;
  workspaceId?: string;
  /** Alpha Fleet metrics (guide 8.2). Absent: the legacy single-key `sort` above. */
  sorts?: readonly SortKey[];
  ranges?: readonly Range[];
  /** The pinned economic partition, used on the wire only when a money sort or range needs it. */
  basis?: BasisOption | null;
  portfolios?: readonly string[];
  venues?: readonly string[];
  sources?: readonly string[];
  version?: string | null;
  lifecycle?: string | null;
  evidence?: EvidenceFilter | null;
}

/** `EQ` for one word, `IN` for several (the dataset's own operators). */
function wordsFilter(field: ManagerDatasetFilter["field"], words: readonly string[]): ManagerDatasetFilter[] {
  if (words.length === 0) return [];
  return words.length === 1 ? [{ field, op: "EQ", value: words[0]! }] : [{ field, op: "IN", values: words }];
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
  list.push(...wordsFilter("health", filters.healths));
  list.push(...wordsFilter("portfolio_id", filters.portfolios ?? []));
  list.push(...wordsFilter("venue", filters.venues ?? []));
  if (filters.version) list.push({ field: "alpha_version_id", op: "EQ", value: filters.version });
  list.push(...wordsFilter("source_state", filters.sources ?? []));
  // "Missing / stale / insufficient evidence": a missing score is `score IS_NULL`; a stale source is `source_state EQ STALE`.
  if (filters.evidence === "missing") list.push({ field: "score", op: "IS_NULL" });
  if (filters.evidence === "stale") list.push({ field: "source_state", op: "EQ", value: "STALE" });
  const pinned = filters.basis != null;
  list.push(...rangeFilters(filters.ranges ?? [], offered, pinned));
  if (list.length > 0) query.filters = list;
  if (filters.lifecycle) query.lifecycleFilter = filters.lifecycle;
  if (filters.sorts !== undefined) {
    const asked = askableSorts(filters.sorts, offered, pinned).sort;
    if (asked.length > 0) query.sort = asked.map((key) => ({ field: key.field, direction: key.dir }));
    // A money order or range needs ONE partition; it is pinned only then, so a plain read keeps its default headlines.
    const needsPin = asked.some((key) => isMoneyField(key.field)) || (filters.ranges ?? []).some((range) => isMoneyField(range.field));
    if (needsPin && filters.basis) query.economicPartition = filters.basis.query;
  } else {
    const sort = datasetSortOf(filters.sort, datasetSortOptions(offered));
    if (sort.keys.length > 0) query.sort = sort.keys;
  }
  if (filters.group !== null) query.groupBy = filters.then != null && filters.then !== filters.group ? [filters.group, filters.then] : [filters.group];
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
export function inStageOf(row: ManagerRow, stamp: (ms: number) => string): InStageView {
  if (row.daysInStage !== null && row.enteredAtMs !== null) {
    return { text: row.daysInStage === 1 ? "1 day" : `${row.daysInStage} days`, detail: `In this stage since ${stamp(row.enteredAtMs)}`, published: true };
  }
  const reason = row.stageLifecycleReasons.daysInStage ?? row.stageLifecycleReasons.enteredAtMs ?? "STAGE_ENTRY_TIME_NOT_PUBLISHED";
  return { text: `Not published (${FE_STAGE_ENTRY.fe})`, detail: reason, published: false };
}

/**
 * The lifecycle flag of a row (guide section 13 and decision register B6: an alpha asking to be archived, or draining, stays on the
 * Fleet WITH a flag, because it still carries risk). `ACTIVE` prints nothing; `ARCHIVE_REQUESTED` and `ARCHIVED` are the two words
 * the backend guide names (section 6.2.1); any other word is its own words with the neutral kind, never a guess. Archive is a lifecycle
 * state, not a stage: it never replaces the stage.
 */
export function lifecycleFlagOf(lifecycle: string | null): { kind: FlagKind; label: string } | null {
  if (lifecycle === null || lifecycle === "ACTIVE") return null;
  if (lifecycle === "ARCHIVE_REQUESTED") return { kind: "approval", label: "Archive requested" };
  if (lifecycle === "ARCHIVED") return { kind: "paused", label: "Archived" };
  return { kind: "neutral", label: humanize(lifecycle) };
}

/** A group key as a label: a stage is its word, no value is the typed "no single stage"; other fields print their text. */
export function groupLabel(group: ManagerGroup): string {
  return group.key.map((part) => {
    if (part.value === null) return part.field === "current_stage" ? "No single stage" : "Not available";
    if (part.field === "current_stage" || part.field === "stage_presence") return stageLabel(part.value);
    return part.field === "health" ? healthView(part.value).label : part.value;
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

/* ── FE-CAT-3: environments in an ALL read ─────────────────────────────── */

/** What each environment is called on the Fleet (the lens names): Live and Canary are the Real-funded domain. */
export const ENVIRONMENT_LABEL: Readonly<Record<ManagerEnvironment, string>> = { paper: "Paper", sandbox: "Sandbox", live: "Real-funded" };
export const environmentLabelOf = (environment: ManagerEnvironment | undefined): string | null => (environment === undefined ? null : ENVIRONMENT_LABEL[environment]);

/** Why an environment is missing from an ALL read, in words (the closed reason code of the contract stays in the disclosure). */
export const COVERAGE_REASON_TEXT: Readonly<Record<ManagerCoverageReason, string>> = {
  NOT_AVAILABLE_TO_VIEWER: "Nothing in this environment is available to you.",
  NOT_CONFIGURED: "This server has no source configured for this environment.",
  POLICY_PENDING: "The access policy for this environment is not in force yet.",
  PUBLICATION_NOT_QUALIFIED: "The source publication for this environment is not qualified yet.",
  SOURCE_UNAVAILABLE: "The source for this environment could not be read.",
  CHANGED_DURING_READ: "This environment changed while it was being read.",
  SCOPE_LIMIT_EXCEEDED: "This environment holds more rows than one read may carry.",
};

export interface CoverageView {
  environment: ManagerEnvironment;
  label: string;
  availability: "INCLUDED" | "UNAVAILABLE";
  /** `3 rows`, `1 row` or `0 rows`: the count of authorized rows after the filters (a counted zero is not an absence). `null` when unavailable. */
  countText: string | null;
  /** Freshness / completeness when they are less than clean; the environment's own, never the combined body's. */
  state: { kind: FlagKind; label: string } | null;
  /** The typed reason when unavailable, and the environment's own quality reasons otherwise. */
  reasons: readonly string[];
  reasonCode: ManagerCoverageReason | null;
  asOfMs: number | null;
}

export function coverageViewOf(entry: ManagerEnvironmentCoverage): CoverageView {
  const label = ENVIRONMENT_LABEL[entry.environment];
  if (entry.availability === "UNAVAILABLE") {
    return { environment: entry.environment, label, availability: "UNAVAILABLE", countText: null, state: { kind: "unknown", label: "Not available" },
      reasons: [COVERAGE_REASON_TEXT[entry.reasonCode], entry.reasonCode], reasonCode: entry.reasonCode, asOfMs: null };
  }
  const { completeness, freshness } = entry.quality;
  const words = [completeness !== "COMPLETE" ? humanize(completeness) : null, freshness !== "FRESH" ? humanize(freshness) : null].filter((word): word is string => word !== null);
  const kind: FlagKind = freshness === "STALE" ? "stale" : words.length > 0 ? "partial" : "ok";
  return {
    environment: entry.environment, label, availability: "INCLUDED", countText: `${entry.authorizedFilteredCount} ${entry.authorizedFilteredCount === 1 ? "row" : "rows"}`,
    state: words.length === 0 ? null : { kind, label: words.join(", ") }, reasons: entry.quality.reasons, reasonCode: null, asOfMs: entry.asOfMs,
  };
}

/* ── FE-CAT-7: where a money cell comes from ───────────────────────────── */

const DOMAIN_WORD: Readonly<Record<ManagerEconomicDomain, string>> = { ACTUAL: "Real-funded", PAPER: "Paper", SANDBOX: "Sandbox" };
const MONEY_COLUMNS: readonly { key: string; what: string }[] = [
  { key: "allocation", what: "Allocation" }, { key: "net_pnl", what: "Net PnL" }, { key: "equity_30d_end_value", what: "Equity" },
];

/**
 * The provenance disclosure of the money columns, one line per fact, from the loaded rows' own partitions and metrics: the economic
 * domain, currency, basis and profile of each partition; per column how many of this partition's loaded rows publish a figure and how
 * complete / fresh / verified those figures say they are. Ownership is named as NOT published (FE-CAT-7): no field of the dataset says
 * whether a balance is alpha-owned or a shared account's, so the cell is the figure of the named partition and nothing more. Nothing is
 * summed or inferred; every count is a count of loaded rows.
 */
export function moneyProvenanceRows(rows: readonly ManagerRow[], metricKeys: readonly string[] | null): readonly string[] {
  const partitions = new Map<string, { domain: ManagerEconomicDomain; currency: string; basis: string; profile: string; proof: string; metrics: ManagerMetricRead[][]; rows: number }>();
  for (const row of rows) {
    for (const entry of row.economicPartitions) {
      const p = entry.partition;
      const key = JSON.stringify([p.economicDomain, p.currency, p.basis, p.nativeProfileRef]);
      const seen = partitions.get(key) ?? { domain: p.economicDomain, currency: p.currency, basis: p.basis, profile: p.nativeProfileRef, proof: p.domainProofRef,
        metrics: MONEY_COLUMNS.map(() => []), rows: 0 };
      seen.rows += 1;
      MONEY_COLUMNS.forEach((column, index) => {
        const metric = entry.metrics.get(column.key);
        if (metric !== undefined) seen.metrics[index]!.push(metric);
      });
      partitions.set(key, seen);
    }
  }
  const lines: string[] = [];
  for (const seen of partitions.values()) {
    lines.push(`${DOMAIN_WORD[seen.domain]} · ${seen.currency}: basis ${seen.basis}; profile ${seen.profile}; domain proof ${seen.proof}; ${seen.rows} loaded ${seen.rows === 1 ? "row" : "rows"}.`);
    MONEY_COLUMNS.forEach((column, index) => {
      if (metricKeys !== null && !metricKeys.includes(column.key)) return;
      const metrics = seen.metrics[index]!;
      const values = metrics.filter((metric) => metric.kind === "value");
      if (metrics.length === 0) { lines.push(`${column.what}: no loaded row publishes it in this partition.`); return; }
      const clean = values.filter((metric) => metric.quality.completeness === "COMPLETE" && metric.quality.freshness === "FRESH" && metric.sourceConfidence === "VERIFIED").length;
      lines.push(`${column.what}: ${values.length} of ${metrics.length} loaded rows publish a figure; ${clean} of them are complete, fresh and verified${metrics.length > values.length ? "; the rest are typed absences with a reason on the cell" : ""}.`);
    });
  }
  if (lines.length > 0) {
    lines.push("Ownership: not published (FE-CAT-7). Nothing in the dataset says whether a balance is alpha-owned or a shared account's, so a cell is the figure of its named partition only.");
    lines.push("Partitions are never added together: a Real-funded, a Paper and a Sandbox figure in the same currency are three figures.");
  }
  return lines;
}

/* ── group header rows (QA1 R2-07) ─────────────────────────────────────── */

/** The values a row has for a group field: one, or several for a membership field (an alpha in two stages is in both groups). */
export function groupValuesOf(row: ManagerRow, field: ManagerGroupField): readonly (string | null)[] {
  switch (field) {
    case "portfolio_id": return [row.portfolioId];
    case "current_stage": return [row.currentStage];
    case "stage_presence": return row.stagePresence.length === 0 ? [null] : row.stagePresence;
    case "owner_user_id": return [row.ownerUserId];
    case "alpha_id": return [row.alphaId];
    case "venue": return [row.venue];
    case "health": return [row.health];
    case "source_state": return [row.sourceState];
    case "lifecycle": return [row.lifecycle];
    default: return [null];
  }
}

export interface GroupedEntry {
  /** Unique per (row, group): a membership group lists the same row under each group. */
  key: string;
  row: ManagerRow;
  /** `null` without a grouping. */
  group: ManagerGroup["key"] | null;
}

const sameKey = (a: ManagerGroup["key"], b: ManagerGroup["key"]): boolean =>
  a.length === b.length && a.every((part, index) => part.field === b[index]!.field && part.value === b[index]!.value);

/**
 * The loaded rows in group order: the order of the server's groups (the whole filtered query), a group the server did not list after them.
 * Nothing is computed from the rows beyond placing each under the group its own field values name.
 */
export function groupEntries(rows: readonly ManagerRow[], fields: readonly ManagerGroupField[], groups: readonly ManagerGroup[]): readonly GroupedEntry[] {
  if (fields.length === 0) return rows.map((row) => ({ key: row.rowKey, row, group: null }));
  const buckets: { key: ManagerGroup["key"]; rows: ManagerRow[] }[] = [];
  const place = (row: ManagerRow, level: number, prefix: ManagerGroup["key"]) => {
    for (const value of groupValuesOf(row, fields[level]!)) {
      const key = [...prefix, { field: fields[level]!, value }];
      if (level + 1 < fields.length) { place(row, level + 1, key); continue; }
      let bucket = buckets.find((candidate) => sameKey(candidate.key, key));
      if (bucket === undefined) { bucket = { key, rows: [] }; buckets.push(bucket); }
      bucket.rows.push(row);
    }
  };
  for (const row of rows) place(row, 0, []);
  const rank = (key: ManagerGroup["key"]): number => { const at = groups.findIndex((group) => sameKey(group.key, key)); return at < 0 ? Number.MAX_SAFE_INTEGER : at; };
  buckets.sort((a, b) => rank(a.key) - rank(b.key));
  return buckets.flatMap((bucket) => bucket.rows.map((row) => ({ key: row.rowKey + "|" + JSON.stringify(bucket.key), row, group: bucket.key })));
}

export const findGroup = (groups: readonly ManagerGroup[], key: ManagerGroup["key"]): ManagerGroup | null => groups.find((group) => sameKey(group.key, key)) ?? null;
