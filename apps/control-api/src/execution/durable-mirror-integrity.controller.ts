import { Controller, Get, HttpException, Inject, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionDurableMirrorRepository } from "./durable-mirror.repository";

/**
 * PHASE 2B (round 2) · the mirror says what it knows it is missing.
 *
 * `execution_durable_mirror_gaps` and `_conflicts` have been written by
 * production code since they were added and read by nothing: no route, no
 * screen. The system has been detecting its own holes and filing them where
 * nobody looks, which reads as health.
 *
 * This publishes the aggregate and only the aggregate. The rows carry
 * `entity_key`, `row_id` and payload digests — they name a specific order or
 * position, and an operator needs to know that a relation is incomplete, not
 * which row it was.
 */
interface MirrorIntegrityRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const IntegrityQuery = z.object({
  environment: z.enum(["paper", "sandbox", "live"]).optional(),
  workspace_id: z.string().min(1).max(64).optional(),
}).strict();

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/durable-mirror")
export class ExecutionDurableMirrorIntegrityController {
  constructor(
    @Inject(ExecutionDurableMirrorRepository) private readonly mirror: ExecutionDurableMirrorRepository,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/integrity")
  async integrity(@Req() request: MirrorIntegrityRequest, @Query() rawQuery: unknown) {
    const query = IntegrityQuery.safeParse(rawQuery);
    if (!query.success) {
      throw new HttpException({ error: { code: "EDS06_MIRROR_INTEGRITY_QUERY_INVALID" } }, 400);
    }
    const environment = query.data.environment ?? "paper";
    const workspaceId = query.data.workspace_id
      ?? this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID
      ?? request.portalWorkspaceId;
    // Same fail-closed workspace check every local read on this surface makes:
    // a workspace outside the local projection, or one the caller is not a
    // member of, is not found rather than empty.
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID
      || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new HttpException({ error: { code: "WORKSPACE_NOT_FOUND" } }, 404);
    }
    const profileId = this.profileFor(environment);
    if (!profileId) {
      // A profile the deployment never configured is a capability gap, and it
      // says so rather than reporting a mirror with nothing wrong.
      return {
        schema_version: "execution.durable-mirror-integrity.v1",
        record_authority: "PORTAL_CONTROL",
        environment,
        state: "UNAVAILABLE" as const,
        reason_code: "EDS06_MIRROR_PROFILE_NOT_CONFIGURED",
        measured_revision: null,
        measured_at_ms: null,
        read_at_ms: Date.now(),
        gap_findings: null,
        conflict_findings: null,
        total_findings: null,
        findings: [],
      };
    }
    const integrity = await this.mirror.integrity({ workspaceId, environment, profileId });
    return {
      schema_version: "execution.durable-mirror-integrity.v1",
      record_authority: "PORTAL_CONTROL",
      environment,
      ...integrity,
    };
  }

  private profileFor(environment: "paper" | "sandbox" | "live"): string | null {
    return environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID ?? null
      : environment === "sandbox" ? this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID ?? null
        : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID ?? null;
  }
}
