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

/**
 * Enforces an ADMIN session for /api/admin routes. USER sessions get a
 * generic 403 without any data leak; missing sessions get 401.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = sessionTokenFrom(request);
    if (!token) {
      throw new UnauthorizedException("Invalid session.");
    }
    const session = await this.auth.sessionFromToken(token);
    if (!session || session.state !== "ACTIVE") {
      throw new UnauthorizedException("Invalid session.");
    }
    const user = await this.auth.users.findById(session.userId);
    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid session.");
    }
    if (user.role !== "ADMIN") {
      throw new UnauthorizedException("Access denied.");
    }
    (request as unknown as { portalUser: unknown }).portalUser = user;
    return true;
  }
}
