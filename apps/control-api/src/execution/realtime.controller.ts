import {
  Controller,
  Get,
  Inject,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { pipeline } from "node:stream/promises";
import { constants } from "node:http2";
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
      request.raw.once("close", () => upstream.stream.close(constants.NGHTTP2_CANCEL));
      const sessionMonitor = setInterval(() => {
        void this.auth.sessions
          .isActiveLease(
            request.portalSession.sessionId,
            request.portalSession.userId,
            request.portalSession.sessionVersion,
            new Date(),
          )
          .then((active) => {
            if (!active) upstream.stream.close(constants.NGHTTP2_CANCEL);
          })
          .catch(() => upstream.stream.close(constants.NGHTTP2_CANCEL));
      }, 5_000);
      upstream.stream.once("close", () => clearInterval(sessionMonitor));
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
