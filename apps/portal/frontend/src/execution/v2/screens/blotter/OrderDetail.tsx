/**
 * The body of an expanded blotter row: bracket legs, fills, and the order path.
 *
 * Every number is the server's string, printed with its own digits. The fills
 * list is the fills the page carries for this order (matched by client or venue
 * order id); it says so, because the fills relation is its own bounded page and
 * an empty list means "none on this page", not "none".
 */
import { Link, useSearchParams } from "react-router-dom";

import type { FunnelStage, OrderFunnel } from "../../../analytics";
import type { PanelStatus } from "../../../contracts";
import { PanelState } from "../../../components/states";
import { Flag } from "../../Flag";
import { withContext } from "../../urlState";
import type { FlagKind } from "../../flagKinds";
import { groupExact, humanize, shortUtc, statusView, type BlotterFill, type BlotterLeg, type BlotterOrder, type Exact } from "./blotterModel";

export type FunnelRead =
  | { phase: "loading" }
  | { phase: "ready"; funnel: OrderFunnel }
  | { phase: "error"; status: Exclude<PanelStatus, "ok" | "loading">; reason: string };

/** An exact field as text: the digits as published, or the honest reason there are none. */
export function ExactText({ value, absent = "Not available" }: { value: Exact; absent?: string }) {
  if (value.kind === "value") return <span className="exec-blt2-num" title={value.text}>{groupExact(value.text)}</span>;
  if (value.kind === "unreadable") return <span className="exec-blt2-na">Not available · unreadable value</span>;
  return <span className="exec-blt2-na">{absent}</span>;
}

const STAGE_LABEL: Readonly<Record<string, string>> = {
  SUBMIT: "Submitted",
  SOURCE_ACK: "Risk grant",
  BROKER_ACK: "Venue acknowledged",
  FILL: "Fill",
};

const STAGE_KIND: Readonly<Record<string, FlagKind>> = { OBSERVED: "ok", PARTIAL: "partial", MISSING: "na" };

function legKind(state: string | null): FlagKind {
  switch ((state ?? "").toUpperCase()) {
    case "ARMED":
    case "PENDING":
    case "CONDITIONAL":
    case "ACTIVE": return "pending";
    case "TRIGGERED":
    case "FILLED":
    case "CLOSED": return "ok";
    case "CANCELED":
    case "CANCELLED":
    case "EXPIRED": return "paused";
    case "REJECTED": return "rejected";
    default: return "unknown";
  }
}

function elapsed(from: string | null, to: string | null): string | null {
  if (from === null || to === null) return null;
  const a = Date.parse(from);
  const b = Date.parse(to);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  const ms = b - a;
  return ms < 10_000 ? `+${ms} ms` : `+${(ms / 1000).toFixed(1)} s`;
}

/**
 * A hop time that cannot belong to this order is not printed: one later than the page's own as-of, or a Submitted time that is not the
 * order's own submitted time (QA4 R4-01). The row says it instead, so a path is never drawn from "now".
 */
export function pathTimeProblem(stage: FunnelStage, at: string | null, order: { submittedAt: string | null }, asOf: string | null): boolean {
  if (at === null) return false;
  const t = Date.parse(at);
  if (Number.isNaN(t)) return false;
  if (asOf !== null && !Number.isNaN(Date.parse(asOf)) && t > Date.parse(asOf)) return true;
  return stage.name === "SUBMIT" && order.submittedAt !== null && !Number.isNaN(Date.parse(order.submittedAt)) && Math.abs(t - Date.parse(order.submittedAt)) > 60_000;
}

function PathRows({ stages, order, asOf }: { stages: readonly FunnelStage[]; order: { submittedAt: string | null }; asOf: string | null }) {
  let previous: string | null = null;
  return (
    <>
      {stages.map((stage) => {
        const first = stage.events[0] ?? null;
        const at = first?.occurredAt ?? null;
        const problem = pathTimeProblem(stage, at, order, asOf);
        const gap = problem ? null : elapsed(previous, at);
        if (at !== null && !problem) previous = at;
        return (
          <tr key={stage.name}>
            <td>{STAGE_LABEL[stage.name] ?? humanize(stage.name)}</td>
            <td>
              {problem ? <Flag kind="na" label="Time not shown" size="sm" /> : at !== null ? <span className="exec-blt2-num">{shortUtc(at)}</span> : <Flag kind={STAGE_KIND[stage.state] ?? "unknown"} label={stage.state === "MISSING" ? "Not reached" : humanize(stage.state)} size="sm" />}
            </td>
            <td className="exec-blt2-na">{gap ?? ""}</td>
            <td className="exec-blt2-na">
              {stage.eventCount !== null && stage.eventCount > 1 ? `${stage.eventCount} events${stage.truncated ? ", list cut" : ""}` : ""}
            </td>
          </tr>
        );
      })}
    </>
  );
}

export function OrderDetail({
  order, legs, fills, funnel, chartHref, loadedFills, asOf = null,
}: {
  order: BlotterOrder;
  legs: readonly BlotterLeg[];
  fills: readonly BlotterFill[];
  funnel: FunnelRead;
  /** The page's own as-of: no hop may be later than it. */
  asOf?: string | null;
  chartHref: string | null;
  /** The fills page this order's fills came from has more rows than it carried. */
  loadedFills: number;
}) {
  const [params] = useSearchParams();
  const status = statusView(order.status);
  const refused = status.bucket === "REJECTED";
  return (
    <div className="exec-blt2-kidbox">
      <section aria-label="Bracket legs">
        <h4 className="exec-blt2-h4">Bracket legs</h4>
        {legs.length === 0 ? (
          <p className="exec-blt2-na">No bracket legs on this order</p>
        ) : (
          <table className="exec-blt2-inner">
            <thead><tr><th>Leg</th><th data-numeric="true">Trigger</th><th data-numeric="true">Price</th><th data-numeric="true">Quantity</th><th>State</th></tr></thead>
            <tbody>
              {legs.map((leg) => (
                <tr key={`${leg.groupId}:${leg.legId}`} data-self={leg.clientOrderId !== null && leg.clientOrderId === order.clientOrderId ? "true" : undefined}>
                  <td>{leg.role ? humanize(leg.role) : leg.legId}</td>
                  <td data-numeric="true"><ExactText value={leg.triggerPrice} absent="At market" /></td>
                  <td data-numeric="true"><ExactText value={leg.price} absent="At market" /></td>
                  <td data-numeric="true"><ExactText value={leg.quantity} /></td>
                  <td><Flag kind={legKind(leg.state)} label={leg.state ? humanize(leg.state) : "State not stated"} size="sm" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-label="Fills">
        <h4 className="exec-blt2-h4">Fills</h4>
        {fills.length === 0 ? (
          <p className="exec-blt2-na">{refused ? (order.errorMessage ?? order.errorCode ?? "The order was refused and has no fills.") : loadedFills === 0 ? "No fills on this page" : "No fills for this order on this page"}</p>
        ) : (
          <table className="exec-blt2-inner">
            <thead><tr><th>Fill</th><th>Time (UTC)</th><th data-numeric="true">Quantity</th><th data-numeric="true">Price</th><th data-numeric="true">Fee</th></tr></thead>
            <tbody>
              {fills.map((fill) => (
                <tr key={fill.fillId}>
                  <td><span className="exec-blt2-id">{fill.fillId}</span></td>
                  <td>{fill.tradeTime ? shortUtc(fill.tradeTime) : <span className="exec-blt2-na">Not available</span>}</td>
                  <td data-numeric="true"><ExactText value={fill.quantity} /></td>
                  <td data-numeric="true"><ExactText value={fill.price} /></td>
                  <td data-numeric="true">
                    <ExactText value={fill.commission} />
                    {fill.commission.kind === "value" && fill.commissionCurrency ? <small className="exec-blt2-unit"> {fill.commissionCurrency}</small> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="exec-blt2-note">Fills are those the fills page carries for this order. A fee is in its own currency and is never summed across currencies.</p>
      </section>

      <section aria-label="Order path">
        <h4 className="exec-blt2-h4">Order path</h4>
        {funnel.phase === "loading" ? (
          <p className="exec-blt2-na" role="status">Reading the order path</p>
        ) : funnel.phase === "error" ? (
          <PanelState status={funnel.status} reason={funnel.reason} />
        ) : (
          <>
            <table className="exec-blt2-inner">
              <tbody><PathRows stages={funnel.funnel.stages} order={order} asOf={asOf} /></tbody>
            </table>
            {funnel.funnel.stages.some((stage) => pathTimeProblem(stage, stage.events[0]?.occurredAt ?? null, order, asOf)) ? <p className="exec-blt2-note">A hop time is not shown where it is later than this page's as-of, or where the submitted time is not the order's own. It is not guessed.</p> : null}
            {funnel.funnel.incomplete ? <p className="exec-blt2-note">At least one hop was not observed. It is shown as not reached, not inferred from the hops after it.</p> : null}
          </>
        )}
        {refused && (order.errorMessage || order.errorCode) ? (
          <p className="exec-blt2-note">{order.errorMessage ?? order.errorCode}{order.errorMessage && order.errorCode ? ` (${order.errorCode})` : ""}</p>
        ) : null}
        {chartHref ? <Link className="exec-blt2-link" to={withContext(chartHref, params)}>Open on chart</Link> : null}
      </section>
    </div>
  );
}
