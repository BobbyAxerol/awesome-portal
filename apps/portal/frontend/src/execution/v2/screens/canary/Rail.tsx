/**
 * The right rail: Promotion decision, Before scale-up, Rollback readiness.
 *
 * Promotion decision draws all four decisions and enables none (D6, D9): there is
 * no command route, so each is a disabled `DockAction` carrying the stage
 * dictionary's one-line reason and the My access link. V1 hid the group when the
 * server said `visible: false`; V2 shows it disabled with its reason.
 *
 * Before scale-up is the published reason codes as sentences, the codes only under
 * Provenance. Rollback readiness prints "Ready" only for the server's boolean `true` that the same
 * response does not contradict (model.ts `rollbackHead`); the check dates are FE-071.
 */
import { Link, useSearchParams } from "react-router-dom";

import { BlockerList, NotPublished, SectionPanel } from "../../blocks";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { safeInternalHref } from "../../safeHref";
import { withContext } from "../../urlState";
import type { CanaryView } from "./readCanary";
import { ACCESS_PATH, DECISIONS, FE, blockerItems, decisionReason, rollbackHead, rollbackItems } from "./model";

export function DecisionPanel() {
  return (
    <SectionPanel level={2} title="Promotion decision" aside="Via exit review">
      {DECISIONS.map((decision) => (
        <div key={decision.label} className="exec-cny-dec">
          <p className="exec-cny-dec-hint">{decision.hint}</p>
          <div className="exec-cny-dec-act">
            <DockAction label={decision.label} reason={decisionReason(decision)} accessHref={ACCESS_PATH} />
          </div>
        </div>
      ))}
      <details className="exec-cny-how">
        <summary>How promotion works</summary>
        <p>Decisions go through Canary exit review. Elapsed time alone never promotes.</p>
      </details>
    </SectionPanel>
  );
}

export function BeforeScaleUp({ view }: { view: CanaryView }) {
  const [params] = useSearchParams();
  const items = blockerItems(view);
  const env = view.envelope;
  const lineage = view.lineage;
  return (
    <BlockerList
      level={2}
      title="Before scale-up"
      items={items}
      emptyText="Not available · no reasons were published"
      provenance={
        <div className="exec-cny-prov">
          <p>
            {env === null ? "Envelope not published" : `Envelope${env.revision === null ? "" : ` rev ${env.revision}`}`}
            {env?.baseRiskProfileRevision ? ` · risk profile ${env.baseRiskProfileRevision}` : ""}
            {view.deploymentId === null ? "" : ` · deployment ${view.deploymentId}`}
          </p>
          {lineage.length > 0 ? (
            <ul className="exec-cny-lineage" aria-label="Lineage">
              {lineage.map((item) => (
                <li key={`${item.kind}-${item.value}`}>
                  {item.kind.replace(/_/g, " ").toLowerCase()}{" "}
                  {safeInternalHref(item.href) === null ? <span>{item.value}</span> : <Link to={withContext(safeInternalHref(item.href) as string, params)}>{item.value}</Link>}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      }
    />
  );
}

export function RollbackPanel({ view }: { view: CanaryView }) {
  const head = rollbackHead(view);
  return (
    <SectionPanel
      level={2}
      title="Rollback readiness"
      aside={head.kind === "flag" ? <Flag kind={head.flag} label={head.label} size="sm" /> : <NotPublished id={FE.envelope}>Readiness</NotPublished>}
    >
      <ul className="exec-cny-rb" aria-label="Rollback readiness checks">
        {rollbackItems(view).map((item) => (
          <li key={item.key} className="exec-cny-rb-item">
            <div>
              <span className="exec-cny-rb-name">{item.label}</span>
              <span className="exec-cny-rb-note">
                {item.note !== "" ? `${item.note} · ` : ""}
                {item.checkedWord} {item.checked === null ? <NotPublished id={FE.envelope} /> : item.checked}
              </span>
            </div>
            {item.status.kind === "flag" ? <Flag kind={item.status.flag} label={item.status.label} size="sm" /> : <NotPublished id={FE.envelope} compact>Status</NotPublished>}
          </li>
        ))}
      </ul>
    </SectionPanel>
  );
}
