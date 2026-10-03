/** P19 server-normalized Attempt Lineage projection. */

import { createHmac, timingSafeEqual } from "node:crypto";
import { Inject, Injectable, Optional } from "@nestjs/common";

import { ControlApiConfig, querySigningKeys } from "../config";
import type { PortalUser } from "../domain";
import { CONTROL_API_CONFIG } from "../tokens";
import { projectResearchAlphaVersionDeclaration, type ResearchAlphaVersionDeclaration } from "./alpha-version-declaration";
import { claimSplitFromProjection, researchClaimFamily } from "./claim-family";
import type { ResearchScope } from "./contracts";
import { CurrentSourceDecimalSchema } from "./current-source.payload";
import { ResearchFoundationAtlasClient } from "./foundation.client";
import {
  LINEAGE_COUNT_KEYS,
  LINEAGE_PRESENTATION_REASONS,
  ResearchAttemptLineageResponseSchema,
  ResearchAttemptLineageNodeSchema,
  type ResearchAttemptLineageQuery,
  type ResearchAttemptLineageResponse,
} from "./lineage.contract";
import { RS02_DELTA_WFO_GLOBAL_PROFILE_ID, RS02_SIGNAL_NOTIONAL_PROFILE_ID } from "./delta-wfo.profile";
import { DELTA_CAUSAL_INNER_PROFILE } from "./delta-causal-inner.profile";
import { ResearchLineageError } from "./lineage.error";
import {
  type LineageAttemptRow,
  type LineageBoundary,
  type LineageChildRunRow,
  type LineageExercisedRow,
  type LineageSnapshot,
  type LineageVersionRow,
  ResearchLineageRepository,
} from "./lineage.repository";
import { ResearchRequestedSpecSchema, type ResearchRequestedSpec } from "./preflight.contract";
import { canonicalResearchJson, sha256ResearchJson } from "./preflight.service";
import type { ResearchRunLibraryItem } from "./run-library.contract";
import { ResearchRunLibraryService } from "./run-library.service";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PARTIAL" | "NOT_APPLICABLE";
  reason_code: string | null;
};
type PresentationReason = (typeof LINEAGE_PRESENTATION_REASONS)[number];
type Version = ResearchAttemptLineageResponse["alpha"]["versions"][number];
type RcRef = NonNullable<Node["release_candidate"]>;
type MetricFact = Node["run_facts"]["oos_sharpe"];

/** Keys a researcher declares; effective/derived echoes of the same change are not counted twice. */
const MATERIAL_KEYS = new Set([
  "strategy_id", "execution_route", "protocol", "data.dataset_id", "data.symbol", "data.timeframe",
  "optimization_mode", "optimization_schedule", "optuna_trials", "early_stopping", "random_seed",
  "parameter_space_overrides", "optimization_config", "route_params", "engine.requested_release", "engine.config_digest",
]);
const MATERIAL_CHANGE_THRESHOLD = 2 as const;
const GRADE_ORDER = ["A", "B", "C", "D"] as const;
const CURSOR_PREFIX = "lc1";
const EXACT_DECIMAL = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
const CURSOR_TIMESTAMP = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$/;

/** CG-P19-13: each count, what it includes, and its Run Library reconciliation. */
const COUNTS_DEFINITIONS: ResearchAttemptLineageResponse["counts_definitions"] = {
  version: "research.lineage-counts.v1",
  rows: [
    { key: "total_attempts", includes: "Every logical research attempt of every version of this Alpha in the workspace: draft, submitted, failed and abandoned alike. Worker retries and child runs are not attempts.", run_library_equivalent: "counters.logical_runs for ?alpha=<id> plus draft_attempts, when every submitted attempt has its PRIMARY run" },
    { key: "returned_attempts", includes: "Attempts in this bounded page (at most `limit`); equal to total_attempts only when coverage is COMPLETE.", run_library_equivalent: null },
    { key: "draft_attempts", includes: "Attempts in state DRAFT (autosaved intent, never submitted).", run_library_equivalent: null },
    { key: "submitted_attempts", includes: "Attempts in any state other than DRAFT.", run_library_equivalent: "counters.logical_runs for ?alpha=<id> (its PRIMARY rows), when every submitted attempt has its PRIMARY run" },
    { key: "failed_attempts", includes: "Attempts whose lifecycle state is FAILED.", run_library_equivalent: "claim_ledger.failed for ?alpha=<id> (FAILED runs), when each FAILED attempt's PRIMARY run is FAILED" },
    { key: "abandoned_attempts", includes: "Attempts whose lifecycle state is ABANDONED; kept on record, never deleted.", run_library_equivalent: null },
    { key: "child_runs", includes: "Non-PRIMARY runs of these attempts (audit, diagnostic, reproduction, export, verify, projection).", run_library_equivalent: "counters.worker_children for ?alpha=<id>" },
    { key: "technical_retries", includes: "Worker re-leases of the same durable job beyond the first; never an attempt or a node.", run_library_equivalent: "counters.technical_retries for ?alpha=<id>" },
    { key: "storied_returned", includes: "Returned attempts classified STORIED by research.lineage-presentation.v1.", run_library_equivalent: null },
    { key: "probe_returned", includes: "Returned attempts classified PROBE by research.lineage-presentation.v1.", run_library_equivalent: null },
  ],
};
type Node = import("zod").z.infer<typeof ResearchAttemptLineageNodeSchema>;
type FactKind = "CONFIG" | "DATA" | "ENGINE" | "ALPHA_VERSION";
type VersionLifecycleState = "DRAFT" | "ACTIVE" | "SUPERSEDED" | "ABANDONED";

const ATTEMPT_STATES = new Set([
  "DRAFT", "PREFLIGHT_VALID", "QUEUED", "CLAIMED", "RUNNING", "COMPUTE_DONE",
  "SEALING", "READY", "CANCEL_REQUESTED", "CANCELLED", "FAILED", "RECOVERY_REQUIRED", "ABANDONED",
]);
const RUN_STATES = new Set(["DRAFT", "QUEUED", "RUNNING", "SEALING", "READY", "FAILED", "CANCELLED", "RECOVERY_REQUIRED"]);
const INTENT_KINDS = new Set(["NEW", "CLONE_FOR_EXPERIMENT", "REPRODUCE_EXISTING", "UPGRADE_ENGINE_EXPERIMENT"]);
const VERSION_STATES = new Set(["DRAFT", "ACTIVE", "SUPERSEDED", "ABANDONED"]);
const RUN_KINDS = new Set(["PRIMARY", "AUDIT", "DIAGNOSTIC", "REPRODUCTION", "EXPORT", "VERIFY", "PROJECTION"]);
const RELATIONSHIP_KINDS = new Set([
  "PRIMARY", "AUDIT_OF_SELECTION", "DIAGNOSTIC_OF_RUN", "REPRODUCTION_OF_RUN",
  "EXPORT_OF_RUN", "VERIFY_OF_RUN", "PROJECTION_OF_RUN",
]);
const EXPOSURE_ROLES = new Set(["QUALITY_SCAN", "TRAIN", "SELECTION_INPUT", "OUTER_OOS", "HOLDOUT", "RETROSPECTIVE", "UNKNOWN"]);

function available(): Availability {
  return { state: "AVAILABLE", reason_code: null };
}

function absent(reason: string): Availability {
  return { state: "NOT_PUBLISHED", reason_code: reason };
}

function partial(reason: string): Availability {
  return { state: "PARTIAL", reason_code: reason };
}

function record(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function nested(value: Record<string, unknown>, key: string): Record<string, unknown> | null {
  const candidate = value[key];
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as Record<string, unknown>
    : null;
}

function utcMs(value: Date | null | undefined, label: string): number | null {
  if (value == null) return null;
  const numeric = value.getTime();
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", `Attempt Lineage ${label} is invalid.`, 503);
  }
  return numeric;
}

function requiredUtcMs(value: Date, label: string): number {
  const numeric = utcMs(value, label);
  if (numeric === null) throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", `Attempt Lineage ${label} is missing.`, 503);
  return numeric;
}

function count(value: string | number | null | undefined, label: string): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(numeric) || numeric < 0) {
    throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", `Attempt Lineage ${label} is invalid.`, 503);
  }
  return numeric;
}

function boundedText(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (value.length > 512) {
    throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", `Attempt Lineage ${label} exceeds its display budget.`, 503);
  }
  return value;
}

function safeValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.length <= 512 ? value : `sha256:${sha256ResearchJson(value)}`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value) || (value && typeof value === "object")) return `sha256:${sha256ResearchJson(value)}`;
  return null;
}

/** Exact allow-list of browser-visible semantic facts. */
function facts(row: LineageAttemptRow): Map<string, { kind: FactKind; value: string | null }> | null {
  const requestedRaw = record(row.requested_spec);
  const effectiveRaw = record(row.effective_spec);
  if (!requestedRaw || !effectiveRaw) return null;
  const requestedParsed = ResearchRequestedSpecSchema.safeParse(requestedRaw);
  if (!requestedParsed.success || effectiveRaw.schema_version !== "research.effective-spec.v1") return null;
  const requested = requestedParsed.data;
  const engine = nested(effectiveRaw, "engine");
  const dataBinding = nested(effectiveRaw, "data_binding");
  const optimization = nested(effectiveRaw, "optimization");
  const topology = nested(effectiveRaw, "topology");
  if (!engine || !dataBinding || !optimization || !topology) return null;

  const values = new Map<string, { kind: FactKind; value: string | null }>();
  const put = (path: string, kind: FactKind, value: unknown) => values.set(path, { kind, value: safeValue(value) });
  put("strategy_id", "CONFIG", requested.strategy_id);
  put("execution_route", "CONFIG", requested.execution_route);
  put("protocol", "CONFIG", requested.protocol);
  put("data.dataset_id", "DATA", requested.data.dataset_id);
  put("data.symbol", "DATA", requested.data.symbol);
  put("data.timeframe", "DATA", requested.data.timeframe);
  put("optimization_mode", "CONFIG", requested.optimization_mode);
  put("optimization_schedule", "CONFIG", requested.optimization_schedule);
  put("optuna_trials", "CONFIG", requested.optuna_trials);
  put("early_stopping", "CONFIG", requested.early_stopping);
  put("random_seed", "CONFIG", requested.random_seed);
  put("parameter_space_overrides", "CONFIG", requested.parameter_space_overrides);
  put("optimization_config", "CONFIG", requested.optimization_config);
  put("route_params", "CONFIG", requested.route_params);
  put("engine.requested_release", "ENGINE", requested.client.engine_release_id);
  put("engine.config_digest", "ENGINE", requested.client.config_digest);
  put("engine.effective_release", "ENGINE", engine.engine_release_id);
  put("engine.effective_route", "ENGINE", engine.execution_route);
  put("data.snapshot_content_hash", "DATA", dataBinding.snapshot_content_hash);
  put("data.market_content_hash", "DATA", dataBinding.market_content_hash);
  put("data.topology_digest", "DATA", topology.topology_digest);
  put("optimization.effective_mode", "CONFIG", optimization.mode);
  put("optimization.effective_schedule", "CONFIG", optimization.schedule);
  put("optimization.effective_trial_count", "CONFIG", optimization.trial_count);
  put("optimization.effective_early_stopping", "CONFIG", optimization.early_stopping);
  put("optimization.effective_random_seed", "CONFIG", optimization.random_seed);
  return values;
}

function diff(parent: LineageAttemptRow, child: LineageAttemptRow) {
  const parentFacts = facts(parent);
  const childFacts = facts(child);
  if (!parentFacts || !childFacts) {
    return {
      state: "NOT_PUBLISHED" as const,
      changes: [],
      gates_reset: parent.alpha_version_id !== child.alpha_version_id,
      availability: absent("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF"),
    };
  }
  const changes: Array<{ path: string; kind: FactKind; before: string | null; after: string | null }> = [];
  if (parent.alpha_version_id !== child.alpha_version_id) {
    changes.push({ path: "alpha_version", kind: "ALPHA_VERSION", before: parent.alpha_version_label, after: child.alpha_version_label });
  }
  const keys = [...new Set([...parentFacts.keys(), ...childFacts.keys()])].sort();
  for (const key of keys) {
    const left = parentFacts.get(key);
    const right = childFacts.get(key);
    if (!left || !right || left.value !== right.value) {
      changes.push({ path: key, kind: right?.kind ?? left?.kind ?? "CONFIG", before: left?.value ?? null, after: right?.value ?? null });
    }
  }
  if (changes.length > 48) {
    throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage diff exceeds its declared budget.", 503);
  }
  return {
    state: "AVAILABLE" as const,
    changes,
    gates_reset: parent.alpha_version_id !== child.alpha_version_id,
    availability: available(),
  };
}

function versionLabel(row: { alpha_version_id: string; declared_contract: unknown }): string {
  const contract = record(row.declared_contract);
  const version = typeof contract?.version === "string" && contract.version.length <= 120 ? contract.version : null;
  return version ? `av_${version.replaceAll(".", "_")}` : row.alpha_version_id;
}

function requestedSpec(row: LineageAttemptRow): ResearchRequestedSpec | null {
  const raw = record(row.requested_spec);
  const parsed = raw ? ResearchRequestedSpecSchema.safeParse(raw) : null;
  return parsed?.success ? parsed.data : null;
}

function declaration(row: LineageVersionRow): ResearchAlphaVersionDeclaration | null {
  const contract = record(row.declared_contract);
  if (!contract) return null;
  try {
    return projectResearchAlphaVersionDeclaration(contract, row.entrypoint);
  } catch {
    return null;
  }
}

/** Run Library availability words map onto the lineage vocabulary; the reason is kept verbatim. */
function fromLibrary(availability: { state: string; reason_code: string | null }): Availability {
  if (availability.state === "AVAILABLE") return available();
  return absent(availability.reason_code ?? "P19_RUN_LIBRARY_FACT_NOT_PUBLISHED");
}

function scalarText(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.length <= 96) return value;
  if (typeof value === "boolean") return String(value);
  return null;
}

/** Spec 10 §2.3 line: `route · mode × schedule`, allow-listed keys only. */
function specText(spec: ResearchRequestedSpec): string {
  return `${spec.execution_route} · ${spec.optimization_mode} × ${spec.optimization_schedule}`;
}

/**
 * `6p · 5 swept · 1 pinned`: the version's declared parameter space after
 * this attempt's overrides.  Declared `fixed` and overridden `pin` are pinned.
 */
function specSpace(spec: ResearchRequestedSpec, declared: ResearchAlphaVersionDeclaration | null) {
  if (!declared) return null;
  const names = Object.keys(declared.parameter_space);
  const pins = new Set(spec.parameter_space_overrides.filter((row) => row.kind === "pin").map((row) => row.name));
  const pinned = names.filter((name) => declared.parameter_space[name]!.kind === "fixed" || pins.has(name)).length;
  return { parameters: names.length, swept: names.length - pinned, pinned };
}

interface RangeAccumulator {
  kind: "SWEEP" | "PIN";
  low: number | null;
  high: number | null;
  values: Set<string>;
}

function accumulate(ranges: Map<string, RangeAccumulator>, name: string, kind: "SWEEP" | "PIN", low: unknown, high: unknown) {
  const current = ranges.get(name) ?? { kind, low: null, high: null, values: new Set<string>() };
  if (kind === "SWEEP") current.kind = "SWEEP";
  for (const value of [low, high]) {
    if (typeof value === "number" && Number.isFinite(value)) {
      current.low = current.low === null ? value : Math.min(current.low, value);
      current.high = current.high === null ? value : Math.max(current.high, value);
    } else {
      const text = scalarText(value);
      if (text !== null) current.values.add(text);
    }
  }
  ranges.set(name, current);
}

/** CG-P19-06: union of what every attempt of one version declared. */
function exercisedFor(
  rows: readonly LineageExercisedRow[],
  declared: ResearchAlphaVersionDeclaration | null,
  bounded: boolean,
): Version["exercised"] {
  const routes = new Set<string>();
  const modes = new Set<string>();
  const ranges = new Map<string, RangeAccumulator>();
  let considered = 0;
  let withoutManifest = 0;
  let overflow = bounded;
  for (const row of rows) {
    const attempts = count(row.attempts, "exercised attempt count");
    if (row.execution_route === null || row.optimization_mode === null || row.optimization_schedule === null) {
      withoutManifest += attempts;
      continue;
    }
    considered += attempts;
    routes.add(row.execution_route);
    modes.add(`${row.optimization_mode} × ${row.optimization_schedule}`);
    const overrides = Array.isArray(row.parameter_space_overrides) ? row.parameter_space_overrides : [];
    const overridden = new Set<string>();
    for (const entry of overrides) {
      const item = entry && typeof entry === "object" ? entry as Record<string, unknown> : null;
      if (!item || typeof item.name !== "string") continue;
      overridden.add(item.name);
      if (item.kind === "sweep") accumulate(ranges, item.name, "SWEEP", item.low, item.high);
      else if (item.kind === "pin") accumulate(ranges, item.name, "PIN", item.value, item.value);
    }
    for (const [name, parameter] of Object.entries(declared?.parameter_space ?? {})) {
      if (overridden.has(name)) continue;
      if (parameter.kind === "fixed") accumulate(ranges, name, "PIN", parameter.value, parameter.value);
      else if (parameter.kind === "categorical") for (const value of parameter.values) accumulate(ranges, name, "SWEEP", value, value);
      else accumulate(ranges, name, "SWEEP", parameter.low, parameter.high);
    }
  }
  const sortedRoutes = [...routes].sort();
  const sortedModes = [...modes].sort();
  const sortedRanges = [...ranges.entries()].sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  if (sortedRoutes.length > 16 || sortedModes.length > 32 || sortedRanges.length > 24) overflow = true;
  const paramRanges = sortedRanges.slice(0, 24).map(([name, range]) => {
    const values = [...range.values].sort();
    if (values.length > 16) overflow = true;
    return {
      name,
      kind: range.kind,
      low: range.low === null ? null : String(range.low),
      high: range.high === null ? null : String(range.high),
      values: values.slice(0, 16),
    };
  });
  const availability = considered === 0
    ? absent(withoutManifest > 0 ? "P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE" : "P19_VERSION_HAS_NO_ATTEMPT")
    : overflow
      ? partial("P19_EXERCISED_DECLARATIONS_BOUNDED")
      : withoutManifest > 0
        ? partial("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE")
        : available();
  return {
    routes: sortedRoutes.slice(0, 16),
    modes: sortedModes.slice(0, 32),
    param_ranges: paramRanges,
    attempts_considered: considered,
    attempts_without_manifest: withoutManifest,
    availability,
  };
}

function rcRef(item: ResearchRunLibraryItem | undefined): RcRef | null {
  if (!item?.rc) return null;
  return {
    kind: item.rc.kind,
    release_candidate_id: item.rc.release_candidate_id,
    draft_id: item.rc.draft_id,
    run_id: item.run_id,
    delivery_state: item.rc.delivery_state,
    approval_state: item.rc.approval_state,
    sealed_at_utc_ms: item.rc.sealed_at_utc_ms,
  };
}

function rcFor(
  runId: string | null,
  item: ResearchRunLibraryItem | undefined,
  wired: boolean,
): { ref: RcRef | null; availability: Availability } {
  if (runId === null) return { ref: null, availability: notApplicable("P19_ATTEMPT_HAS_NO_PRIMARY_RUN") };
  if (!item) return { ref: null, availability: absent(wired ? "P19_RUN_LIBRARY_ROW_NOT_READABLE" : "P19_RUN_LIBRARY_READER_NOT_WIRED") };
  return { ref: rcRef(item), availability: fromLibrary(item.rc_availability) };
}

function metricFromLibrary(
  item: ResearchRunLibraryItem,
  role: "OOS_SHARPE" | "DECAY",
): MetricFact | ({ value: null; reason: string } & Partial<Pick<MetricFact, "source" | "origin" | "source_locator" | "input_digest">>) {
  const cell = item.stats.find((stat) => stat.role === role);
  if (!cell) return { value: null, reason: "P19_RUN_LIBRARY_PUBLISHES_NO_PERFORMANCE_CELL_FOR_STATUS" };
  if (cell.availability.state === "AVAILABLE" && cell.value !== null && EXACT_DECIMAL.test(cell.value)) {
    const retainedMean = cell.definition_id?.startsWith("research.current-source.v1.selected-trial-mean-");
    return {
      value: cell.value,
      source: cell.source ?? (retainedMean ? "RS02_RETAINED_SELECTED_TRIAL" : "P13_EVIDENCE_PROJECTION"),
      scope: retainedMean ? "SELECTED_TRIAL_MEAN_ACROSS_FOLDS" : cell.scope,
      definition_id: cell.definition_id,
      availability: available(),
      ...(cell.origin !== undefined ? { origin: cell.origin } : {}),
      ...(cell.source_locator !== undefined ? { source_locator: cell.source_locator } : {}),
      ...(cell.input_digest !== undefined ? { input_digest: cell.input_digest } : {}),
    };
  }
  return {
    value: null, reason: cell.availability.reason_code ?? "P13_SOURCE_EVIDENCE_NOT_PUBLISHED",
    ...(cell.source !== undefined ? { source: cell.source } : {}),
    ...(cell.origin !== undefined ? { origin: cell.origin } : {}),
    ...(cell.source_locator !== undefined ? { source_locator: cell.source_locator } : {}),
    ...(cell.input_digest !== undefined ? { input_digest: cell.input_digest } : {}),
  };
}

function notApplicable(reason: string): Availability {
  return { state: "NOT_APPLICABLE", reason_code: reason };
}

@Injectable()
export class ResearchLineageService {
  constructor(
    private readonly repository: ResearchLineageRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    // W6b: the Screen-01 mapping and the Engine Atlas are optional so a
    // deployment (or a focused test) without them degrades to typed absences.
    @Optional() private readonly runLibrary?: ResearchRunLibraryService,
    @Optional() private readonly atlas?: ResearchFoundationAtlasClient,
  ) {}

  async read(
    scope: ResearchScope,
    alphaId: string,
    query: ResearchAttemptLineageQuery,
    user?: PortalUser,
  ): Promise<ResearchAttemptLineageResponse> {
    this.requireEnabled();
    const boundary = query.cursor ? this.decodeCursor(query.cursor, scope.workspaceId, alphaId, query.limit) : null;
    const snapshot = boundary
      ? await this.repository.read(scope, alphaId, query.limit, boundary)
      : await this.repository.read(scope, alphaId, query.limit);
    if (!snapshot) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_NOT_FOUND", "Research Alpha was not found.", 404);
    }
    const atlasRoutes = await this.atlasRoutes(user);
    return this.map(snapshot, { workspaceId: scope.workspaceId, alphaId, limit: query.limit }, atlasRoutes);
  }

  /** Engine Atlas routes for `untried`; an unreadable Atlas is a typed absence, never a failed lineage. */
  private async atlasRoutes(user: PortalUser | undefined): Promise<Array<{ route_id: string; status_word: string | null }> | null> {
    if (!this.atlas || !user) return null;
    try {
      const atlas = await this.atlas.read(user);
      return atlas.routes.map((route) => ({ route_id: route.route_id, status_word: route.status_word ?? null }));
    } catch {
      return null;
    }
  }

  private map(
    snapshot: LineageSnapshot,
    page: { workspaceId: string; alphaId: string; limit: number },
    atlasRoutes: Array<{ route_id: string; status_word: string | null }> | null,
  ): ResearchAttemptLineageResponse {
    const ids = new Set(snapshot.attempts.map((row) => row.attempt_id));
    const versionIds = new Set(snapshot.versions.map((row) => row.alpha_version_id));
    const children = new Map<string, LineageChildRunRow[]>();
    for (const row of snapshot.childRuns) {
      const values = children.get(row.attempt_id) ?? [];
      values.push(row);
      children.set(row.attempt_id, values);
    }

    this.assertGraph(snapshot, ids, versionIds);
    const byId = new Map(snapshot.attempts.map((row) => [row.attempt_id, row]));
    const versionRows = new Map(snapshot.versions.map((row) => [row.alpha_version_id, row]));
    const labels = new Map(snapshot.versions.map((row) => [row.alpha_version_id, versionLabel(row)]));
    const declarations = new Map(snapshot.versions.map((row) => [row.alpha_version_id, declaration(row)]));
    const library = new Map<string, ResearchRunLibraryItem>();
    if (this.runLibrary) {
      for (const row of snapshot.libraryRows ?? []) {
        try {
          library.set(row.run_id, this.runLibrary.mapRow(row));
        } catch {
          // An incompatible Library row stays a typed absence for its cells;
          // the lineage graph itself is still exact.
        }
      }
    }
    const retained = new Map<string, Record<string, unknown>>();
    for (const row of snapshot.retainedMetrics ?? []) {
      const metrics = record(row.metrics);
      // LAST_FOLD_DEPLOYMENT's mean_oos/decay describe its INNER candidate
      // validation. The original selected-trial fallback is not an outer-OOS
      // aggregate on a causal lane; Library's own all-time facts remain first.
      if (metrics && (row.profile_id !== DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id
        || row.source_attested === true && metrics.basis === "OUTER_FOLD_SELECTED_OOS_MEAN")) retained.set(row.run_id, metrics);
    }
    const attestedClaims = new Map<string, string>();
    for (const row of snapshot.retainedMetrics ?? []) {
      if (row.source_attested === true && (
        row.validation_claim === "walk_forward_oos" && (row.profile_id === RS02_DELTA_WFO_GLOBAL_PROFILE_ID
          || row.profile_id === RS02_SIGNAL_NOTIONAL_PROFILE_ID)
        || row.validation_claim === "strict_nested_fold_local_retraining"
          && row.profile_id === DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id
      )) {
        attestedClaims.set(row.run_id, row.validation_claim);
      }
    }
    const claimSplits = new Map((snapshot.claimSplits ?? []).map((row) => [
      row.run_id, claimSplitFromProjection(record(row.projection)),
    ]));

    const semanticAbsence = snapshot.attempts.some((row) => {
      if (row.parent_attempt_id === null) return false;
      const parent = byId.get(row.parent_attempt_id);
      return parent !== undefined && (facts(row) === null || facts(parent) === null);
    })
      ? absent("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE_FOR_PARENT_DIFF")
      : available();
    const promotionAbsence = snapshot.versions.some((row) => row.promotion_attempt_id === null)
      ? absent("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK")
      : available();

    const totalAttempts = count(snapshot.counts.total_attempts, "total attempt count");
    // This is the full same-workspace/Alpha prefix in the repository's exact
    // repeatable-read census, not the position in a response page. Existing
    // microsecond created_at + opaque-id keyset order is the presentation
    // basis; the immutable attempt_id remains the only identity.
    const ordinalUpperBound = snapshot.counts.attempts_before_boundary !== undefined
      ? count(snapshot.counts.attempts_before_boundary, "logical attempt prefix")
      : snapshot.window === "OLDER_PAGE" ? null : totalAttempts;
    if (totalAttempts < snapshot.attempts.length || ordinalUpperBound !== null
      && (ordinalUpperBound > totalAttempts || ordinalUpperBound < snapshot.attempts.length)) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage count boundary is incompatible.", 503);
    }
    const attempts: Node[] = snapshot.attempts.map((row, index) => {
      const parent = row.parent_attempt_id ? byId.get(row.parent_attempt_id) : undefined;
      const parentState = row.parent_attempt_id === null
        ? "ROOT" as const
        : parent ? "RETURNED" as const : "OUTSIDE_RETURNED_GRAPH" as const;
      const semanticDiff = row.parent_attempt_id === null
        ? { state: "ROOT" as const, changes: [], gates_reset: false, availability: available() }
        : parent
          ? diff(parent, row)
          : {
            state: "PARENT_OUTSIDE_RETURNED_GRAPH" as const,
            changes: [],
            gates_reset: false,
            availability: partial("P19_PARENT_OUTSIDE_BOUNDED_GRAPH"),
          };
      const exposureCount = count(row.exposure_count, "exposure count");
      const roles = [...new Set(row.exposure_roles ?? [])].sort();
      if (roles.some((role) => !EXPOSURE_ROLES.has(role))) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage exposure role is incompatible.", 503);
      }
      const returnedChildRuns = children.get(row.attempt_id) ?? [];
      const childRunsPartial = returnedChildRuns.length > 32;
      const childRuns = returnedChildRuns
        .slice(0, 32)
        .filter((child) => child.relationship_kind !== "PRIMARY")
        .map((child) => {
          if (!RUN_KINDS.has(child.run_kind) || !RELATIONSHIP_KINDS.has(child.relationship_kind) || !RUN_STATES.has(child.state)) {
            throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage child relationship is incompatible.", 503);
          }
          return {
            run_id: child.run_id,
            run_kind: child.run_kind as Node["child_runs"][number]["run_kind"],
            relationship_kind: child.relationship_kind as Node["child_runs"][number]["relationship_kind"],
            parent_run_id: child.parent_run_id,
            state: child.state as Node["child_runs"][number]["state"],
            created_at_utc_ms: requiredUtcMs(child.created_at, "child run timestamp"),
          };
        });
      if (!ATTEMPT_STATES.has(row.state) || !INTENT_KINDS.has(row.intent_kind)) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage lifecycle is incompatible.", 503);
      }
      if (row.primary_run_state !== null && !RUN_STATES.has(row.primary_run_state)) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage primary run lifecycle is incompatible.", 503);
      }
      const item = row.primary_run_id ? library.get(row.primary_run_id) : undefined;
      const rc = rcFor(row.primary_run_id, item, this.runLibrary !== undefined);
      const spec = requestedSpec(row);
      const space = spec ? specSpace(spec, declarations.get(row.alpha_version_id) ?? null) : null;
      const claimFamily = researchClaimFamily({
        validationClaim: row.primary_run_id ? attestedClaims.get(row.primary_run_id) ?? null : null,
        split: row.primary_run_id ? claimSplits.get(row.primary_run_id) ?? null : null,
      });
      const runFacts = this.runFacts(row, item, row.primary_run_id ? retained.get(row.primary_run_id) : undefined, claimFamily);
      const reason = boundedText(row.reason, "reason");
      return {
        attempt_id: row.attempt_id,
        display_label: ordinalUpperBound === null ? null
          : `att_${String(ordinalUpperBound - snapshot.attempts.length + index + 1).padStart(2, "0")}`,
        display_label_basis: "PRESENTATION_ONLY_WORKSPACE_ALPHA_CREATED_AT_ID_V1",
        display_label_availability: ordinalUpperBound === null
          ? absent("P19_LOGICAL_ATTEMPT_HISTORY_PREFIX_NOT_PUBLISHED") : available(),
        parent_attempt_id: row.parent_attempt_id,
        parent_state: parentState,
        alpha_version_id: row.alpha_version_id,
        alpha_version_label: row.alpha_version_label,
        state: row.state as Node["state"],
        intent_kind: row.intent_kind as Node["intent_kind"],
        // W5a · P19: a Screen-07 what-if fork names its relation explicitly.
        relation_to_parent: row.relation_kind === "SIBLING_OF" ? "SIBLING_OF" as const : null,
        reason,
        space_signature: row.space_signature,
        created_at_utc_ms: requiredUtcMs(row.created_at, "attempt creation timestamp"),
        updated_at_utc_ms: requiredUtcMs(row.updated_at, "attempt update timestamp"),
        primary_run: {
          run_id: row.primary_run_id,
          // D1 (10-3): the Library row is already joined here for `rc`, so
          // the label costs nothing extra and cannot drift from Screen 01's.
          // Without the Library reader wired it stays null, like `rc` does.
          display_label: item?.display_label ?? null,
          state: row.primary_run_state as Node["primary_run"]["state"],
          effective_spec_digest: row.effective_spec_digest,
          engine_release_id: row.engine_release_id,
          dataset_binding_digest: row.dataset_binding_digest,
          technical_retry_count: count(row.technical_retry_count, "technical retry count"),
          execution_profile_id: row.primary_run_id ? (row.execution_profile_id ?? null) : null,
        },
        child_runs: childRuns,
        child_runs_coverage: {
          state: childRunsPartial ? "PARTIAL" : "COMPLETE",
          reason_code: childRunsPartial ? "P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT" : null,
        },
        semantic_diff: semanticDiff,
        exposure: {
          state: exposureCount > 0 ? "RECORDED" : "NOT_PUBLISHED",
          count: exposureCount,
          roles: roles as Node["exposure"]["roles"],
          latest_source_as_of_utc_ms: utcMs(row.latest_source_as_of, "exposure source timestamp"),
          availability: exposureCount > 0 ? available() : absent("P19_NO_EXPOSURE_FACT_PUBLISHED_FOR_ATTEMPT"),
        },
        // Filled below, once every node's facts are known.
        presentation_kind: "PROBE" as const,
        presentation_reasons: [] as PresentationReason[],
        promotion_state: "AWAITING_PICK" as const,
        promotion_reason_code: null,
        spec_label: spec
          ? {
            text: specText(spec),
            space,
            availability: space ? available() : partial("P19_ALPHA_DECLARATION_PARAMETER_SPACE_NOT_READABLE"),
          }
          : { text: null, space: null, availability: absent("P19_PERSISTED_PREFLIGHT_MANIFEST_NOT_AVAILABLE") },
        release_candidate: rc.ref,
        release_candidate_availability: rc.availability,
        run_facts: runFacts,
        outcome: reason !== null
          ? { text: reason, source: "ATTEMPT_REASON" as const, availability: available() }
          : runFacts.claim.text !== null && runFacts.claim.availability.state === "AVAILABLE"
            ? { text: runFacts.claim.text, source: "SOURCE_CLAIM_SENTENCE" as const, availability: available() }
            : {
              text: null,
              source: null,
              availability: row.primary_run_id === null
                ? notApplicable("P19_ATTEMPT_HAS_NO_PRIMARY_RUN")
                : absent(runFacts.claim.availability.reason_code ?? "P19_NO_OUTCOME_SENTENCE_PUBLISHED"),
            },
      };
    });

    const versions: Version[] = snapshot.versions.map((row) => {
      if (!VERSION_STATES.has(row.lifecycle_state)) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage Alpha version lifecycle is incompatible.", 503);
      }
      const fields = [row.promotion_attempt_id, row.promotion_run_id, row.promotion_source_contract_rev, row.promotion_source_digest, row.promotion_source_as_of];
      const published = fields.every((field) => field !== null);
      const absentFields = fields.every((field) => field === null);
      if (!published && !absentFields) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage promotion fact is incomplete.", 503);
      }
      const pickRc = published
        ? rcFor(row.promotion_run_id, library.get(row.promotion_run_id!), this.runLibrary !== undefined)
        : { ref: null, availability: notApplicable("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK") };
      const sourceAuthority = { owner: "P22_RELEASE_CANDIDATE_APPROVAL" as const, state: published ? "CONNECTED" as const : "NOT_CONNECTED" as const };
      const receiptCount = Number(row.promotion_receipt_count ?? 0);
      const exactReceipt = published && receiptCount === 1;
      const selectionAbsent = !published
        ? notApplicable("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK")
        : absent(receiptCount > 1 ? "P19_P22_PICK_RECEIPT_AMBIGUOUS" : "P19_P22_PICK_RECEIPT_NOT_AVAILABLE");
      const selectedTrialId = exactReceipt ? row.promotion_selected_trial_id ?? null : null;
      const selectedParamsDigest = exactReceipt ? row.promotion_selected_params_digest ?? null : null;
      const approvalId = exactReceipt && typeof row.promotion_approval_id === "string"
        && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(row.promotion_approval_id)
        ? row.promotion_approval_id : null;
      return {
        alpha_version_id: row.alpha_version_id,
        label: labels.get(row.alpha_version_id)!,
        code_digest: row.code_digest,
        entrypoint: row.entrypoint,
        lifecycle_state: row.lifecycle_state as VersionLifecycleState,
        registered_at_utc_ms: requiredUtcMs(row.registered_at, "Alpha version timestamp"),
        promotion_pick: published
          ? {
            state: "PUBLISHED" as const,
            attempt_id: row.promotion_attempt_id,
            run_id: row.promotion_run_id,
            source_contract_rev: row.promotion_source_contract_rev,
            source_digest: row.promotion_source_digest,
            source_as_of_utc_ms: requiredUtcMs(row.promotion_source_as_of!, "promotion source timestamp"),
            availability: available(),
            selected_trial_id: selectedTrialId,
            selected_trial_availability: selectedTrialId ? available()
              : exactReceipt ? absent("P19_P22_SELECTED_TRIAL_NOT_PUBLISHED") : selectionAbsent,
            selected_params_digest: selectedParamsDigest,
            selected_params_availability: selectedParamsDigest ? available()
              : exactReceipt ? absent("P19_P21_SELECTED_PARAMS_DIGEST_NOT_PUBLISHED") : selectionAbsent,
            // The receipt does not carry a fold fact. In particular, the
            // numeric part of a global selected_trial_id is not a fold.
            fold: null,
            fold_availability: absent("P19_P22_SELECTED_FOLD_NOT_PUBLISHED"),
            approval_href: approvalId ? `/governance/approvals/${approvalId}/r1` : null,
            approval_availability: approvalId ? available()
              : exactReceipt ? absent("P19_P22_APPROVAL_BINDING_NOT_AVAILABLE") : selectionAbsent,
            source_authority: sourceAuthority,
            release_candidate: pickRc.ref,
            release_candidate_availability: pickRc.availability,
          }
          : {
            state: "NOT_PUBLISHED" as const,
            attempt_id: null,
            run_id: null,
            source_contract_rev: null,
            source_digest: null,
            source_as_of_utc_ms: null,
            availability: absent("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"),
            selected_trial_id: null,
            selected_trial_availability: selectionAbsent,
            selected_params_digest: null,
            selected_params_availability: selectionAbsent,
            fold: null,
            fold_availability: notApplicable("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"),
            approval_href: null,
            approval_availability: notApplicable("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"),
            source_authority: sourceAuthority,
            release_candidate: null,
            release_candidate_availability: pickRc.availability,
          },
        // Composed after the attempts are classified.
        outcome: { text: null, rule: "research.lineage-version-outcome.v1" as const, availability: absent("P19_VERSION_HAS_NO_RETURNED_ATTEMPT") },
        supersession: this.supersession(row, snapshot.versions, labels),
        exercised: exercisedFor(
          (snapshot.exercised ?? []).filter((group) => group.alpha_version_id === row.alpha_version_id),
          declarations.get(row.alpha_version_id) ?? null,
          snapshot.exercisedBounded === true,
        ),
        untried: { routes: [], availability: absent("P19_ENGINE_ATLAS_NOT_READABLE") },
        presentation: { storied: 0, probe: 0, basis: "RETURNED_ATTEMPTS" as const },
      };
    });
    const versionById = new Map(versions.map((version) => [version.alpha_version_id, version]));

    // CG-P19-03 / CG-P19-14: classification and promotion standing need the
    // node's own diff/rc and its version's pick; both are persisted facts.
    for (const node of attempts) {
      const version = versionById.get(node.alpha_version_id);
      const versionRow = versionRows.get(node.alpha_version_id);
      const pick = version?.promotion_pick;
      const reasons: PresentationReason[] = [];
      if (pick?.state === "PUBLISHED" && pick.attempt_id === node.attempt_id) reasons.push("PROMOTION_PICK");
      if (node.release_candidate !== null) reasons.push("RELEASE_CANDIDATE");
      if (versionRow?.first_attempt_id === node.attempt_id) reasons.push("VERSION_FIRST_ATTEMPT");
      if (node.semantic_diff.gates_reset) reasons.push("GATES_RESET");
      const material = node.semantic_diff.state === "AVAILABLE"
        ? node.semantic_diff.changes.filter((change) => MATERIAL_KEYS.has(change.path)).length
        : 0;
      if (material >= MATERIAL_CHANGE_THRESHOLD) reasons.push("MATERIAL_CHANGES");
      node.presentation_reasons = reasons;
      node.presentation_kind = reasons.length > 0 ? "STORIED" : "PROBE";
      const standing = this.promotion(node, version);
      node.promotion_state = standing.state;
      node.promotion_reason_code = standing.reason;
    }
    for (const version of versions) {
      const own = attempts.filter((node) => node.alpha_version_id === version.alpha_version_id);
      version.presentation = {
        storied: own.filter((node) => node.presentation_kind === "STORIED").length,
        probe: own.filter((node) => node.presentation_kind === "PROBE").length,
        basis: "RETURNED_ATTEMPTS",
      };
      version.outcome = this.versionOutcome(version, own, snapshot.hasMore || snapshot.window === "OLDER_PAGE");
      version.untried = this.untried(version, atlasRoutes);
    }

    if (totalAttempts < attempts.length) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage count boundary is incompatible.", 503);
    }
    const oldest = snapshot.attempts[0];
    const olderCursor = snapshot.hasMore && oldest?.created_at_cursor
      ? this.encodeCursor(page, oldest.created_at_cursor, oldest.attempt_id)
      : null;
    const body = {
      schema_version: "research.attempt-lineage.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      alpha: {
        alpha_id: snapshot.alpha.alpha_id,
        name: snapshot.alpha.name,
        active_version_id: snapshot.alpha.active_version_id,
        active_version_state: snapshot.alpha.active_version_state,
        active_version_availability: snapshot.alpha.active_version_id === null
          ? absent("P19_ALPHA_HAS_NO_ACTIVE_VERSION")
          : available(),
        versions,
      },
      attempts,
      counts: {
        total_attempts: totalAttempts,
        returned_attempts: attempts.length,
        draft_attempts: count(snapshot.counts.draft_attempts, "draft attempt count"),
        submitted_attempts: count(snapshot.counts.submitted_attempts, "submitted attempt count"),
        failed_attempts: count(snapshot.counts.failed_attempts, "failed attempt count"),
        abandoned_attempts: count(snapshot.counts.abandoned_attempts, "abandoned attempt count"),
        child_runs: count(snapshot.counts.child_runs, "child run count"),
        technical_retries: count(snapshot.counts.technical_retries, "total technical retry count"),
        storied_returned: attempts.filter((node) => node.presentation_kind === "STORIED").length,
        probe_returned: attempts.filter((node) => node.presentation_kind === "PROBE").length,
      },
      counts_definitions: COUNTS_DEFINITIONS,
      presentation_rule: {
        version: "research.lineage-presentation.v1" as const,
        storied_when: [...LINEAGE_PRESENTATION_REASONS],
        material_change_threshold: MATERIAL_CHANGE_THRESHOLD,
      },
      coverage: {
        state: snapshot.hasMore || snapshot.window === "OLDER_PAGE" ? "PARTIAL" as const : "COMPLETE" as const,
        reason_code: snapshot.hasMore || snapshot.window === "OLDER_PAGE" ? "P19_BOUNDED_GRAPH_LIMIT_REACHED" : null,
        oldest_returned_created_at_utc_ms: attempts[0]?.created_at_utc_ms ?? null,
        window: snapshot.window ?? "NEWEST" as const,
        older_cursor: olderCursor,
      },
      source_absences: {
        promotion_pick: promotionAbsence,
        historical_semantic_diff: semanticAbsence,
      },
    };
    // CG-P19-02: the revision covers every fact above; the snapshot time is
    // provenance, not content, so an unchanged lineage revalidates as 304.
    const revision = `p19r2_${sha256ResearchJson(body)}`;
    const response = { ...body, as_of_utc_ms: snapshot.asOfUtcMs, lineage_revision: revision, etag: `"${revision}"` };
    const parsed = ResearchAttemptLineageResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage could not form a compatible persisted response.", 503);
    }
    return parsed.data;
  }

  /** CG-P19-05: the Screen-01 cells of the primary run, else the retained RS-02 selected trial. */
  private runFacts(
    row: LineageAttemptRow,
    item: ResearchRunLibraryItem | undefined,
    retained: Record<string, unknown> | undefined,
    family: ReturnType<typeof researchClaimFamily>,
  ): Node["run_facts"] {
    if (row.primary_run_id === null) {
      const none = notApplicable("P19_ATTEMPT_HAS_NO_PRIMARY_RUN");
      const metric = { value: null, source: null, scope: null, definition_id: null, availability: none };
      return {
        certificate: { grade: null, availability: none },
        claim: {
          state: null, text: null, availability: none,
          family: "NOT_PUBLISHED", family_origin: "NOT_PUBLISHED", family_availability: none,
        },
        oos_sharpe: metric,
        decay: metric,
      };
    }
    const unreadable = absent(this.runLibrary ? "P19_RUN_LIBRARY_ROW_NOT_READABLE" : "P19_RUN_LIBRARY_READER_NOT_WIRED");
    const metric = (role: "OOS_SHARPE" | "DECAY", retainedKey: "mean_oos_sharpe" | "mean_decay", definition: string): MetricFact => {
      const fromLibraryCell = item ? metricFromLibrary(item, role) : { value: null, reason: unreadable.reason_code! };
      if (fromLibraryCell.value !== null) return fromLibraryCell as MetricFact;
      const value = retained?.[retainedKey];
      if (typeof value === "string" && CurrentSourceDecimalSchema.safeParse(value).success) {
        const outer = retained?.basis === "OUTER_FOLD_SELECTED_OOS_MEAN";
        return {
          value,
          source: outer ? "RS02_RETAINED_OUTER_FOLD_SELECTIONS" : "RS02_RETAINED_SELECTED_TRIAL",
          scope: outer ? "OUTER_FOLD_SELECTED_OOS_MEAN" : "SELECTED_TRIAL_MEAN_ACROSS_FOLDS",
          definition_id: outer ? retainedKey === "mean_oos_sharpe"
            ? "research.current-source.v1.outer-fold-selected-oos-sharpe-mean"
            : "research.current-source.v1.outer-fold-mean-inner-is-mean-minus-outer-oos" : definition,
          availability: available(),
          ...(outer ? { origin: "PORTAL_DERIVED" as const } : {}),
        };
      }
      const missing = fromLibraryCell as { reason: string } & Partial<MetricFact>;
      return {
        value: null, source: missing.source ?? null, scope: null, definition_id: null, availability: absent(missing.reason),
        ...(missing.origin !== undefined ? { origin: missing.origin } : {}),
        ...(missing.source_locator !== undefined ? { source_locator: missing.source_locator } : {}),
        ...(missing.input_digest !== undefined ? { input_digest: missing.input_digest } : {}),
      };
    };
    return {
      certificate: item
        ? { grade: item.certificate.grade, availability: fromLibrary(item.certificate.availability) }
        : { grade: null, availability: unreadable },
      claim: item
        ? { state: item.claim.state, text: item.claim.text, availability: fromLibrary(item.claim.availability),
            family: family.family, family_origin: family.origin, family_availability: family.availability }
        : { state: null, text: null, availability: unreadable,
            family: family.family, family_origin: family.origin, family_availability: family.availability },
      oos_sharpe: metric("OOS_SHARPE", "mean_oos_sharpe", "research.current-source.v1.selected-trial-mean-oos-sharpe"),
      decay: metric("DECAY", "mean_decay", "research.current-source.v1.selected-trial-mean-decay"),
    };
  }

  /**
   * CG-P19-14: a lifecycle/source fact, first match wins — the version's
   * published pick; a closed version or a terminal attempt; otherwise the
   * version is waiting for a pick.  Nothing is compared or ranked.
   */
  private promotion(node: Node, version: Version | undefined): { state: Node["promotion_state"]; reason: string | null } {
    const pick = version?.promotion_pick;
    if (pick?.state === "PUBLISHED") {
      return pick.attempt_id === node.attempt_id
        ? { state: "PICKED", reason: null }
        : { state: "NOT_PICKED", reason: "P19_VERSION_PICK_NAMES_ANOTHER_ATTEMPT" };
    }
    if (version && (version.lifecycle_state === "SUPERSEDED" || version.lifecycle_state === "ABANDONED")) {
      return { state: "CLOSED", reason: "P19_VERSION_NOT_ACTIVE_PROMOTION_CLOSED" };
    }
    if (node.state === "ABANDONED" || node.state === "FAILED" || node.state === "CANCELLED") {
      return { state: "CLOSED", reason: "P19_ATTEMPT_STATE_CANNOT_PROMOTE" };
    }
    return { state: "AWAITING_PICK", reason: "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK" };
  }

  /**
   * CG-P19-07 `research.lineage-version-outcome.v1`: the highest certificate
   * grade the source issued on this version's returned attempts (a governance
   * grade, not a metric), then the rc and pick facts, or "promote closed".
   */
  private versionOutcome(version: Version, own: readonly Node[], bounded: boolean): Version["outcome"] {
    const rule = "research.lineage-version-outcome.v1" as const;
    if (own.length === 0) return { text: null, rule, availability: absent("P19_VERSION_HAS_NO_RETURNED_ATTEMPT") };
    const grades = own.map((node) => node.run_facts.certificate.grade).filter((grade): grade is NonNullable<typeof grade> => grade !== null);
    const best = GRADE_ORDER.find((grade) => grades.includes(grade)) ?? null;
    const parts = [best ? `best cert ${best}` : "cert not issued"];
    if (version.lifecycle_state === "SUPERSEDED" || version.lifecycle_state === "ABANDONED") {
      parts.push("promote closed");
    } else {
      const sealed = own.some((node) => node.release_candidate?.kind === "LOCAL_SEAL");
      const drafted = own.some((node) => node.release_candidate?.kind === "ACTOR_DRAFT");
      parts.push(sealed ? "rc sealed" : drafted ? "rc_ draft" : "no rc");
      parts.push(version.promotion_pick.state === "PUBLISHED" && version.promotion_pick.attempt_id
        ? `pick ${version.promotion_pick.attempt_id}`
        : "no pick published");
    }
    return {
      text: parts.join(" · ").slice(0, 240),
      rule,
      availability: bounded ? partial("P19_BOUNDED_GRAPH_LIMIT_REACHED") : available(),
    };
  }

  /** CG-P19-07: the RF-03 successor that names this version as its predecessor. */
  private supersession(row: LineageVersionRow, all: readonly LineageVersionRow[], labels: ReadonlyMap<string, string>): Version["supersession"] {
    const successor = all.find((candidate) => candidate.supersedes_alpha_version_id === row.alpha_version_id);
    if (successor) {
      return {
        state: "RECORDED",
        superseded_by_version_id: successor.alpha_version_id,
        superseded_by_label: labels.get(successor.alpha_version_id) ?? successor.alpha_version_id,
        reason_code: null,
      };
    }
    if (row.lifecycle_state === "SUPERSEDED") {
      return { state: "NOT_RECORDED", superseded_by_version_id: null, superseded_by_label: null, reason_code: "P19_SUPERSESSION_PREDATES_RF03_PREDECESSOR_RECORD" };
    }
    return { state: "NOT_APPLICABLE", superseded_by_version_id: null, superseded_by_label: null, reason_code: "P19_VERSION_NOT_SUPERSEDED" };
  }

  /** CG-P19-06: Atlas routes (not DEFERRED) that no attempt of the version declared. */
  private untried(version: Version, atlasRoutes: Array<{ route_id: string; status_word: string | null }> | null): Version["untried"] {
    if (atlasRoutes === null) return { routes: [], availability: absent("P19_ENGINE_ATLAS_NOT_READABLE") };
    if (version.exercised.availability.state === "NOT_PUBLISHED") {
      return { routes: [], availability: absent(version.exercised.availability.reason_code ?? "P19_EXERCISED_NOT_PUBLISHED") };
    }
    const tried = new Set(version.exercised.routes);
    const routes = atlasRoutes
      .filter((route) => route.status_word !== "DEFERRED" && !tried.has(route.route_id))
      .slice(0, 32);
    return {
      routes,
      availability: version.exercised.availability.state === "PARTIAL"
        ? partial(version.exercised.availability.reason_code ?? "P19_EXERCISED_DECLARATIONS_BOUNDED")
        : available(),
    };
  }

  /* ---------------------------------------------------------- CG-P19-09 cursor */

  private cursorKey(): { keyId: string; key: string } {
    const keys = querySigningKeys(this.config);
    const keyId = this.config.QUERY_CURSOR_ACTIVE_KEY_ID;
    const key = keys[keyId];
    if (!key) throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage paging is not configured.", 503);
    return { keyId, key };
  }

  private cursorPayload(page: { workspaceId: string; alphaId: string; limit: number }, createdAt: string, attemptId: string): string {
    return Buffer.from(canonicalResearchJson({ a: page.alphaId, c: createdAt, i: attemptId, l: page.limit, r: "research.attempt-lineage.v1", w: page.workspaceId }), "utf8")
      .toString("base64url");
  }

  /**
   * Deterministic and signed: the same boundary always yields the same token,
   * so it can sit inside the revalidated body; attempts are append-only, so a
   * boundary never goes stale.  It binds workspace, Alpha and limit.
   */
  private encodeCursor(page: { workspaceId: string; alphaId: string; limit: number }, createdAt: string, attemptId: string): string {
    const { keyId, key } = this.cursorKey();
    const payload = this.cursorPayload(page, createdAt, attemptId);
    const signature = createHmac("sha256", key).update(`${CURSOR_PREFIX}.${keyId}.${payload}`).digest("base64url");
    return `${CURSOR_PREFIX}.${keyId}.${payload}.${signature}`;
  }

  private decodeCursor(token: string, workspaceId: string, alphaId: string, limit: number): LineageBoundary {
    const invalid = () => new ResearchLineageError("RESEARCH_LINEAGE_INVALID", "Attempt Lineage cursor is not valid for this Alpha, workspace or limit.", 400);
    const [prefix, keyId, payload, signature, ...rest] = token.split(".");
    if (prefix !== CURSOR_PREFIX || !keyId || !payload || !signature || rest.length > 0) throw invalid();
    const keys = querySigningKeys(this.config);
    const key = keys[keyId];
    if (!key) throw invalid();
    const wanted = createHmac("sha256", key).update(`${CURSOR_PREFIX}.${keyId}.${payload}`).digest();
    const actual = Buffer.from(signature, "base64url");
    if (actual.toString("base64url") !== signature || actual.length !== wanted.length || !timingSafeEqual(actual, wanted)) throw invalid();
    let decoded: Record<string, unknown>;
    try {
      decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch {
      throw invalid();
    }
    if (decoded.r !== "research.attempt-lineage.v1" || decoded.w !== workspaceId || decoded.a !== alphaId || decoded.l !== limit
        || typeof decoded.c !== "string" || !CURSOR_TIMESTAMP.test(decoded.c)
        || typeof decoded.i !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,190}$/.test(decoded.i)) {
      throw invalid();
    }
    return { createdAt: decoded.c, attemptId: decoded.i };
  }

  private assertGraph(snapshot: LineageSnapshot, ids: Set<string>, versionIds: Set<string>): void {
    const parentById = new Map<string, string | null>();
    for (const row of snapshot.attempts) {
      if (parentById.has(row.attempt_id)) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage contains a duplicate node.", 503);
      }
      if (!versionIds.has(row.alpha_version_id)) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage version scope is incompatible.", 503);
      }
      if (row.parent_attempt_id !== null && row.parent_alpha_id !== snapshot.alpha.alpha_id) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage parent crosses Alpha scope.", 503);
      }
      parentById.set(row.attempt_id, row.parent_attempt_id);
    }
    // The database trigger already blocks cycles at write time.  Repeat the
    // check at read time so a repaired/imported bad row cannot cause an
    // unbounded browser traversal or disguise corruption as a root node.
    for (const id of ids) {
      const visited = new Set<string>();
      let cursor: string | null | undefined = id;
      while (cursor && ids.has(cursor)) {
        if (visited.has(cursor)) {
          throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage contains a parent cycle.", 503);
        }
        visited.add(cursor);
        cursor = parentById.get(cursor);
      }
    }
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_LINEAGE !== "true") {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage is not enabled in this deployment.", 503);
    }
    if (this.config.FEATURE_RESEARCH_RUN_LIBRARY !== "true") {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage requires the retained Run Library reader.", 503);
    }
  }
}
