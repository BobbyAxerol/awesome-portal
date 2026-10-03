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
  ResearchImportedSourceResolveIngressSchema,
} from "./artifact-ingress.contract";
import { ResearchCurrentSourceIngestService } from "./current-source-ingest.service";
import { ResearchChildAuditCompanionIngestService } from "./child-audit-companion.ingest";
import { ChildAuditCompanionBatchIngressSchema, ChildAuditCompanionSealIngressSchema } from "./child-audit-companion.contract";
import { ResearchFixedReplayCompanionIngestService } from "./fixed-replay-companion.ingest";
import { FixedReplayCompanionBatchIngressSchema, FixedReplayCompanionSealIngressSchema } from "./fixed-replay-companion.contract";
import { ResearchMetadataRepository } from "./repository";
import { ResearchProgressRepository } from "./progress.repository";
import { ResearchProgressIngressSchema } from "./progress.contract";
import { ResearchProgressError } from "./progress.error";
import { ResearchProgressService } from "./progress.service";
import { ResearchWhatIfGridSealIngressSchema } from "./whatif.contract";
import { WHATIF_PROFILE_ID } from "./whatif.profile";
import { ResearchWhatIfRepository } from "./whatif.repository";
import { PinnedAuditSealSchema } from "./final-audit.contract";
import { ResearchFinalAuditService } from "./final-audit.service";

@Controller("/internal/research/progress")
export class ResearchProgressIngressController {
  constructor(
    @Inject(ResearchProgressService) private readonly service: ResearchProgressService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ResearchProgressRepository) private readonly progress: ResearchProgressRepository,
    @Inject(ResearchMetadataRepository) private readonly metadata: ResearchMetadataRepository,
    @Inject(ResearchCurrentSourceIngestService) private readonly currentSource: ResearchCurrentSourceIngestService,
    @Inject(ResearchWhatIfRepository) private readonly whatIf: ResearchWhatIfRepository,
    @Inject(ResearchChildAuditCompanionIngestService) private readonly childAudit?: ResearchChildAuditCompanionIngestService,
    @Inject(ResearchFixedReplayCompanionIngestService) private readonly fixedReplay?: ResearchFixedReplayCompanionIngestService,
    @Inject(ResearchFinalAuditService) private readonly finalAudit?: ResearchFinalAuditService,
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

  @Post("artifacts/audit/seal")
  @HttpCode(200)
  async sealPinnedAudit(@Req() request:FastifyRequest,@Body() body:unknown){
    this.assertWorkerPrincipal(request);
    this.assertArtifactRetentionEnabled();
    const parsed=PinnedAuditSealSchema.safeParse(body);
    if(!parsed.success)throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID","Invalid pinned audit seal.",400);
    if(!this.finalAudit)throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE","Audit receipt authority is unavailable.",503);
    const lease=await this.progress.resolveIngress(parsed.data);
    await this.finalAudit.seal({workspaceId:lease.workspaceId,actorUserId:lease.actorUserId},parsed.data);
    return {schema_version:"research.pinned-audit-seal.v1",verified:true};
  }

  /** E17: exact immutable source bytes for one current imported-run lease. */
  @Post("sources/imported")
  @HttpCode(200)
  async resolveImportedSource(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    if (this.config.FEATURE_RESEARCH_IMPORTED_EXECUTION !== "true") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Imported Alpha execution is not enabled.", 503);
    }
    const parsed = ResearchImportedSourceResolveIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Imported Alpha source request is invalid.", 400);
    }
    const lease = await this.progress.resolveIngress(parsed.data);
    if (lease.executionProfileId !== "p17.imported-signal-notional.v1") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Only an imported Alpha run may resolve imported source bytes.", 409);
    }
    const source = await this.metadata.loadImportedExecutionSource(
      { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId },
      {
        runId: parsed.data.run_id,
        sourceDigest: parsed.data.source_digest,
        entrypoint: parsed.data.entrypoint,
      },
    );
    return {
      schema_version: "research.imported-source.v1",
      source_digest: source.sourceDigest,
      entrypoint: source.entrypoint,
      source_base64: source.sourceBytes.toString("base64"),
      byte_count: source.sourceBytes.byteLength,
    };
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

  /**
   * W5a A10c: the immutable WHATIF_GRID relation of one what-if diagnostic
   * run, after its P05 artifact is sealed. The lease is the diagnostic run's
   * own; the frozen parent run is never written.
   */
  @Post("artifacts/what-if/seal")
  @HttpCode(200)
  async sealWhatIfGrid(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertArtifactRetentionEnabled();
    if (this.config.FEATURE_RESEARCH_WHATIF !== "true") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research what-if diagnostics are not enabled.", 503);
    }
    this.assertBoundedBody(body);
    const parsed = ResearchWhatIfGridSealIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research what-if grid seal is invalid.", 400);
    }
    const lease = await this.progress.resolveIngress(parsed.data);
    if (lease.executionProfileId !== WHATIF_PROFILE_ID) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Only a what-if diagnostic run may seal a what-if grid.", 409);
    }
    const result = await this.whatIf.sealGrid(
      { workspaceId: lease.workspaceId, actorUserId: lease.actorUserId },
      parsed.data,
    );
    return { schema_version: "research.whatif-grid-sealed.v1", sealed: true, replayed: result.replayed };
  }

  @Post("artifacts/child-audit/batches")
  @HttpCode(200)
  async appendChildAudit(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertCurrentSourceIngestEnabled();
    this.assertBoundedBody(body);
    const parsed = ChildAuditCompanionBatchIngressSchema.safeParse(body);
    if (!parsed.success) throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research audit companion batch is invalid.", 400);
    if (!this.childAudit) throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Audit retention is not configured.", 503);
    const lease = await this.progress.resolveIngress(parsed.data);
    return this.childAudit.appendBatch(lease, parsed.data);
  }

  @Post("artifacts/child-audit/seal")
  @HttpCode(200)
  async sealChildAudit(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertCurrentSourceIngestEnabled();
    this.assertBoundedBody(body);
    const parsed = ChildAuditCompanionSealIngressSchema.safeParse(body);
    if (!parsed.success) throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research audit companion seal is invalid.", 400);
    if (!this.childAudit) throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Audit retention is not configured.", 503);
    const lease = await this.progress.resolveIngress(parsed.data);
    return this.childAudit.seal(lease, parsed.data);
  }

  @Post("artifacts/fixed-replay/batches")
  @HttpCode(200)
  async appendFixedReplay(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertCurrentSourceIngestEnabled();
    this.assertBoundedBody(body);
    const parsed = FixedReplayCompanionBatchIngressSchema.safeParse(body);
    if (!parsed.success) throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research fixed replay batch is invalid.", 400);
    if (!this.fixedReplay) throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Fixed replay retention is not configured.", 503);
    const lease = await this.progress.resolveIngress(parsed.data);
    return this.fixedReplay.appendBatch(lease, parsed.data);
  }

  @Post("artifacts/fixed-replay/seal")
  @HttpCode(200)
  async sealFixedReplay(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    this.assertCurrentSourceIngestEnabled();
    this.assertBoundedBody(body);
    const parsed = FixedReplayCompanionSealIngressSchema.safeParse(body);
    if (!parsed.success) throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research fixed replay seal is invalid.", 400);
    if (!this.fixedReplay) throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Fixed replay retention is not configured.", 503);
    const lease = await this.progress.resolveIngress(parsed.data);
    return this.fixedReplay.seal(lease, parsed.data);
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
