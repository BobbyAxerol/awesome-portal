/**
 * The Fleet peek for a Manager DATASET row (guide section 8.3, HiFi fleet.html `open()`): identity, lifecycle, health and source of one
 * alpha version in one portfolio, in the shared Drawer. Opened by the `sel` param (the row key), so a link to a selected row works.
 *
 * Identity only, as the table: no money (the dataset's money lives in per-currency partitions this screen does not print). Every absence
 * is a statement: days in stage is `Not published (FE-027)` with the typed reason on its title, never a dash and never 0. The way out is
 * "Open Alpha 360" with the page's context; Compare stays disabled with its reason (FE-033), never hidden.
 */
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { withOrigin } from "../../backTo";
import { JourneySpine, NaWhy } from "../../blocks";
import { DockAction, Drawer, type DockMode } from "../../Drawer";
import { Flag } from "../../Flag";
import type { ManagerRow } from "../../readers/managerDataset";
import { withContext } from "../../urlState";
import { inStageOf, lifecycleFlagOf, stageViewOf } from "./fleetDatasetModel";
import { alphaHref, FE, healthView, humanize, notPublished } from "./fleetModel";
import { spineStage } from "./FleetTable";
import { formatInstant } from "../../boundary";

export interface FleetDatasetDrawerProps {
  /** The `sel` value (a row key). */
  rowKey: string;
  /** The loaded row for it, or null when it is not in the loaded rows. */
  row: ManagerRow | null;
  /** True while the first page is still on its way: the row may yet arrive. */
  loading: boolean;
  mode: DockMode;
  onClose(): void;
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="exec-fleet-fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function FleetDatasetDrawer({ rowKey, row, loading, mode, onClose }: FleetDatasetDrawerProps) {
  const [params] = useSearchParams();
  const alphaId = row === null ? null : row.alphaId;
  const open = alphaId === null ? null : (
    <Link
      className="exec-dock-btn exec-fleet-open"
      data-variant="primary"
      to={withContext(withOrigin(alphaHref(alphaId), { kind: "fleet" }, params), params)}
    >
      Open Alpha 360
    </Link>
  );
  const actions = (
    <>
      {open}
      <DockAction label="Compare" reason={notPublished(FE.compare)} />
    </>
  );

  if (row === null) {
    return (
      <Drawer title={rowKey} subtitle={loading ? "Loading" : "Not in the loaded rows"} mode={mode} onClose={onClose} actions={actions}>
        <p className="exec-fleet-note">
          {loading
            ? "Reading the fleet."
            : "This row is not in the rows loaded for the current filters. Clear a filter or load more."}
        </p>
      </Drawer>
    );
  }

  const stage = stageViewOf(row);
  const inStage = inStageOf(row, formatInstant);
  const health = row.health === null ? null : healthView(row.health);
  const lifecycle = lifecycleFlagOf(row.lifecycle);
  const spine = stage.kind === "single" && stage.code !== null ? spineStage(stage.code) : null;
  const name = row.name ?? row.alphaId;

  return (
    <Drawer title={name} subtitle={`Version ${row.alphaVersionId}`} mode={mode} onClose={onClose} actions={actions}>
      <div className="exec-fleet-drawer">
        {health !== null || lifecycle !== null ? (
          <div className="exec-fleet-drawer-flags">
            {health ? <Flag kind={health.kind} label={health.label} /> : null}
            {lifecycle ? <Flag kind={lifecycle.kind} label={lifecycle.label} /> : null}
          </div>
        ) : null}
        {spine ? (
          <section aria-label="Lifecycle position">
            <h3 className="exec-fleet-h">Lifecycle</h3>
            <JourneySpine variant="compact" current={spine} label={`${name} lifecycle`} />
          </section>
        ) : null}

        <section aria-label="Identity">
          <h3 className="exec-fleet-h">Identity</h3>
          <dl className="exec-fleet-facts">
            <Fact label="Alpha id"><span className="exec-fleet-mono">{row.alphaId}</span></Fact>
            <Fact label="Owner">{row.ownerUserId ?? <span className="exec-fleet-na">Not available</span>}</Fact>
            <Fact label="Portfolio">{row.portfolioId}</Fact>
            <Fact label="Current stage">
              {stage.kind === "single" ? stage.label : <NaWhy className="exec-fleet-np" text={stage.label} reason={stage.reason} />}
            </Fact>
            {stage.kind !== "single" && stage.presence.length > 0 ? <Fact label="In stages">{stage.presence.join(", ")}</Fact> : null}
            <Fact label="In stage">
              {inStage.published ? <span title={inStage.detail}>{inStage.text}</span> : <NaWhy className="exec-fleet-np" text={inStage.text} reason={inStage.detail} />}
            </Fact>
            <Fact label="Source">{row.sourceState === null ? <span className="exec-fleet-na">Not available</span> : humanize(row.sourceState)}</Fact>
          </dl>
        </section>
      </div>
    </Drawer>
  );
}
