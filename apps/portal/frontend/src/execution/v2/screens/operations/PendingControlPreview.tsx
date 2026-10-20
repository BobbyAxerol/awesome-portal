/**
 * "Preview control" under a discovered recall (RV-10): ask what a named continuation of THIS recall would do, without doing it.
 *
 * One primary path. The control is either shut with ONE short reason, or a small form: the operation (Apply pending or Cancel
 * remaining), a reason, the five source versions as READ-ONLY text, and Preview. The versions are the counters the Portal served for
 * this recall; the form has no field for them (`buildPendingControlIntent`).
 *
 * What it will and will not do:
 * - It sends a rollback preview (`previewPendingControl`) and nothing else. It applies nothing, reserves nothing and has no submit:
 *   a submit needs this preview's digest and a fresh step-up, and stays dark. The result says so.
 * - It is mounted only where the build enables command previews (flag `command`; dark otherwise, nothing is drawn). It is shut when
 *   no workspace is named, the recall's outcome is unknown (no counters), or the discovery serves no opaque policy revision for the request
 *   to name (`policy_revision` NOT_PUBLISHED; typed gap `POLICY_REVISION_NOT_PUBLISHED`).
 * - A refusal is shown with its closed code and the Portal's own sentence, never the server's text. A relay denial says whether anything
 *   reached the source and whether a retry is allowed. A preview that does not read, or answers another operation or recall, is not shown.
 * - A request that did not complete retries under the SAME reference with the same inputs; any change (operation, reason, versions,
 *   policy) is a new reference. A second click while a request is in flight is ignored; a late answer for a recall the form has left
 *   is dropped, never shown as this one's.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { formatAsOf } from "../../boundary";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { AMOUNT_KEYS, PENDING_OPERATIONS, PENDING_VERSION_KEYS, type PendingOperation } from "../../readers/commandCurrency";
import { PENDING_PROBLEM_CODES, pendingControlWords, type PendingControlPreview as Preview } from "../../readers/pendingControlPreview";
import {
  OPERATION_LABEL, REASON_MAX, buildPendingControlIntent, intentFingerprint, newPendingKey, previewGate, reasonBlock,
  type PendingControlTarget,
} from "./pendingControlIntent";

import "../../css/pendingControl.css";

const LABEL = "Preview control";
const AMOUNT_LABEL = { requested: "Requested", applied: "Applied", pending: "Pending", cancelled: "Cancelled", rejected: "Rejected" } as const;
const VERSION_LABEL = { budget: "Budget", source: "Source", parent: "Parent", book: "Book", command: "Command" } as const;
const STATE_WORDS = {
  WAITING_ENCUMBRANCE: "Waiting for encumbrance", PARTIALLY_APPLIED_CANCELLED: "Partly applied, rest cancelled", CANCELLED: "Cancelled",
  REJECTED: "Rejected", APPLIED: "Applied",
} as const;
export const PREVIEW_ONLY_COPY = "Preview only. Nothing was applied or reserved. Sending the control is not enabled.";

type Outcome =
  | { kind: "preview"; preview: Preview }
  | { kind: "refused"; code: string; words: string; status: string }
  | { kind: "incomplete"; reason: string };

/** `CODE: words` -> the closed code and the Portal's sentence. A reason that does not start with a code has none. */
function splitReason(reason: string): { code: string | null; words: string } {
  const match = /^([A-Z][A-Z0-9_]{2,63}): (.*)$/s.exec(reason);
  return match === null ? { code: null, words: reason } : { code: match[1]!, words: match[2]! };
}

export interface PendingControlPreviewProps {
  api: ExecutionApi;
  target: PendingControlTarget;
}

export function PendingControlPreview({ api, target }: PendingControlPreviewProps) {
  const gate = previewGate(target);
  const { recall } = target;
  const scope = JSON.stringify([
    target.workspaceId, target.resource, target.environment, target.policyRevision, recall.originalRecallId,
    recall.state === "WAITING_ENCUMBRANCE" ? recall.versions : null,
  ]);

  const [operation, setOperation] = useState<PendingOperation>("APPLY_PENDING");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const inFlight = useRef(false);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const live = useRef(scope);
  const ids = { op: useId(), reason: useId(), hint: useId() };

  // Another recall, workspace, version set or policy owns none of the earlier text, reference or answer.
  useEffect(() => {
    live.current = scope;
    intent.current = null;
    setReason("");
    setOperation("APPLY_PENDING");
    setOutcome(null);
    setBusy(false);
    inFlight.current = false;
  }, [scope]);

  if (!gate.open) {
    return (
      <div className="exec-pc" data-state="shut" title={`Reason code: ${gate.code}`}>
        <DockAction label={LABEL} reason={gate.reason} />
      </div>
    );
  }

  const block = reasonBlock(reason);

  const send = async () => {
    if (inFlight.current || block !== null) return;
    // Built from the served recall at press time. The reference is minted per intent and reused only for the same one.
    const probe = buildPendingControlIntent({ target, operation, reason, idempotencyKey: newPendingKey() });
    if (!probe.ok) return setOutcome({ kind: "refused", code: probe.code, words: probe.reason, status: "not sent" });
    const fingerprint = intentFingerprint(probe.intent);
    if (intent.current === null || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: probe.intent.business_payload.idempotency_key };
    const draft = buildPendingControlIntent({ target, operation, reason, idempotencyKey: intent.current.key });
    if (!draft.ok) return setOutcome({ kind: "refused", code: draft.code, words: draft.reason, status: "not sent" });
    inFlight.current = true;
    setBusy(true);
    const mine = live.current;
    try {
      const result = await api.previewPendingControl(draft.intent);
      if (live.current !== mine) return;
      if (result.ok) {
        if (result.value.kind === "pending_control_preview") setOutcome({ kind: "preview", preview: result.value.preview });
        else setOutcome({ kind: "incomplete", reason: "The answer is a shape this build does not read, so it is not shown." });
      } else {
        const { code, words } = splitReason(result.reason);
        // A typed refusal (a closed code, or a relay denial) is the Portal's answer; anything else did not complete.
        if (result.status === "denied" || result.status === "terminal" || (code !== null && (PENDING_PROBLEM_CODES as readonly string[]).includes(code))) {
          setOutcome({ kind: "refused", code: code ?? "DENIED", words, status: result.status });
        } else {
          setOutcome({ kind: "incomplete", reason: result.reason });
        }
      }
    } catch {
      if (live.current === mine) setOutcome({ kind: "incomplete", reason: "The request ended before the Portal's answer was read." });
    } finally {
      if (live.current === mine) {
        inFlight.current = false;
        setBusy(false);
      }
    }
  };

  const edited = () => setOutcome((current) => (current?.kind === "preview" ? null : current));

  return (
    <div className="exec-pc" data-state="open">
      <label className="exec-pc-label" htmlFor={ids.op}>Control</label>
      <select
        id={ids.op}
        className="exec-pc-select"
        value={operation}
        disabled={busy}
        onChange={(event) => { setOperation(event.target.value as PendingOperation); edited(); }}
      >
        {PENDING_OPERATIONS.map((op) => <option key={op} value={op}>{OPERATION_LABEL[op]}</option>)}
      </select>

      <dl className="exec-pc-versions" aria-label="Versions the preview is checked against">
        {PENDING_VERSION_KEYS.map((key) => (
          <div key={key}>
            <dt>{VERSION_LABEL[key]} version</dt>
            <dd className="exec-ops-mono">{recall.state === "WAITING_ENCUMBRANCE" ? recall.versions[key] : ""}</dd>
          </div>
        ))}
      </dl>

      <label className="exec-pc-label" htmlFor={ids.reason}>Reason</label>
      <textarea
        id={ids.reason}
        className="exec-pc-textarea"
        rows={2}
        value={reason}
        maxLength={REASON_MAX * 2}
        disabled={busy}
        aria-describedby={ids.hint}
        onChange={(event) => { setReason(event.target.value); edited(); }}
      />
      <div className="exec-pc-foot">
        <button
          type="button"
          className="exec-dock-btn"
          data-variant="primary"
          disabled={block !== null || busy}
          aria-describedby={ids.hint}
          aria-busy={busy ? "true" : undefined}
          onClick={() => void send()}
        >
          {busy ? "Previewing" : LABEL}
        </button>
        <span id={ids.hint} className="exec-pc-hint">{block}</span>
      </div>

      {outcome?.kind === "refused" ? (
        <p className="exec-pc-refusal" role="alert" data-outcome="refused">
          <span className="exec-ops-mono">{outcome.code}</span> {outcome.words}
        </p>
      ) : null}
      {outcome?.kind === "incomplete" ? (
        <p className="exec-pc-refusal" role="alert" data-outcome="incomplete">
          The preview did not complete: {outcome.reason} It sends nothing, so it can be asked again.
        </p>
      ) : null}
      {outcome?.kind === "preview" ? <PreviewResult preview={outcome.preview} /> : null}
    </div>
  );
}

function PreviewResult({ preview }: { preview: Preview }) {
  if (!preview.allowed) {
    return (
      <div className="exec-pc-result" role="alert" data-outcome="not-allowed">
        <p><Flag kind="rejected" label="Preview not allowed" size="sm" /></p>
        <p><span className="exec-ops-mono">{preview.reasonCode}</span> {pendingControlWords(preview.reasonCode)}</p>
        <p className="exec-pc-note">{PREVIEW_ONLY_COPY}</p>
      </div>
    );
  }
  const p = preview.prediction;
  return (
    <div className="exec-pc-result" role="status" data-outcome="allowed">
      <p><Flag kind="ok" label="Preview allowed" size="sm" /></p>
      <dl className="exec-ops-facts">
        <dt>Would become</dt>
        <dd>{STATE_WORDS[p.state]}</dd>
        <dt>Change</dt>
        <dd><span className="exec-ops-mono" title={p.delta.fullText}>{p.delta.fullText}</span></dd>
        {AMOUNT_KEYS.map((key) => (
          <PairRow key={key} label={AMOUNT_LABEL[key]} value={<span className="exec-ops-mono" title={p.amounts[key].fullText}>{p.amounts[key].fullText}</span>} />
        ))}
        <dt>Blockers</dt>
        <dd>
          {p.blockers.length === 0 ? "None stated" : (
            <ul className="exec-pc-blockers">{p.blockers.map((blocker, index) => <li key={`${index}:${blocker}`}>{blocker}</li>)}</ul>
          )}
        </dd>
        <dt>Digest</dt>
        <dd><span className="exec-ops-mono">{preview.previewDigest}</span></dd>
        <dt>Expires</dt>
        <dd><time dateTime={new Date(preview.expiresAt).toISOString()}>{formatAsOf(preview.expiresAt)}</time></dd>
        <dt>Profile</dt>
        <dd><span className="exec-ops-mono">{preview.profileRef}</span></dd>
      </dl>
      <details className="exec-pc-after">
        <summary>Versions after</summary>
        <dl className="exec-ops-facts">
          {PENDING_VERSION_KEYS.map((key) => <PairRow key={key} label={`${VERSION_LABEL[key]} version`} value={<span className="exec-ops-mono">{p.versions[key]}</span>} />)}
        </dl>
      </details>
      <p className="exec-pc-note">{PREVIEW_ONLY_COPY}</p>
    </div>
  );
}

function PairRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  );
}
