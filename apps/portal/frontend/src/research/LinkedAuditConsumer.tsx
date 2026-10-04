import { useState } from "react";
import { Link } from "react-router-dom";
import { shortDigest } from "./researchFormat";
import { progressHref } from "./runLinks";
import { useLinkedAudit } from "./useLinkedAudit";
import { useReport } from "./useReport";
import { coreV2 } from "./reportClient";
import type { RcWriter } from "./useReleaseCandidate";

/**
 * What the run's own report says about its final-audit target. The linked audit
 * exists for one selected parameter set only (the contract's constant); any other
 * kind is the server's typed 409 RESEARCH_FINAL_AUDIT_NOT_APPLICABLE, so the read
 * is not sent. `null` (report unread / unavailable) = ask exactly as before.
 */
export type AuditTargetKind = "SINGLE_PARAMETER_SET" | "FIXED_PARAMETER_PROFILE" | "PER_FOLD_PARAMETER_SELECTIONS" | null;
export const auditApplies = (kind: AuditTargetKind | undefined): boolean => kind == null || kind === "SINGLE_PARAMETER_SET";

/** Reads the report (cached, ETag) only to learn the target kind; for screens that have no report in hand. */
export function LinkedAuditForRun(props: Omit<Parameters<typeof LinkedAuditConsumer>[0], "targetKind" | "targetPending">) {
  const report = useReport(props.runId, { workspaceId: props.workspaceId });
  return <LinkedAuditConsumer {...props} targetKind={(report.report ? coreV2(report.report.frozen_core)?.final_audit?.audit_target_kind : null) ?? null} targetPending={report.inFlight && !report.report && !report.refusal} />;
}

/** Supplemental live custody, never an amendment to the frozen printable core/pack. */
export function LinkedAuditConsumer({ runId, workspaceId, writer, writesLocked, readOnly = false, onSettled, targetKind, targetPending = false }: {
  runId: string; workspaceId?: string; writer?: RcWriter; writesLocked?: boolean; readOnly?: boolean; onSettled?: () => void;
  targetKind?: AuditTargetKind; targetPending?: boolean;
}) {
  const applies = auditApplies(targetKind);
  const audit = useLinkedAudit(runId, { workspaceId, writer, writesLocked, onSettled, enabled: applies && !targetPending });
  const [confirm, setConfirm] = useState(false);
  if (!applies) return (
    <section className="rc-card no-print" data-linked-final-audit data-audit-state="NOT_APPLICABLE" aria-label="Linked final audit">
      <h3 className="rc-k">Linked final audit</h3>
      <p role="status">not applicable</p>
      <p className="mono" data-audit-target={targetKind ?? undefined}>{targetKind}</p>
    </section>
  );
  const { read, failure, busy } = audit;
  const mayCreate = !readOnly && read?.may_create && !writesLocked && (!failure || failure.retryable);
  const proof = read?.verification;
  return (
    <section className="rc-card no-print" data-linked-final-audit data-audit-state={failure ? "refused" : read?.state ?? "loading"} aria-label="Linked final audit">
      <h3 className="rc-k">Linked final audit</h3>
      <p role="status">{failure?.message ?? read?.state ?? "Reading audit custody…"}</p>
      {failure ? <p className="mono" data-audit-refusal>{failure.code}{failure.requestId ? ` · request ${failure.requestId}` : ""}</p> : null}
      {read ? <p className="mono" title={read.target_digest}>target {shortDigest(read.target_digest)}</p> : null}
      {proof ? <p className="mono" data-audit-proof title={`manifest ${proof.manifest_digest} · result ${proof.result_digest}`}>
        VERIFIED · {shortDigest(proof.manifest_digest)} · {shortDigest(proof.result_digest)} · optimizer trials {proof.result.optimizer_trials}
      </p> : null}
      {read?.child_run_id ? <Link to={progressHref(read.child_run_id, { workspaceId })} data-action="linked-audit-progress">Open audit progress →</Link> : null}
      {!failure || failure.retryable || failure.status === 409 ? <button type="button" className="rc-linkbtn" onClick={audit.retry} disabled={busy}>Read audit again</button> : null}
      {mayCreate ? confirm ? <>
        <p>No optimization or reselection. The original selection and frozen report stay unchanged.</p>
        <button type="button" className="rc-linkbtn" onClick={() => { setConfirm(false); audit.create(); }} disabled={busy} data-action="confirm-linked-audit">Confirm pinned audit</button>
        <button type="button" className="rc-linkbtn" onClick={() => setConfirm(false)} disabled={busy}>Cancel</button>
      </> : <button type="button" className="rc-linkbtn" onClick={() => setConfirm(true)} disabled={busy} data-action="create-linked-audit">Run pinned audit</button> : null}
      <p>Supplemental custody only — no approval, promotion or frozen-record rewrite.</p>
    </section>
  );
}
