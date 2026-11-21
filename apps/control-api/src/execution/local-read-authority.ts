import { Inject, Injectable } from "@nestjs/common";
import { LocalRealtimeError } from "./profile-realtime.service";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ProjectionEnvironment } from "./profile-projection.repository";
import { localProfileReadable } from "./retained-read-profile";

export interface ExecutionReadRequest {
  portalUser: PortalUser;
  portalSession: AuthSession;
  portalWorkspaceId: string;
  portalViewerWorkspaceId?: string;
}

/** Authorizes the accepted mirror, never relabels it as a personal workspace. */
@Injectable()
export class ExecutionLocalReadAuthority {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  async authorize(request: ExecutionReadRequest, environment?: ProjectionEnvironment, requestedWorkspace?: string) {
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if (!workspaceId || (requestedWorkspace !== undefined && requestedWorkspace !== workspaceId) ||
      !await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId, environment)) {
      throw new LocalRealtimeError("WORKSPACE_NOT_FOUND", 404);
    }
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      throw new LocalRealtimeError("EXECUTION_LOCAL_READ_DISABLED", 404);
    }
    if (environment !== undefined && !this.profileEnabled(environment)) {
      throw new LocalRealtimeError("EXECUTION_PROFILE_READ_DISABLED", 404);
    }
    return { user: request.portalUser, session: request.portalSession, workspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
  }

  profileEnabled(environment: ProjectionEnvironment): boolean {
    return localProfileReadable(this.config, environment);
  }

  async remainsAuthorized(request: ExecutionReadRequest, environment: ProjectionEnvironment): Promise<boolean> {
    try { await this.authorize(request, environment); return true; }
    catch { return false; }
  }
}
