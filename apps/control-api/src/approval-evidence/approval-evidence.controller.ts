import { Controller, Get, Header, Inject, Optional, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { WorkspacesRepository } from "../repos/workspaces";
import { CurrentViewAuthorityError } from "../execution-v2/current-view-authority";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import { OperationalReadError } from "../operations/current-operational-read";
import { APPROVAL_ID_PATTERN, approvalEvidenceQuery } from "./approval-evidence.contract";
import { ApprovalEvidenceNativeDelivery } from "./approval-evidence-native-delivery";
import { ApprovalEvidenceReads } from "./approval-evidence.service";

interface EvidenceRequest extends FastifyRequest { portalUser: PortalUser; portalWorkspaceId: string; portalViewerWorkspaceId?: string; portalSession: AuthSession; }

/** UNMOUNTED by default (see AppModule `approvalEvidence`). Same workspace and membership handling as the sibling governance r1/r2/live reads. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ApprovalEvidenceController {
  constructor(@Inject(ApprovalEvidenceReads) private readonly reads: ApprovalEvidenceReads,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Optional() @Inject(ApprovalEvidenceNativeDelivery) private readonly native?: ApprovalEvidenceNativeDelivery) {}

  @Get("/governance/approvals/:approval_id/evidence")
  @Header("Cache-Control", "private, no-store")
  async detail(@Req() request: EvidenceRequest, @Param("approval_id") approvalId: string, @Query() query: Record<string, unknown>,
    @Res({ passthrough: true }) reply?: FastifyReply) {
    const raw = query?.workspace_id;
    const workspaceId = raw === undefined || raw === null || raw === "" ? request.portalWorkspaceId : typeof raw === "string" && raw.length <= 96 ? raw : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    const { workspace_id: _ignored, ...rest } = query ?? {};
    const validated = typeof raw === "string" && raw !== "" ? { ...rest, workspace_id: workspaceId } : rest;
    if (!this.native) return this.reads.detail({ user: request.portalUser, session: request.portalSession, workspaceId }, approvalId, validated);
    if (!reply) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    const output = reply;
    if (!approvalEvidenceQuery.safeParse(validated).success || !APPROVAL_ID_PATTERN.test(approvalId))
      throw new OperationalReadError("OPERATIONAL_READ_INPUT_INVALID", 400);
    if (!this.native.hasNativeCurrentRelations()) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    let owns = false;
    try {
      await this.native.deliver({ user: request.portalUser, session: request.portalSession, workspaceId,
        viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId }, approvalId, validated, output.raw, () => {
        if (owns) return;
        if (output.raw.headersSent || output.raw.writableEnded || output.raw.destroyed)
          throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        output.hijack(); owns = true;
      });
      if (!owns) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    } catch (error) {
      if (owns || output.raw.headersSent || output.raw.destroyed || output.sent) { output.raw.destroy(); return; }
      if (error instanceof GovernanceError || error instanceof OperationalReadError || error instanceof ExecutionReadScopeError) throw error;
      if (error instanceof CurrentViewAuthorityError && error.code === "CURRENT_VIEW_AUTHORITY_CHANGED")
        throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
      throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    }
  }
}
