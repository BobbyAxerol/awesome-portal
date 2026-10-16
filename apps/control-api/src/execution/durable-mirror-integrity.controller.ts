import { Controller, Get, Header, HttpException, Inject, Optional, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ExecutionDurableMirrorRepository } from "./durable-mirror.repository";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../execution-v2/read-scope";
import { technicalHealthSchema } from "../execution-v2/technical-read.contract";

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
  portalViewerWorkspaceId?: string;
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
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
  ) {}

  @Get("/integrity")
  @Header("Cache-Control", "private, no-store")
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
      || !(await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId, environment))) {
      throw new HttpException({ error: { code: "WORKSPACE_NOT_FOUND" } }, 404);
    }
    const profileId = this.profileFor(environment);
    const principal = { user: request.portalUser, session: request.portalSession, workspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
    if (this.scopes && await this.scopes.selectionMode(principal) === "SCOPED_V2") {
      if (!profileId) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
      const scope = await this.scopes.authorizeTechnicalProfile(principal, { environment, profileId });
      return this.scopes.deliver(scope, async () => {
        const value = await this.mirror.integrity({ workspaceId, environment, profileId });
        const parsed = technicalHealthSchema.safeParse({ schema_version: "portal.execution.technical-health.v1", read_scope: "TECHNICAL_AUTHORIZED",
          environment, profile_id: profileId, component: "DURABLE_MIRROR", state: value.state,
          reason_code: value.reason_code, revision: value.measured_revision, observed_at: value.measured_at_ms });
        if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        return parsed.data;
      });
    }
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
    if (this.scopes && await this.scopes.selectionMode(principal) !== "LEGACY_COMPATIBILITY")
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
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
