/**
 * "Exit review" (hi-fi sandbox.html rail): the gate word, what is blocking it in plain
 * sentences, the two actions and what an exit needs.
 *
 * Neither action has a route (BR-EX-61), so both are `DockAction`s disabled with their reason
 * and a My access link. The reason for Submit names the gate when the server's gate is shut; the
 * reason for Request Sandbox exit review is the profile one. The published blocker codes never
 * sit in a sentence: they, with the certification identity, are under one Provenance disclosure.
 */
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { BlockerList, NotPublished, SectionPanel } from "../../blocks";
import { formatAsOf } from "../../boundary";
import { stageWhy } from "../stage/reasons";
import { blockers, gateOf, humanize, isDecided, submitReason } from "./model";
import type { SandboxView } from "./readSandbox";

const ACCESS = "/administration/profile-access";

/** The exit runbook the V1 screen and the hi-fi both print: policy copy, not data. */
export const EXIT_NEEDS = "Clean exposure → final sync → clean dry-run → return HALTED → all actions plan → apply → verify.";

function Provenance({ view, codes }: { view: SandboxView; codes: readonly string[] }) {
  const rows: [string, string | null][] = [
    ["Certification", view.certificationId],
    ["Workflow version", view.workflowVersion === null ? null : String(view.workflowVersion)],
    ["Workflow state", view.workflowState === null ? null : humanize(view.workflowState)],
    ["Deployment", view.deploymentId],
    ["Source integration", view.sourceIntegrationState === null ? null : humanize(view.sourceIntegrationState)],
    ["Delivery profile", view.deliveryProfile],
    ["Evidence set", view.progress?.evidenceSetHash ?? null],
    ["Policy", view.policyVersion],
    ["Formula", view.formulaVersion],
    ["Read by the Portal", view.observedAt === null ? null : formatAsOf(view.observedAt)],
  ];
  return (
    <>
      <dl className="exec-sbx-prov">
        {rows
          .filter(([, value]) => value !== null)
          .map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {codes.length > 0 ? (
        <ul className="exec-blocker-codes">
          {codes.map((code) => (
            <li key={code}>{code}</li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

export function ExitReviewPanel({ view }: { view: SandboxView }) {
  const gate = gateOf(view);
  const { items, codes } = blockers(view);
  if (isDecided(view)) {
    // A decided certification is a closed approved record: no action is offered, and the blocker code stays under Provenance.
    return (
      <SectionPanel level={2} title="Exit review" aside={<Flag kind="ok" label="Decided" size="sm" />}>
        <div className="exec-sbx-exit" data-testid="exit-closed">
          <p className="exec-sbx-note">This certification was already decided. The record is closed: there is nothing to submit and no exit review to request from here.</p>
          <details className="exec-blocker-prov">
            <summary>Provenance</summary>
            <Provenance view={view} codes={codes} />
          </details>
        </div>
      </SectionPanel>
    );
  }
  // A gate the server did not state has no chip: the empty list below already says `Not available`.
  const aside = gate === "blocked" ? <Flag kind="rejected" label="Blocked" size="sm" /> : gate === "eligible" ? <Flag kind="ok" label="Eligible" size="sm" /> : undefined;
  const empty =
    view.version === "v2" ? (
      <NotPublished id="FE-028">Gate criteria</NotPublished>
    ) : gate === "eligible" ? (
      "Nothing is blocking."
    ) : undefined;
  return (
    <SectionPanel level={2} title="Exit review" aside={aside}>
      <div className="exec-sbx-exit">
        <BlockerList
          frame="bare"
          label="What blocks the exit"
          items={items}
          emptyText={empty}
          provenance={<Provenance view={view} codes={codes} />}
        />
        <div className="exec-sbx-actions">
          <DockAction label="Submit for review" reason={submitReason(gate, stageWhy("notEnabled"))} accessHref={ACCESS} />
          <DockAction label="Request Sandbox exit review" reason={stageWhy("notEnabled")} accessHref={ACCESS} />
        </div>
        <details className="exec-blocker-prov">
          <summary>What exit needs</summary>
          <p className="exec-sbx-note">{EXIT_NEEDS}</p>
        </details>
      </div>
    </SectionPanel>
  );
}
