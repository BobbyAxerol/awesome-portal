import {
  All,
  Body,
  Controller,
  Inject,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import { CONTROL_API_CONFIG } from "../tokens";
import { FacadeError, PortalProxyService } from "./proxy.service";
import { SessionGuard } from "./session.guard";

interface PlanningRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: { csrfSecretHash: string };
}

const USER_TASK_WRITES = [
  { method: "POST", path: /^\/roadmap-task-board\/api\/v1\/tasks$/ },
  { method: "PATCH", path: /^\/roadmap-task-board\/api\/v1\/tasks\/[^/]+$/ },
  { method: "POST", path: /^\/roadmap-task-board\/api\/v1\/tasks\/[^/]+\/(?:move|transition)$/ },
] as const;

function userMayWriteTask(method: string, path: string): boolean {
  return USER_TASK_WRITES.some((entry) => entry.method === method && entry.path.test(path));
}

@UseGuards(SessionGuard)
@Controller()
export class PlanningFacadeController {
  constructor(
    @Inject(PortalProxyService) private readonly proxyService: PortalProxyService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @All(["/roadmap-task-board/api", "/roadmap-task-board/api/*"])
  async planning(
    @Req() request: PlanningRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    if (!this.proxyService.planningEnabled()) {
      throw new FacadeError(
        "PLANNING_PROXY_DISABLED",
        "The Planning API façade proxy is disabled.",
        404,
      );
    }

    const path = request.originalUrl.split("?")[0] ?? request.url.split("?")[0];
    const query = (request.url.split("?")[1] as string | undefined) ?? undefined;
    const method = request.method.toUpperCase();
    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(method);

    if (write) {
      if (
        request.portalUser.role !== "ADMIN" &&
        !userMayWriteTask(method, path)
      ) {
        throw new FacadeError("PERMISSION_DENIED", "Access denied.", 403);
      }
      if (!originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
        throw new FacadeError("ORIGIN_DENIED", "Origin not allowed.", 403);
      }
      const csrf = request.headers[CSRF_HEADER] as string | undefined;
      if (!csrf) {
        throw new FacadeError("CSRF_REQUIRED", "CSRF token is missing.", 403);
      }
      if (!constantTimeEqual(sha256(csrf), request.portalSession.csrfSecretHash)) {
        throw new FacadeError("CSRF_INVALID", "CSRF token is invalid.", 403);
      }
    }

    const contentType =
      (request.headers["content-type"] as string | undefined) ?? undefined;
    const bodyText: string | Buffer | undefined =
      !write || body === undefined || body === null
        ? undefined
        : Buffer.isBuffer(body)
          ? body
          : typeof body === "string"
            ? body
            : JSON.stringify(body);
    const result = await this.proxyService.proxyPlanning({
      method,
      path,
      query,
      body: bodyText,
      contentType,
      requestId:
        (request.headers["x-request-id"] as string | undefined) ?? newUlid("req"),
      traceparent:
        (request.headers["traceparent"] as string | undefined) ??
        "00-00000000000000000000000000000000-0000000000000000-01",
      user: request.portalUser,
      workspaceId: request.portalWorkspaceId,
      idempotencyKey: undefined,
    });
    for (const [name, value] of Object.entries(result.headers)) {
      reply.header(name, value);
    }
    void reply.status(result.status);
    if (result.headers["content-type"]?.includes("application/json")) {
      try {
        return JSON.parse(result.body.toString("utf8"));
      } catch {
        return {};
      }
    }
    return result.body;
  }
}
