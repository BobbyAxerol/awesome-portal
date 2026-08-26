import {
  Controller,
  Get,
  HttpException,
  Inject,
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
import { SessionGuard } from "../facade/session.guard";
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
  ) {}

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
  response: EventEmitter,
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
  const sessionMonitor = setInterval(() => {
    void activeLease()
      .then((active) => {
        if (!active) cancelUpstream();
      })
      .catch(cancelUpstream);
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
