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
import { IDLE_EXTRA, sectionOf, type ExtraState } from "./evidenceExtra";
import { useEffect, useId, useState, type ReactNode } from "react";

import type { ConditionRow, ExecutionApi } from "../../../api/ports";
import type { ReviewCaptureCapabilities } from "../../../api/reviewCapture";
import type { DecidedRow } from "../../../screens/ApprovalInbox";
import { formatAsOf } from "../../boundary";
import { DockAction } from "../../Drawer";
import { CodeName, NotAvailableLine, QuietIdsWhy } from "../../blocks";
import { Flag } from "../../Flag";
import type { ActorsV2, LatestOperationV2, SectionV2 } from "../../readers/governanceParents";
import type { InboxRowV2 } from "./inboxRowV2";
import {
  actorText,
  instantText,
  isYours,
  NOT_PUBLISHED,
  PREVIEW_REASON,
  quorumCells,
  quorumText,
  separationOfDuty,
  separationOfDutyV2,
  summarizeEvidence,
  type EvidenceKind,
  type Principal,
} from "./laneModel";
import type { EvidenceState } from "./EvidenceFrame";
import { StepUpBlock, type StepUpBlockProps } from "./StepUp";
import { captureReasonText } from "../stage/reasons";

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
  return <span className="exec-ck-np"><QuietIdsWhy text={text} /></span>;
}

/** A stored actor id, or the absence as the server gave it (a section withheld for this viewer is still FE-030's datum). */
function ActorCell({ actors, pick }: { actors: SectionV2<ActorsV2> | null; pick: (a: ActorsV2) => { id: string | null; isViewer: boolean | null } }) {
  if (actors === null) return <Np text={NOT_PUBLISHED.decisionCall} />;
  if (actors.availability !== "AVAILABLE") return <Np text={`${NOT_PUBLISHED.decisionCall} · ${actors.reasonCode}`} />;
  const { id, isViewer } = pick(actors);
  return id === null ? <>Not decided yet</> : <span className="exec-ck-id">{actorText(id, isViewer)}</span>;
}

const STORED_STATUS_WORD: Readonly<Record<LatestOperationV2["storedStatus"], string>> = { PLANNED: "planned", APPLIED: "applied", EXPIRED: "expired" };

/**
 * The approval to operation link: the newest recorded Portal plan for this
 * approval. Its stored status is the Portal's own record, not Trading System
 * acceptance, and not whether the plan can still be applied.
 */
function LatestPlanCell({ latest }: { latest: SectionV2<LatestOperationV2> | null }) {
  if (latest === null) return <Np text={NOT_PUBLISHED.decisionCall} />;
  if (latest.availability === "AVAILABLE") {
    return (
      <>
        <span className="exec-ck-id">{latest.operationId}</span>
        {` · stored ${STORED_STATUS_WORD[latest.storedStatus]} · created ${formatAsOf(latest.createdAt)}`}
      </>
    );
  }
  if (latest.reasonCode === "NO_RECORDED_PORTAL_OPERATION") return <>None recorded</>;
  if (latest.reasonCode === "LATEST_RECORDED_OPERATION_NOT_PUBLIC") return <Np text={`Not published · ${latest.reasonCode}`} />;
  return <Np text={`${NOT_PUBLISHED.decisionCall} · ${latest.reasonCode}`} />;
}

export interface RailProps {
  api: ExecutionApi;
  target: RailTarget | null;
  evidence: EvidenceState;
  principal: Principal;
  workspaceId?: string;
  /**
   * The step-up target of this rail's decision: the workspace, environment, resource and action whose batch row the block reads
   * (FE-015/060). Absent (today: no cockpit decision names a capital action) the rail keeps its informational "Not published" block.
   */
  stepUp?: Omit<StepUpBlockProps, "api">;
  /** The approval evidence read (WP-K): the receipt preview's "What changes" sentence. Absent keeps the typed absence. */
  extra?: ExtraState;
}

export function Rail({ api, target, evidence, principal, workspaceId, stepUp, extra = IDLE_EXTRA }: RailProps) {
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
  // A V2 parent that publishes its actors speaks for itself; a queue row's creator (compared with the signed-in person) still comes first.
  const v2 = evidence.status === "ready" && (evidence.data.kind === "r2v2" || evidence.data.kind === "exitv2" || evidence.data.kind === "livev2");
  const sod = creator === null && summary.actors !== null && summary.actors.availability === "AVAILABLE"
    ? separationOfDutyV2(summary.actors)
    : separationOfDuty({ creator, serverSod: summary.serverSod, principal });
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

  // The receipt preview's rows (hi-fi `.rc`): the title of the request, the signed-in person, and what an approval would count as.
  const requestTitle = target.row?.subject ?? target.waiver?.label ?? null;
  const youText = principal.username ?? principal.userIds[0] ?? "Not named by the session";
  // "Counts as" is the published count plus this one approval, said conditionally: the server decides whether it is accepted.
  // Nothing is claimed for a waiver (no quorum), a Live gate (closed), your own request (you cannot decide it) or a count not published.
  const countsAs: ReactNode = waiver
    ? "Not counted: a waiver is not an approval"
    : target.kind === "live"
      ? "Not counted: Live decisions are closed on this build"
      : sod.kind === "violation"
        ? "Not counted: you cannot decide this request"
        : met !== null && required !== null
          ? `If approved: ${met + 1} of ${required} approvals`
          : <Np text={NOT_PUBLISHED.approvers} />;

  // "What changes": the source's own sentence (WP-K receipt_preview); nothing is composed here. Not offered for a waiver (no approval is counted).
  const preview = waiver ? null : sectionOf(extra, (e) => e.receipt);
  const previewRow: { label: string; value: ReactNode } | null = preview !== null && preview.kind === "value"
    ? { label: "What changes", value: <span data-testid="ck-what-changes">{preview.value.whatChanges}</span> }
    : null;

  return (
    <div className="exec-ck-railbody">
      <section className="exec-ck-panel" aria-label="Decision controls">
        <div className="exec-ck-ph">
          <h3 className="exec-ck-pt">Decision</h3>
          <span className="exec-ck-pr">{policy ? `Policy ${policy}` : <Np text={`Policy ${NOT_PUBLISHED.policy}`} />}</span>
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

          {spec.stepUp && stepUp !== undefined ? (
            <StepUpBlock api={api} {...stepUp} />
          ) : spec.stepUp ? (
            <div className="exec-ck-stepup" role="group" aria-label="Step-up confirmation">
              <Flag kind="approval" label="Step-up" size="sm" />
              <p>Requirement: <Np text={NOT_PUBLISHED.stepUp} /></p>
            </div>
          ) : null}

          <div>
            <label className="exec-ck-label" htmlFor={noteId}>Note</label>
            <textarea id={noteId} className="exec-ck-textarea" rows={2} disabled aria-describedby={noteReasonId} placeholder="Recorded with the decision" />
            <p id={noteReasonId} className="exec-blk-sr">{PREVIEW_REASON}</p>
          </div>

          {spec.note ? <p className="exec-ck-note">{spec.note}</p> : null}

          <div className="exec-ck-actions">
            <DockAction label={spec.primary} variant="primary" reason={PREVIEW_REASON} quietReason keyHint="A" />
            {spec.others.length > 0 ? (
              <>
                <DockAction label="Other decisions" reason={PREVIEW_REASON} quietReason />
                <p className="exec-ck-note">Would offer: {spec.others.join(", ")}</p>
              </>
            ) : null}
            {own && !waiver ? <DockAction label="Withdraw" reason={PREVIEW_REASON} quietReason /> : null}
          </div>
        </div>
      </section>

      <section className="exec-ck-panel" aria-label="Receipt" data-recorded={decided ? "true" : undefined}>
        <div className="exec-ck-ph">
          <h3 className="exec-ck-pt">{decided ? "Recorded" : "Preview · not recorded"}</h3>
          {decided ? <span className="exec-ck-pr">Read from the decision history</span> : null}
        </div>
        <ReceiptRows
          rows={[
            { label: "Decision", value: decided ? decided.outcome.replace(/_/g, " ").toLowerCase() : "None chosen" },
            ...(decided ? [{ label: "By", value: decided.by }, { label: "At", value: decided.at }] : []),
            { label: "Request", value: <><span className="exec-ck-id">{target.id}</span>{requestTitle ? ` · ${requestTitle}` : ""}</> },
            // The signed-in person, as the session names them; their role preset is not published (FE-015), so none is printed.
            ...(decided ? [] : [{ label: "You", value: youText }]),
            ...(decided ? [] : [{ label: "Counts as", value: countsAs }]),
            ...(decided ? [] : [previewRow ?? { label: "What changes", value: <Np text={NOT_PUBLISHED.decisionCall} /> }]),
            ...(v2
              ? [
                  { label: "Requested by", value: <ActorCell actors={summary.actors} pick={(a) => ({ id: a.requesterUserId, isViewer: a.viewerIsRequester })} /> },
                  { label: "Created by", value: <ActorCell actors={summary.actors} pick={(a) => ({ id: a.artifactCreatorUserId, isViewer: a.viewerIsArtifactCreator })} /> },
                  { label: "Latest plan", value: <LatestPlanCell latest={summary.latestOperation} /> },
                ]
              : []),
          ]}
        />
        <NotAvailableLine
          className="exec-ck-note exec-ck-pad"
          facts={["Ladder", "Call", "Receipt ref"].map((label) => ({ label, id: "FE-030" as const }))}
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
                  // A code the stage dictionary knows (BE-P7: the same classes as the eligibility) reads in words; the code as sent
                  // stays in hidden text (known) or behind a disclosure (any other), never beside the words.
                  value: action.state === "AVAILABLE" ? (
                    "Available"
                  ) : action.reason_code === null || action.reason_code === undefined ? (
                    "Unavailable · no reason given"
                  ) : captureReasonText(action.reason_code) !== null ? (
                    <>
                      Unavailable · {captureReasonText(action.reason_code)}
                      <span className="exec-blk-sr"> ({action.reason_code})</span>
                    </>
                  ) : (
                    <>
                      Unavailable · <CodeName code={action.reason_code} />
                    </>
                  ),
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
