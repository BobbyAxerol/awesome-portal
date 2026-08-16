import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { sessionTokenFrom } from "../auth/cookies";
import { PortalUser } from "../domain";
import { WorkspacesRepository } from "../repos/workspaces";

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
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = sessionTokenFrom(request);
    if (!token) {
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ.");
    }
    const session = await this.auth.sessionFromToken(token);
    if (!session || session.state !== "ACTIVE") {
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ.");
    }
    const user = await this.auth.users.findById(session.userId);
    if (!user || user.status !== "ACTIVE" || user.mustChangePassword) {
      throw new UnauthorizedException("Phiên đăng nhập không hợp lệ.");
    }
    const workspaceId = await this.workspaces.ensurePersonal(user.userId, user.username);
    const state = request as unknown as {
      portalUser: PortalUser;
      portalWorkspaceId: string;
    };
    state.portalUser = user;
    state.portalWorkspaceId = workspaceId;
    return true;
  }
}
