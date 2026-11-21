/**
 * The only door from V2 into the V1 replay components.
 *
 * `TradeReplayEvents` and `ReplayCandleChart` pull in lightweight-charts. They
 * are reached through `import()` here and nowhere else in `v2/blocks`, so the
 * chart library lands in its own chunk and never in an entry chunk. A test
 * holds this: no block imports either file statically.
 */
import { lazy } from "react";

/** V1 replay panel (candles, markers, log). Loads on first render. */
export const LazyTradeReplayEvents = lazy(() =>
  import("../../components/TradeReplayEvents").then((m) => ({ default: m.TradeReplayEvents })),
);

/** V1 candle chart alone, for a screen that composes its own log. Loads on first render. */
export const LazyReplayCandleChart = lazy(() =>
  import("../../components/ReplayCandleChart").then((m) => ({ default: m.ReplayCandleChart })),
);
