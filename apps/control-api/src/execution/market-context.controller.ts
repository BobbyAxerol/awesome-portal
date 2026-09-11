import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { MarketContextError, MarketContextService } from "./market-context.service";
import {
  MARKET_CONTEXT_INTERVALS,
  MARKET_CONTEXT_MAXIMUM_CANDLE_RANGE_MS,
  MARKET_CONTEXT_MAXIMUM_VISUAL_CANDLES,
  MARKET_CONTEXT_VENUE,
} from "./market-context.registry";

const WorkspaceQuery = z.string().trim().min(1).max(96).optional();
const MarketInstrumentQuery = z.string().regex(/^[A-Z0-9]{2,30}$/);
const LatestQuerySchema = z.object({
  workspace_id: WorkspaceQuery,
  environment: z.enum(["paper", "sandbox", "live"]).default("paper"),
  venue: z.literal(MARKET_CONTEXT_VENUE),
  instrument: MarketInstrumentQuery,
}).strict();
const CandlesQuerySchema = LatestQuerySchema.extend({
  interval: z.enum(MARKET_CONTEXT_INTERVALS),
  from_ms: z.coerce.number().int().min(0).max(8_640_000_000_000_000),
  to_ms: z.coerce.number().int().min(0).max(8_640_000_000_000_000),
  point_limit: z.coerce.number().int().min(1).max(MARKET_CONTEXT_MAXIMUM_VISUAL_CANDLES).default(200),
}).strict();

interface MarketContextRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalSession: AuthSession;
  portalWorkspaceId: string;
}

/** Browser-safe, exact route family; raw Edge routes stay forbidden. */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/market")
export class MarketContextController {
  constructor(
    @Inject(MarketContextService) private readonly marketContext: MarketContextService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get("/latest")
  async latest(@Req() request: MarketContextRequest, @Query() raw: unknown) {
    const query = LatestQuerySchema.safeParse(raw);
    if (!query.success) throw new MarketContextError("EDS11R4_MARKET_QUERY_INVALID", 400);
    const workspaceId = await workspaceFor(request, query.data.workspace_id, this.workspaces);
    return this.marketContext.latest(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      { environment: query.data.environment, venue: query.data.venue, instrument: query.data.instrument },
    );
  }

  @Get("/candles")
  async candles(@Req() request: MarketContextRequest, @Query() raw: unknown) {
    const query = CandlesQuerySchema.safeParse(raw);
    if (
      !query.success ||
      query.data.to_ms <= query.data.from_ms ||
      query.data.to_ms - query.data.from_ms > MARKET_CONTEXT_MAXIMUM_CANDLE_RANGE_MS
    ) {
      throw new MarketContextError("EDS11R4_MARKET_QUERY_INVALID", 400);
    }
    const workspaceId = await workspaceFor(request, query.data.workspace_id, this.workspaces);
    return this.marketContext.candles(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      {
        environment: query.data.environment,
        venue: query.data.venue,
        instrument: query.data.instrument,
        interval: query.data.interval,
        fromMs: query.data.from_ms,
        toMs: query.data.to_ms,
        pointLimit: query.data.point_limit,
      },
    );
  }
}

async function workspaceFor(
  request: MarketContextRequest,
  requestedWorkspaceId: string | undefined,
  workspaces: WorkspacesRepository,
): Promise<string> {
  const workspaceId = requestedWorkspaceId ?? request.portalWorkspaceId;
  if (!(await workspaces.isMember(workspaceId, request.portalUser.userId))) {
    throw new MarketContextError("WORKSPACE_NOT_FOUND", 404);
  }
  return workspaceId;
}
