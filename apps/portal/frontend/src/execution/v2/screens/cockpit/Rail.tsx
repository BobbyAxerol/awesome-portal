/**
 * Decision rail of the Approvals cockpit.
 *
 * Decision writes are UXM-09 and not part of S1: every decision control here is
 * a `DockAction` disabled with the same reason, and nothing in this file can
 * call a plan, an apply or any POST (the only port call is the read-only
 * capture-capabilities list). The rail still tells the reader what they need to
 * know to decide elsewhere: who created the request, how many approvers it has,
 * and what the server has recorded.
 */
import { useEffect, useId, useState, type ReactNode } from "react";

import type { ConditionRow, ExecutionApi } from "../../../api/ports";
import type { ReviewCaptureCapabilities } from "../../../api/reviewCapture";
import type { DecidedRow } from "../../../screens/ApprovalInbox";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import type { InboxRowV2 } from "./inboxRowV2";
import {
  instantText,
  isYours,
  NOT_PUBLISHED,
  PREVIEW_REASON,
  quorumCells,
  quorumText,
  separationOfDuty,
  summarizeEvidence,
  type EvidenceKind,
  type Principal,
} from "./laneModel";
import type { EvidenceState } from "./EvidenceFrame";

export interface RailTarget {
  kind: EvidenceKind | "waiver";
  id: string;
  row: InboxRowV2 | null;
  decided: DecidedRow | null;
  waiver: ConditionRow | null;
}

interface DecisionSpec {
  primary: string;
  others: readonly string[];
  stepUp: boolean;
  note: string | null;
}

const DECISIONS: Readonly<Record<EvidenceKind | "waiver", DecisionSpec>> = {
  r1: { primary: "Approve", others: ["Approve with a condition", "Request changes", "Deny"], stepUp: false, note: null },
  r2: { primary: "Approve", others: ["Approve with a condition", "Request changes", "Deny"], stepUp: true, note: null },
  exit: { primary: "Approve promotion", others: ["Extend observation 14 days", "Hold at current stage"], stepUp: false, note: null },
  live: { primary: "Approve", others: [], stepUp: true, note: "Live decisions are closed on this build." },
  waiver: { primary: "Extend 14 days", others: ["Close · condition met", "Let it lapse"], stepUp: false, note: null },
};

const ACTION_LABEL: Readonly<Record<string, string>> = {
  R2_CREATE: "Capture R2 review",
  PAPER_EXIT_CREATE: "Create exit review",
  SANDBOX_NOTE: "Sandbox note",
  R2_EXECUTION_GRANT: "R2 execution grant",
  PAPER_EXIT_PROMOTE: "Exit promotion",
  SANDBOX_CERTIFY_SOURCE: "Sandbox certify source",
};

type CapabilityRead =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; actions: ReviewCaptureCapabilities["actions"] }
  | { status: "failed"; reason: string };

/** The one read the rail makes. It lists which Portal actions the server would offer; it records nothing. */
function useCaptureCapabilities(api: ExecutionApi, workspaceId: string | null): CapabilityRead {
  const [state, setState] = useState<CapabilityRead>({ status: "idle" });
  useEffect(() => {
    if (workspaceId === null) {
      setState({ status: "idle" });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    void api
      .getReviewCaptureCapabilities(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setState(result.ok ? { status: "ready", actions: result.value.actions } : { status: "failed", reason: result.reason });
      })
      .catch(() => {
        if (!cancelled) setState({ status: "failed", reason: "The read did not complete." });
      });
    return () => {
      cancelled = true;
    };
  }, [api, workspaceId]);
  return state;
}

function ReceiptRows({ rows }: { rows: readonly { label: string; value: ReactNode }[] }) {
  return (
    <table className="exec-ck-kv">
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Np({ text }: { text: string }) {
  return <span className="exec-ck-np">{text}</span>;
}

export interface RailProps {
  api: ExecutionApi;
  target: RailTarget | null;
  evidence: EvidenceState;
  principal: Principal;
  workspaceId?: string;
}

export function Rail({ api, target, evidence, principal, workspaceId }: RailProps) {
  const noteId = useId();
  const noteReasonId = useId();
  const summary = summarizeEvidence(evidence.status === "ready" ? evidence.data : null);
  const capabilityWorkspace = summary.workspaceId ?? workspaceId ?? null;
  const capabilities = useCaptureCapabilities(api, target !== null && target.kind !== "waiver" ? capabilityWorkspace : null);

  if (target === null) {
    return (
      <div className="exec-ck-railbody">
        <section className="exec-ck-panel" aria-label="Decision controls">
          <div className="exec-ck-ph"><h3 className="exec-ck-pt">Decision</h3></div>
          <div className="exec-ck-pad">Select a request to see who created it, its approvers and the recorded decision.</div>
        </section>
      </div>
    );
  }

  const spec = DECISIONS[target.kind];
  const waiver = target.waiver;
  const row = target.row;
  const creator = row?.creator ?? summary.creator;
  const sod = separationOfDuty({ creator, serverSod: summary.serverSod, principal });
  const met = summary.quorumMet ?? row?.quorumMet ?? null;
  const required = summary.quorumRequired ?? row?.quorumRequired ?? null;
  const cells = quorumCells(met, required);
  const policy = summary.policyVersion ?? row?.policyVersion ?? null;
  const own = row !== null && isYours(row, principal);

  const decided = target.decided
    ? { outcome: target.decided.outcome, by: target.decided.decidedBy, at: instantText(target.decided.decidedAt) ?? target.decided.decidedAt, policy: target.decided.policyVersion }
    : summary.decided
      ? { outcome: summary.decided.outcome, by: summary.decided.by, at: instantText(summary.decided.at) ?? summary.decided.at, policy }
      : null;

  return (
    <div className="exec-ck-railbody">
      <section className="exec-ck-panel" aria-label="Decision controls">
        <div className="exec-ck-ph">
          <h3 className="exec-ck-pt">Decision</h3>
          <span className="exec-ck-pr">{policy ? `Policy ${policy}` : <Np text="Policy Not published" />}</span>
        </div>
        <div className="exec-ck-bd">
          {waiver ? (
            <div className="exec-ck-sod" data-state="info">
              Waiver owner {waiver.owner}
              {principal.username !== null && waiver.owner === principal.username ? " (you)" : ""}. A waiver has no approver quorum.
            </div>
          ) : (
            <div className="exec-ck-sod" data-state={sod.kind}>{sod.text}</div>
          )}

          {waiver ? null : (
            <div className="exec-ck-quorum">
              <span>Quorum</span>
              {cells.length > 0 ? (
                <span className="exec-ck-cells" aria-hidden="true">
                  {cells.map((filled, index) => <i key={index} data-filled={filled ? "true" : undefined} />)}
                </span>
              ) : null}
              <span>{quorumText(met, required) ?? "Approvers not published"}</span>
            </div>
          )}

          {spec.stepUp ? (
            <div className="exec-ck-stepup" role="group" aria-label="Step-up confirmation">
              <Flag kind="approval" label="Step-up" size="sm" />
              <p>Requirement: <Np text={NOT_PUBLISHED.stepUp} /></p>
              <p className="exec-ck-note">Informational only. Nothing is asked or sent in this preview.</p>
            </div>
          ) : null}

          <div>
            <label className="exec-ck-label" htmlFor={noteId}>Note</label>
            <textarea id={noteId} className="exec-ck-textarea" rows={2} disabled aria-describedby={noteReasonId} placeholder="Recorded with the decision" />
            <p id={noteReasonId} className="exec-ck-note">{PREVIEW_REASON}</p>
          </div>

          {spec.note ? <p className="exec-ck-note">{spec.note}</p> : null}

          <div className="exec-ck-actions">
            <DockAction label={spec.primary} variant="primary" reason={PREVIEW_REASON} />
            {spec.others.length > 0 ? (
              <>
                <DockAction label="Other decisions" reason={PREVIEW_REASON} />
                <p className="exec-ck-note">Would offer: {spec.others.join(", ")}</p>
              </>
            ) : null}
            {own && !waiver ? <DockAction label="Withdraw" reason={PREVIEW_REASON} /> : null}
          </div>
        </div>
      </section>

      <section className="exec-ck-panel" aria-label="Receipt" data-recorded={decided ? "true" : undefined}>
        <div className="exec-ck-ph">
          <h3 className="exec-ck-pt">{decided ? "Recorded" : "Receipt"}</h3>
          <span className="exec-ck-pr">{decided ? "Read from the decision history" : PREVIEW_REASON}</span>
        </div>
        <ReceiptRows
          rows={[
            { label: "Decision", value: decided ? decided.outcome.replace(/_/g, " ").toLowerCase() : "None recorded" },
            ...(decided ? [{ label: "By", value: decided.by }, { label: "At", value: decided.at }] : []),
            { label: "Request", value: <span className="exec-ck-id">{target.id}</span> },
            { label: "Ladder", value: <Np text={NOT_PUBLISHED.decisionCall} /> },
            { label: "Call", value: <Np text={NOT_PUBLISHED.decisionCall} /> },
            { label: "Receipt ref", value: <Np text={NOT_PUBLISHED.decisionCall} /> },
            { label: "What changes", value: <Np text={NOT_PUBLISHED.decisionCall} /> },
          ]}
        />
      </section>

      {target.kind === "waiver" ? null : (
        <details className="exec-ck-panel exec-ck-details">
          <summary>What the server offers</summary>
          <div className="exec-ck-pad">
            {capabilities.status === "ready" ? (
              <ReceiptRows
                rows={capabilities.actions.map((action) => ({
                  label: ACTION_LABEL[action.id] ?? action.id,
                  value: action.state === "AVAILABLE" ? "Available" : `Unavailable · ${action.reason_code ?? "no reason given"}`,
                }))}
              />
            ) : capabilities.status === "failed" ? (
              <span>Not read: {capabilities.reason}</span>
            ) : capabilities.status === "loading" ? (
              <span>Reading</span>
            ) : (
              <span className="exec-ck-np">Workspace not published on this review</span>
            )}
          </div>
        </details>
      )}

    </div>
  );
}
