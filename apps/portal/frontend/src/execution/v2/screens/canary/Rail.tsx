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

import { BlockerList, GapLine, NaWhy, NotPublished, SectionPanel, type GapItem } from "../../blocks";
import { DecisionGroup } from "../stage/DecisionGroup";
import { Flag } from "../../Flag";
import { safeInternalHref } from "../../safeHref";
import { withContext } from "../../urlState";
import type { CanaryView } from "./readCanary";
import type { StageAction } from "../stage/reasons";
import { useStageReason } from "../stage/StageEligibility";
import { ACCESS_PATH, DECISIONS, FE, blockerItems, decisionReason, rollbackHead, rollbackItems } from "./model";

/** The four promotion decisions as the eligibility read names them (display identifiers, not capability names). */
const DECISION_ACTION: Readonly<Record<string, StageAction>> = {
  Hold: "canary.hold",
  Reduce: "canary.reduce",
  Rollback: "canary.rollback",
  "Request scale": "canary.request_scale",
};

export function DecisionPanel() {
  // FE-068: the server's own reason for a decision that is off, when it published one; today's sentence otherwise. Text only.
  const reasonFor = useStageReason();
  return (
    <SectionPanel level={2} title="Promotion decision" aside="Via exit review">
      <DecisionGroup
        label="Promotion decisions"
        accessHref={ACCESS_PATH}
        items={DECISIONS.map((decision) => ({
          key: decision.label,
          label: decision.label,
          // What each does is its button's title; decisions go through Canary exit review and elapsed time alone never promotes.
          hint: decision.hint,
          reason: reasonFor(DECISION_ACTION[decision.label]!, decisionReason(decision)),
        }))}
      />
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
      emptyText={<NaWhy reason="No reasons were published" />}
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
  const items = rollbackItems(view);
  // A check that says nothing (no status, no date) is not a row of `Not available`: the checks are ONE line (FE-071 and the reasons in its title).
  const silent = (item: (typeof items)[number]) => item.status.kind !== "flag" && item.checked === null;
  const spoken = items.filter((item) => !silent(item));
  const gaps: GapItem[] = items
    .filter(silent)
    .map((item) => ({ label: item.label, id: FE.envelope, reason: [item.status.kind === "not-published" ? item.status.reasonCode : null, item.checkedReason].filter(Boolean).join(" · ") || null }));
  return (
    <SectionPanel level={2} title="Rollback readiness" aside={head.kind === "flag" && !(head.label === "Not available" && spoken.length === 0) ? <Flag kind={head.flag} label={head.label} size="sm" /> : undefined}>
      {spoken.length > 0 ? (
        <ul className="exec-cny-rb" aria-label="Rollback readiness checks">
          {spoken.map((item) => (
            <li key={item.key} className="exec-cny-rb-item">
              <div>
                <span className="exec-cny-rb-name">{item.label}</span>
                <span className="exec-cny-rb-note">
                  {item.note !== "" ? `${item.note} · ` : ""}
                  {item.checked === null ? null : `${item.checkedWord} ${item.checked}`}
                </span>
              </div>
              {item.status.kind === "flag" ? (
                <Flag kind={item.status.flag} label={item.status.label} size="sm" />
              ) : (
                <NotPublished id={FE.envelope} titleReason={item.status.reasonCode} />
              )}
            </li>
          ))}
        </ul>
      ) : null}
      <GapLine items={gaps} />
    </SectionPanel>
  );
}
