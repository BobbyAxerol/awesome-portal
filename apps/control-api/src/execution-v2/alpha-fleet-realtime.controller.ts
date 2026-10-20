import { Controller, Get, Header, Inject, Query, Req, Res, UseGuards } from "@nestjs/common";
import { FastifyReply, FastifyRequest } from "fastify";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionReadScopeError } from "./read-scope";
import { AlphaFleetRealtimeService, type FleetStreamSink } from "./alpha-fleet-realtime.service";

interface FleetRealtimeRequest extends FastifyRequest { portalUser: PortalUser; portalSession: AuthSession;
  portalWorkspaceId: string; portalViewerWorkspaceId?: string; }
const MAX_QUERY_BYTES = 8192, MAX_EVENT_ID = 4096;

/**
 * ELP2-09 named dataset `alpha_fleet_overview`: the baseline barrier and the notification stream of the fleet read. Two closed
 * routes; no relation, SQL, URL, source cursor, ordinal or scope input is accepted from the browser. Every response is
 * `private, no-store`.
 */
@Controller("/api/v1/execution/manager/fleet")
@UseGuards(SessionGuard)
export class AlphaFleetRealtimeController {
  constructor(@Inject(AlphaFleetRealtimeService) private readonly realtime: AlphaFleetRealtimeService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get("/realtime-snapshot") @Header("Cache-Control", "private, no-store")
  async snapshot(@Req() request: FleetRealtimeRequest, @Query() raw: unknown) {
    const { query, principal } = await this.prepare(request, raw);
    return this.realtime.snapshot(principal, query);
  }

  @Get("/stream")
  async stream(@Req() request: FleetRealtimeRequest, @Res() reply: FastifyReply, @Query() raw: unknown): Promise<void> {
    const { query, principal } = await this.prepare(request, raw);
    const header = request.headers["last-event-id"];
    if (Array.isArray(header) || (typeof header === "string" && (header.length === 0 || header.length > MAX_EVENT_ID)))
      throw new ExecutionReadScopeError("EXECUTION_READ_CURSOR_INVALID", 400);
    const response = reply.raw;
    const sink: FleetStreamSink = {
      write: chunk => response.write(chunk),
      end: () => { if (!response.writableEnded) response.end(); },
      onClose: listener => { response.once("close", listener); },
      closed: () => response.destroyed || response.writableEnded,
    };
    try {
      await this.realtime.openStream(principal, query, header, () => {
        reply.hijack();
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8", "cache-control": "private, no-store",
          "x-accel-buffering": "no", "x-content-type-options": "nosniff" });
        response.flushHeaders();
        return sink;
      });
    } catch (error) {
      // Before `begin` ran this is an ordinary HTTP error. After it, openStream has already answered with a terminal frame.
      if (!response.headersSent) throw error;
      if (!response.writableEnded) response.end();
    }
  }

  private async prepare(request: FleetRealtimeRequest, raw: unknown) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw) || Buffer.byteLength(JSON.stringify(raw)) > MAX_QUERY_BYTES)
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 400);
    const query = { ...(raw as Record<string, unknown>) };
    const workspace = typeof query.workspace_id === "string" ? query.workspace_id : request.portalWorkspaceId;
    if (!(await this.workspaces.canReadExecution(workspace, request.portalUser.userId)))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    return { query, principal: { user: request.portalUser, session: request.portalSession, workspaceId: workspace,
      viewerWorkspaceId: request.portalViewerWorkspaceId ?? request.portalWorkspaceId } };
  }
}
