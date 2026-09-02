import {
  Controller,
  Get,
  HttpException,
  Inject,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { pipeline } from "node:stream/promises";
import { constants } from "node:http2";
import { EventEmitter } from "node:events";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthService } from "../auth/auth.service";
import { AuthSession, PortalUser } from "../domain";
import { ControlApiConfig } from "../config";
import { SessionGuard } from "../facade/session.guard";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ExecutionProfileRealtimeService,
  LocalRealtimeEnvelope,
  LocalRealtimeError,
} from "./profile-realtime.service";
import { ProjectionEnvironment } from "./profile-projection.repository";
import {
  ExecutionRealtimeProxy,
  RealtimeProxyError,
} from "./realtime.proxy";

interface RealtimeRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ExecutionRealtimeController {
  constructor(
    @Inject(ExecutionRealtimeProxy) private readonly proxy: ExecutionRealtimeProxy,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ExecutionProfileRealtimeService) private readonly localRealtime: ExecutionProfileRealtimeService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/profiles/:environment/realtime-snapshot")
  async profileSnapshot(
    @Req() request: RealtimeRequest,
    @Param("environment") rawEnvironment: string,
  ) {
    const { environment, profileId, workspaceId } = localScope(this.config, rawEnvironment);
    try {
      return await this.localRealtime.snapshot(workspaceId, environment, profileId);
    } catch (error) {
      throw localHttpError(error);
    }
  }

  @Get("/profiles/:environment/stream")
  async profileStream(
    @Req() request: RealtimeRequest,
    @Res() reply: FastifyReply,
    @Param("environment") rawEnvironment: string,
    @Query("cursor") rawCursor?: unknown,
  ): Promise<void> {
    try {
      const { environment, profileId, workspaceId } = localScope(this.config, rawEnvironment);
      const cursor = singleHeader(request.headers["last-event-id"]) ?? singleValue(rawCursor);
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      });
      let closed = false;
      let unsubscribe: () => void = () => undefined;
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(leaseMonitor);
        unsubscribe();
        reply.raw.removeListener("close", close);
      };
      const send = (event: LocalRealtimeEnvelope): boolean => {
        if (closed) return false;
        const accepted = reply.raw.write(sse(event));
        if (event.terminal) {
          reply.raw.end();
          close();
          return false;
        }
        if (!accepted) {
          reply.raw.write(sse({
            ...event,
            event_type: "projection.gap",
            terminal: true,
            reconnect_required: true,
            payload: { reason_code: "N31_DOWNSTREAM_BACKPRESSURE" },
          }));
          reply.raw.end();
          close();
        }
        return accepted;
      };
      const heartbeat = setInterval(() => send(
        this.localRealtime.heartbeat(workspaceId, environment, profileId),
      ), 15_000);
      heartbeat.unref();
      const leaseMonitor = setInterval(() => {
        void this.auth.sessions.isActiveLease(
          request.portalSession.sessionId,
          request.portalSession.userId,
          request.portalSession.sessionVersion,
          new Date(),
        ).then((active) => {
          if (active || closed) return;
          send(this.localRealtime.authExpired(workspaceId, environment, profileId));
        }).catch(() => {
          reply.raw.end();
          close();
        });
      }, 5_000);
      leaseMonitor.unref();
      reply.raw.once("close", close);
      unsubscribe = await this.localRealtime.subscribe(
        workspaceId, environment, profileId, cursor, send,
      );
      if (closed) unsubscribe();
    } catch (error) {
      if (!reply.raw.headersSent) void reply.status(localStatus(error)).send(localErrorBody(error));
      else reply.raw.end();
    }
  }

  @Get("/command-center/stream")
  async commandCenter(
    @Req() request: RealtimeRequest,
    @Res() reply: FastifyReply,
    @Query("cursor") rawSnapshotCursor?: unknown,
  ): Promise<void> {
    try {
      const snapshotCursor = singleValue(rawSnapshotCursor);
      const upstream = await this.proxy.open({
        user: request.portalUser,
        session: request.portalSession,
        workspaceId: request.portalWorkspaceId,
        lastEventId: singleHeader(request.headers["last-event-id"]),
        snapshotCursor,
      });
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": upstream.contentType,
        "cache-control": "no-cache, no-store",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      });
      bindRealtimeLifecycle(
        reply.raw,
        upstream.stream,
        () => this.auth.sessions.isActiveLease(
          request.portalSession.sessionId,
          request.portalSession.userId,
          request.portalSession.sessionVersion,
          new Date(),
        ),
      );
      await pipeline(upstream.stream, reply.raw).catch(() => undefined);
    } catch (error) {
      if (error instanceof RealtimeProxyError) {
        void reply.status(error.status).send({
          error: { code: error.code, message: "Execution realtime stream is unavailable." },
        });
        return;
      }
      void reply.status(502).send({
        error: { code: "REALTIME_UPSTREAM_UNAVAILABLE", message: "Execution realtime stream is unavailable." },
      });
    }
  }

  @Get("/command-center/realtime-snapshot")
  async commandCenterSnapshot(@Req() request: RealtimeRequest) {
    try {
      return await this.proxy.snapshot({
        user: request.portalUser,
        session: request.portalSession,
        workspaceId: request.portalWorkspaceId,
      });
    } catch (error) {
      if (error instanceof RealtimeProxyError) {
        throw new HttpException({
          error: { code: error.code, message: "Execution realtime snapshot is unavailable." },
        }, error.status);
      }
      throw new HttpException({
        error: {
          code: "REALTIME_SNAPSHOT_UNAVAILABLE",
          message: "Execution realtime snapshot is unavailable.",
        },
      }, 502);
    }
  }
}

/** Owns the downstream response, upstream stream and lease-monitor lifecycle. */
export function bindRealtimeLifecycle(
  response: EventEmitter & { write?(chunk: string): boolean; end?(): void },
  upstream: EventEmitter & { close(code?: number): void },
  activeLease: () => Promise<boolean>,
  monitorIntervalMs = 5_000,
): () => void {
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(sessionMonitor);
    response.removeListener("close", cancelUpstream);
    upstream.removeListener("close", stop);
    upstream.removeListener("aborted", stop);
  };
  const cancelUpstream = () => {
    upstream.close(constants.NGHTTP2_CANCEL);
    stop();
  };
  const expireDownstream = () => {
    if (stopped) return;
    response.write?.(
      `event: auth.expired\ndata: ${JSON.stringify({
        event_type: "auth.expired",
        schema_version: "execution.realtime.v1",
        terminal: true,
        reconnect_required: false,
      })}\n\n`,
    );
    upstream.close(constants.NGHTTP2_CANCEL);
    response.end?.();
    stop();
  };
  const sessionMonitor = setInterval(() => {
    void activeLease()
      .then((active) => {
        if (!active) expireDownstream();
      })
      .catch(expireDownstream);
  }, monitorIntervalMs);
  sessionMonitor.unref();
  response.once("close", cancelUpstream);
  upstream.once("close", stop);
  upstream.once("aborted", stop);
  return stop;
}

function singleHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) throw new RealtimeProxyError("REALTIME_CURSOR_AMBIGUOUS", 400);
  return value;
}

function singleValue(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    throw new RealtimeProxyError("REALTIME_CURSOR_AMBIGUOUS", 400);
  }
  return value;
}

function localScope(
  config: ControlApiConfig,
  rawEnvironment: string,
): { environment: ProjectionEnvironment; profileId: string; workspaceId: string } {
  if (!(["paper", "sandbox", "live"] as const).includes(rawEnvironment as ProjectionEnvironment)) {
    throw new LocalRealtimeError("N31_PROFILE_ENVIRONMENT_INVALID", 404);
  }
  const environment = rawEnvironment as ProjectionEnvironment;
  const profileId = environment === "paper" ? config.EXECUTION_EDGE_PAPER_PROFILE_ID
    : environment === "sandbox" ? config.EXECUTION_EDGE_SANDBOX_PROFILE_ID
      : config.EXECUTION_EDGE_LIVE_PROFILE_ID;
  if (!profileId) throw new LocalRealtimeError("N31_PROFILE_NOT_CONFIGURED", 503);
  const workspaceId = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
  if (!workspaceId) throw new LocalRealtimeError("N31_PROJECTION_WORKSPACE_NOT_CONFIGURED", 503);
  return { environment, profileId, workspaceId };
}

function sse(event: LocalRealtimeEnvelope): string {
  const id = event.cursor ? `id: ${event.cursor}\n` : "";
  return `${id}event: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function localStatus(error: unknown): number {
  return error instanceof LocalRealtimeError ? error.status : 500;
}

function localErrorBody(error: unknown) {
  return {
    error: {
      code: error instanceof LocalRealtimeError ? error.code : "N31_LOCAL_REALTIME_FAILED",
      message: "Local execution realtime is unavailable.",
    },
  };
}

function localHttpError(error: unknown): HttpException {
  return new HttpException(localErrorBody(error), localStatus(error));
}
