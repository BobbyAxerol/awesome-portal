import { Body, Controller, Get, Header, HttpCode, Inject, Optional, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { ExecutionReadScopes, ExecutionReadScopeError } from "../execution-v2/read-scope";
import { SessionGuard } from "../facade/session.guard";
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ActivationService } from "./activation.service";
import {
  StagedActivationApplyRequestSchema,
  StagedActivationPlanRequestSchema,
  StagedActivationVerifyRequestSchema,
} from "./contracts";

interface ActivationRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession & { csrfSecretHash: string };
  portalViewerWorkspaceId?: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/activation")
export class ActivationController {
  constructor(
    @Inject(ActivationService) private readonly activation: ActivationService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
  ) {}

  @Get("/capabilities")
  @Header("Cache-Control", "private, no-store")
  async capabilities(@Req() request: ActivationRequest, @Query("workspace_id") rawWorkspaceId?: unknown) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.readTechnical(request, workspaceId, () => this.activation.capabilities(request.portalUser, workspaceId));
  }

  @Get("/plans/:plan_id")
  @Header("Cache-Control", "private, no-store")
  async detail(
    @Req() request: ActivationRequest,
    @Param("plan_id") planId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.readTechnical(request, workspaceId, () => this.activation.detail(request.portalUser, workspaceId, planId));
  }

  private async readTechnical<T>(request: ActivationRequest, workspaceId: string, read: () => Promise<T>): Promise<T> {
    const principal = { user: request.portalUser, session: request.portalSession, workspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
    // Activation evidence/signature/compatibility fields have no commissioned
    // V2 field policy. Maintenance health permission is not permission to read
    // those details. Do not replace a plan with an unrelated health-only DTO,
    // infer its environment from the URL, or disclose existence/evidence first.
    if (this.scopes && await this.scopes.coreSelectionMode(principal) === "SCOPED_V2")
      throw new GovernanceError("ACTIVATION_TECHNICAL_FIELDS_NOT_COMMISSIONED", "Activation technical field policy is not commissioned.", 503);
    const result = await read();
    if (this.scopes && await this.scopes.coreSelectionMode(principal) !== "LEGACY_COMPATIBILITY")
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    return result;
  }

  @Post("/plans")
  @HttpCode(201)
  async plan(@Req() request: ActivationRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = StagedActivationPlanRequestSchema.safeParse(body);
    if (!parsed.success) {
      const sensitive = parsed.error.issues.some((issue) => issue.message === "SENSITIVE_OPERATOR_TEXT_FORBIDDEN");
      throw new GovernanceError(
        sensitive ? "SENSITIVE_OPERATOR_TEXT_FORBIDDEN" : "INVALID_STAGED_ACTIVATION_PLAN",
        sensitive ? "Sensitive fields are prohibited in activation reasons." : "Invalid staged activation plan.",
        400,
      );
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.activation.plan(
      request.portalUser,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Post("/plans/:plan_id/apply")
  @HttpCode(202)
  async apply(@Req() request: ActivationRequest, @Param("plan_id") planId: string, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = StagedActivationApplyRequestSchema.safeParse(body);
    if (!parsed.success) throw new GovernanceError("INVALID_STAGED_ACTIVATION_APPLY", "Invalid apply request.", 400);
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.activation.apply(
      request.portalUser,
      planId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Post("/plans/:plan_id/verify")
  async verify(@Req() request: ActivationRequest, @Param("plan_id") planId: string, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = StagedActivationVerifyRequestSchema.safeParse(body);
    if (!parsed.success) throw new GovernanceError("INVALID_STAGED_ACTIVATION_VERIFY", "Invalid verify request.", 400);
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.activation.verify(
      request.portalUser,
      planId,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  private async workspace(request: ActivationRequest, raw: unknown): Promise<string> {
    const workspaceId = raw === undefined || raw === null || raw === ""
      ? request.portalWorkspaceId
      : typeof raw === "string" && raw.length <= 96 ? raw : null;
    if (!workspaceId || !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new GovernanceError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: ActivationRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new GovernanceError("ORIGIN_DENIED", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (
      !header || !cookie || !constantTimeEqual(header, cookie) ||
      !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)
    ) {
      throw new GovernanceError("CSRF_INVALID", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: ActivationRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
      ? value : newUlid("req");
  }
}
