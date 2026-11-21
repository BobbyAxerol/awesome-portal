/** P18 same-origin Report and authenticated bounded-export routes. */

import { Body, Controller, Get, Header, HttpCode, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ResearchReportExportCreateSchema,
  ResearchReportExportJobIdSchema,
  ResearchReportExportReadQuerySchema,
  ResearchReportReadQuerySchema,
  ResearchReportRunIdSchema,
} from "./report.contract";
import { ResearchReportError } from "./report.error";
import { ResearchReportService } from "./report.service";
import { sendRevalidatable } from "./etag";

interface ReportRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
  portalSession: { csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchReportController {
  constructor(
    private readonly service: ResearchReportService,
    private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get(":runId/report")
  async detail(
    @Req() request: ReportRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = this.readQuery(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    const body = await this.service.read({ workspaceId, actorUserId: request.portalUser.userId }, runId);
    return sendRevalidatable(reply, request, body);
  }

  @Post(":runId/report/exports")
  @HttpCode(202)
  async createExport(
    @Req() request: ReportRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
    @Body() body: unknown,
  ) {
    this.assertActionSecurity(request);
    const runId = this.runId(rawRunId);
    const query = this.readQuery(rawQuery);
    const input = ResearchReportExportCreateSchema.safeParse({
      ...(body && typeof body === "object" && !Array.isArray(body) ? body : {}),
      ...(query.workspace_id === undefined ? {} : { workspace_id: query.workspace_id }),
    });
    if (!input.success) this.invalid();
    const workspaceId = await this.workspace(request, input.data.workspace_id);
    return this.service.requestExport({ workspaceId, actorUserId: request.portalUser.userId }, runId, input.data.format);
  }

  @Get(":runId/report/exports/:jobId")
  @Header("Cache-Control", "private, no-store")
  async exportStatus(
    @Req() request: ReportRequest,
    @Param("runId") rawRunId: string,
    @Param("jobId") rawJobId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const jobId = this.jobId(rawJobId);
    const query = this.exportQuery(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    return this.service.readExport({ workspaceId, actorUserId: request.portalUser.userId }, runId, jobId);
  }

  @Get(":runId/report/exports/:jobId/download")
  async download(
    @Req() request: ReportRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Param("jobId") rawJobId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const jobId = this.jobId(rawJobId);
    const query = this.exportQuery(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    const result = await this.service.download({ workspaceId, actorUserId: request.portalUser.userId }, runId, jobId);
    // Filename is generated server-side from vetted IDs only; never reflect a
    // browser path/name parameter in either Content-Disposition or storage.
    reply.header("cache-control", "private, no-store");
    reply.header("content-type", result.status.content_type!);
    reply.header("content-length", String(result.bytes.byteLength));
    reply.header("content-disposition", `attachment; filename="${result.status.filename!}"`);
    reply.header("x-content-type-options", "nosniff");
    return reply.send(result.bytes);
  }

  private runId(raw: string): string {
    if (!ResearchReportRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private jobId(raw: string): string {
    if (!ResearchReportExportJobIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private readQuery(raw: unknown) {
    const parsed = ResearchReportReadQuerySchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private exportQuery(raw: unknown) {
    const parsed = ResearchReportExportReadQuerySchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private invalid(): never {
    throw new ResearchReportError("RESEARCH_REPORT_INVALID", "Invalid Research Report request.", 400);
  }

  private async workspace(request: ReportRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // A foreign report/export URL is deliberately indistinguishable from a
      // nonexistent one. This holds for the manifest, job status and bytes.
      throw new ResearchReportError("RESEARCH_REPORT_NOT_FOUND", "Research report was not found.", 404);
    }
    return workspaceId;
  }

  private assertActionSecurity(request: ReportRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchReportError("RESEARCH_REPORT_FORBIDDEN", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie)
      || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchReportError("RESEARCH_REPORT_FORBIDDEN", "CSRF token is invalid.", 403);
    }
  }
}
