import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { WorkspacesRepository } from "../repos/workspaces";
import { ApprovalEvidenceReads } from "./approval-evidence.service";

interface EvidenceRequest extends FastifyRequest { portalUser: PortalUser; portalWorkspaceId: string; portalSession: AuthSession; }

/** UNMOUNTED by default (see AppModule `approvalEvidence`). Same workspace and membership handling as the sibling governance r1/r2/live reads. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ApprovalEvidenceController {
  constructor(@Inject(ApprovalEvidenceReads) private readonly reads: ApprovalEvidenceReads,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get("/governance/approvals/:approval_id/evidence")
  @Header("Cache-Control", "private, no-store")
  async detail(@Req() request: EvidenceRequest, @Param("approval_id") approvalId: string, @Query() query: Record<string, unknown>) {
    const raw = query?.workspace_id;
    const workspaceId = raw === undefined || raw === null || raw === "" ? request.portalWorkspaceId : typeof raw === "string" && raw.length <= 96 ? raw : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    const { workspace_id: _ignored, ...rest } = query ?? {};
    return this.reads.detail({ user: request.portalUser, session: request.portalSession, workspaceId }, approvalId,
      typeof raw === "string" && raw !== "" ? { ...rest, workspace_id: workspaceId } : rest);
  }
}
