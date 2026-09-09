import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  dataLayerUnavailable,
  ExecutionMarketCandlesService,
  MARKET_CANDLES_MAX_LIMIT,
  MARKET_CANDLE_INTERVALS,
  MARKET_OF_VENUE,
  MARKET_VENUES,
  MarketCandlesError,
  marketContextToCandlesEnvelope,
} from "./market-candles.service";
import { MarketContextService } from "./market-context.service";

/** `ETHUSDT` (Binance shape) or `ETH-USDT-SWAP` (OKX shape). */
const SYMBOL = /^[A-Z0-9]{5,20}$|^[A-Z0-9]{2,12}-[A-Z0-9]{2,8}-SWAP$/;
const UTC_MS = z.coerce.number().int().safe().min(0).max(8_640_000_000_000_000);

const QuerySchema = z.object({
  environment: z.enum(["paper", "sandbox", "live"]).default("paper"),
  venue: z.enum(MARKET_VENUES).default("BINANCE"),
  market: z.enum(["USDM", "SWAP"]).optional(),
  symbol: z.string().regex(SYMBOL),
  interval: z.enum(MARKET_CANDLE_INTERVALS).default("1h"),
  from_ms: UTC_MS.optional(),
  to_ms: UTC_MS.optional(),
  limit: z.coerce.number().int().min(1).max(MARKET_CANDLES_MAX_LIMIT).default(500),
}).strict().superRefine((value, context) => {
  if (value.market !== undefined && value.market !== MARKET_OF_VENUE[value.venue]) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["market"], message: `${value.venue} serves ${MARKET_OF_VENUE[value.venue]} only` });
  }
  if (value.venue === "BINANCE" && value.symbol.includes("-")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["symbol"], message: "Binance symbols carry no hyphen" });
  }
  if (value.from_ms !== undefined && value.to_ms !== undefined && value.from_ms > value.to_ms) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to_ms"], message: "to_ms must not precede from_ms" });
  }
});

/**
 * `GET /api/v1/execution/market/venue-candles` — venue PUBLIC klines for the
 * Trade Replay's market context (OR-4). Same-origin, session-guarded, two
 * venues with one market each (BINANCE USDM, OKX SWAP), symbol allowlisted by
 * shape, interval from a fixed set. The sibling `/market/candles` route is
 * the Trading System market context through the Manager (EDS-10b / EDS-11R4,
 * `MarketContextController`); the two are unified behind
 * `EXECUTION_MARKET_CANDLES_SOURCE` (G10).
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/market")
export class ExecutionMarketCandlesController {
  constructor(
    @Inject(ExecutionMarketCandlesService) private readonly candles: ExecutionMarketCandlesService,
    @Inject(MarketContextService) private readonly marketContext: MarketContextService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/venue-candles")
  async get(@Req() request: FastifyRequest & { portalUser: PortalUser; portalSession: AuthSession; portalWorkspaceId: string }, @Query() raw: unknown) {
    const query = QuerySchema.safeParse(raw);
    if (!query.success) throw new MarketCandlesError("MARKET_CANDLES_QUERY_INVALID", 400);
    const input = {
      venue: query.data.venue,
      symbol: query.data.symbol,
      interval: query.data.interval,
      fromMs: query.data.from_ms ?? null,
      toMs: query.data.to_ms ?? null,
      limit: query.data.limit,
    } as const;
    if (this.config.EXECUTION_MARKET_CANDLES_SOURCE !== "data_layer") return this.candles.candles(input);
    if (input.venue !== "BINANCE") return dataLayerUnavailable(input, Date.now(), "MARKET_CONTEXT_VENUE_UNSUPPORTED");
    if (input.fromMs === null || input.toMs === null || input.toMs <= input.fromMs) {
      return dataLayerUnavailable(input, Date.now(), "MARKET_CONTEXT_RANGE_REQUIRED");
    }
    const workspaceId = request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new MarketCandlesError("WORKSPACE_NOT_FOUND", 404);
    }
    const source = await this.marketContext.candles(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      {
        environment: query.data.environment,
        venue: input.venue,
        instrument: input.symbol,
        interval: input.interval,
        fromMs: input.fromMs,
        toMs: input.toMs,
        pointLimit: Math.min(input.limit, 2_000),
      },
    );
    return marketContextToCandlesEnvelope(input, source, Date.now());
  }
}
