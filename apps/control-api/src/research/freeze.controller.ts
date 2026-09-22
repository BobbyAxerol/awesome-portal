/** P16 same-origin Freeze / integrity BFF route. */

import { Controller, Get, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchFreezeReadQuerySchema, ResearchFreezeRunIdSchema } from "./freeze.contract";
import { ResearchFreezeError } from "./freeze.error";
import { ResearchFreezeService } from "./freeze.service";

interface FreezeRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
  portalSession: { csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchFreezeController {
  constructor(
    @Inject(ResearchFreezeService) private readonly service: ResearchFreezeService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get(":runId/freeze")
  async detail(
    @Req() request: FreezeRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = this.query(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    const body = await this.service.detail(
      { workspaceId, actorUserId: request.portalUser.userId }, runId,
      { ...(query.fold === undefined ? {} : { fold: query.fold }) },
    );
    if (body.etag) {
      reply.header("etag", body.etag);
      const candidate = request.headers["if-none-match"];
      if (!Array.isArray(candidate) && candidate === body.etag) return reply.code(304).send();
    }
    return reply.send(body);
  }

  /**
   * This is a CSRF/origin-protected user-requested re-read. It persists no
   * receipt, does not fetch artifact bytes and cannot enqueue diagnostics;
   * POST preserves the explicit-action semantics of the Screen-07 button.
   */
  @Post(":runId/freeze/verify")
  @HttpCode(200)
  async verify(
    @Req() request: FreezeRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    this.assertActionSecurity(request);
    const runId = this.runId(rawRunId);
    const query = this.query(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    return this.service.verify(
      { workspaceId, actorUserId: request.portalUser.userId }, runId,
      { ...(query.fold === undefined ? {} : { fold: query.fold }) },
    );
  }

  private runId(raw: string): string {
    if (!ResearchFreezeRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private query(raw: unknown) {
    const parsed = ResearchFreezeReadQuerySchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private invalid(): never {
    throw new ResearchFreezeError("RESEARCH_FREEZE_INVALID", "Invalid Research Freeze request.", 400);
  }

  private async workspace(request: FreezeRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }

  private assertActionSecurity(request: FreezeRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_FORBIDDEN", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie)
      || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchFreezeError("RESEARCH_FREEZE_FORBIDDEN", "CSRF token is invalid.", 403);
    }
  }
}
