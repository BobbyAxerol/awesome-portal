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
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionCommandApplyRequestSchema,
  ExecutionCommandCatalogueQuerySchema,
  ExecutionCommandPlanRequestSchema,
  OperationAcknowledgeRequestSchema,
  OperationQueueQuerySchema,
  OperationResolveRequestSchema,
} from "../operations/contracts";
import { ExecutionOperationsService } from "../operations/operations.service";
import { OperationsWorkflowService } from "../operations/workflow.service";
import {
  ApplyOperationRequestSchema,
  approvalHistoryQuery,
  approvalListQuery,
  DecisionPlanRequestSchema,
  PaperExitApplyOperationRequestSchema,
  PaperExitDecisionPlanRequestSchema,
} from "./contracts";
import { GovernanceError, GovernanceService } from "./governance.service";
import { PaperExitService } from "./paper-exit.service";

interface GovernanceRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession & { csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class GovernanceController {
  constructor(
    @Inject(GovernanceService) private readonly governance: GovernanceService,
    @Inject(PaperExitService) private readonly paperExit: PaperExitService,
    @Inject(ExecutionOperationsService) private readonly operations: ExecutionOperationsService,
    @Inject(OperationsWorkflowService) private readonly operationWorkflow: OperationsWorkflowService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/operations")
  async operationsQueue(
    @Req() request: GovernanceRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const parsed = OperationQueueQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_OPERATION_QUEUE_QUERY", "Invalid operation queue query.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.operationWorkflow.list(request.portalUser, workspaceId, parsed.data);
  }

  @Post("/operations/:operation_id/acknowledge")
  async acknowledgeOperation(
    @Req() request: GovernanceRequest,
    @Param("operation_id") operationId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = OperationAcknowledgeRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_OPERATION_ACKNOWLEDGEMENT", "Invalid acknowledgement request.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.operationWorkflow.acknowledge(
      request.portalUser,
      operationId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Post("/operations/:operation_id/resolve")
  async resolveOperation(
    @Req() request: GovernanceRequest,
    @Param("operation_id") operationId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = OperationResolveRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_OPERATION_RESOLUTION", "Invalid resolution request.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.operationWorkflow.resolve(
      request.portalUser,
      operationId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Get("/commands/catalog")
  async catalogue(
    @Req() request: GovernanceRequest,
    @Query() query: Record<string, unknown>,
  ) {
    if (request.portalUser.role !== "ADMIN") {
      throw new GovernanceError("ADMIN_ROLE_REQUIRED", "Access denied.", 403);
    }
    const parsed = ExecutionCommandCatalogueQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new GovernanceError(
        "INVALID_EXECUTION_COMMAND_CATALOGUE_QUERY",
        "Invalid execution command catalogue query.",
        400,
      );
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.operations.catalogue(request.portalUser, {
      ...parsed.data,
      workspace_id: workspaceId,
    });
  }

  @Get("/governance/approvals")
  async approvals(
    @Req() request: GovernanceRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const workspaceId = await this.workspace(request, query.workspace_id);
    return this.governance.list(request.portalUser, workspaceId, approvalListQuery(query));
  }

  @Get("/governance/approvals/history")
  async approvalHistory(
    @Req() request: GovernanceRequest,
    @Query() query: Record<string, unknown>,
  ) {
    const workspaceId = await this.workspace(request, query.workspace_id);
    return this.governance.history(request.portalUser, workspaceId, approvalHistoryQuery(query));
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

  @Get("/governance/approvals/:approval_id/live")
  async live(
    @Req() request: GovernanceRequest,
    @Param("approval_id") approvalId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.governance.liveDetail(
      request.portalUser,
      request.portalSession,
      workspaceId,
      approvalId,
    );
  }

  @Get("/governance/exit-reviews/:review_id")
  async exitReview(
    @Req() request: GovernanceRequest,
    @Param("review_id") reviewId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.paperExit.detail(request.portalUser, workspaceId, reviewId);
  }

  @Post("/commands/plans")
  @HttpCode(201)
  async plan(@Req() request: GovernanceRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const paperExit = PaperExitDecisionPlanRequestSchema.safeParse(body);
    if (paperExit.success) {
      const workspaceId = await this.workspace(request, paperExit.data.workspace_id);
      const result = await this.paperExit.plan(
        request.portalUser,
        {
          workspaceId,
          requestKey: paperExit.data.request_key,
          reviewId: paperExit.data.target.review_id,
          expectedReviewVersion: paperExit.data.expected_review_version,
          decision: paperExit.data.payload.decision,
          reason: paperExit.data.payload.reason,
          extensionDays: paperExit.data.payload.extension_days ?? null,
          evidenceHashes: paperExit.data.payload.evidence_hashes,
        },
        this.requestId(request),
      );
      return { ...result.response, replayed: result.replayed };
    }
    const execution = ExecutionCommandPlanRequestSchema.safeParse(body);
    if (execution.success) {
      const workspaceId = await this.workspace(request, execution.data.workspace_id);
      return this.operations.plan(
        request.portalUser,
        { ...execution.data, workspace_id: workspaceId },
        this.requestId(request),
      );
    }
    if (
      body !== null &&
      typeof body === "object" &&
      (body as Record<string, unknown>).schema_version === "execution.command-plan-request.v1"
    ) {
      const sensitive = execution.error.issues.some(
        (issue) => issue.message === "SENSITIVE_PAYLOAD_FIELD_FORBIDDEN",
      );
      throw new GovernanceError(
        sensitive ? "SENSITIVE_PAYLOAD_FIELD_FORBIDDEN" : "INVALID_EXECUTION_COMMAND_PLAN",
        sensitive
          ? "Sensitive credential fields are prohibited in execution command payloads."
          : "Invalid execution command plan request.",
        400,
      );
    }
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
        conditions: parsed.data.payload.conditions ?? (
          parsed.data.payload.condition
            ? [{
                text: parsed.data.payload.condition,
                owner: request.portalUser.userId,
                deadline: null,
                expires_at: null,
                blocking: true,
              }]
            : []
        ),
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
    const paperExit = PaperExitApplyOperationRequestSchema.safeParse(body);
    if (paperExit.success) {
      const workspaceId = await this.workspace(request, paperExit.data.workspace_id);
      return this.paperExit.apply(
        request.portalUser,
        workspaceId,
        operationId,
        paperExit.data.apply_token,
        this.requestId(request),
      );
    }
    const execution = ExecutionCommandApplyRequestSchema.safeParse(body);
    if (execution.success) {
      const workspaceId = await this.workspace(request, execution.data.workspace_id);
      return this.operations.apply(
        request.portalUser,
        workspaceId,
        operationId,
        this.requestId(request),
      );
    }
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
    const execution = await this.operations.operationOrNull(
      request.portalUser,
      workspaceId,
      operationId,
    );
    if (execution) return execution;
    const paperExit = await this.paperExit.operationOrNull(
      request.portalUser,
      workspaceId,
      operationId,
    );
    if (paperExit) return paperExit;
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
