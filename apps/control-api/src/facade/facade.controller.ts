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
import { Readable } from "node:stream";
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
      throw new FacadeError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
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

  @Get("/api/runs/:run_id/events")
  async runEvents(
    @Req() request: PortalRequest,
    @Res() reply: FastifyReply,
    @Param("run_id") runId: string,
  ): Promise<void | FastifyReply> {
    if (!this.proxyService.enabled()) {
      throw new FacadeError(
        "FAÇADE_PROXY_DISABLED",
        "The Control API façade proxy is disabled; use the legacy gateway path.",
        404,
      );
    }

    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? newUlid("req");
    const traceparent =
      (request.headers["traceparent"] as string | undefined) ??
      "00-00000000000000000000000000000000-0000000000000000-01";
    const abort = new AbortController();
    let downstreamClosed = false;
    const close = () => {
      downstreamClosed = true;
      abort.abort();
    };
    reply.raw.once("close", close);
    const timeout = setTimeout(
      () => abort.abort(),
      this.config.PORTAL_SSE_CONNECT_TIMEOUT_MS,
    );

    let upstream: Response;
    try {
      upstream = await this.proxyService.openPortalRunEvents(
        {
          method: "GET",
          path: `/api/runs/${runId}/events`,
          query: undefined,
          body: undefined,
          contentType: undefined,
          requestId,
          traceparent,
          user: request.portalUser,
          workspaceId: request.portalWorkspaceId,
          idempotencyKey: undefined,
        },
        abort.signal,
      );
    } catch {
      clearTimeout(timeout);
      reply.raw.off("close", close);
      if (downstreamClosed) return;
      if (abort.signal.aborted) {
        throw new FacadeError(
          "SSE_UPSTREAM_TIMEOUT",
          "The run event stream did not respond in time.",
          504,
        );
      }
      throw new FacadeError(
        "SSE_UPSTREAM_UNAVAILABLE",
        "The run event stream is unavailable.",
        502,
      );
    }
    clearTimeout(timeout);

    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().startsWith("text/event-stream")) {
      reply.raw.off("close", close);
      abort.abort();
      throw new FacadeError(
        "SSE_UPSTREAM_INVALID_RESPONSE",
        "The run event upstream did not return an event stream.",
        502,
      );
    }

    reply.status(upstream.status);
    reply.header("content-type", contentType);
    reply.header("cache-control", upstream.headers.get("cache-control") ?? "no-cache");
    reply.header("x-accel-buffering", "no");
    reply.header("x-request-id", requestId);
    if (upstream.body === null) {
      reply.raw.off("close", close);
      abort.abort();
      return reply.send();
    }

    const stream = Readable.fromWeb(
      upstream.body as import("node:stream/web").ReadableStream,
    );
    const cleanup = () => {
      reply.raw.off("close", close);
      abort.abort();
    };
    stream.once("end", cleanup);
    stream.once("error", cleanup);
    return reply.send(stream);
  }

  @All([
    "/api/runs",
    "/api/runs/*",
    "/api/strategies",
    "/api/strategies/*",
    "/api/datasets",
    "/api/config/options",
    "/api/v1/portal/*",
    "/api/v1/alphas",
    "/api/v1/alphas/*",
    "/api/health",
    "/api/ready",
  ])
  async portal(
    @Req() request: PortalRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
    @Body() body: unknown,
  ) {
    if (!this.proxyService.enabled()) {
      throw new FacadeError(
        "FAÇADE_PROXY_DISABLED",
        "The Control API façade proxy is disabled; use the legacy gateway path.",
        404,
      );
    }
    const path = request.originalUrl.split("?")[0] ?? request.url.split("?")[0];
    const query = (request.url.split("?")[1] as string | undefined) ?? undefined;
    const method = request.method.toUpperCase();
    const user = request.portalUser;

    const write = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    // Mutations (creating runs, importing alphas, editing config) are
    // ADMIN-only. Every authenticated session — including cross-user — may
    // READ runs and catalogs through the proxy; workspace read models remain
    // available as a convenience but are no longer the only read path.
    if (write && user.role !== "ADMIN") {
      throw new FacadeError("PERMISSION_DENIED", "Access denied.", 403);
    }
    const requestId =
      (request.headers["x-request-id"] as string | undefined) ?? newUlid("req");
    const traceparent =
      (request.headers["traceparent"] as string | undefined) ??
      "00-00000000000000000000000000000000-0000000000000000-01";
    const contentType =
      (request.headers["content-type"] as string | undefined) ?? undefined;

    if (write) {
      const bodyText: string | Buffer | undefined =
        body === undefined || body === null
          ? undefined
          : Buffer.isBuffer(body)
            ? body // keep raw multipart bytes; utf8 coercion corrupts binaries
            : typeof body === "string"
              ? body
              : JSON.stringify(body);
      const result = await this.proxyService.handleWrite({
        method,
        path,
        query,
        body: bodyText,
        contentType,
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
      contentType,
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
