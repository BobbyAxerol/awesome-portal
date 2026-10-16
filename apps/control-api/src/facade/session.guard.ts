import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  Optional,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthService, AuthError } from "../auth/auth.service";
import { sessionTokenFrom } from "../auth/cookies";
import { PortalUser } from "../domain";
import { WorkspacesRepository } from "../repos/workspaces";
import type { ControlApiConfig } from "../config";
import { retainedReview, coreExecutionRead } from "../execution/retained-read-profile";
import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { CONTROL_API_CONFIG } from "../tokens";
import {isReadStoreUnavailable} from "../db/read-unavailable";
import { CurrentHumanWorkspaceProvisioner } from "../execution-v2/current-human-workspace";

/**
 * Authenticated-session guard for façade routes. Attaches the portal user
 * and its personal workspace to the request; missing/invalid sessions get a
 * generic 401.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Optional() @Inject(CONTROL_API_CONFIG) private readonly config?: ControlApiConfig,
    @Optional() @Inject(CurrentHumanWorkspaceProvisioner)
    private readonly currentHumanWorkspace?: CurrentHumanWorkspaceProvisioner,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try { return await this.authorize(context); }
    catch(error){
      if (isReadStoreUnavailable(error))
        throw new AuthError("PORTAL_AUTHORITY_UNAVAILABLE","Portal identity authority is temporarily unavailable.",503);
      throw error;
    }
  }

  private async authorize(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    // Current actor/grant/source fences also protect negative responses.
    // Neither scoped nor legacy Execution payloads may be shared by HTTP caches.
    const executionRead = (request.url ?? "").split("?")[0].startsWith("/api/v1/execution/");
    if (executionRead) context.switchToHttp().getResponse().header("Cache-Control", "private, no-store");
    const token = sessionTokenFrom(request);
    if (!token) {
      throw new UnauthorizedException("Invalid session.");
    }
    const session = await this.auth.sessionFromToken(token);
    if (!session || session.state !== "ACTIVE") {
      throw new UnauthorizedException("Invalid session.");
    }
    const user = await this.auth.users.findById(session.userId);
    if (!user || user.status !== "ACTIVE" || user.mustChangePassword) {
      throw new UnauthorizedException("Invalid session.");
    }
    let workspaceId = this.currentHumanWorkspace
      ? await this.currentHumanWorkspace.ensure({ user_id: user.userId,
          session_id: session.sessionId, session_generation: session.sessionVersion })
      : await this.workspaces.ensurePersonal(user.userId, user.username);
    const viewerWorkspaceId = workspaceId;
    if (retainedReview(this.config) && executionRead) {
      if (request.method !== "GET" && request.method !== "HEAD") throw new ForbiddenException("UDB_RETAINED_REVIEW_MUTATION_DISABLED");
      const query = request.query as Record<string, unknown>;
      const configured = this.config!.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID!;
      if (!coreExecutionRead(request.url.split("?")[0]) && ((query.workspace_id !== undefined && query.workspace_id !== configured) ||
        !await this.workspaces.canReadExecution(configured,user.userId,typeof query.environment === "string" &&
          ["paper","sandbox","live","all","canary"].includes(query.environment) ? query.environment : undefined))) {
        throw new NotFoundException("Workspace not found.");
      }
      if (!coreExecutionRead(request.url.split("?")[0])) workspaceId = configured;
    }
    const state = request as unknown as {
      portalUser: PortalUser;
      portalWorkspaceId: string;
      portalViewerWorkspaceId: string;
      portalSession: typeof session;
    };
    state.portalUser = user;
    state.portalWorkspaceId = workspaceId;
    state.portalViewerWorkspaceId = viewerWorkspaceId;
    state.portalSession = session;
    return true;
  }
}
