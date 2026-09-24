/** Private P11 source callback.  It is not a browser or façade route. */

import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { FastifyRequest } from "fastify";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  RESEARCH_CURRENT_SOURCE_INGEST_MAX_BODY_BYTES,
  ResearchArtifactReserveIngressSchema,
  ResearchArtifactSealIngressSchema,
  ResearchCurrentSourceBatchIngressSchema,
  ResearchCurrentSourceSealIngressSchema,
} from "./artifact-ingress.contract";
import { ResearchCurrentSourceIngestService } from "./current-source-ingest.service";
import { ResearchMetadataRepository } from "./repository";
import { ResearchProgressRepository } from "./progress.repository";
import { ResearchProgressIngressSchema } from "./progress.contract";
import { ResearchProgressError } from "./progress.error";
import { ResearchProgressService } from "./progress.service";

@Controller("/internal/research/progress")
export class ResearchProgressIngressController {
  constructor(
    @Inject(ResearchProgressService) private readonly service: ResearchProgressService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ResearchProgressRepository) private readonly progress: ResearchProgressRepository,
    @Inject(ResearchMetadataRepository) private readonly metadata: ResearchMetadataRepository,
    @Inject(ResearchCurrentSourceIngestService) private readonly currentSource: ResearchCurrentSourceIngestService,
  ) {}

  @Post("events")
  @HttpCode(202)
  async ingest(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    const parsed = ResearchProgressIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research progress source payload is invalid.", 400);
    }
    return this.service.ingest(parsed.data);
  }

  @Post("artifacts/reserve")
  @HttpCode(200)
  async reserveArtifact(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertArtifactRetentionEnabled();
    const parsed = ResearchArtifactReserveIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research artifact reservation is invalid.", 400);
    }
    const input = parsed.data;
    const lease = await this.progress.resolveIngress(input);
    const reservation = await this.metadata.reserveArtifact(
      { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId },
      {
        artifactId: input.artifact_id,
        runId: input.run_id,
        workerAttemptId: lease.workerAttemptId,
        leaseEpoch: lease.leaseEpoch,
        storageLocator: `artifacts/${input.artifact_id}`,
        retentionClass: input.retention_class,
      },
    );
    return {
      schema_version: "research.artifact-reservation.v1",
      artifact_id: reservation.artifactId,
      artifact_revision: reservation.artifactRevision,
      state: reservation.state,
      replayed: reservation.replayed,
    };
  }

  @Post("artifacts/seal")
  @HttpCode(200)
  async sealArtifact(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertArtifactRetentionEnabled();
    const parsed = ResearchArtifactSealIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research artifact seal is invalid.", 400);
    }
    const input = parsed.data;
    const lease = await this.progress.resolveIngress(input);
    const result = await this.metadata.sealArtifact(
      { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId },
      {
        artifactId: input.artifact_id,
        workerAttemptId: lease.workerAttemptId,
        leaseEpoch: lease.leaseEpoch,
        manifestDigest: input.manifest_digest,
        manifestSchemaVersion: input.manifest_schema_version,
        totalRows: input.total_rows,
        totalBytes: input.total_bytes,
        parts: input.parts.map((part) => ({
          tableKind: part.table_kind,
          schemaVersion: part.schema_version,
          partOrdinal: part.part_ordinal,
          relativePath: part.relative_path,
          partDigest: part.part_digest,
          rowCount: part.row_count,
          byteCount: part.byte_count,
          sequenceMin: part.sequence_min ?? null,
          sequenceMax: part.sequence_max ?? null,
        })),
        documents: (input.documents ?? []).map((document) => ({
          name: document.name,
          relativePath: document.relative_path,
          documentDigest: document.document_digest,
          byteCount: document.byte_count,
        })),
      },
    );
    return { schema_version: "research.artifact-seal.v1", sealed: true, replayed: result.replayed };
  }

  /** W1 §1.2: one bounded retained-row batch for a sealed P05 WFO artifact. */
  @Post("artifacts/current-source/batches")
  @HttpCode(200)
  async appendCurrentSourceBatch(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertCurrentSourceIngestEnabled();
    this.assertBoundedBody(body);
    const parsed = ResearchCurrentSourceBatchIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research current-source batch is invalid.", 400);
    }
    const lease = await this.progress.resolveIngress(parsed.data);
    return this.currentSource.appendBatch(lease, parsed.data);
  }

  /** W1 §1.2: final immutable current-source seal; digests come from run_producers. */
  @Post("artifacts/current-source/seal")
  @HttpCode(200)
  async sealCurrentSource(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertCurrentSourceIngestEnabled();
    this.assertBoundedBody(body);
    const parsed = ResearchCurrentSourceSealIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research current-source seal is invalid.", 400);
    }
    const lease = await this.progress.resolveIngress(parsed.data);
    return this.currentSource.seal(lease, parsed.data);
  }

  private assertCurrentSourceIngestEnabled(): void {
    this.assertArtifactRetentionEnabled();
    if (this.config.FEATURE_RESEARCH_CURRENT_SOURCE !== "true") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research current-source retention is not enabled.", 503);
    }
  }

  private assertBoundedBody(body: unknown): void {
    const encoded = JSON.stringify(body ?? null);
    if (Buffer.byteLength(encoded, "utf8") > RESEARCH_CURRENT_SOURCE_INGEST_MAX_BODY_BYTES) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research current-source ingest body exceeds 1,000,000 bytes.", 400);
    }
  }

  private assertArtifactRetentionEnabled(): void {
    if (this.config.FEATURE_RESEARCH_RETAINED_ARTIFACTS !== "true") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research artifact retention is not enabled.", 503);
    }
  }

  private assertWorkerPrincipal(request: FastifyRequest): void {
    const secret = this.config.INTERNAL_PRINCIPAL_SECRET;
    const raw = request.headers["x-portal-principal"];
    if (!secret) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research progress ingress is not configured.", 503);
    }
    if (Array.isArray(raw) || typeof raw !== "string") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Research progress source is not authorized.", 403);
    }
    const principal = new PrincipalService(secret).verify(raw);
    if (
      !principal || principal.principalId !== "research-progress-worker"
      || principal.username !== "research-progress-worker"
      || principal.role !== "ADMIN" || principal.mustChangePassword
      || !principal.authnMethods.includes("research_progress_writer")
    ) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Research progress source is not authorized.", 403);
    }
  }
}
