import { Inject, Injectable } from "@nestjs/common";
import { LocalRealtimeError } from "./profile-realtime.service";
import { ControlApiConfig } from "../config";
import { AuthSession, PortalUser } from "../domain";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ProjectionEnvironment } from "./profile-projection.repository";

export interface ExecutionReadRequest {
  portalUser: PortalUser;
  portalSession: AuthSession;
  portalWorkspaceId: string;
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
      !await this.workspaces.isMember(workspaceId, request.portalUser.userId)) {
      throw new LocalRealtimeError("WORKSPACE_NOT_FOUND", 404);
    }
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true") {
      throw new LocalRealtimeError("EXECUTION_LOCAL_READ_DISABLED", 404);
    }
    if (environment !== undefined && !this.profileEnabled(environment)) {
      throw new LocalRealtimeError("EXECUTION_PROFILE_READ_DISABLED", 404);
    }
    return { user: request.portalUser, session: request.portalSession, workspaceId };
  }

  profileEnabled(environment: ProjectionEnvironment): boolean {
    return environment === "paper" ? this.config.FEATURE_EXECUTION_CURRENT_SOURCE_PAPER === "true"
      : environment === "sandbox" ? this.config.FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX === "true"
        : this.config.FEATURE_EXECUTION_CURRENT_SOURCE_LIVE === "true";
  }

  async remainsAuthorized(request: ExecutionReadRequest, environment: ProjectionEnvironment): Promise<boolean> {
    try { await this.authorize(request, environment); return true; }
    catch { return false; }
  }
}
