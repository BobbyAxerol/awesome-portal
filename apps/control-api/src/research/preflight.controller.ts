import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
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
  ResearchPreflightCreateRequestSchema,
  ResearchPreflightGetQuerySchema,
  ResearchPreflightTokenSchema,
} from "./preflight.contract";
import { ResearchPreflightError } from "./preflight.error";
import { asResearchPreflightError, ResearchPreflightService } from "./preflight.service";
import { ResearchRunAdmissionService } from "./run-admission.service";

interface PreflightRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}

/** P08 same-origin BFF: a browser gets immutable metadata, never HMD rows. */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/preflights")
export class ResearchPreflightController {
  constructor(
    @Inject(ResearchPreflightService) private readonly service: ResearchPreflightService,
    @Inject(ResearchRunAdmissionService) private readonly runAdmission: ResearchRunAdmissionService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Req() request: PreflightRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = ResearchPreflightCreateRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    try {
      const scope = { workspaceId, actorUserId: request.portalUser.userId };
      const response = await this.service.create(
        request.portalUser,
        scope,
        parsed.data.requested_spec,
        this.requestId(request),
      );
      return {
        ...response,
        // P08 keeps its immutable response shape; P10 now supplies the one
        // server-owned predicate that this same response may expose.
        may_create_run: await this.runAdmission.mayCreate(
          request.portalUser,
          scope,
          response.preflight_token,
        ),
      };
    } catch (error) {
      return asResearchPreflightError(error);
    }
  }

  @Get(":preflight_token")
  async get(
    @Req() request: PreflightRequest,
    @Param("preflight_token") preflightToken: string,
    @Query() rawQuery: unknown,
  ) {
    const token = ResearchPreflightTokenSchema.safeParse(preflightToken);
    const query = ResearchPreflightGetQuerySchema.safeParse(rawQuery);
    if (!token.success || !query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    try {
      const scope = { workspaceId, actorUserId: request.portalUser.userId };
      const response = await this.service.get(
        scope,
        token.data,
      );
      return {
        ...response,
        may_create_run: await this.runAdmission.mayCreate(
          request.portalUser,
          scope,
          response.preflight_token,
        ),
      };
    } catch (error) {
      return asResearchPreflightError(error);
    }
  }

  private invalid(): never {
    throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Invalid Research preflight request.", 400);
  }

  private async workspace(request: PreflightRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: PreflightRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie) ||
        !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: PreflightRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
      ? value : newUlid("req");
  }
}
