import { Controller, Get, Inject, Param, Query, Req, UseGuards, Header } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import { AuthError } from "../auth/auth.service";
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
  portalViewerWorkspaceId?: string;
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
  @Header("Cache-Control","private, no-store")
  alpha(
    @Req() request: SubjectActivityHttpRequest,
    @Param("alphaId") alphaId: string,
    @Param("relation") relation: string,
    @Query() rawQuery: unknown,
  ) {
    return this.read(request, "alpha", alphaId, relation, rawQuery);
  }

  @Get("/accounts/:accountId/:relation")
  @Header("Cache-Control","private, no-store")
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
      throw new AuthError("EDS12_SUBJECT_ACTIVITY_QUERY_INVALID", "The subject activity request is not valid.", 400);
    }
    const workspaceId = query.data.workspace_id ?? this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ?? request.portalWorkspaceId;
    // Every other execution reader names the environment so a DR-30 scoped grant is judged per environment; an unnamed one needs the full grant.
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ||
      !(await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId, query.data.environment))) {
      // A typed code (the generic HttpException filter flattens every code to REQUEST_REJECTED).
      throw new AuthError("WORKSPACE_NOT_FOUND", "The execution workspace is not available to this account.", 404);
    }
    try {
      return await this.activity.readAuthorized(
        { workspaceId, user: request.portalUser,session:request.portalSession,viewerWorkspaceId:request.portalViewerWorkspaceId??request.portalWorkspaceId },
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
        throw new AuthError(error.code, error.message === error.code ? subjectActivityMessage(error.code) : error.message, error.status);
      }
      throw error;
    }
  }
}

/** Plain, public wording for the typed refusals (the code stays the contract; the sentence is for the screen). */
function subjectActivityMessage(code: string): string {
  switch (code) {
    case "EDS12_SUBJECT_ACTIVITY_NOT_ACTIVATED": return "Orders and fills are not published for this environment: its read profile is not enabled on this stack.";
    case "EDS12_SUBJECT_ACTIVITY_PROFILE_NOT_CONFIGURED": return "Orders and fills are not published for this environment: no read profile is configured.";
    case "EDS12_SUBJECT_ACTIVITY_PROJECTION_NOT_READY": return "Orders and fills are not published yet: the retained projection has no snapshot.";
    case "EDS12_SUBJECT_ACTIVITY_PROJECTION_STALE": return "Orders and fills are not published: the retained projection is stale.";
    default: return "The subject activity read is not available.";
  }
}
