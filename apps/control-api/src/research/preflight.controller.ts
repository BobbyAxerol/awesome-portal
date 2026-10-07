import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import type { ZodIssue } from "zod";

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
import { admissionFieldPath } from "./preflight-gates";
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
    if (!parsed.success) this.invalid(parsed.error.issues);
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    try {
      const scope = { workspaceId, actorUserId: request.portalUser.userId };
      const response = await this.service.create(
        request.portalUser,
        scope,
        parsed.data.requested_spec,
        this.requestId(request),
      );
      // P08 keeps its immutable response shape; P10 now supplies the one
      // server-owned predicate that this same response may expose.
      return this.withAdmission(response, await this.runAdmission.admissionFacts(
        request.portalUser,
        scope,
        response.preflight_token,
      ));
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
      return this.withAdmission(response, await this.runAdmission.admissionFacts(
        request.portalUser,
        scope,
        response.preflight_token,
      ));
    } catch (error) {
      return asResearchPreflightError(error);
    }
  }

  /** CG-P08-03: the typed reason and field path behind `may_create_run`. */
  private withAdmission<T extends { gates?: readonly { gate: string; state: string; field_path: readonly string[]; message: string }[] }>(
    response: T,
    facts: { allowed: boolean; code: string | null; message: string | null },
  ): T & { may_create_run: boolean; run_admission: { may_create_run: boolean; code: string | null; message: string | null; field_path: readonly string[] } } {
    return {
      ...response,
      gates: [...(response.gates ?? []).filter(gate => gate.gate !== "execution_admission"), {
        gate: "execution_admission", state: facts.allowed ? "PASS" as const : "FAIL" as const,
        field_path: facts.allowed ? [] : admissionFieldPath(facts.message),
        message: facts.allowed ? "This exact preflight is currently admitted for run creation."
          : facts.message ?? "Run creation admission could not be established; no execution permission is granted.",
      }],
      may_create_run: facts.allowed,
      run_admission: {
        may_create_run: facts.allowed,
        code: facts.allowed ? null : facts.code,
        message: facts.allowed ? null : facts.message,
        field_path: facts.allowed ? [] : admissionFieldPath(facts.message),
      },
    };
  }

  /**
   * CG-P08-03: a 400 names every invalid requested-spec field so Screen 02
   * can send the reader to the step that owns it. Paths only — never values.
   */
  private invalid(issues: readonly ZodIssue[] = []): never {
    const fieldPaths = issues
      .map((issue) => issue.path.map(String))
      .map((path) => (path[0] === "requested_spec" ? path.slice(1) : path))
      .filter((path) => path.length > 0 && path.length <= 6 && path.every((part) => /^[A-Za-z0-9_]{1,64}$/.test(part)))
      .slice(0, 16);
    throw new ResearchPreflightError(
      "RESEARCH_PREFLIGHT_INVALID",
      "Invalid Research preflight request.",
      400,
      fieldPaths.length > 0 ? { field_paths: fieldPaths } : undefined,
    );
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
