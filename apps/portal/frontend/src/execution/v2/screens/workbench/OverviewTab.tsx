/**
 * Overview: equity against the approved band, the exit gate, runtime health,
 * accounting and execution quality (hi-fi `deployment.html`, tab Overview).
 *
 * What differs from the hi-fi, on purpose (S3 plan D13):
 *   - the band is `Not published (FE-029)`: the approved-evidence join is not
 *     activated, so the chart draws equity only and says so;
 *   - the drawdown pane is `Not published (FE-013)`: the snapshot `drawdown`
 *     carries no published scale or sign, and EquityPanel never derives one;
 *   - Funding is "Not available" with "Counted separately" unless the head
 *     snapshot publishes it;
 *   - Latency is `Not available` with the source's own reason code.
 */
import type { ReactNode } from "react";

import type { DeploymentQuality } from "../../../api/derivations";
import { Flag } from "../../Flag";
import { GapLine, Kpi, KpiStrip, PanelGate, SectionPanel } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { EquityPanel } from "../../charts";
import { At, Fig, Na } from "./cells";
import { VenueCalendarPanel } from "./Calendar";
import { ExitGatePanel } from "./ExitGatePanel";
import { PAGE_CAP, humanize, readQuality, type AccountingFacts, type Figure, type WorkbenchModel } from "./model";
import type { ReadState } from "./useWorkbenchReads";

export interface OverviewTabProps {
  model: WorkbenchModel;
  /** The profile's source is not qualified (hi-fi "nq"): no figure is drawn, quality included. */
  notQualified?: boolean;
  quality: ReadState<DeploymentQuality>;
  exitReviewsHref: string;
}

/** `Kpi` props for a figure: a value prints, an absence prints `Not available`, an unreadable one says so. */
function kpiOf(value: Figure): { value?: string; metric?: null } {
  if (value.kind === "value") return { value: value.decimal.display };
  if (value.kind === "unreadable") return { metric: null };
  return {};
}

function EquityBlock({ model }: { model: WorkbenchModel }) {
  const { equity } = model;
  const envelope = equity.serverEnvelope;
  return (
    <SectionPanel level={2} title="Equity vs approved band" aside={`Simulated${equity.currency ? ` · ${equity.currency}` : ""}`}>
      <EquityPanel
        label="Paper equity vs approved band"
        seriesName="Equity"
        points={equity.points}
        currency={equity.currency ?? undefined}
        state={equity.state}
        segments={equity.segments}
        serverEnvelope={envelope}
        height={240}
      />
      <GapLine
        items={[
          { label: "Drawdown", id: "FE-013", reason: "The snapshot drawdown carries no published scale" },
          { label: "Approved band", id: "FE-029" },
          { label: "Window", id: "FE-025" },
        ]}
      />
    </SectionPanel>
  );
}

function RuntimeHealth({ model }: { model: WorkbenchModel }) {
  const { deployment, positions, equity } = model;
  const mode = [deployment?.mode ? humanize(deployment.mode) : null, deployment?.venue].filter((part): part is string => part !== null && part !== undefined);
  const a: AccountingFacts = equity.accounting;
  const digest = a.digest;
  return (
    <SectionPanel level={2} title="Runtime health">
      <table className="exec-wb-kv">
        <tbody>
          <tr>
            <th scope="row">Mode · venue</th>
            <td>{mode.length > 0 ? mode.join(" · ") : <Na />}</td>
          </tr>
          <tr>
            <th scope="row">Open positions</th>
            <td>
              {positions.table.published ? (
                <>
                  <span className="exec-blk-num">{positions.open}</span>
                  {positions.table.loaded >= PAGE_CAP ? <span className="exec-wb-why">In the first {PAGE_CAP} rows</span> : null}
                  {positions.unreadableSide > 0 ? <span className="exec-wb-why">{positions.unreadableSide} with a side that could not be read</span> : null}
                </>
              ) : (
                <Na why="The profile carries no positions branch" />
              )}
            </td>
          </tr>
          <tr>
            <th scope="row">Last source update</th>
            <td><At ms={deployment?.updatedAtMs ?? null} /></td>
          </tr>
          <tr>
            <th scope="row">Fills counted</th>
            <td><Fig value={a.fillsCounted} /></td>
          </tr>
        </tbody>
      </table>
      <details className="exec-wb-prov">
        <summary>Provenance</summary>
        <p className="exec-wb-id">
          {deployment?.deploymentId ?? "Deployment id not published"}
          {digest ? <> · digest <span title={digest}>{digest.slice(0, 12)}</span></> : <> · digest not published</>}
        </p>
        {a.snapshotReason || a.snapshotSource ? (
          <p className="exec-wb-id">
            Snapshot {a.snapshotReason ?? "reason not published"}
            {a.snapshotSource ? <> · source {a.snapshotSource}</> : null}
            {a.atMs === null ? null : <> · taken {formatAsOf(a.atMs)}</>}
          </p>
        ) : null}
      </details>
    </SectionPanel>
  );
}

function Accounting({ model }: { model: WorkbenchModel }) {
  const a = model.equity.accounting;
  const cur = a.currency;
  const cash = a.cashFree.kind === "value" && a.cashLocked.kind === "value";
  return (
    <div id="exec-wb-accounting">
      <SectionPanel level={2} title="Accounting" aside={`Simulated${cur ? ` · ${cur}` : ""}`}>
        <table className="exec-wb-kv">
          <tbody>
            <tr>
              <th scope="row">Equity</th>
              <td><Fig value={a.equity} /></td>
            </tr>
            <tr>
              <th scope="row">Net PnL</th>
              <td><Fig value={a.netPnl} signed /></td>
            </tr>
            <tr>
              <th scope="row">Fees</th>
              <td><Fig value={a.fees} /></td>
            </tr>
            <tr>
              <th scope="row" title="Counted separately">Funding</th>
              <td>
                <Fig value={a.funding} signed why="Counted separately" />
              </td>
            </tr>
            <tr>
              <th scope="row">Cash free · locked</th>
              <td>
                {cash ? (
                  <>
                    <Fig value={a.cashFree} /> · <Fig value={a.cashLocked} />
                  </>
                ) : (
                  <Na />
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </SectionPanel>
    </div>
  );
}

function qualityBody(quality: ReadState<DeploymentQuality>): { body: ReactNode; partial: boolean } {
  if (quality.phase === "loading") return { body: <PanelGate status="loading" />, partial: false };
  if (quality.phase === "error") return { body: <PanelGate status={quality.failure.status} reason={quality.failure.reason} />, partial: false };
  const facts = readQuality(quality.value);
  if (facts.status.kind !== "ok") return { body: <PanelGate status={facts.status.kind} reason={facts.status.reason} />, partial: false };
  return {
    partial: facts.partial,
    body: (
      <>
        <KpiStrip label="Execution quality" columns={4}>
          <Kpi label="Sessions" {...kpiOf(facts.sessions)} />
          <Kpi label="Orders" {...kpiOf(facts.orders)} />
          <Kpi label="Fills" {...kpiOf(facts.fills)} />
          <Kpi label="Rejected" {...kpiOf(facts.rejected)}>
            {facts.submitted.kind === "value" ? <>Of {facts.submitted.decimal.display} submitted</> : null}
          </Kpi>
        </KpiStrip>
        <GapLine items={[{ label: "Latency", reason: facts.latencyReason ?? "No latency figure is published" }]} />
      </>
    ),
  };
}

function ExecutionQuality({ quality, notQualified }: { quality: ReadState<DeploymentQuality>; notQualified: boolean }) {
  const { body, partial } = notQualified
    ? { body: <PanelGate status="unavailable" reason="Source not qualified." />, partial: false }
    : qualityBody(quality);
  return (
    <SectionPanel level={2} title="Execution quality" aside={partial ? <Flag kind="partial" label="Partial" size="sm" /> : undefined}>
      {body}
    </SectionPanel>
  );
}

export function OverviewTab({ model, quality, exitReviewsHref, notQualified = false }: OverviewTabProps) {
  return (
    <div className="exec-wb-stack">
      {model.calendar === null ? null : <VenueCalendarPanel calendar={model.calendar} />}
      <div className="exec-wb-grid2">
        <EquityBlock model={model} />
        <div id="exec-wb-evidence">
          <ExitGatePanel gate={model.gate} exitReviewsHref={exitReviewsHref} />
        </div>
      </div>
      <div className="exec-wb-grid2">
        <RuntimeHealth model={model} />
        <Accounting model={model} />
      </div>
      <ExecutionQuality quality={quality} notQualified={notQualified} />
    </div>
  );
}
