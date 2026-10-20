/**
 * Exit gate (hi-fi `Exit gate`, Paper -> Sandbox).
 *
 * The verdict is the server's (`observation_gate.state`); the counts are drawn
 * beside the policy minimums so a reader sees why, and this panel never judges
 * them. The hi-fi's per-criterion verdicts (Fills reconcile, Cost drift, Drift
 * vs approved band) have no source: each is `Not published (FE-xxx)` with the
 * request that will publish it, never a green "Met" or an invented
 * "Insufficient data".
 */
import { useMemo } from "react";
import { Link } from "react-router-dom";

import type { CaptureContext, ContextRead } from "../../../api/governanceContext";
import type { ExecutionApi } from "../../../api/ports";
import { formatExact } from "../../../formatExact";
import { Flag } from "../../Flag";
import { GapLine, GapWhy, SectionPanel } from "../../blocks";
import { Na } from "./cells";
import { ExitReviewRequest } from "./ExitReviewRequest";
import { bindExitParent, bindExitReview } from "./exitReviewRequest";
import { useExitParent } from "./useExitParent";
import { GATE_FLAG, type GateFacts } from "./model";

const n = (value: number): string => formatExact(String(value), "count").display;

function progress(current: number | null, minimum: number | null, unit: string) {
  if (current === null) return <Na />;
  return (
    <span className="exec-blk-num">
      {n(current)}
      {minimum === null ? null : <> of {n(minimum)}</>} {unit}
    </span>
  );
}

/**
 * What the Paper exit review request needs. Absent: the panel is the read-only gate it was (no control).
 * The control is bound to the R2 parent of THIS deployment, read once from `GET /governance/paper-exit/parent` (`useExitParent`).
 * `captureContext` is a context already in hand (a test, a caller that read the R2 review itself): when given it is used as is and
 * nothing is read.
 */
export interface ExitRequestProps {
  api: ExecutionApi;
  deploymentId: string;
  /** The workspace the route names, or `null` when none is. */
  workspaceId: string | null;
  captureContext?: ContextRead<CaptureContext> | null;
}

export interface ExitGatePanelProps {
  gate: GateFacts;
  exitReviewsHref: string;
  request?: ExitRequestProps;
}

export function ExitGatePanel({ gate, exitReviewsHref, request }: ExitGatePanelProps) {
  const verdict = GATE_FLAG[gate.verdict];
  const given = request?.captureContext;
  const parent = useExitParent(request?.api ?? null, request?.deploymentId ?? "", request?.workspaceId ?? null, request !== undefined && given === undefined);
  const bind = useMemo(() => {
    if (request === undefined) return null;
    if (given !== undefined) return bindExitReview({ context: given, workspaceId: request.workspaceId, deploymentId: request.deploymentId });
    return bindExitParent({ parent, workspaceId: request.workspaceId, deploymentId: request.deploymentId });
  }, [request?.workspaceId, request?.deploymentId, given, parent]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <SectionPanel level={2} title="Exit gate" aside="Paper → Sandbox">
      <table className="exec-wb-kv">
        <tbody>
          <tr>
            <th scope="row">Gate verdict</th>
            <td title="Set by the server">
              <Flag kind={verdict.kind} label={verdict.label} size="sm" />
            </td>
          </tr>
          <tr>
            <th scope="row">Observation days</th>
            <td>{progress(gate.observedDays, gate.minimumDays, "days")}</td>
          </tr>
          <tr>
            <th scope="row">Trades</th>
            <td>{progress(gate.trades, gate.minimumTrades, "trades")}</td>
          </tr>
          {gate.windowBounded === null ? null : (
            <tr>
              <th scope="row">Observation window</th>
              <td>
                {gate.windowBounded ? <Flag kind="partial" label="Bounded by the source" size="sm" /> : <span>Not bounded</span>}
                {gate.reasonCode ? <GapWhy name="Observation window, reason" rows={[gate.reasonCode]} /> : null}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <GapLine
        items={[
          { label: "Drift vs approved band", id: "FE-029" },
          { label: "Fills reconcile", id: "FE-028" },
          { label: "Cost drift", id: "FE-028" },
        ]}
      />
      {gate.policy ? <p className="exec-wb-cap">Policy {gate.policy}</p> : null}
      {request !== undefined && bind !== null ? <ExitReviewRequest api={request.api} deploymentId={request.deploymentId} workspaceId={request.workspaceId} bind={bind} /> : null}
      <p className="exec-wb-link">
        <Link className="exec-blk-link" to={exitReviewsHref}>Open exit review</Link>
      </p>
    </SectionPanel>
  );
}
