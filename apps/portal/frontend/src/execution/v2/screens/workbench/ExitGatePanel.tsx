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
import { Link } from "react-router-dom";

import { formatExact } from "../../../formatExact";
import { Flag } from "../../Flag";
import { NotPublished, SectionPanel } from "../../blocks";
import { Na } from "./cells";
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

export interface ExitGatePanelProps {
  gate: GateFacts;
  exitReviewsHref: string;
}

export function ExitGatePanel({ gate, exitReviewsHref }: ExitGatePanelProps) {
  const verdict = GATE_FLAG[gate.verdict];
  return (
    <SectionPanel level={2} title="Exit gate" aside="Paper → Sandbox">
      <table className="exec-wb-kv">
        <tbody>
          <tr>
            <th scope="row">Gate verdict</th>
            <td>
              <Flag kind={verdict.kind} label={verdict.label} size="sm" />
              <span className="exec-wb-why">Set by the server</span>
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
                {gate.reasonCode ? <span className="exec-wb-why">{gate.reasonCode}</span> : null}
              </td>
            </tr>
          )}
          <tr>
            <th scope="row">Drift vs approved band</th>
            <td><NotPublished id="FE-029" /></td>
          </tr>
          <tr>
            <th scope="row">Fills reconcile</th>
            <td><NotPublished id="FE-028" /></td>
          </tr>
          <tr>
            <th scope="row">Cost drift</th>
            <td><NotPublished id="FE-028" /></td>
          </tr>
        </tbody>
      </table>
      {gate.policy ? <p className="exec-wb-cap">Policy {gate.policy}</p> : null}
      <p className="exec-wb-link">
        <Link className="exec-blk-link" to={exitReviewsHref}>Open exit review</Link>
      </p>
    </SectionPanel>
  );
}
