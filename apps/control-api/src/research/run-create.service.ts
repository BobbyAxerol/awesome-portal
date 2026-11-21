/** P10 same-origin New Run producer. */

import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { PortalProxyService, FacadeError } from "../facade/proxy.service";
import type { ResearchScope } from "./contracts";
import { ResearchMetadataError } from "./contracts";
import { CONTROL_API_CONFIG } from "../tokens";
import { sha256ResearchJson } from "./preflight.service";
import {executionRecipe, executionRecipeResources} from "./execution-recipes";
import {isNativeRecipe} from './native-delta.binding';
import { ResearchMetadataRepository } from "./repository";
import {
  ResearchRunCreateResponseSchema,
  type ResearchRunCreateRequest,
  type ResearchRunCreateResponse,
} from "./run-create.contract";
import { ResearchRunCreateError } from "./run-create.error";
import { ENGINE_110_QUALIFICATION_BINDING, ENGINE_110_QUALIFICATION_BINDING_DIGEST } from "./engine-qualification.profile";
import { ResearchRunAdmissionService } from "./run-admission.service";
import { VnObservedSourceObservationSchema } from "./preflight.contract";
import { VN_OBSERVED_FIXED_PROFILE_ID,
  VN_OBSERVED_FIXED_WORK_SCHEMA_VERSION } from "./vn-observed-fixed.profile";
import { DELTA_WFO_V2_PROFILE_ID, DELTA_WFO_V2_WORK_SCHEMA_VERSION } from "./delta-wfo-v2.profile";
import { DELTA_CAUSAL_INNER_PROFILE_ID, DELTA_CAUSAL_INNER_WORK_SCHEMA_VERSION } from "./delta-causal-inner.profile";
import { DELTA_PER_FOLD_DECAY_PROFILE_ID, DELTA_THREE_WINDOW_OPTIMIZED_PROFILE_ID } from "./full02.profiles";
import {
  DELTA_WFO_PROFILE_ID,
  DELTA_WFO_WORK_SCHEMA_VERSION,
  deltaWfoPreviewLongEnabled,
} from "./delta-wfo.profile";
import {
  IMPORTED_ALPHA_PROFILE_ID,
  IMPORTED_ALPHA_WORK_SCHEMA_VERSION,
} from "./imported-alpha.profile";

function stableId(prefix: string, digest: string): string {
  return `${prefix}_${digest.slice(0, 32)}`;
}

function digest(value: unknown): string {
  return sha256ResearchJson(value);
}

@Injectable()
export class ResearchRunCreateService {
  constructor(
    private readonly repository: ResearchMetadataRepository,
    private readonly admission: ResearchRunAdmissionService,
    private readonly proxy: PortalProxyService,
    // Nest injects the validated config because AppModule uses the same token
    // for direct constructor values in test and production.
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async create(
    user: PortalUser,
    scope: ResearchScope,
    input: ResearchRunCreateRequest,
    requestId: string,
  ): Promise<ResearchRunCreateResponse> {
    if (this.config.FEATURE_RESEARCH_RUN_PRODUCER !== "true") {
      throw new ResearchRunCreateError(
        "RESEARCH_RUN_PRODUCER_UNAVAILABLE",
        "Research run creation is not enabled in this environment.",
        503,
      );
    }
    const parentBoundClone = input.intent_kind === "CLONE_FOR_EXPERIMENT" && input.lineage?.relation === "CLONE_OF";
    const parentBoundReproduction = input.intent_kind === "REPRODUCE_EXISTING" && input.lineage?.relation === "REPRODUCTION_OF";
    if ((input.intent_kind === "REPRODUCE_EXISTING") !== (input.lineage?.relation === "REPRODUCTION_OF")) {
      throw new ResearchRunCreateError("RESEARCH_RUN_CREATE_INVALID", "Reproduction requires its explicit parent and intent.", 400);
    }
    if (input.intent_kind !== "NEW" && !parentBoundClone && !parentBoundReproduction) {
      // P12/P19 own clone/reproduce/upgrade lineage semantics.  Accepting
      // their labels before their parent/effective-version contracts exist
      // would create a misleading graph, so P10 makes the current gap typed.
      throw new ResearchRunCreateError(
        "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
        "This installed Research adapter accepts a new run, a parent-bound clone, or an exact input reproduction.",
        409,
      );
    }
    let accepted;
    try {
      accepted = await this.admission.require(
        user,
        scope,
        input.preflight_token,
        input.requested_spec,
      );
    } catch (error) {
      // P08 tokens are actor-scoped. Preserve their non-enumerating typed
      // absence at the public P10 boundary rather than allowing an internal
      // metadata error to escape through the generic exception filter.
      throw this.mapMetadataError(error);
    }
    const manifest = accepted.manifest!;
    const requested = accepted.requestedSpec!;
    const alpha = accepted.alpha!;
    // The lineage fork joins the command identity only when present, so every
    // pre-W5a command (and the P04/W1 golden digests) keeps its exact bytes.
    const commandDigest = digest({
      schema_version: input.schema_version,
      client_intent_id: input.client_intent_id,
      preflight_token: input.preflight_token,
      requested_spec: requested,
      intent_kind: input.intent_kind,
      ...(input.lineage ? { lineage: input.lineage } : {}),
    });
    const runId = stableId("rrun", commandDigest);
    const attemptId = stableId("ratt", commandDigest);
    const jobId = stableId("rjob", commandDigest);
    const commandId = stableId("rcmd", commandDigest);
    const profile = accepted.profile!;
    const recipe=executionRecipe(profile.id,profile.digest);
    const native=isNativeRecipe(recipe);
    const importedSearch=recipe.adapter_kind==="IMPORTED_SEARCH";
    const causal = (recipe.adapter_kind==="DELTA_WFO"||importedSearch) && recipe.public_profile.optimization_schedule==="per_fold_causal";
    const wfo = recipe.adapter_kind==="DELTA_WFO"||importedSearch&&requested.protocol==="advanced";
    const optimized = recipe.adapter_kind==="DELTA_THREE_WINDOW_OPTIMIZED"||importedSearch&&requested.protocol==="three_window_decay";
    const imported = profile.id === IMPORTED_ALPHA_PROFILE_ID||importedSearch;
    const vnObserved = profile.id === VN_OBSERVED_FIXED_PROFILE_ID;
    const observation = vnObserved ? VnObservedSourceObservationSchema.safeParse({
      ...(manifest.datasetBinding.provenance as Record<string, unknown>),
      dataset_id: requested.data.dataset_id, symbol: requested.data.symbol, timeframe: requested.data.timeframe,
    }) : null;
    if (observation && !observation.success) {
      throw new ResearchRunCreateError("RESEARCH_RUN_PREFLIGHT_NOT_READY", "The VN observed source binding is incompatible.", 409);
    }
    const sourceObservation = observation?.success ? observation.data : null;
    // Lineage is Portal-owned and already persisted above the compute port.
    // A clone is a fresh execution for the worker, not a new private engine
    // operation. Keep the immutable public intent/parent in PostgreSQL and
    // the command digest, while preserving the existing NEW compute contract.
    const workerIntentKind = parentBoundClone || parentBoundReproduction ? "NEW" : input.intent_kind;
    // The P04 branch below is byte-for-byte the pre-W1 construction (golden
    // tests pin both digests). The WFO branch is a separate versioned shape:
    // it carries the pinned profile identity and never a P04 parameter map.
    const workDigest = native ? digest({schema_version:recipe.work_schema_version,
        requested_spec_digest:manifest.requestedSpecDigest,effective_spec_digest:manifest.effectiveSpecDigest,
        dataset_binding_digest:manifest.datasetBindingDigest,manifest_digest:manifest.manifestDigest,
        snapshot:{snapshot_id:this.stringFact(manifest.snapshot,'snapshot_id'),snapshot_content_hash:this.stringFact(manifest.snapshot,'snapshot_content_hash')},
        alpha:{alpha_id:alpha.alphaId,alpha_version_id:alpha.alphaVersionId,adapter_id:alpha.adapterId,
          adapter_contract_digest:alpha.adapterContractDigest,fixed_parameters:alpha.fixedParameters},
        execution_profile:{profile_id:profile.id,profile_digest:profile.digest},
        engine_release_id:requested.client.engine_release_id,requested_spec:requested}) : vnObserved
      ? digest({
        schema_version: VN_OBSERVED_FIXED_WORK_SCHEMA_VERSION,
        requested_spec_digest: manifest.requestedSpecDigest, effective_spec_digest: manifest.effectiveSpecDigest,
        dataset_binding_digest: manifest.datasetBindingDigest, manifest_digest: manifest.manifestDigest,
        snapshot: { snapshot_id: this.stringFact(manifest.snapshot, "snapshot_id"),
          snapshot_content_hash: this.stringFact(manifest.snapshot, "snapshot_content_hash") },
        alpha: { alpha_id: alpha.alphaId, alpha_version_id: alpha.alphaVersionId,
          adapter_id: alpha.adapterId, adapter_contract_digest: alpha.adapterContractDigest, fixed_parameters: alpha.fixedParameters },
        execution_profile: { profile_id: profile.id, profile_digest: profile.digest },
        source_observation: sourceObservation, engine_release_id: requested.client.engine_release_id, requested_spec: requested,
      })
      : imported
      ? digest({
        schema_version: importedSearch?recipe.work_schema_version:IMPORTED_ALPHA_WORK_SCHEMA_VERSION,
        requested_spec_digest: manifest.requestedSpecDigest,
        effective_spec_digest: manifest.effectiveSpecDigest,
        dataset_binding_digest: manifest.datasetBindingDigest,
        manifest_digest: manifest.manifestDigest,
        snapshot: {
          snapshot_id: this.stringFact(manifest.snapshot, "snapshot_id"),
          snapshot_content_hash: this.stringFact(manifest.snapshot, "snapshot_content_hash"),
        },
        alpha: {
          alpha_id: alpha.alphaId,
          alpha_version_id: alpha.alphaVersionId,
          source_digest: alpha.sourceDigest,
          entrypoint: alpha.entrypoint,
          adapter_id: alpha.adapterId,
          adapter_contract_digest: alpha.adapterContractDigest,
          parameters: alpha.importedParameters,
          ...(importedSearch?{search_binding:alpha.importedSearchBinding}:{}),
        },
        execution_profile: { profile_id: profile.id, profile_digest: profile.digest },
        engine_release_id: requested.client.engine_release_id,
        requested_spec: requested,
      })
      : wfo || optimized
      ? digest({
        schema_version: executionRecipe(profile.id, profile.digest).work_schema_version,
        requested_spec_digest: manifest.requestedSpecDigest,
        effective_spec_digest: manifest.effectiveSpecDigest,
        dataset_binding_digest: manifest.datasetBindingDigest,
        manifest_digest: manifest.manifestDigest,
        snapshot: {
          snapshot_id: this.stringFact(manifest.snapshot, "snapshot_id"),
          snapshot_content_hash: this.stringFact(manifest.snapshot, "snapshot_content_hash"),
        },
        alpha: {
          alpha_id: alpha.alphaId,
          alpha_version_id: alpha.alphaVersionId,
          adapter_id: alpha.adapterId,
          adapter_contract_digest: alpha.adapterContractDigest,
        },
        execution_profile: {
          profile_id: profile.id,
          profile_digest: profile.digest,
        },
        engine_release_id: requested.client.engine_release_id,
        requested_spec: requested,
      })
      : digest({
        schema_version: "research.p10.delta-work.v1",
        requested_spec_digest: manifest.requestedSpecDigest,
        effective_spec_digest: manifest.effectiveSpecDigest,
        dataset_binding_digest: manifest.datasetBindingDigest,
        manifest_digest: manifest.manifestDigest,
        snapshot: {
          snapshot_id: this.stringFact(manifest.snapshot, "snapshot_id"),
          snapshot_content_hash: this.stringFact(manifest.snapshot, "snapshot_content_hash"),
        },
        alpha: {
          alpha_id: alpha.alphaId,
          alpha_version_id: alpha.alphaVersionId,
          adapter_id: alpha.adapterId,
          adapter_contract_digest: alpha.adapterContractDigest,
          fixed_parameters: alpha.fixedParameters,
        },
        engine_release_id: requested.client.engine_release_id,
        // This is retained to prove that an accepted P10 request did not drop
        // a value before the only installed worker profile evaluated it.
        requested_spec: requested,
      });
    const legacyRequest = (wfo || optimized || imported) ? {
      strategy_id: requested.strategy_id,
      dataset_id: requested.data.dataset_id,
      protocol: requested.protocol,
      research_contract_version: "research.run-request.v1",
      run_id: runId,
      workspace_id: scope.workspaceId,
      research: {
        schema_version: "research.run-producer.v1",
        client_intent_id: input.client_intent_id,
        intent_kind: workerIntentKind,
        preflight_token: input.preflight_token,
        requested_spec: requested,
        requested_spec_digest: manifest.requestedSpecDigest,
        effective_spec_digest: manifest.effectiveSpecDigest,
        dataset_binding_digest: manifest.datasetBindingDigest,
        manifest_digest: manifest.manifestDigest,
        snapshot_id: this.stringFact(manifest.snapshot, "snapshot_id"),
        snapshot_content_hash: this.stringFact(manifest.snapshot, "snapshot_content_hash"),
        alpha_id: alpha.alphaId,
        alpha_version_id: alpha.alphaVersionId,
        execution_adapter_id: alpha.adapterId,
        adapter_contract_digest: alpha.adapterContractDigest,
        // W1: the child re-verifies this pinned profile before running the
        // walk-forward search; there is deliberately no p04_parameters map.
        execution_profile_id: profile.id,
        execution_profile_digest: profile.digest,
        ...(imported ? {
          imported_source_digest: alpha.sourceDigest,
          imported_entrypoint: alpha.entrypoint,
          imported_parameters: alpha.importedParameters,
          ...(importedSearch?{imported_search_binding:alpha.importedSearchBinding}:{}),
        } : {}),
        work_digest: workDigest,
      },
    } : {
      // Legacy read model fields remain top-level, unchanged and nonoptional.
      strategy_id: requested.strategy_id,
      dataset_id: requested.data.dataset_id,
      protocol: requested.protocol,
      research_contract_version: "research.run-request.v1",
      run_id: runId,
      workspace_id: scope.workspaceId,
      research: {
        schema_version: "research.run-producer.v1",
        client_intent_id: input.client_intent_id,
        intent_kind: workerIntentKind,
        preflight_token: input.preflight_token,
        requested_spec: requested,
        requested_spec_digest: manifest.requestedSpecDigest,
        effective_spec_digest: manifest.effectiveSpecDigest,
        dataset_binding_digest: manifest.datasetBindingDigest,
        manifest_digest: manifest.manifestDigest,
        snapshot_id: this.stringFact(manifest.snapshot, "snapshot_id"),
        snapshot_content_hash: this.stringFact(manifest.snapshot, "snapshot_content_hash"),
        alpha_id: alpha.alphaId,
        alpha_version_id: alpha.alphaVersionId,
        execution_adapter_id: alpha.adapterId,
        adapter_contract_digest: alpha.adapterContractDigest,
        // P10's fixed P04 profile is explicit in the private worker request;
        // the child never receives an implied UI default or discovers params
        // from arbitrary Alpha source.
        p04_parameters: alpha.fixedParameters,
        ...(requested.client.engine_release_id === "er_quantbt_110" ? {
          qualification_binding: { ...ENGINE_110_QUALIFICATION_BINDING, binding_digest: ENGINE_110_QUALIFICATION_BINDING_DIGEST },
        } : {}),
        ...(vnObserved ? { execution_profile_id: profile.id, execution_profile_digest: profile.digest,
          source_observation: sourceObservation } : {}),
        ...(native ? {execution_profile_id:profile.id,execution_profile_digest:profile.digest} : {}),
        work_digest: workDigest,
      },
    };
    let produced;
    try {
      produced = await this.repository.createOrReplayRunProducerIntent(scope, {
        attemptId,
        runId,
        jobId,
        commandId,
        clientIntentId: input.client_intent_id,
        requestPayloadDigest: commandDigest,
        intentKind: input.intent_kind,
        alphaId: alpha.alphaId,
        alphaVersionId: alpha.alphaVersionId,
        executionAdapterId: alpha.adapterId,
        adapterContractDigest: alpha.adapterContractDigest,
        executionProfileId: profile.id,
        executionProfileDigest: profile.digest,
        preflightToken: input.preflight_token,
        requestedSpecDigest: manifest.requestedSpecDigest,
        effectiveSpecDigest: manifest.effectiveSpecDigest,
        datasetBindingDigest: manifest.datasetBindingDigest,
        manifestDigest: manifest.manifestDigest,
        snapshotId: this.stringFact(manifest.snapshot, "snapshot_id"),
        snapshotContentHash: this.stringFact(manifest.snapshot, "snapshot_content_hash"),
        workDigest,
        engineReleaseId: requested.client.engine_release_id,
        legacyRequest,
        cost: executionRecipeResources(executionRecipe(profile.id, profile.digest), this.config),
        // The wide confined profiles are compute, not viewer interactions.
        // P06's existing one-heavy-per-workspace admission must see them;
        // otherwise several creates reserve leases before a single worker
        // can consume them. Keep the historical fixed P04 policy unchanged.
        queueClass: executionRecipe(profile.id, profile.digest).queue_class,
        resourceClass: executionRecipe(profile.id, profile.digest).resource_class,
        attemptLimit: 2,
        // The edge the browser declared, if any. Both relations reach the
        // same column; only SIBLING_OF carries a cell and the same-version
        // rule (E13).
        ...(input.lineage?.relation === "SIBLING_OF"
          ? { sibling: { parentRunId: input.lineage.parent_run_id, whatIfCellId: input.lineage.what_if_cell_id } }
          : {}),
        ...(input.lineage?.relation === "CLONE_OF"
          ? { clonedFrom: { parentRunId: input.lineage.parent_run_id } }
          : {}),
        ...(parentBoundReproduction && input.lineage
          ? { reproducedFrom: { parentRunId: input.lineage.parent_run_id } }
          : {}),
      });
    } catch (error) {
      throw this.mapMetadataError(error);
    }

    const producer = produced.producer;
    if (producer.dispatchState === "DISPATCHED") {
      return this.response(producer, true, input.lineage?.relation === "REPRODUCTION_OF" ? input.lineage.parent_run_id : undefined);
    }

    let claim;
    try {
      claim = await this.repository.claimNextDurableJob(scope, {
        workerId: "research-producer-v1",
        leaseSeconds: this.config.RESEARCH_RUN_PRODUCER_LEASE_SECONDS,
        jobId: producer.jobId,
      });
      if (!claim || claim.jobId !== producer.jobId || claim.runId !== producer.runId) {
        throw new ResearchRunCreateError(
          "RESEARCH_RUN_TRANSPORT_UNKNOWN",
          "The Research intent is durable but dispatch is waiting for queue capacity or lease recovery; retry with the same intent.",
          503,
        );
      }
      await this.repository.recordRunProducerClaim(scope, {
        runId: producer.runId,
        jobId: claim.jobId,
        workerAttemptId: claim.workerAttemptId,
        leaseEpoch: claim.leaseEpoch,
      });
    } catch (error) {
      if (error instanceof ResearchRunCreateError) throw error;
      throw this.mapMetadataError(error);
    }

    const dispatchRequest = JSON.stringify({
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
        body: dispatchRequest,
        contentType: "application/json",
        requestId,
        traceparent: this.traceparent(requestId),
        user,
        workspaceId: scope.workspaceId,
        idempotencyKey: `research-run:${input.client_intent_id}`,
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
        throw new ResearchRunCreateError(
          "RESEARCH_RUN_UPSTREAM_REJECTED",
          "The private Portal run adapter rejected this immutable request.",
          502,
        );
      }
      throw new ResearchRunCreateError(
        "RESEARCH_RUN_TRANSPORT_UNKNOWN",
        "The Research intent is durable, but dispatch outcome is unknown; retry with the same intent.",
        503,
      );
    }
    if (write.status !== 202 || typeof write.body?.run_id !== "string" || write.body.run_id !== producer.runId) {
      throw new ResearchRunCreateError(
        write.status === 503 ? "RESEARCH_RUN_PRODUCER_UNAVAILABLE" : "RESEARCH_RUN_UPSTREAM_REJECTED",
        write.status === 503
          ? "The private Portal run adapter is temporarily unavailable."
          : "The private Portal run adapter did not accept the exact durable run identity.",
        write.status === 503 ? 503 : 502,
      );
    }
    try {
      const recorded = await this.repository.recordRunProducerDispatched(scope, {
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
      return this.response(recorded, produced.replayed || write.replayed,
        input.lineage?.relation === "REPRODUCTION_OF" ? input.lineage.parent_run_id : undefined);
    } catch (error) {
      // Portal may already own the NATS message. Never create another intent
      // or claim success: the next same-key retry reconciles the exact lease.
      throw new ResearchRunCreateError(
        "RESEARCH_RUN_TRANSPORT_UNKNOWN",
        "The Research run was accepted for dispatch but its durable receipt is being reconciled; retry with the same intent.",
        503,
      );
    }
  }

  private response(
    producer: {
      runId: string;
      requestedSpecDigest: string;
      effectiveSpecDigest: string;
      datasetBindingDigest: string;
      manifestDigest: string;
      legacyRequest: Record<string, unknown>;
    },
    replayed: boolean,
    reproductionParentRunId?: string,
  ): ResearchRunCreateResponse {
    const legacy = producer.legacyRequest;
    const response = {
      schema_version: "research.run-create.v1" as const,
      run_id: producer.runId,
      status: "QUEUED" as const,
      replayed,
      requested_spec_digest: producer.requestedSpecDigest,
      effective_spec_digest: producer.effectiveSpecDigest,
      dataset_binding_digest: producer.datasetBindingDigest,
      manifest_digest: producer.manifestDigest,
      ...(reproductionParentRunId ? { reproduction: {
        parent_run_id: reproductionParentRunId,
        pin_scope: "IMMUTABLE_INPUT_PINS" as const,
        environment_equivalence: {
          state: "NOT_PUBLISHED" as const,
          reason_code: "P10_RUNTIME_IMAGE_DEPENDENCY_EQUIVALENCE_NOT_RECORDED" as const,
          source_locator: "research.run_producers.v1:engine_release+adapter+execution_profile" as const,
        },
      } } : {}),
      legacy: {
        strategy_id: this.stringFact(legacy, "strategy_id"),
        dataset_id: this.stringFact(legacy, "dataset_id"),
        protocol: this.stringFact(legacy, "protocol"),
      },
    };
    const parsed = ResearchRunCreateResponseSchema.safeParse(response);
    if (!parsed.success) {
      throw new ResearchRunCreateError("RESEARCH_RUN_UPSTREAM_REJECTED", "Research run response did not satisfy its immutable contract.", 502);
    }
    return parsed.data;
  }

  private stringFact(value: Record<string, unknown>, key: string): string {
    const fact = value[key];
    if (typeof fact !== "string" || fact.length === 0 || fact.length > 191) {
      throw new ResearchRunCreateError("RESEARCH_RUN_PREFLIGHT_NOT_READY", "Research immutable metadata is incomplete.", 409);
    }
    return fact;
  }

  private traceparent(requestId: string): string {
    const trace = createHash("sha256").update(`research-run:${requestId}`).digest("hex");
    return `00-${trace.slice(0, 32)}-${trace.slice(32, 48)}-01`;
  }

  private mapMetadataError(error: unknown): ResearchRunCreateError {
    if (error instanceof ResearchRunCreateError) return error;
    if (error instanceof ResearchMetadataError) {
      switch (error.code) {
        case "RESEARCH_REPRODUCTION_BINDING_CONFLICT":
          return new ResearchRunCreateError("RESEARCH_RUN_REPRODUCTION_CONFLICT", "Reproduction must preserve the parent engine, AlphaVersion, effective specification and data snapshot; use a clone for changed inputs.", 409);
        case "RESEARCH_RUN_NOT_FOUND":
          return new ResearchRunCreateError("RESEARCH_RUN_NOT_FOUND", "Research parent run was not found.", 404);
        case "RESEARCH_PREFLIGHT_NOT_FOUND":
          return new ResearchRunCreateError("RESEARCH_RUN_NOT_FOUND", "Research preflight was not found.", 404);
        case "RESEARCH_PREFLIGHT_EXPIRED":
        case "RESEARCH_PREFLIGHT_STALE":
          return new ResearchRunCreateError("RESEARCH_RUN_PREFLIGHT_STALE", "Research preflight is stale; run preflight again.", 409);
        case "RESEARCH_IDEMPOTENCY_PAYLOAD_CONFLICT":
          return new ResearchRunCreateError("RESEARCH_RUN_CREATE_INVALID", "That client intent is already bound to a different request.", 409);
        case "RESEARCH_JOB_STATE_CONFLICT":
        case "RESEARCH_JOB_LEASE_REJECTED":
        case "RESEARCH_CONCURRENT_TRANSACTION":
          return new ResearchRunCreateError("RESEARCH_RUN_TRANSPORT_UNKNOWN", "Research durable dispatch is being recovered; retry with the same intent.", 503);
        case "RESEARCH_DB_ROLE_UNAVAILABLE":
        case "RESEARCH_ADMISSION_SATURATED":
          return new ResearchRunCreateError("RESEARCH_RUN_PRODUCER_UNAVAILABLE", "Research run creation is temporarily unavailable.", 503);
        default:
          return new ResearchRunCreateError("RESEARCH_RUN_CREATE_INVALID", "Research run request is invalid.", error.status);
      }
    }
    return new ResearchRunCreateError("RESEARCH_RUN_PRODUCER_UNAVAILABLE", "Research run creation is temporarily unavailable.", 503);
  }
}
