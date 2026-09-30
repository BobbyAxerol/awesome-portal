/**
 * W5a · A10c — Screen-07 what-if: exact-evaluation read + one explicit job.
 *
 * READ (inside the current-source freeze GET): builds the 81-cell grid around
 * the sealed θ*, and fills a cell only from an evaluation that already exists
 * with the SAME evaluation key — a retained parent trial, or a sealed
 * WHATIF_GRID row from an earlier diagnostic job. No engine, no job, no
 * interpolation: a cell with no exact evaluation is MISSING (or QUEUED while
 * an admitted job covers it).
 *
 * EVALUATE (explicit POST only): admits ONE bounded diagnostic Research job
 * (≤81 unique evaluations, deduplicated by grid key) through the same P10
 * producer → P06 claim → Portal child path as a WFO run, with its own
 * DIAGNOSTIC attempt and a DIAGNOSTIC_OF_RUN run. It never writes to the
 * parent run, its seal, its selection or its passport.
 */

import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { FacadeError, PortalProxyService } from "../facade/proxy.service";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { ResearchMetadataError } from "./contracts";
import { bytesBlockChain, type ArtifactByteVerification } from "./artifact-verify.contract";
import { DEFAULT_PARAMETER_BINDING_REGISTRY, exactDecimalText } from "./parameter-binding.registry";
import { ResearchMetadataRepository } from "./repository";
import {
  buildWhatIfGrid,
  canonicalDecimal,
  canonicalParameters,
  subtractDecimal,
  WhatIfGridError,
  type DeclaredAxisRange,
  type WhatIfGrid,
} from "./whatif.grid";
import {
  WHATIF_PROFILE,
  WHATIF_PROFILE_DIGEST,
  WHATIF_PROFILE_ID,
  WHATIF_RESOURCE_CLASS,
  WHATIF_RESOURCE_PROFILE,
  WHATIF_WORK_SCHEMA_VERSION,
} from "./whatif.profile";
import {
  ResearchWhatIfEvaluateResponseSchema,
  WhatIfSchema,
  type ResearchWhatIfEvaluateResponse,
  type WhatIf,
  type WhatIfCell,
} from "./whatif.contract";
import { ResearchWhatIfError } from "./whatif.error";
import { ResearchWhatIfRepository, type WhatIfJobRow, type WhatIfParentFacts } from "./whatif.repository";

export interface WhatIfBasis {
  runId: string;
  /** The sealed frozen selection (θ*) as exact decimal strings. */
  frozen: Record<string, string>;
  /** Retained parent TRIAL rows: id, state, objective, parameters. */
  trials: { trialId: string; state: string; objective: string | null; parameters: Record<string, string> }[];
  bytes: ArtifactByteVerification;
}

const NOT_ENABLED = "P16_WHATIF_NOT_ENABLED";
const NO_WFO_PROFILE_BINDING = "P16_WHATIF_PARENT_PROFILE_BINDING_NOT_REGISTERED";
const BYTES_BLOCK = "P16_WHATIF_BLOCKED_UNTIL_THE_FROZEN_CHAIN_IS_RESOLVED";
const NOTHING = "P16_WHATIF_EVERY_UNIQUE_EVALUATION_ALREADY_EXISTS";
const IN_FLIGHT = "P16_WHATIF_DIAGNOSTIC_JOB_IN_FLIGHT";
const SIBLING_BLOCKED = "P16_SIBLING_DRAFT_BLOCKED_UNTIL_THE_FROZEN_CHAIN_IS_RESOLVED";
const ACTIVE_STATES = new Set(["DRAFT", "QUEUED", "RUNNING", "SEALING"]);

function digest(value: unknown): string {
  const normalize = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(normalize);
    if (input && typeof input === "object") {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, nested]) => [key, normalize(nested)]));
    }
    return input;
  };
  return createHash("sha256").update(JSON.stringify(normalize(value)), "utf8").digest("hex");
}

function sameParameters(left: Record<string, string>, right: Record<string, string>): boolean {
  const a = Object.keys(left);
  if (a.length !== Object.keys(right).length) return false;
  return a.every((key) => right[key] !== undefined && canonicalDecimal(left[key]!) === canonicalDecimal(right[key]!));
}

@Injectable()
export class ResearchWhatIfService {
  constructor(
    private readonly repository: ResearchWhatIfRepository,
    private readonly metadata: ResearchMetadataRepository,
    private readonly proxy: PortalProxyService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  get enabled(): boolean {
    return this.config.FEATURE_RESEARCH_WHATIF === "true";
  }

  /** The GET side. Never enqueues, never evaluates. */
  async read(scope: ResearchScope, basis: WhatIfBasis): Promise<WhatIf> {
    if (!this.enabled) return this.inert("NOT_ENABLED", NOT_ENABLED, basis.runId);
    const parent = await this.repository.parentFacts(scope, basis.runId);
    const prepared = parent ? this.prepare(basis, parent) : null;
    if (!parent || !prepared) return this.inert("NOT_PUBLISHED", NO_WFO_PROFILE_BINDING, basis.runId);
    const { grid } = prepared;
    const [jobs, sealed] = await Promise.all([
      this.repository.jobs(scope, basis.runId),
      this.repository.sealedResults(scope, basis.runId),
    ]);
    return this.compose(basis, parent, grid, jobs, sealed);
  }

  /** The explicit POST. One bounded diagnostic job, deduplicated by grid key. */
  async evaluate(
    user: PortalUser,
    scope: ResearchScope,
    basis: WhatIfBasis,
    requestedGridKey: string,
    requestId: string,
  ): Promise<ResearchWhatIfEvaluateResponse> {
    if (!this.enabled) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The what-if diagnostic is not enabled in this environment.", 503);
    }
    if (bytesBlockChain(basis.bytes)) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_BLOCKED", "Resolve the frozen chain first: its sealed bytes do not verify.", 409);
    }
    const parent = await this.repository.parentFacts(scope, basis.runId);
    const prepared = parent ? this.prepare(basis, parent) : null;
    if (!parent || !prepared) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_NOT_APPLICABLE", "This run has no registered walk-forward declaration to build a grid from.", 409);
    }
    const { grid } = prepared;
    if (grid.grid_key !== requestedGridKey) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_GRID_CHANGED", "The grid changed since it was read; reread the freeze and try again.", 409);
    }
    const [jobs, sealed] = await Promise.all([
      this.repository.jobs(scope, basis.runId),
      this.repository.sealedResults(scope, basis.runId),
    ]);
    const composed = this.compose(basis, parent, grid, jobs, sealed);
    const current = jobs.find((job) => job.gridKey === grid.grid_key && job.state !== "FAILED" && job.state !== "CANCELLED");
    if (current && ACTIVE_STATES.has(current.state)) {
      return this.evaluateResponse(basis.runId, "REPLAYED", grid.grid_key, current);
    }
    const missing = this.missingEvaluations(grid, composed);
    if (missing.length === 0) {
      return ResearchWhatIfEvaluateResponseSchema.parse({
        schema_version: "research.whatif-evaluate-result.v1",
        run_id: basis.runId,
        outcome: "NOTHING_TO_EVALUATE",
        grid_key: grid.grid_key,
        job: current ? this.job(current) : null,
      });
    }
    const other = jobs.find((job) => ACTIVE_STATES.has(job.state));
    if (other) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_IN_FLIGHT", "Another what-if diagnostic for this run is still running; one at a time.", 409);
    }
    const failedBefore = jobs.filter((job) => job.gridKey === grid.grid_key).length;
    const ordinal = failedBefore + 1;
    const identity = digest({ parent_run_id: basis.runId, grid_key: grid.grid_key, ordinal, schema: "research.whatif-job-identity.v1" });
    const ids = {
      runId: `rrun_${identity.slice(0, 32)}`,
      attemptId: `ratt_${identity.slice(0, 32)}`,
      jobId: `rjob_${identity.slice(0, 32)}`,
      commandId: `rcmd_${identity.slice(0, 32)}`,
      clientIntentId: `whatif:${identity.slice(0, 40)}`,
      logicalRunKey: `whatif:${grid.grid_key.slice(0, 32)}:${ordinal}`,
    };
    const evaluations = missing.map((entry) => ({
      evaluation_key: entry.evaluation_key,
      parameters: entry.configuration,
    }));
    const requestedSpec = this.requestedSpec(parent);
    const workDigest = digest({
      schema_version: WHATIF_WORK_SCHEMA_VERSION,
      parent_run_id: basis.runId,
      grid_key: grid.grid_key,
      ordinal,
      profile_digest: WHATIF_PROFILE_DIGEST,
      requested_spec_digest: parent.requestedSpecDigest,
      dataset_binding_digest: parent.datasetBindingDigest,
      evaluations,
    });
    const legacyRequest = {
      strategy_id: parent.legacyStrategyId,
      dataset_id: parent.legacyDatasetId,
      protocol: parent.legacyProtocol,
      research_contract_version: "research.run-request.v1",
      run_id: ids.runId,
      workspace_id: scope.workspaceId,
      research: {
        schema_version: "research.run-producer.v1",
        client_intent_id: ids.clientIntentId,
        intent_kind: "DIAGNOSTIC",
        preflight_token: parent.preflightToken,
        requested_spec: requestedSpec,
        requested_spec_digest: parent.requestedSpecDigest,
        effective_spec_digest: parent.effectiveSpecDigest,
        dataset_binding_digest: parent.datasetBindingDigest,
        manifest_digest: parent.manifestDigest,
        snapshot_id: parent.snapshotId,
        snapshot_content_hash: parent.snapshotContentHash,
        alpha_id: parent.alphaId,
        alpha_version_id: parent.alphaVersionId,
        execution_adapter_id: parent.executionAdapterId,
        adapter_contract_digest: parent.adapterContractDigest,
        execution_profile_id: WHATIF_PROFILE_ID,
        execution_profile_digest: WHATIF_PROFILE_DIGEST,
        work_digest: workDigest,
        whatif: {
          schema_version: "research.whatif-job.v1",
          parent_run_id: basis.runId,
          grid_key: grid.grid_key,
          evaluations,
        },
      },
    };
    let created;
    try {
      created = await this.metadata.createOrReplayWhatIfIntent(scope, {
        ...ids,
        parentRunId: basis.runId,
        parentAttemptId: parent.attemptId,
        parentActorUserId: parent.actorUserId,
        gridKey: grid.grid_key,
        evaluations,
        workDigest,
        legacyRequest,
        preflightToken: parent.preflightToken,
        alphaId: parent.alphaId,
        alphaVersionId: parent.alphaVersionId,
        executionAdapterId: parent.executionAdapterId,
        adapterContractDigest: parent.adapterContractDigest,
        requestedSpecDigest: parent.requestedSpecDigest,
        effectiveSpecDigest: parent.effectiveSpecDigest,
        datasetBindingDigest: parent.datasetBindingDigest,
        manifestDigest: parent.manifestDigest,
        snapshotId: parent.snapshotId,
        snapshotContentHash: parent.snapshotContentHash,
        engineReleaseId: parent.engineReleaseId,
        cost: WHATIF_RESOURCE_PROFILE,
        resourceClass: WHATIF_RESOURCE_CLASS,
      });
    } catch (error) {
      throw this.mapMetadata(error);
    }
    await this.dispatch(user, scope, created.producer, requestId);
    const refreshed = (await this.repository.jobs(scope, basis.runId)).find((job) => job.runId === created.producer.runId);
    if (!refreshed) throw new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The diagnostic job was admitted but cannot be read back yet.", 503);
    return this.evaluateResponse(basis.runId, created.replayed ? "REPLAYED" : "ADMITTED", grid.grid_key, refreshed);
  }

  // ---------------------------------------------------------------- helpers

  private prepare(basis: WhatIfBasis, parent: WhatIfParentFacts): { grid: WhatIfGrid } | null {
    const binding = DEFAULT_PARAMETER_BINDING_REGISTRY.byProfileDigest(parent.executionProfileDigest);
    if (!binding || binding.adapterContractDigest !== parent.adapterContractDigest) return null;
    const space: Record<string, DeclaredAxisRange> = {};
    for (const axis of WHATIF_PROFILE.axes) {
      const range = binding.parameterSpace[axis.parameter];
      if (!range) return null;
      const minimum = exactDecimalText(range.minimum);
      const maximum = exactDecimalText(range.maximum);
      const step = exactDecimalText(range.step);
      if (minimum === null || maximum === null || step === null) return null;
      space[axis.parameter] = { minimum, maximum, step };
    }
    try {
      return {
        grid: buildWhatIfGrid(basis.runId, basis.frozen, space, {
          dataset_binding_digest: parent.datasetBindingDigest,
          requested_spec_digest: parent.requestedSpecDigest,
          engine_release_id: parent.engineReleaseId,
          random_seed: parent.randomSeed,
        }),
      };
    } catch (error) {
      if (error instanceof WhatIfGridError) return null;
      throw error;
    }
  }

  private compose(
    basis: WhatIfBasis,
    parent: WhatIfParentFacts,
    grid: WhatIfGrid,
    jobs: WhatIfJobRow[],
    sealed: Map<string, { runId: string; trialId: string; state: string; objective: string | null }>,
  ): WhatIf {
    // Exact existing evaluations, by evaluation key.
    type Found = { objective: string | null; source: "PARENT_TRIAL" | "DIAGNOSTIC_GRID"; ref: string; defined: boolean };
    const found = new Map<string, Found>();
    for (const entry of grid.unique) {
      const trial = basis.trials.find((row) => sameParameters(row.parameters, entry.configuration));
      if (trial && trial.state === "COMPLETE" && trial.objective !== null) {
        found.set(entry.evaluation_key, { objective: canonicalDecimal(trial.objective), source: "PARENT_TRIAL", ref: `trial:${trial.trialId}`, defined: true });
        continue;
      }
      const result = sealed.get(entry.evaluation_key);
      if (result) {
        const defined = result.state === "COMPLETE" && result.objective !== null;
        found.set(entry.evaluation_key, {
          objective: defined ? canonicalDecimal(result.objective!) : null,
          source: "DIAGNOSTIC_GRID",
          ref: `${result.runId}:trial:${result.trialId}`,
          defined,
        });
      }
    }
    const current = jobs.find((job) => job.gridKey === grid.grid_key && ACTIVE_STATES.has(job.state));
    const queued = new Set(current?.evaluationKeys ?? []);
    const base = found.get(grid.base_evaluation_key);
    const baseObjective = base?.defined ? base.objective : null;
    const cells: WhatIfCell[] = grid.cells.map((cell) => {
      const hit = found.get(cell.evaluation_key);
      const state = hit ? (hit.defined ? "EVALUATED" : "NOT_DEFINED") : queued.has(cell.evaluation_key) ? "QUEUED" : "MISSING";
      const objective = hit?.defined ? hit.objective : null;
      return {
        cell_id: cell.cell_id,
        x_index: cell.x_index,
        y_index: cell.y_index,
        parameters: cell.parameters,
        evaluation_key: cell.evaluation_key,
        canonical_cell_id: cell.canonical_cell_id,
        clamped: cell.clamped,
        is_base: cell.is_base,
        state,
        objective,
        delta_j: objective !== null && baseObjective !== null ? subtractDecimal(objective, baseObjective) : null,
        source: hit?.source ?? null,
        source_ref: hit?.ref ?? null,
      };
    });
    const evaluatedCells = cells.filter((cell) => cell.state === "EVALUATED").length;
    const evaluatedUnique = grid.unique.filter((entry) => found.get(entry.evaluation_key)?.defined).length;
    const missing = grid.unique.filter((entry) => !found.has(entry.evaluation_key)).length;
    const blocked = bytesBlockChain(basis.bytes);
    const evaluate = blocked
      ? { state: "BLOCKED" as const, may_submit: false, reason_code: BYTES_BLOCK, missing_evaluations: missing }
      : current
        ? { state: "IN_FLIGHT" as const, may_submit: false, reason_code: IN_FLIGHT, missing_evaluations: missing }
        : missing === 0
          ? { state: "NOTHING_TO_EVALUATE" as const, may_submit: false, reason_code: NOTHING, missing_evaluations: 0 }
          : { state: "AVAILABLE" as const, may_submit: true, reason_code: null, missing_evaluations: missing };
    const latest = jobs.find((job) => job.gridKey === grid.grid_key) ?? null;
    const value = {
      schema_version: "research.freeze-what-if.v1" as const,
      state: "AVAILABLE" as const,
      reason_code: null,
      definition: {
        profile_id: WHATIF_PROFILE_ID,
        profile_digest: WHATIF_PROFILE_DIGEST,
        objective_kind: "MODE_1_DECAY_J" as const,
        objective_scope: "GLOBAL_STUDY_IS_FOLDS" as const,
        random_seed: parent.randomSeed,
        engine_release_id: parent.engineReleaseId,
        dataset_binding_digest: parent.datasetBindingDigest,
        preview_only: true as const,
        interpolation: "NONE_SNAP_TO_NODE" as const,
      },
      sliders: grid.axes.map((axis) => ({
        parameter: axis.parameter,
        hifi_name: axis.hifi_name,
        minimum: axis.minimum,
        maximum: axis.maximum,
        step: axis.step,
        base: axis.base,
        radius_steps: 4 as const,
        values: axis.values,
        clamped: axis.clamped,
      })),
      grid: {
        size: 9 as const,
        grid_key: grid.grid_key,
        base_objective: baseObjective,
        base_source: base?.defined ? base.source : null,
        unique_evaluations: grid.unique.length,
        cells,
      },
      coverage: {
        evaluated_cells: evaluatedCells,
        total_cells: 81 as const,
        evaluated_unique: evaluatedUnique,
        unique_evaluations: grid.unique.length,
        label: `${evaluatedCells} / 81`,
      },
      job: latest ? this.job(latest) : null,
      actions: {
        evaluate_grid: evaluate,
        sibling_draft: blocked
          ? { state: "BLOCKED" as const, may_create: false, reason_code: SIBLING_BLOCKED, href_template: null }
          : {
            state: "AVAILABLE" as const,
            may_create: true,
            reason_code: null,
            href_template: `/research/quantbt/runs/new?from=${basis.runId}&fork={cell_id}`,
          },
      },
    };
    return WhatIfSchema.parse(value);
  }

  private missingEvaluations(grid: WhatIfGrid, composed: WhatIf) {
    const have = new Set(
      (composed.grid?.cells ?? []).filter((cell) => cell.state === "EVALUATED" || cell.state === "NOT_DEFINED")
        .map((cell) => cell.evaluation_key),
    );
    return grid.unique.filter((entry) => !have.has(entry.evaluation_key)).slice(0, WHATIF_PROFILE.max_evaluations);
  }

  private inert(state: "NOT_ENABLED" | "NOT_PUBLISHED", reason: string, runId: string): WhatIf {
    return inertWhatIf(runId, state, reason);
  }

  private job(row: WhatIfJobRow) {
    return {
      run_id: row.runId,
      state: row.state,
      evaluations: row.evaluationKeys.length,
      grid_key: row.gridKey,
      requested_at_utc_ms: row.requestedAtUtcMs,
      sealed: row.sealed,
      progress_href: `/research/quantbt/runs/${row.runId}/progress`,
    };
  }

  private evaluateResponse(
    runId: string,
    outcome: "ADMITTED" | "REPLAYED",
    gridKey: string,
    job: WhatIfJobRow,
  ): ResearchWhatIfEvaluateResponse {
    return ResearchWhatIfEvaluateResponseSchema.parse({
      schema_version: "research.whatif-evaluate-result.v1",
      run_id: runId,
      outcome,
      grid_key: gridKey,
      job: this.job(job),
    });
  }

  /** The parent's own admitted requested spec, unchanged: same data, same study, same seed. */
  private requestedSpec(parent: WhatIfParentFacts): Record<string, unknown> {
    return parent.requestedSpec;
  }

  private async dispatch(
    user: PortalUser,
    scope: ResearchScope,
    producer: { runId: string; jobId: string; dispatchState: string; legacyRequest: Record<string, unknown> },
    requestId: string,
  ): Promise<void> {
    if (producer.dispatchState === "DISPATCHED") return;
    let claim;
    try {
      claim = await this.metadata.claimNextDurableJob(scope, {
        workerId: "research-whatif-v1",
        leaseSeconds: this.config.RESEARCH_RUN_PRODUCER_LEASE_SECONDS,
        jobId: producer.jobId,
      });
      if (!claim || claim.jobId !== producer.jobId || claim.runId !== producer.runId) {
        throw new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The diagnostic is durable but its dispatch lease is being recovered; ask again.", 503);
      }
      await this.metadata.recordRunProducerClaim(scope, {
        runId: producer.runId,
        jobId: claim.jobId,
        workerAttemptId: claim.workerAttemptId,
        leaseEpoch: claim.leaseEpoch,
      });
    } catch (error) {
      throw this.mapMetadata(error);
    }
    const body = JSON.stringify({
      ...producer.legacyRequest,
      job_id: producer.jobId,
      worker_attempt_id: claim.workerAttemptId,
      lease_epoch: claim.leaseEpoch,
    });
    let write;
    try {
      write = await this.proxy.handleWrite({
        method: "POST",
        path: "/api/runs",
        query: undefined,
        body,
        contentType: "application/json",
        requestId,
        traceparent: this.traceparent(requestId),
        user,
        workspaceId: scope.workspaceId,
        idempotencyKey: `research-whatif:${producer.runId}`,
        retryPending: true,
        researchRunProducer: {
          runId: producer.runId,
          jobId: producer.jobId,
          workerAttemptId: claim.workerAttemptId,
          leaseEpoch: claim.leaseEpoch,
        },
      });
    } catch (error) {
      if (error instanceof FacadeError && error.status < 500) {
        throw new ResearchWhatIfError("RESEARCH_WHATIF_UPSTREAM_REJECTED", "The private Portal run adapter rejected this diagnostic request.", 502);
      }
      throw new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The diagnostic is durable, but dispatch outcome is unknown; ask again.", 503);
    }
    if (write.status !== 202 || typeof write.body?.run_id !== "string" || write.body.run_id !== producer.runId) {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_UPSTREAM_REJECTED", "The private Portal run adapter did not accept the diagnostic identity.", 502);
    }
    try {
      await this.metadata.recordRunProducerDispatched(scope, {
        runId: producer.runId,
        jobId: producer.jobId,
        workerAttemptId: claim.workerAttemptId,
        leaseEpoch: claim.leaseEpoch,
        receipt: {
          run_id: producer.runId,
          status: "QUEUED",
          facade_idempotency_key: write.idempotencyKey,
          facade_replayed: write.replayed,
        },
      });
    } catch {
      throw new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The diagnostic was dispatched; its receipt is being reconciled.", 503);
    }
  }

  private traceparent(requestId: string): string {
    const trace = createHash("sha256").update(`research-whatif:${requestId}`).digest("hex");
    return `00-${trace.slice(0, 32)}-${trace.slice(32, 48)}-01`;
  }

  private mapMetadata(error: unknown): ResearchWhatIfError {
    if (error instanceof ResearchWhatIfError) return error;
    if (error instanceof ResearchMetadataError) {
      if (error.code === "RESEARCH_WORKSPACE_FORBIDDEN") return new ResearchWhatIfError("RESEARCH_WHATIF_FORBIDDEN", "Access denied.", 403);
      if (error.code === "RESEARCH_WHATIF_IN_FLIGHT") return new ResearchWhatIfError("RESEARCH_WHATIF_IN_FLIGHT", error.message, 409);
      if (error.code === "RESEARCH_ADMISSION_SATURATED") return new ResearchWhatIfError("RESEARCH_WHATIF_ADMISSION_SATURATED", error.message, 503);
      return new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The what-if diagnostic is temporarily unavailable.", error.status >= 500 ? 503 : 409);
    }
    return new ResearchWhatIfError("RESEARCH_WHATIF_UNAVAILABLE", "The what-if diagnostic is temporarily unavailable.", 503);
  }
}

export { canonicalParameters };

/**
 * The card's typed answer when there is no grid to serve: the lane is dark
 * or the run has no registered walk-forward declaration. Sliders stay empty
 * (the screen draws them disabled with this reason), no action may submit,
 * and no sibling can be drafted from a grid that does not exist.
 */
export function inertWhatIf(
  runId: string,
  state: "NOT_ENABLED" | "NOT_PUBLISHED" = "NOT_ENABLED",
  reason: string = NOT_ENABLED,
): WhatIf {
  const evaluateState = state === "NOT_ENABLED" ? "NOT_ENABLED" as const : "NOT_APPLICABLE" as const;
  void runId;
  return WhatIfSchema.parse({
    schema_version: "research.freeze-what-if.v1",
    state,
    reason_code: reason,
    definition: null,
    sliders: [],
    grid: null,
    coverage: null,
    job: null,
    actions: {
      evaluate_grid: { state: evaluateState, may_submit: false, reason_code: reason, missing_evaluations: 0 },
      sibling_draft: { state: "NOT_APPLICABLE", may_create: false, reason_code: reason, href_template: null },
    },
  });
}
