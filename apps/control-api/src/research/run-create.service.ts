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
import { ResearchMetadataRepository } from "./repository";
import {
  ResearchRunCreateResponseSchema,
  type ResearchRunCreateRequest,
  type ResearchRunCreateResponse,
} from "./run-create.contract";
import { ResearchRunCreateError } from "./run-create.error";
import { ResearchRunAdmissionService } from "./run-admission.service";

const P10_RESOURCE_PROFILE = Object.freeze({
  memoryBytes: 4 * 1024 * 1024 * 1024,
  cpuSeconds: 45,
  scratchBytes: 64 * 1024 * 1024,
  ioBytes: 512 * 1024 * 1024,
});

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
    if (input.intent_kind !== "NEW") {
      // P12/P19 own clone/reproduce/upgrade lineage semantics.  Accepting
      // their labels before their parent/effective-version contracts exist
      // would create a misleading graph, so P10 makes the current gap typed.
      throw new ResearchRunCreateError(
        "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
        "This installed Research adapter currently accepts only a new Delta qualification run.",
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
    const commandDigest = digest({
      schema_version: input.schema_version,
      client_intent_id: input.client_intent_id,
      preflight_token: input.preflight_token,
      requested_spec: requested,
      intent_kind: input.intent_kind,
    });
    const runId = stableId("rrun", commandDigest);
    const attemptId = stableId("ratt", commandDigest);
    const jobId = stableId("rjob", commandDigest);
    const commandId = stableId("rcmd", commandDigest);
    const workDigest = digest({
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
    const legacyRequest = {
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
        intent_kind: input.intent_kind,
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
        cost: P10_RESOURCE_PROFILE,
        queueClass: "INTERACTIVE",
        resourceClass: "p10-delta-rsi-v1",
        attemptLimit: 2,
      });
    } catch (error) {
      throw this.mapMetadataError(error);
    }

    const producer = produced.producer;
    if (producer.dispatchState === "DISPATCHED") {
      return this.response(producer, true);
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
          "The Research intent is durable but its previous dispatch lease is still being recovered; retry with the same intent.",
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
      return this.response(recorded, produced.replayed || write.replayed);
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
