/** P19 server-normalized Attempt Lineage projection. */

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  ResearchAttemptLineageResponseSchema,
  ResearchAttemptLineageNodeSchema,
  type ResearchAttemptLineageQuery,
  type ResearchAttemptLineageResponse,
} from "./lineage.contract";
import { ResearchLineageError } from "./lineage.error";
import {
  type LineageAttemptRow,
  type LineageChildRunRow,
  type LineageSnapshot,
  ResearchLineageRepository,
} from "./lineage.repository";
import { ResearchRequestedSpecSchema } from "./preflight.contract";
import { sha256ResearchJson } from "./preflight.service";

type Availability = { state: "AVAILABLE" | "NOT_PUBLISHED" | "PARTIAL"; reason_code: string | null };
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

@Injectable()
export class ResearchLineageService {
  constructor(
    private readonly repository: ResearchLineageRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async read(
    scope: ResearchScope,
    alphaId: string,
    query: ResearchAttemptLineageQuery,
  ): Promise<ResearchAttemptLineageResponse> {
    this.requireEnabled();
    const snapshot = await this.repository.read(scope, alphaId, query.limit);
    if (!snapshot) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_NOT_FOUND", "Research Alpha was not found.", 404);
    }
    return this.map(snapshot);
  }

  private map(snapshot: LineageSnapshot): ResearchAttemptLineageResponse {
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

    const attempts: Node[] = snapshot.attempts.map((row) => {
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
      return {
        attempt_id: row.attempt_id,
        parent_attempt_id: row.parent_attempt_id,
        parent_state: parentState,
        alpha_version_id: row.alpha_version_id,
        alpha_version_label: row.alpha_version_label,
        state: row.state as Node["state"],
        intent_kind: row.intent_kind as Node["intent_kind"],
        reason: boundedText(row.reason, "reason"),
        space_signature: row.space_signature,
        created_at_utc_ms: requiredUtcMs(row.created_at, "attempt creation timestamp"),
        updated_at_utc_ms: requiredUtcMs(row.updated_at, "attempt update timestamp"),
        primary_run: {
          run_id: row.primary_run_id,
          state: row.primary_run_state as Node["primary_run"]["state"],
          effective_spec_digest: row.effective_spec_digest,
          engine_release_id: row.engine_release_id,
          dataset_binding_digest: row.dataset_binding_digest,
          technical_retry_count: count(row.technical_retry_count, "technical retry count"),
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
      };
    });

    const versions = snapshot.versions.map((row) => {
      if (!VERSION_STATES.has(row.lifecycle_state)) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage Alpha version lifecycle is incompatible.", 503);
      }
      const fields = [row.promotion_attempt_id, row.promotion_run_id, row.promotion_source_contract_rev, row.promotion_source_digest, row.promotion_source_as_of];
      const published = fields.every((field) => field !== null);
      const absentFields = fields.every((field) => field === null);
      if (!published && !absentFields) {
        throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage promotion fact is incomplete.", 503);
      }
      return {
        alpha_version_id: row.alpha_version_id,
        label: versionLabel(row),
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
          }
          : {
            state: "NOT_PUBLISHED" as const,
            attempt_id: null,
            run_id: null,
            source_contract_rev: null,
            source_digest: null,
            source_as_of_utc_ms: null,
            availability: absent("P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK"),
          },
      };
    });

    const totalAttempts = count(snapshot.counts.total_attempts, "total attempt count");
    if (totalAttempts < attempts.length) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage count boundary is incompatible.", 503);
    }
    const response = {
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
      },
      coverage: {
        state: snapshot.hasMore ? "PARTIAL" as const : "COMPLETE" as const,
        reason_code: snapshot.hasMore ? "P19_BOUNDED_GRAPH_LIMIT_REACHED" : null,
        oldest_returned_created_at_utc_ms: attempts[0]?.created_at_utc_ms ?? null,
      },
      source_absences: {
        promotion_pick: promotionAbsence,
        historical_semantic_diff: semanticAbsence,
      },
      as_of_utc_ms: snapshot.asOfUtcMs,
    };
    const parsed = ResearchAttemptLineageResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchLineageError("RESEARCH_LINEAGE_UNAVAILABLE", "Attempt Lineage could not form a compatible persisted response.", 503);
    }
    return parsed.data;
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
