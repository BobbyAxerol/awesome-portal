import {
  All,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { CONTROL_API_CONFIG } from "../tokens";
import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import { RunsRepository } from "../repos/runs";
import { WorkspacesRepository } from "../repos/workspaces";
import { FacadeError, PortalProxyService } from "./proxy.service";
import { SessionGuard } from "./session.guard";

interface PortalRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

const READ_ONLY_PORTAL_PATHS = new Set([
  "/api/health",
  "/api/ready",
  "/api/strategies",
  "/api/datasets",
  "/api/v1/portal/registry",
  "/api/v1/portal/summary",
  "/api/v1/portal/links",
]);

const WRITE_PATHS_PREFIXES = ["/api/runs", "/api/v1/portal"];

function isReadOnlyAllowed(path: string): boolean {
  return (
    READ_ONLY_PORTAL_PATHS.has(path) ||
    path.startsWith("/api/strategies/") ||
    path.startsWith("/api/datasets")
  );
}

@UseGuards(SessionGuard)
@Controller()
export class FacadeController {
  constructor(
    @Inject(PortalProxyService) private readonly proxyService: PortalProxyService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(RunsRepository) private readonly runs: RunsRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/api/workspaces")
  async listWorkspaces(@Req() request: PortalRequest) {
    const workspaces = await this.workspaces.findByMembership(request.portalUser.userId);
    return {
      workspaces: workspaces.map((item) => ({
        workspace_id: item.workspaceId,
        name: item.name,
        owner_user_id: item.ownerUserId,
        created_at: item.createdAt.toISOString(),
      })),
    };
  }

  @Get("/api/workspaces/:workspace_id/runs")
  async listWorkspaceRuns(
    @Req() request: PortalRequest,
    @Param("workspace_id") workspaceId: string,
  ) {
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new FacadeError("WORKSPACE_NOT_FOUND", "Workspace không tồn tại.", 404);
    }
    const runs = await this.runs.listForWorkspace(workspaceId);
    return {
      runs: runs.map((item) => ({
        run_id: item.runId,
        workspace_id: item.workspaceId,
        owner_user_id: item.ownerUserId,
        status: item.status,
        protocol: item.protocol,
        strategy_id: item.strategyId,
        dataset_id: item.datasetId,
        updated_at: item.updatedAt.toISOString(),
      })),
    };
  }

  @All(["/api/runs", "/api/runs/*", "/api/strategies", "/api/strategies/*", "/api/datasets", "/api/v1/portal/*", "/api/health", "/api/ready"])
  async portal(
    @Req() request: PortalRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    if (!this.proxyService.enabled()) {
      throw new FacadeError(
        "FAÇADE_PROXY_DISABLED",
        "Control API façade proxy đang tắt; dùng legacy gateway path.",
        404,
      );
    }
    const path = request.originalUrl.split("?")[0] ?? request.url.split("?")[0];
    const query = (request.url.split("?")[1] as string | undefined) ?? undefined;
    const method = request.method.toUpperCase();
    const user = request.portalUser;

    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (write && user.role !== "ADMIN" && !path.startsWith("/api/runs")) {
      throw new FacadeError("PERMISSION_DENIED", "Không được phép truy cập.", 403);
    }
    if (!write && !isReadOnlyAllowed(path) && user.role !== "ADMIN") {
      throw new FacadeError(
        "PERMISSION_DENIED",
        "Đọc runs qua Control API cần quyền ADMIN; dùng workspace read model.",
        403,
      );
    }
    if (!write && path.startsWith("/api/runs/") && path.endsWith("/events")) {
      throw new FacadeError(
        "SSE_NOT_MIGRATED",
        "SSE stream chưa migrate qua façade; dùng legacy gateway path.",
        404,
      );
    }

    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? newUlid("req");
    const traceparent =
      (request.headers["traceparent"] as string | undefined) ??
      "00-00000000000000000000000000000000-0000000000000000-01";

    if (write) {
      const bodyText =
        body === undefined || body === null
          ? undefined
          : Buffer.isBuffer(body)
            ? body.toString("utf8")
            : typeof body === "string"
              ? body
              : JSON.stringify(body);
      const result = await this.proxyService.handleWrite({
        method,
        path,
        query,
        body: bodyText,
        requestId,
        traceparent,
        user,
        workspaceId: request.portalWorkspaceId,
        idempotencyKey: request.headers["x-portal-idempotency-key"] as string | undefined,
      });
      reply.header("x-portal-idempotency-key", result.idempotencyKey);
      void reply.status(result.status);
      return result.body ?? {};
    }

    const result = await this.proxyService.proxy({
      method,
      path,
      query,
      body: undefined,
      requestId,
      traceparent,
      user,
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
