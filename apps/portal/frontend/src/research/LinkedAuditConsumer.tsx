import { useState } from "react";
import { Link } from "react-router-dom";
import { shortDigest } from "./researchFormat";
import { progressHref } from "./runLinks";
import { useLinkedAudit } from "./useLinkedAudit";
import type { RcWriter } from "./useReleaseCandidate";

/** Supplemental live custody, never an amendment to the frozen printable core/pack. */
export function LinkedAuditConsumer({ runId, workspaceId, writer, writesLocked, readOnly = false, onSettled }: {
  runId: string; workspaceId?: string; writer?: RcWriter; writesLocked?: boolean; readOnly?: boolean; onSettled?: () => void;
}) {
  const audit = useLinkedAudit(runId, { workspaceId, writer, writesLocked, onSettled });
  const [confirm, setConfirm] = useState(false);
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
