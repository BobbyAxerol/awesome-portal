/** P11 same-origin progress/read/console/cancel BFF. */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";

import { AuthService } from "../auth/auth.service";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ControlApiConfig } from "../config";
import { type AuthSession, type PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { newUlid } from "../id";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  ResearchProgressCancelRequestSchema,
  ResearchProgressPageQuerySchema,
  ResearchProgressReadQuerySchema,
  ResearchProgressRunIdSchema,
} from "./progress.contract";
import { ResearchProgressError } from "./progress.error";
import { ResearchProgressService } from "./progress.service";

interface ProgressRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession & { csrfSecretHash: string };
}

type StreamEnvelope = Parameters<ResearchProgressService["subscribe"]>[2] extends (event: infer Value) => void ? Value : never;

/**
 * CG-P11-08: one `research.progress` frame may carry at most this much read.
 * A larger read is omitted with a typed reason and the client falls back to
 * one snapshot GET; the event itself is never dropped for its read's size.
 */
export const STREAM_READ_FRAME_BUDGET_BYTES = 192 * 1_024;

/**
 * The browser gets one same-origin vocabulary.  It cannot see source journal
 * roots, raw process stdout, P06 lease epochs, HMAC headers, NATS or an
 * arbitrary retry/CLI control plane.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/runs")
export class ResearchProgressController {
  constructor(
    @Inject(ResearchProgressService) private readonly service: ResearchProgressService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get(":runId/progress")
  async progress(
    @Req() request: ProgressRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchProgressReadQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.read(request.portalUser, { workspaceId, actorUserId: request.portalUser.userId }, runId);
  }

  /**
   * CG-P11-07: the immutable requested spec a new run may be seeded from
   * (Screen 02 `?from=<runId>`). Read-only; creating the new run is still a
   * NEW intent through a fresh preflight.
   */
  @Get(":runId/requested-spec")
  async requestedSpec(
    @Req() request: ProgressRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchProgressReadQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.requestedSpec({ workspaceId, actorUserId: request.portalUser.userId }, runId);
  }

  @Get(":runId/console")
  async console(
    @Req() request: ProgressRequest,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = ResearchProgressPageQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    return this.service.console(
      { workspaceId, actorUserId: request.portalUser.userId },
      runId,
      query.data.after_seq,
      query.data.limit,
    );
  }

  @Get(":runId/events")
  async events(
    @Req() request: ProgressRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ): Promise<void> {
    let close: () => void = () => undefined;
    try {
      const runId = this.runId(rawRunId);
      const query = ResearchProgressPageQuerySchema.safeParse(rawQuery);
      if (!query.success) this.invalid();
      const workspaceId = await this.workspace(request, query.data.workspace_id);
      const scope = { workspaceId, actorUserId: request.portalUser.userId };
      const afterSequence = this.streamAfterSequence(request, rawQuery, query.data.after_seq);
      let lastSent = afterSequence;
      let loading = true;
      let overflowed = false;
      const pending: StreamEnvelope[] = [];
      let unsubscribe: () => void = () => undefined;
      let closed = false;
      let heartbeat: NodeJS.Timeout | undefined;
      let leaseMonitor: NodeJS.Timeout | undefined;
      let authorizationCheckInFlight = false;
      const end = () => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        if (leaseMonitor) clearInterval(leaseMonitor);
        unsubscribe();
        reply.raw.removeListener("close", end);
      };
      close = end;
      const send = (event: string, payload: unknown, sequence?: number, terminal = false): boolean => {
        if (closed) return false;
        const id = sequence === undefined ? "" : `id: ${sequence}\n`;
        const accepted = reply.raw.write(`${id}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
        if (sequence !== undefined) lastSent = Math.max(lastSent, sequence);
        if (!accepted) {
          // No unbounded per-viewer queue.  A browser receives one typed gap,
          // switches to snapshot polling, and must explicitly reopen later.
          reply.raw.write(`event: research.progress.gap\ndata: ${JSON.stringify({
            schema_version: "research.progress-stream.v1",
            event_type: "research.progress.gap",
            terminal: true,
            reconnect_required: false,
            reason_code: "P11_DOWNSTREAM_BACKPRESSURE",
          })}\n\n`);
          reply.raw.end();
          end();
          return false;
        }
        if (terminal) {
          reply.raw.end();
          end();
          return false;
        }
        return true;
      };
      const liveFrame = (envelope: StreamEnvelope) => {
        const read = envelope.read ?? null;
        if (read !== null && Buffer.byteLength(JSON.stringify(read), "utf8") > STREAM_READ_FRAME_BUDGET_BYTES) {
          return {
            event: envelope.event,
            snapshot: envelope.snapshot,
            read: null,
            read_omitted_reason: "P11_STREAM_READ_OVER_FRAME_BUDGET" as const,
          };
        }
        return { event: envelope.event, snapshot: envelope.snapshot, read };
      };
      const buffered = (envelope: StreamEnvelope) => {
        if (envelope.event.sequence <= lastSent || closed) return;
        if (loading) {
          if (pending.length >= 16) overflowed = true;
          else pending.push(envelope);
          return;
        }
        send("research.progress", liveFrame(envelope), envelope.event.sequence, this.isTerminal(envelope.event.event_type));
      };
      // Subscribe before the durable page read so a callback between the two
      // cannot create a silent gap. The tiny fixed buffer has a typed close
      // rather than holding browser work in memory.
      unsubscribe = this.service.subscribe(request.portalUser, runId, buffered);
      const [initial, snapshot] = await Promise.all([
        this.service.events(scope, runId, afterSequence, query.data.limit),
        this.service.read(request.portalUser, scope, runId),
      ]);
      reply.hijack();
      reply.raw.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-store",
        "x-accel-buffering": "no",
        "x-content-type-options": "nosniff",
      });
      reply.raw.once("close", end);
      send("research.progress.snapshot", snapshot);
      // Replayed history needs no read: the opening snapshot frame above is
      // already the current read, so these carry `read: null`.
      for (const event of initial.events) {
        if (!send("research.progress", { event, snapshot: null, read: null }, event.sequence, this.isTerminal(event.event_type))) return;
      }
      loading = false;
      if (overflowed) {
        send("research.progress.gap", {
          schema_version: "research.progress-stream.v1",
          event_type: "research.progress.gap",
          terminal: true,
          reconnect_required: false,
          reason_code: "P11_LIVE_BUFFER_OVERFLOW",
        }, undefined, true);
        return;
      }
      for (const envelope of pending.sort((left, right) => left.event.sequence - right.event.sequence)) {
        if (envelope.event.sequence <= lastSent) continue;
        if (!send("research.progress", liveFrame(envelope), envelope.event.sequence, this.isTerminal(envelope.event.event_type))) return;
      }
      heartbeat = setInterval(() => send("research.progress.heartbeat", {
        schema_version: "research.progress-stream.v1",
        event_type: "research.progress.heartbeat",
        terminal: false,
      }), 15_000);
      heartbeat.unref();
      leaseMonitor = setInterval(() => {
        // A slow authorization lookup must not accumulate one unresolved
        // promise per five-second tick for a long-lived browser stream.
        if (closed || authorizationCheckInFlight) return;
        authorizationCheckInFlight = true;
        void Promise.all([
          this.auth.sessions.isActiveLease(
            request.portalSession.sessionId,
            request.portalSession.userId,
            request.portalSession.sessionVersion,
            new Date(),
          ),
          this.workspaces.isMember(workspaceId, request.portalUser.userId),
        ]).then(([active, member]) => {
          if (!active || !member) {
            send("auth.expired", {
              schema_version: "research.progress-stream.v1",
              event_type: "auth.expired",
              terminal: true,
              reconnect_required: false,
            }, undefined, true);
          }
        }).catch(() => {
          reply.raw.end();
          end();
        }).finally(() => {
          authorizationCheckInFlight = false;
        });
      }, 5_000);
      leaseMonitor.unref();
    } catch (error) {
      close();
      if (!reply.raw.headersSent) {
        const typed = error instanceof ResearchProgressError ? error : new ResearchProgressError(
          "RESEARCH_PROGRESS_UNAVAILABLE", "Research progress is temporarily unavailable.", 503,
        );
        void reply.status(typed.status).send({ error: { code: typed.code, message: typed.message } });
      } else {
        reply.raw.end();
      }
    }
  }

  @Post(":runId/cancel")
  @HttpCode(202)
  async cancel(
    @Req() request: ProgressRequest,
    @Param("runId") rawRunId: string,
    @Body() rawBody: unknown,
  ) {
    this.assertMutationSecurity(request);
    const runId = this.runId(rawRunId);
    const body = ResearchProgressCancelRequestSchema.safeParse(rawBody);
    if (!body.success) this.invalid();
    const workspaceId = await this.workspace(request, body.data.workspace_id);
    return this.service.cancel(
      request.portalUser,
      { workspaceId, actorUserId: request.portalUser.userId },
      { runId, reason: body.data.reason, requestId: this.requestId(request) },
    );
  }

  private runId(value: string): string {
    const parsed = ResearchProgressRunIdSchema.safeParse(value);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private invalid(): never {
    throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Invalid Research progress request.", 400);
  }

  private async workspace(request: ProgressRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }

  private streamAfterSequence(request: FastifyRequest, rawQuery: unknown, fallback: number): number {
    const hasQueryCursor = !!rawQuery && typeof rawQuery === "object"
      && !Array.isArray(rawQuery) && Object.prototype.hasOwnProperty.call(rawQuery, "after_seq");
    if (hasQueryCursor) return fallback;
    const rawHeader = request.headers["last-event-id"];
    if (Array.isArray(rawHeader) || rawHeader === undefined) return fallback;
    if (!/^[0-9]{1,16}$/.test(rawHeader)) this.invalid();
    const parsed = Number(rawHeader);
    if (!Number.isSafeInteger(parsed)) this.invalid();
    return parsed;
  }

  private isTerminal(eventType: string): boolean {
    return eventType === "run_completed" || eventType === "run_failed";
  }

  private assertMutationSecurity(request: ProgressRequest): void {
    const origin = request.headers.origin;
    if (typeof origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Request origin is not allowed.", 403);
    }
    const rawHeader = request.headers[CSRF_HEADER];
    const header = typeof rawHeader === "string" ? rawHeader : undefined;
    const cookie = csrfCookieFrom(request);
    if (!header || !cookie || !constantTimeEqual(header, cookie)
      || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash)) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "CSRF token is invalid.", 403);
    }
  }

  private requestId(request: FastifyRequest): string {
    const value = request.headers["x-request-id"];
    return typeof value === "string" && /^[A-Za-z0-9._:-]{1,128}$/.test(value)
      ? value : newUlid("req");
  }
}
