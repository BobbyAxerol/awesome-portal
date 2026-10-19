/**
 * The Fleet peek: identity of one alpha, in the shared Drawer.
 *
 * Opened by the `sel` param, so a link to a selected row works. The body is
 * identity only (who, which stages, which portfolios, which deployments and
 * their health). The way out is "Open Alpha 360", the V1 route unchanged; the
 * Compare action is disabled with its reason (D9), never hidden.
 */
import type { ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";

import { DockAction, Drawer, type DockMode } from "../../Drawer";
import { JourneySpine } from "../../blocks";
import { Flag } from "../../Flag";
import { withContext } from "../../urlState";
import { utcStamp } from "../../../time";
import { alphaHref, FE, notPublished, type FleetRow } from "./fleetModel";
import { spineStage } from "./FleetTable";

export interface FleetDrawerProps {
  /** The `sel` value. */
  alphaId: string;
  /** The loaded row for it, or null when it is not in the loaded page. */
  row: FleetRow | null;
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

export function FleetDrawer({ alphaId, row, loading, mode, onClose }: FleetDrawerProps) {
  const [params] = useSearchParams();
  const link = withContext(alphaHref(alphaId), params);
  const open = (
    <Link className="exec-dock-btn exec-fleet-open" data-variant="primary" to={link}>Open Alpha 360</Link>
  );
  const actions = (
    <>
      {open}
      <DockAction label="Compare" reason={notPublished(FE.compare)} />
    </>
  );

  if (!row) {
    return (
      <Drawer title={alphaId} subtitle={loading ? "Loading" : "Not in the loaded page"} mode={mode} onClose={onClose} actions={actions}>
        <p className="exec-fleet-note">
          {loading
            ? "Reading the fleet."
            : "This alpha is not in the rows loaded for the current filters. Clear a filter or load more, or open its page directly."}
        </p>
      </Drawer>
    );
  }

  return (
    <Drawer title={row.label} subtitle={`Version ${row.version}`} mode={mode} onClose={onClose} actions={actions}>
      <div className="exec-fleet-drawer">
        <div className="exec-fleet-drawer-flags">
          <Flag kind={row.health.kind} label={row.health.label} />
        </div>
        {spineStage(row.stageCode) ? (
          <section aria-label="Lifecycle position">
            <h3 className="exec-fleet-h">Lifecycle</h3>
            <JourneySpine variant="compact" current={spineStage(row.stageCode)} label={`${row.label} lifecycle`} />
          </section>
        ) : null}
        {row.attention.length > 0 ? (
          <section aria-label="Attention reasons">
            <h3 className="exec-fleet-h">Attention reasons</h3>
            <ul className="exec-fleet-list">
              {row.attention.map((reason) => (
                <li key={reason.code} title={reason.code}>{reason.label}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-label="Identity">
          <h3 className="exec-fleet-h">Identity</h3>
          <dl className="exec-fleet-facts">
            <Fact label="Alpha id"><span className="exec-fleet-mono">{row.alphaId}</span></Fact>
            <Fact label="Owner">{row.owner ?? <span className="exec-fleet-na">Not available</span>}</Fact>
            <Fact label="Highest stage">{row.stage}</Fact>
            <Fact label="Stages">{row.stageCodes.map((s) => s.charAt(0) + s.slice(1).toLowerCase()).join(", ")}</Fact>
            <Fact label="Updated">{utcStamp(row.updatedAt)}</Fact>
          </dl>
        </section>

        <section aria-label="Portfolios">
          <h3 className="exec-fleet-h">Portfolios</h3>
          {row.portfolios.length > 0 ? (
            <ul className="exec-fleet-list">
              {row.portfolios.map((name) => <li key={name}>{name}</li>)}
            </ul>
          ) : (
            <p className="exec-fleet-note">None attached.</p>
          )}
        </section>

        <section aria-label="Deployments">
          <h3 className="exec-fleet-h">Deployments</h3>
          {row.deployments.items.length > 0 ? (
            <table className="exec-fleet-deptable">
              <thead>
                <tr><th scope="col">Deployment</th><th scope="col">Stage</th><th scope="col">Venue</th><th scope="col">State</th><th scope="col">Health</th></tr>
              </thead>
              <tbody>
                {row.deployments.items.map((d) => (
                  <tr key={d.id}>
                    <td className="exec-fleet-mono">{d.id}</td>
                    <td>{d.stage}</td>
                    <td>{d.venue}</td>
                    <td>{d.state}</td>
                    <td><Flag kind={d.health.kind} label={d.health.label} size="sm" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="exec-fleet-note">No deployment. This alpha is in research.</p>
          )}
        </section>

        <section aria-label="Lifecycle">
          <h3 className="exec-fleet-h">Lifecycle readiness</h3>
          <p className="exec-fleet-note"><span className="exec-fleet-np">{notPublished(FE.readiness)}</span></p>
        </section>
      </div>
    </Drawer>
  );
}
