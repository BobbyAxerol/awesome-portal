import { Controller, Get, HttpException, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionSubjectActivityService,
  SubjectActivityError,
  type SubjectActivityKind,
  type SubjectActivityRelation,
} from "./subject-activity.service";

const SubjectIdSchema = z.string().regex(/^[A-Za-z0-9._:@-]{1,191}$/);
const PageQuery = z.object({
  environment: z.enum(["paper", "sandbox", "live"]),
  limit: z.coerce.number().int().min(1).max(500).default(200),
  after: z.string().min(1).max(4096).optional(),
  workspace_id: z.string().trim().min(1).max(96).optional(),
}).strict();

interface SubjectActivityHttpRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalSession: AuthSession;
  portalWorkspaceId: string;
}

/** Exact subject operations: no browser-selectable Manager relation or cursor. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/resources")
export class ExecutionSubjectActivityController {
  constructor(
    @Inject(ExecutionSubjectActivityService) private readonly activity: ExecutionSubjectActivityService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/alphas/:alphaId/:relation")
  alpha(
    @Req() request: SubjectActivityHttpRequest,
    @Param("alphaId") alphaId: string,
    @Param("relation") relation: string,
    @Query() rawQuery: unknown,
  ) {
    return this.read(request, "alpha", alphaId, relation, rawQuery);
  }

  @Get("/accounts/:accountId/:relation")
  account(
    @Req() request: SubjectActivityHttpRequest,
    @Param("accountId") accountId: string,
    @Param("relation") relation: string,
    @Query() rawQuery: unknown,
  ) {
    return this.read(request, "account", accountId, relation, rawQuery);
  }

  private async read(
    request: SubjectActivityHttpRequest,
    kind: SubjectActivityKind,
    rawSubjectId: string,
    rawRelation: string,
    rawQuery: unknown,
  ) {
    const subjectId = SubjectIdSchema.safeParse(rawSubjectId);
    const relation = rawRelation === "orders" || rawRelation === "fills" ? rawRelation as SubjectActivityRelation : null;
    const query = PageQuery.safeParse(rawQuery);
    if (!subjectId.success || !relation || !query.success) {
      throw new HttpException({ error: { code: "EDS12_SUBJECT_ACTIVITY_QUERY_INVALID" } }, 400);
    }
    const workspaceId = query.data.workspace_id ?? this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ?? request.portalWorkspaceId;
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ||
      !(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new HttpException({ error: { code: "WORKSPACE_NOT_FOUND" } }, 404);
    }
    try {
      return await this.activity.read(
        { workspaceId, userId: request.portalUser.userId },
        {
          environment: query.data.environment,
          subjectKind: kind,
          subjectId: subjectId.data,
          relation,
          limit: query.data.limit,
          after: query.data.after ?? null,
        },
      );
    } catch (error) {
      if (error instanceof SubjectActivityError) {
        throw new HttpException({ error: { code: error.code } }, error.status);
      }
      throw error;
    }
  }
}
