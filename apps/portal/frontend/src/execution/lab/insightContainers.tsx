/**
 * Lab-only containers over the analytics port (Lane A).
 *
 * These join port method, reader and panel for screens the product route does
 * not mount; the fixtures page is their only consumer. Moved out of
 * `screens/containers.tsx` so the product import graph never reaches the
 * analytics screens’ demo modules (N29-FE-01 §8).
 */
import { useState, type ReactNode } from "react";

import type { ExecutionApi, InsightBatchInput } from "../api/ports";
import type { AnalyticsEnvelope, CapitalLedger, InsightBatch } from "../analytics";
import { aggregateHeadroomFrom, envelopeFromAnalytics } from "../analytics";
import { PanelState } from "../components/states";
import type { PanelStatus } from "../contracts";
import { HeadroomBanner } from "../screens/AccountBroker360";
import { useAnalyticsRead } from "../screens/containers";
import { OrderFunnelStrip } from "../screens/FullBlotter";
import { CorrelationPanel } from "../screens/PortfolioThreeSixty";

/* ---------------------------------------------------------------------------
 * The four analytics screens
 *
 * Each screen was reachable only by passing it props, which meant the port
 * method, the reader and the screen had never been joined anywhere — the join
 * is where a route typo or a mismapped state actually shows up.
 *
 * They stay on Lane A. These containers take an `api`, and the fixtures page
 * hands them the fixture port; nothing here mounts a product route or enables a
 * registry flag.
 * ------------------------------------------------------------------------ */

export function FullBlotterFunnelContainer({
  api,
  orderId,
}: {
  api: ExecutionApi;
  orderId: string;
}) {
  const state = useAnalyticsRead(() => api.getOrderFunnel(orderId), [api, orderId]);
  return (
    <OrderFunnelStrip
      funnel={state.value?.funnel ?? null}
      status={state.status}
      reason={state.reason}
    />
  );
}

export function AlphaInsightContainer({
  api,
  alphaId,
  request,
  render,
}: {
  api: ExecutionApi;
  alphaId: string;
  request: InsightBatchInput;
  /** The screen decides how a batch is drawn; this only supplies it. */
  render: (state: {
    batch: InsightBatch | null;
    envelope: AnalyticsEnvelope | null;
    status: PanelStatus;
    reason?: string;
  }) => ReactNode;
}) {
  // `request` is an object literal at most call sites, so a new identity every
  // render. Depending on it directly would re-fetch forever; the fields that
  // change the answer are the dependency.
  const itemKey = request.items.map((i) => `${i.insightId}:${i.alphaId}`).join(",");
  const state = useAnalyticsRead(
    () => api.getInsightBatch(alphaId, request),
    [api, alphaId, request.portfolioId, itemKey],
  );
  return (
    <>
      {render({
        batch: state.value?.batch ?? null,
        envelope: state.value?.envelope ?? null,
        status: state.status,
        reason: state.reason,
      })}
    </>
  );
}

/**
 * Concrete rather than a render prop.
 *
 * The first draft handed the parsed correlation to a callback so a screen could
 * decide how to draw it, and no screen ever did — the panel already exists and
 * already owns those decisions, including the leader lens and the cell budget.
 * A container whose only consumer is its own test is not a seam, it is an
 * unfinished bridge.
 */
export function CorrelationContainer({
  api,
  portfolioId,
}: {
  api: ExecutionApi;
  portfolioId: string;
}) {
  const [lensIndex, setLensIndex] = useState<number | null>(null);
  const state = useAnalyticsRead(() => api.getCorrelation(portfolioId), [api, portfolioId]);
  if (state.status !== "ok" && state.status !== "partial") {
    return <PanelState status={state.status} reason={state.reason} />;
  }
  return (
    <CorrelationPanel
      correlation={state.value?.correlation ?? null}
      envelope={state.value ? envelopeFromAnalytics(state.value.envelope) : undefined}
      lensIndex={lensIndex}
      onLensChange={setLensIndex}
    />
  );
}

export function CapitalLedgerContainer({
  api,
  portfolioId,
  render,
}: {
  api: ExecutionApi;
  portfolioId: string;
  render: (state: {
    ledger: CapitalLedger | null;
    envelope: AnalyticsEnvelope | null;
    status: PanelStatus;
    reason?: string;
  }) => ReactNode;
}) {
  const state = useAnalyticsRead(() => api.getCapitalLedger(portfolioId), [api, portfolioId]);
  return (
    <>
      {render({
        ledger: state.value?.ledger ?? null,
        envelope: state.value?.envelope ?? null,
        status: state.status,
        reason: state.reason,
      })}
    </>
  );
}

/*
 * `BindingExposureContainer` was here and is gone.
 *
 * It handed the parsed exposure to a render prop and nothing consumed it, while
 * `ExposureHeadroomContainer` below does the job the contract actually answers.
 * Two containers for one endpoint, one of them unused, is not a choice of
 * seams — it is one seam and one leftover.
 */

/**
 * The aggregate headroom banner, fed from the port.
 *
 * Narrow on purpose. `AccountBroker360` needs sync rows, linked accounts and a
 * policy that the exposure endpoint does not carry, so a container for the whole
 * screen would have to invent them. The banner is the part the exposure contract
 * actually answers, and it is the part that decides whether an operator places
 * an order — so it is the part worth wiring first.
 *
 * `aggregateHeadroomFrom` returns null unless every figure is present, and the
 * banner renders null as unavailable with its own reason. Nothing here computes
 * a verdict, and nothing falls back to summing the buckets when one is missing.
 */
export function ExposureHeadroomContainer({
  api,
  bindingId,
}: {
  api: ExecutionApi;
  bindingId: string;
}) {
  const state = useAnalyticsRead(() => api.getBindingExposure(bindingId), [api, bindingId]);
  const exposure = state.value?.exposure ?? null;
  const envelope = state.value?.envelope ?? null;
  const figures = aggregateHeadroomFrom(exposure?.aggregate ?? null);

  if (state.status !== "ok" && state.status !== "partial") {
    return <PanelState status={state.status} reason={state.reason} />;
  }
  return (
    <HeadroomBanner
      // Both or neither: a verdict without its envelope is an unattributed
      // claim about exposure, and this banner is the one place that must not
      // make one.
      aggregate={figures && envelope ? { ...figures, envelope: envelopeFromAnalytics(envelope) } : null}
      exposure={exposure}
    />
  );
}
