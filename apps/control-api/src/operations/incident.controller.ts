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
import { GovernanceError } from "../governance/governance.service";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  IncidentAcknowledgeRequestSchema,
  IncidentAnnotateRequestSchema,
  IncidentAssignRequestSchema,
  IncidentCorrelateOperationRequestSchema,
  IncidentCreateRequestSchema,
  IncidentEvidenceRequestSchema,
  IncidentMitigateRequestSchema,
  IncidentResolveRequestSchema,
} from "./contracts";
import { IncidentService } from "./incident.service";

interface IncidentRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { sessionId: string; csrfSecretHash: string };
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/operations/incidents")
export class IncidentController {
  constructor(
    @Inject(IncidentService) private readonly incidents: IncidentService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Post()
  @HttpCode(201)
  async create(@Req() request: IncidentRequest, @Body() body: unknown) {
    this.assertMutationSecurity(request);
    const parsed = IncidentCreateRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new GovernanceError("INVALID_INCIDENT_CREATE", "Invalid incident create request.", 400);
    }
    const workspaceId = await this.workspace(request, parsed.data.workspace_id);
    return this.incidents.create(
      request.portalUser,
      { ...parsed.data, workspace_id: workspaceId },
      this.requestId(request),
    );
  }

  @Get(":incident_id")
  async detail(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Query("workspace_id") rawWorkspaceId?: unknown,
  ) {
    const workspaceId = await this.workspace(request, rawWorkspaceId);
    return this.incidents.detail(request.portalUser, workspaceId, incidentId);
  }

  @Post(":incident_id/acknowledge")
  @HttpCode(201)
  async acknowledge(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentAcknowledgeRequestSchema,
      "INVALID_INCIDENT_ACKNOWLEDGEMENT",
      (input) => this.incidents.acknowledge(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  @Post(":incident_id/assign")
  @HttpCode(201)
  async assign(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentAssignRequestSchema,
      "INVALID_INCIDENT_ASSIGNMENT",
      (input) => this.incidents.assign(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  @Post(":incident_id/annotations")
  @HttpCode(201)
  async annotate(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentAnnotateRequestSchema,
      "INVALID_INCIDENT_ANNOTATION",
      (input) => this.incidents.annotate(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  @Post(":incident_id/evidence")
  @HttpCode(201)
  async evidence(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentEvidenceRequestSchema,
      "INVALID_INCIDENT_EVIDENCE",
      (input) => this.incidents.attachEvidence(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  @Post(":incident_id/operations")
  @HttpCode(201)
  async correlateOperation(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentCorrelateOperationRequestSchema,
      "INVALID_INCIDENT_OPERATION_CORRELATION",
      (input) => this.incidents.correlateOperation(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  @Post(":incident_id/mitigate")
  @HttpCode(201)
  async mitigate(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentMitigateRequestSchema,
      "INVALID_INCIDENT_MITIGATION",
      (input) => this.incidents.mitigate(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  @Post(":incident_id/resolve")
  @HttpCode(201)
  async resolve(
    @Req() request: IncidentRequest,
    @Param("incident_id") incidentId: string,
    @Body() body: unknown,
  ) {
    return this.validatedMutation(
      request,
      incidentId,
      body,
      IncidentResolveRequestSchema,
      "INVALID_INCIDENT_RESOLUTION",
      (input) => this.incidents.resolve(request.portalUser, incidentId, input, this.requestId(request)),
    );
  }

  private async validatedMutation<T extends { workspace_id: string }>(
    request: IncidentRequest,
    _incidentId: string,
    body: unknown,
    schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } },
    code: string,
    run: (input: T) => Promise<unknown>,
  ) {
    this.assertMutationSecurity(request);
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new GovernanceError(code, "Invalid incident workflow request.", 400);
    const input = parsed.data;
    const workspaceId = await this.workspace(request, input.workspace_id);
    return run({ ...input, workspace_id: workspaceId } as T);
  }

  private async workspace(request: IncidentRequest, raw: unknown): Promise<string> {
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

  private assertMutationSecurity(request: IncidentRequest): void {
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

  private requestId(request: IncidentRequest): string {
    const header = request.headers["x-request-id"];
    return typeof header === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(header)
      ? header
      : newUlid("req");
  }
}
