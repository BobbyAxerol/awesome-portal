import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";

import { SessionGuard } from "../facade/session.guard";
import {
  ExecutionMarketCandlesService,
  MARKET_CANDLES_MAX_LIMIT,
  MARKET_CANDLE_INTERVALS,
  MarketCandlesError,
} from "./market-candles.service";

const SYMBOL = /^[A-Z0-9]{5,20}$/;
const UTC_MS = z.coerce.number().int().safe().min(0).max(8_640_000_000_000_000);

const QuerySchema = z.object({
  venue: z.literal("BINANCE").default("BINANCE"),
  market: z.literal("USDM").default("USDM"),
  symbol: z.string().regex(SYMBOL),
  interval: z.enum(MARKET_CANDLE_INTERVALS).default("1h"),
  from_ms: UTC_MS.optional(),
  to_ms: UTC_MS.optional(),
  limit: z.coerce.number().int().min(1).max(MARKET_CANDLES_MAX_LIMIT).default(500),
}).strict().superRefine((value, context) => {
  if (value.from_ms !== undefined && value.to_ms !== undefined && value.from_ms > value.to_ms) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to_ms"], message: "to_ms must not precede from_ms" });
  }
});

/**
 * `GET /api/v1/execution/market/candles` — venue public klines for the Trade
 * Replay's market context. Same-origin, session-guarded, one venue/market
 * (BINANCE USDM), symbol allowlisted by shape, interval from a fixed set.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/market")
export class ExecutionMarketCandlesController {
  constructor(@Inject(ExecutionMarketCandlesService) private readonly candles: ExecutionMarketCandlesService) {}

  @Get("/candles")
  async get(@Query() raw: unknown) {
    const query = QuerySchema.safeParse(raw);
    if (!query.success) throw new MarketCandlesError("MARKET_CANDLES_QUERY_INVALID", 400);
    return this.candles.candles({
      symbol: query.data.symbol,
      interval: query.data.interval,
      fromMs: query.data.from_ms ?? null,
      toMs: query.data.to_ms ?? null,
      limit: query.data.limit,
    });
  }
}
