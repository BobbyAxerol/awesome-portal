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
  Optional,
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
import { ExecutionProfileProjectionRepository, ProjectionEnvironment } from "./profile-projection.repository";
import {
  ExecutionRealtimeProxy,
  RealtimeProxyError,
} from "./realtime.proxy";
import { ExecutionCurrentSourceProxy } from "./current-source.proxy";
import { ExecutionLocalReadAuthority } from "./local-read-authority";
import { retainedReview, localProfileReadable } from "./retained-read-profile";
import { ExecutionReadScopes, ExecutionReadScopeError, type AuthorizedExecutionReadScope } from "../execution-v2/read-scope";
import { technicalDiagnosticsSchema } from "../execution-v2/technical-read.contract";
import { NativeManagerReadConsumer } from "../execution-v2/native-manager-consumer";
import { ScopedReplayError } from "../execution-v2/scoped-replay-cursor";
import { MaximumDataOperationError } from "./maximum-data-operation.service";

interface RealtimeRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
  portalViewerWorkspaceId?: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class ExecutionRealtimeController {
  constructor(
    @Inject(ExecutionRealtimeProxy) private readonly proxy: ExecutionRealtimeProxy,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(ExecutionProfileRealtimeService) private readonly localRealtime: ExecutionProfileRealtimeService,
    @Inject(ExecutionCurrentSourceProxy) private readonly currentSource: ExecutionCurrentSourceProxy,
    @Inject(ExecutionProfileProjectionRepository) private readonly projectionRepository: ExecutionProfileProjectionRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ExecutionLocalReadAuthority) private readonly readAuthority: ExecutionLocalReadAuthority,
    @Optional() @Inject(ExecutionReadScopes) private readonly scopes?: ExecutionReadScopes,
    @Optional() @Inject(NativeManagerReadConsumer) private readonly nativeManager?: NativeManagerReadConsumer,
  ) {}

  private async legacyStream(request: RealtimeRequest, workspaceId=request.portalWorkspaceId) {
    if (this.scopes) await this.scopes.assertLegacyStream({user:request.portalUser,session:request.portalSession,
      workspaceId,viewerWorkspaceId:request.portalWorkspaceId});
  }

  private nativeProfileAvailable(environment: ProjectionEnvironment): void {
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION !== "true")
      throw new LocalRealtimeError("EXECUTION_LOCAL_READ_DISABLED", 404);
    if (!localProfileReadable(this.config, environment))
      throw new LocalRealtimeError("EXECUTION_PROFILE_READ_DISABLED", 404);
  }

  /**
   * BE-R2-5 restricted operational telemetry.  This is deliberately an
   * ADMIN-only Portal endpoint rather than a browser data contract: it reports
   * bounded local fan-out/source-admission health without leaking a Manager
   * selector, source cursor, request path, profile input, credential or row.
   */
  @Get("/realtime/diagnostics")
  async realtimeDiagnostics(@Req() request: RealtimeRequest) {
    const workspaceId = this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID ?? request.portalWorkspaceId;
    const principal = { user: request.portalUser, session: request.portalSession, workspaceId,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId };
    if (this.scopes && await this.scopes.selectionMode(principal) === "SCOPED_V2") {
      // Technical permission is independent of the legacy ADMIN role and
      // business read-all. Every configured profile authorizes independently.
      const bindings = diagnosticProfiles(this.config).filter(({ environment }) => this.readAuthority.profileEnabled(environment));
      if (!bindings.length) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
      const scopes: AuthorizedExecutionReadScope[] = [];
      for (const binding of bindings) scopes.push(await this.scopes.authorizeTechnicalProfile(principal, binding));
      const read = async () => {
        const profiles = [];
        for (const scope of scopes) {
          const metadata = await this.projectionRepository.snapshotMetadata(workspaceId, scope.environment, scope.profileId);
          const health = await this.projectionRepository.refreshHealth(workspaceId, scope.environment, scope.profileId);
          profiles.push({ environment: scope.environment, profile_id: scope.profileId, component: "LOCAL_PROJECTION",
            state: health.state, health: metadata ? "OBSERVED" : "NOT_PUBLISHED",
            lag_ms: metadata ? Math.max(0, Date.now() - metadata.lastSuccessfulRefreshAt.valueOf()) : null,
            last_error_code: health.reasonCode });
        }
        const parsed = technicalDiagnosticsSchema.safeParse({ schema_version: "portal.execution.technical-diagnostics.v1", read_scope: "TECHNICAL_AUTHORIZED", profiles });
        if (!parsed.success) throw new ExecutionReadScopeError("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
        return parsed.data;
      };
      const fenced = (index: number): Promise<Awaited<ReturnType<typeof read>>> => index === scopes.length
        ? read() : this.scopes!.deliver(scopes[index], () => fenced(index + 1));
      return fenced(0);
    }
    if (request.portalUser.role !== "ADMIN") {
      throw new LocalRealtimeError("N31_REALTIME_DIAGNOSTICS_FORBIDDEN", 403);
    }
    const readAt = new Date();
    if (this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true") {
      await this.readAuthority.authorize(request);
    }
    const profiles = workspaceId && this.config.FEATURE_EXECUTION_LOCAL_PROJECTION === "true"
      ? await Promise.all(diagnosticProfiles(this.config).filter(({ environment }) => this.readAuthority.profileEnabled(environment)).map(async ({ environment, profileId }) => {
        const [snapshot, health] = await Promise.all([
          this.projectionRepository.snapshot(workspaceId, environment, profileId),
          this.projectionRepository.refreshHealth(workspaceId, environment, profileId),
        ]);
        const ageMs = snapshot
          ? Math.max(0, readAt.valueOf() - snapshot.lastSuccessfulRefreshAt.valueOf())
          : null;
        const freshness = health.state === "RECOVERING" ? "STALE"
          : ageMs === null ? "UNKNOWN"
            : ageMs <= this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS * 2 ? "FRESH"
              : ageMs <= this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS * 4 ? "AGING" : "STALE";
        const alert = !snapshot ? "N31_PROJECTION_NOT_READY"
          : ageMs !== null && ageMs > this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS
            ? "N31_PROJECTION_STALE_CEILING_EXCEEDED"
            : health.state === "RECOVERING" ? "N31_PROFILE_REFRESH_RECOVERING" : null;
        return {
          environment,
          snapshot_present: snapshot !== null,
          freshness,
          availability: health.state === "RECOVERING" ? "DEGRADED" : snapshot ? "AVAILABLE" : "UNKNOWN",
          last_successful_refresh_at: snapshot?.lastSuccessfulRefreshAt.toISOString() ?? null,
          stale_age_ms: ageMs,
          recovery: {
            state: health.state,
            reason_code: health.reasonCode,
            retry_not_before: health.retryNotBefore?.toISOString() ?? null,
            consecutive_failures: health.consecutiveFailures,
          },
          alert_code: alert,
        };
      }))
      : [];
    const result = {
      schema_version: "portal.execution.realtime-diagnostics.v1",
      authority: "PORTAL_CONTROL_API",
      read_at: readAt.toISOString(),
      thresholds: {
        local_projection_poll_ms: this.config.EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS,
        stale_ceiling_ms: this.config.EXECUTION_LOCAL_PROJECTION_STALE_CEILING_MS,
        source_maximum_queue: this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_QUEUE,
        source_maximum_pace_wait_ms: this.config.EXECUTION_EDGE_CURRENT_SOURCE_MAXIMUM_PACE_WAIT_MS,
      },
      profiles,
      local_realtime: this.localRealtime.diagnostics(),
      source_admission: await this.currentSource.diagnostics(),
      browser_to_edge_or_source: "FORBIDDEN",
    };
    if (this.scopes && await this.scopes.selectionMode(principal) !== "LEGACY_COMPATIBILITY")
      throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    return result;
  }

  @Get("/profiles/:environment/realtime-snapshot")
  async profileSnapshot(
    @Req() request: RealtimeRequest,
    @Param("environment") rawEnvironment: string,
    @Res({ passthrough: true }) reply?: FastifyReply,
  ) {
    const { environment, profileId, workspaceId } = localScope(this.config, rawEnvironment);
    if (this.nativeManager && !retainedReview(this.config)) {
      if (!reply) throw new LocalRealtimeError("N31_NATIVE_REPLY_REQUIRED", 503);
      try {
        this.nativeProfileAvailable(environment);
        if (await this.nativeManager.serveProfileSnapshot({user:request.portalUser,session:request.portalSession,
          workspaceId,viewerWorkspaceId:request.portalViewerWorkspaceId??request.portalWorkspaceId},
          environment,profileId,this.localRealtime,reply)) return;
      } catch (error) { throw localHttpError(error); }
    }
    await this.readAuthority.authorize(request, environment);
    if (retainedReview(this.config)) {
      // No resumable cursor exists in this profile. A 204 is intentional
      // absence, not a successful heartbeat or an upstream error. Older
      // consumers stop here; the typed review context tells newer consumers
      // not to start the realtime bootstrap at all.
      reply?.code(204).header("Cache-Control", "private, no-store")
        .header("X-Portal-Realtime-State", "UDB_RETAINED_STREAM_DISABLED");
      return;
    }
    try {
      await this.legacyStream(request, workspaceId);
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
    if (retainedReview(this.config)) throw new HttpException({code:"UDB_RETAINED_STREAM_DISABLED",message:"Streaming is disabled in retained review."},404);
    let cleanup = () => undefined as void;
    try {
      const { environment, profileId, workspaceId } = localScope(this.config, rawEnvironment);
      const cursor = singleHeader(request.headers["last-event-id"]) ?? singleValue(rawCursor);
      if (this.nativeManager) this.nativeProfileAvailable(environment);
      if (this.nativeManager && await this.nativeManager.serveProfileStream(
        {user:request.portalUser,session:request.portalSession,workspaceId,
          viewerWorkspaceId:request.portalViewerWorkspaceId??request.portalWorkspaceId},
        environment,profileId,cursor,reply)) {
        try { this.localRealtime.startNativePolling(); }
        catch { reply.raw.destroy(); }
        return;
      }
      await this.readAuthority.authorize(request, environment);
      await this.legacyStream(request, workspaceId);
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
      cleanup = close;
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
        ).then(async (active) => {
          if (!active || !await this.readAuthority.remainsAuthorized(request, environment)) return false;
          await this.legacyStream(request, workspaceId);
          return true;
        }).then((active) => {
          if (active || closed) return;
          send(this.localRealtime.authExpired(workspaceId, environment, profileId));
        }).catch(() => {
          reply.raw.end();
          close();
        });
      }, 5_000);
      leaseMonitor.unref();
      reply.raw.once("close", close);
      try {
        unsubscribe = await this.localRealtime.subscribe(
          workspaceId, environment, profileId, cursor, send,
        );
      } catch {
        send({ ...this.localRealtime.heartbeat(workspaceId, environment, profileId),
          event_type: "projection.gap", terminal: true, reconnect_required: true,
          payload: { reason_code: "N31_LOCAL_READ_FAILED" } });
        close();
      }
      if (closed) unsubscribe();
    } catch (error) {
      cleanup();
      if (reply.raw.destroyed || reply.raw.writableEnded) return;
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
    if (retainedReview(this.config)) throw new HttpException({code:"UDB_RETAINED_STREAM_DISABLED",message:"Streaming is disabled in retained review."},404);
    try {
      await this.legacyStream(request);
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
        async () => {
          await this.legacyStream(request);
          return this.auth.sessions.isActiveLease(
          request.portalSession.sessionId,
          request.portalSession.userId,
          request.portalSession.sessionVersion,
          new Date(),
          );
        },
      );
      await pipeline(upstream.stream, reply.raw).catch(() => undefined);
    } catch (error) {
      if (error instanceof RealtimeProxyError || error instanceof ExecutionReadScopeError) {
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
  async commandCenterSnapshot(@Req() request: RealtimeRequest, @Res({passthrough:true}) reply?: FastifyReply) {
    if (retainedReview(this.config)) {
      reply?.code(204).header("Cache-Control","private, no-store").header("X-Portal-Realtime-State","UDB_RETAINED_STREAM_DISABLED");
      return;
    }
    try {
      await this.legacyStream(request);
      return await this.proxy.snapshot({
        user: request.portalUser,
        session: request.portalSession,
        workspaceId: request.portalWorkspaceId,
      });
    } catch (error) {
      if (error instanceof RealtimeProxyError || error instanceof ExecutionReadScopeError) {
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

function diagnosticProfiles(config: ControlApiConfig): Array<{
  environment: ProjectionEnvironment;
  profileId: string;
}> {
  const configured = [
    { environment: "paper" as const, profileId: config.EXECUTION_EDGE_PAPER_PROFILE_ID },
    { environment: "sandbox" as const, profileId: config.EXECUTION_EDGE_SANDBOX_PROFILE_ID },
    { environment: "live" as const, profileId: config.EXECUTION_EDGE_LIVE_PROFILE_ID },
  ];
  return configured.filter((entry): entry is { environment: ProjectionEnvironment; profileId: string } =>
    typeof entry.profileId === "string" && entry.profileId.length > 0,
  );
}

function sse(event: LocalRealtimeEnvelope): string {
  const id = event.cursor ? `id: ${event.cursor}\n` : "";
  return `${id}event: ${event.event_type}\ndata: ${JSON.stringify(event)}\n\n`;
}

function localStatus(error: unknown): number {
  if (error instanceof ScopedReplayError) return error.code === "RECONNECT_LIMIT" ? 429 :
    ["SOURCE_UNAVAILABLE", "STOPPED"].includes(error.code) ? 503 : 409;
  return error instanceof HttpException ? error.getStatus() :
    error instanceof LocalRealtimeError || error instanceof ExecutionReadScopeError ||
      error instanceof MaximumDataOperationError ? error.status : 500;
}

function localErrorBody(error: unknown) {
  if (error instanceof HttpException) return error.getResponse();
  return {
    error: {
      code: error instanceof LocalRealtimeError || error instanceof ExecutionReadScopeError ||
        error instanceof MaximumDataOperationError || error instanceof ScopedReplayError ? error.code : "N31_LOCAL_REALTIME_FAILED",
      message: "Local execution realtime is unavailable.",
    },
  };
}

function localHttpError(error: unknown): Error {
  if (error instanceof LocalRealtimeError || error instanceof ExecutionReadScopeError ||
    error instanceof MaximumDataOperationError) return error;
  return new HttpException(localErrorBody(error), localStatus(error));
}
