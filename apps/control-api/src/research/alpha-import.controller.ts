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
  ResearchAlphaActivateRequestSchema,
  ResearchAlphaImportGatesRequestSchema,
  ResearchAlphaImportParseRequestSchema,
  ResearchAlphaImportRegisterRequestSchema,
  ResearchAlphaListQuerySchema,
  type ResearchAlphaRegistryListResponse,
} from "./alpha-import.contract";
import { ResearchAlphaImportError } from "./alpha-import.error";
import { asResearchAlphaImportError, ResearchAlphaImportService } from "./alpha-import.service";

interface AlphaImportRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}

/** P07 same-origin BFF: browser session/RBAC stops at Control API. */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/alphas")
export class ResearchAlphaImportController {
  constructor(
    @Inject(ResearchAlphaImportService) private readonly service: ResearchAlphaImportService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get()
  async list(@Req() request: AlphaImportRequest, @Query() rawQuery: unknown) {
    const query = ResearchAlphaListQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    try {
      const entries = await this.service.list(
        { workspaceId, actorUserId: request.portalUser.userId },
        query.data.alpha_id,
      );
      const response: ResearchAlphaRegistryListResponse = {
        schema_version: "research.alpha-registry.v1",
        entries,
      };
      return response;
    } catch (error) {
      return asResearchAlphaImportError(error);
    }
  }

  @Post("/import/parse")
  @HttpCode(201)
  async parse(@Req() request: AlphaImportRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = ResearchAlphaImportParseRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    try {
      return await this.service.parse(
        request.portalUser,
        { workspaceId, actorUserId: request.portalUser.userId },
        { originalFilename: parsed.data.original_filename, sourceText: parsed.data.source_text },
        this.requestId(request),
      );
    } catch (error) {
      return asResearchAlphaImportError(error);
    }
  }

  @Post("/import/gates")
  async gates(@Req() request: AlphaImportRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = ResearchAlphaImportGatesRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    try {
      return await this.service.gates(
        request.portalUser,
        { workspaceId, actorUserId: request.portalUser.userId },
        parsed.data.source_file_ref,
        this.requestId(request),
      );
    } catch (error) {
      return asResearchAlphaImportError(error);
    }
  }

  @Post("/import/register")
  @HttpCode(201)
  async register(@Req() request: AlphaImportRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = ResearchAlphaImportRegisterRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    try {
      return await this.service.register(
        request.portalUser,
        { workspaceId, actorUserId: request.portalUser.userId },
        {
          sourceFileRef: parsed.data.source_file_ref,
          alphaId: parsed.data.alpha_id,
          gateReceiptId: parsed.data.gate_receipt_id,
        },
        this.requestId(request),
      );
    } catch (error) {
      return asResearchAlphaImportError(error);
    }
  }

  @Post(":alpha_version_id/activate")
  async activate(
    @Req() request: AlphaImportRequest,
    @Param("alpha_version_id") alphaVersionId: string,
    @Body() body: unknown,
  ) {
    this.assertMutationSecurity(request);
    const parsed = ResearchAlphaActivateRequestSchema.safeParse(body);
    if (!parsed.success) this.invalid();
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    try {
      return await this.service.activate(
        request.portalUser,
        { workspaceId, actorUserId: request.portalUser.userId },
        { alphaVersionId, expectedAlphaRevision: parsed.data.expected_alpha_revision },
      );
    } catch (error) {
      return asResearchAlphaImportError(error);
    }
  }

  private invalid(): never {
    throw new ResearchAlphaImportError("RESEARCH_ALPHA_IMPORT_INVALID", "Invalid Alpha import request.", 400);
  }

  private async workspace(request: AlphaImportRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchAlphaImportError("RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND", "Workspace not found.", 404);
    }
    return workspaceId;
  }

  private assertMutationSecurity(request: AlphaImportRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchAlphaImportError("RESEARCH_ALPHA_IMPORT_INVALID", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie) ||
        !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchAlphaImportError("RESEARCH_ALPHA_IMPORT_INVALID", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: AlphaImportRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
      ? value : newUlid("req");
  }
}
