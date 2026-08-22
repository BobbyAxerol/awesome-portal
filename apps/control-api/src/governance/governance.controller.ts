import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ApplyOperationRequestSchema,
  approvalListQuery,
  DecisionPlanRequestSchema,
} from "./contracts";
import { GovernanceError, GovernanceService } from "./governance.service";

interface GovernanceRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class GovernanceController {
  constructor(
    @Inject(GovernanceService) private readonly governance: GovernanceService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/governance/approvals")
  async approvals(
    @Req() request: GovernanceRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const workspaceId = await this.workspace(request, query.workspace_id);
    return this.governance.list(request.portalUser, workspaceId, approvalListQuery(query));
  }

  @Get("/governance/approvals/:approval_id/r1")
  async r1(
    @Req() request: GovernanceRequest,
    @Param("approval_id") approvalId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.governance.detail(request.portalUser, workspaceId, approvalId);
  }

  @Get("/governance/approvals/:approval_id/r2")
  async r2(
    @Req() request: GovernanceRequest,
    @Param("approval_id") approvalId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.governance.r2Detail(request.portalUser, workspaceId, approvalId);
  }

  @Post("/commands/plans")
  @HttpCode(201)
  async plan(@Req() request: GovernanceRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = DecisionPlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_DECISION_PLAN", "Invalid decision plan request.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    const result = await this.governance.plan(
      request.portalUser,
      {
        workspaceId,
        requestKey: parsed.data.request_key,
        approvalId: parsed.data.target.approval_id,
        expectedApprovalVersion: parsed.data.expected_approval_version,
        decision: parsed.data.payload.decision,
        reason: parsed.data.payload.reason,
        condition: parsed.data.payload.condition ?? null,
        evidenceHashes: parsed.data.payload.evidence_hashes,
      },
      this.requestId(request),
    );
    return { ...result.response, replayed: result.replayed };
  }

  @Post("/operations/:operation_id/apply")
  @HttpCode(202)
  async apply(
    @Req() request: GovernanceRequest,
    @Param("operation_id") operationId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = ApplyOperationRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_APPLY_REQUEST", "Invalid apply request.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.governance.apply(
      request.portalUser,
      workspaceId,
      operationId,
      parsed.data.apply_token,
      this.requestId(request),
    );
  }

  @Get("/operations/:operation_id")
  async operation(
    @Req() request: GovernanceRequest,
    @Param("operation_id") operationId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.governance.operation(request.portalUser, workspaceId, operationId);
  }

  private async workspace(request: GovernanceRequest, raw: unknown): Promise<string> {
    const workspaceId = raw === undefined || raw === null || raw === ""
      ? request.portalWorkspaceId
      : typeof raw === "string" && raw.length <= 96
        ? raw
        : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: GovernanceRequest): void {
    const origin = request.headers.origin;
    if (
      typeof origin !== "string" ||
      !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)
    ) {
      throw new GovernanceError("ORIGIN_DENIED", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (
      !header ||
      !cookie ||
      !constantTimeEqual(header, cookie) ||
      !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)
    ) {
      throw new GovernanceError("CSRF_INVALID", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: GovernanceRequest): string {
    const header = request.headers["x-request-id"];
    return typeof header === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(header)
      ? header
      : newUlid("req");
  }
}
