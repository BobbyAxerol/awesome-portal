/**
 * "Record review note" (hi-fi sandbox.html rail): the one real write on the stage screens,
 * `POST /governance/sandbox/capture-note`, through the port method V1 uses (`captureSandboxNote`).
 *
 * What the form will and will not do:
 *
 * - It is open only when the SERVER says so. The capability comes from
 *   `getReviewCaptureCapabilities`; no role name decides (D10). An answer that did not come, or a
 *   workspace nobody published, is `unknown` and the form is shut with that reason, never open.
 * - The summary is 8 to 1000 characters, the server's published bound (D8). The hi-fi says 24;
 *   the server accepts 8 and the form does not invent a stricter rule the server will not enforce.
 * - A note records a review. It is not a pass, a certification or a promotion: the response
 *   contract pins `source_verdict: NOT_ASSERTED` and no Trading System change, and the panel says so.
 * - It is never optimistic. Nothing is shown as recorded until the server answered `ok`; a definite
 *   refusal (typed: denied, conflict, a 4xx) is shown as the server worded it and nothing is kept.
 * - It never says "not recorded" when it does not know. A request that threw, a 5xx or 408, or a 2xx
 *   the client could not read leaves the outcome UNKNOWN: the note may have been recorded. The key
 *   stays tied to the text, so retrying sends the same reference; an edited text gets a new reference
 *   and the form says, in plain words, that an earlier attempt may have been recorded.
 * - It is idempotent. The request key follows the INTENT (workspace, certification, version, text):
 *   pressing Record again with the same text replays under the same key (the server answers
 *   `replayed`, nothing is duplicated); an edited text is a new intent with a new key. A second
 *   click while a request is in flight is ignored (a ref, not state, so two clicks in one tick
 *   still make one request).
 * - A recorded note is followed by a re-read of the certification, because the workflow version
 *   the next note is bound to may have moved.
 */
import { useId, useRef, useState } from "react";

import type { ExecutionApi } from "../../../api/ports";
import { isOutcomeUnknownReason, type ReviewCapture } from "../../../api/reviewCapture";
import { DockAction } from "../../Drawer";
import { Flag } from "../../Flag";
import { SectionPanel } from "../../blocks";
import { captureReasonText, stageWhy } from "../stage/reasons";
import { useStageReason } from "../stage/StageEligibility";
import { NOTE_MIN, newNoteKey, noteBlock, noteFingerprint, noteLength, type NoteInputs } from "./model";
import type { NoteCapability } from "./useSandboxReads";

const ACCESS = "/administration/profile-access";
const LEAD = "A note records a review. It does not pass a step.";

type Outcome =
  | { kind: "recorded"; capture: ReviewCapture; key: string }
  | { kind: "refused"; reason: string; status: string };

/** An attempt whose outcome the client could not learn: it may be recorded under `key`. */
interface UnknownAttempt {
  fingerprint: string;
  key: string;
  reason: string;
}

export interface ReviewNoteFormProps {
  api: ExecutionApi;
  capability: NoteCapability;
  /** What the note is bound to. `workspaceId` and `workflowVersion` may be unpublished; the form then says why it is shut. */
  identity: Omit<NoteInputs, "summary">;
  /** Called after the server recorded a note, so the screen re-reads the certification. */
  onRecorded(): void;
}

function Shut({ reason, code }: { reason: string; code?: string }) {
  return (
    <>
      <div className="exec-sbx-actions">
        <DockAction label="Record review note" reason={reason} accessHref={ACCESS} />
      </div>
      {code === undefined ? null : <p className="exec-sbx-code">Server reason: {code}</p>}
    </>
  );
}

export function ReviewNoteForm({ api, capability, identity, onRecorded }: ReviewNoteFormProps) {
  // FE-068: the server's own reason when the note is shut, if it published one; today's sentence otherwise. Text only.
  const reasonFor = useStageReason();
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [unknown, setUnknown] = useState<UnknownAttempt | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const inFlight = useRef(false);
  const intent = useRef<{ fingerprint: string; key: string } | null>(null);
  const fieldId = useId();
  const hintId = useId();

  const input: NoteInputs = { ...identity, summary };
  const block = noteBlock(input);
  const count = noteLength(summary);
  const currentFingerprint = noteFingerprint(input);

  const submit = async () => {
    // A ref, not `busy`: two clicks inside one tick both see the same stale state.
    if (inFlight.current || block !== null || identity.workspaceId === null || identity.workflowVersion === null) return;
    inFlight.current = true;
    setBusy(true);
    const fingerprint = noteFingerprint(input);
    if (intent.current === null || intent.current.fingerprint !== fingerprint) intent.current = { fingerprint, key: newNoteKey() };
    const key = intent.current.key;
    try {
      const result = await api.captureSandboxNote({
        workspace_id: identity.workspaceId,
        request_key: key,
        summary: summary.trim(),
        certification_id: identity.certificationId,
        expected_workflow_version: identity.workflowVersion,
      });
      if (result.ok) {
        setOutcome({ kind: "recorded", capture: result.value, key });
        // The same reference answered: whatever was uncertain about it is settled. Another text's
        // uncertainty is not.
        setUnknown((u) => (u?.key === key ? null : u));
        // The next note is a new intent: it must not reuse this key.
        intent.current = null;
        onRecorded();
      } else if (isOutcomeUnknownReason(result.reason)) {
        setOutcome(null);
        setUnknown({ fingerprint, key, reason: result.reason });
      } else {
        setOutcome({ kind: "refused", reason: result.reason, status: result.status });
        // A definite answer for this reference settles it as not recorded.
        setUnknown((u) => (u?.key === key ? null : u));
      }
    } catch {
      setOutcome(null);
      setUnknown({ fingerprint, key, reason: "The request ended before the Portal's answer was read." });
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      if (typeof navigator !== "undefined" && typeof navigator.clipboard?.writeText === "function") {
        await navigator.clipboard.writeText(text);
        setCopied("Reference copied.");
        return;
      }
    } catch {
      /* fall through to the sentence below */
    }
    setCopied("This browser would not copy it. Select the reference above.");
  };

  let body;
  if (capability.state === "loading") {
    body = <p className="exec-sbx-note" role="status" aria-busy="true">Asking the server whether it offers this note.</p>;
  } else if (capability.state === "unknown") {
    body = <Shut reason={`Not available. ${capability.reason}`} />;
  } else if (capability.state === "unavailable") {
    // The eligibility sentence when the server published one; else the capabilities row's own code in words (BE-P7); else today's sentence.
    body = <Shut reason={reasonFor("sandbox.review_note", captureReasonText(capability.reasonCode) ?? stageWhy("notEnabled"))} code={capability.reasonCode} />;
  } else if (outcome?.kind === "recorded") {
    const { capture, key } = outcome;
    body = (
      <div className="exec-sbx-receipt" role="status">
        <p>
          <Flag kind="applied" label={capture.replayed ? "Matched an earlier note" : "Recorded"} size="sm" />
        </p>
        <p>
          {capture.replayed
            ? "This matched a note you already sent under the same key, so nothing was duplicated."
            : "The Portal recorded this review."}{" "}
          The source verdict stays NOT_ASSERTED and nothing was sent to the Trading System.
        </p>
        <dl className="exec-sbx-prov">
          <div><dt>Workflow version</dt><dd>{capture.workflow_version}</dd></div>
          <div><dt>Server reason</dt><dd>{capture.decision_reason_code}</dd></div>
          <div><dt>Reference</dt><dd>{key}</dd></div>
        </dl>
        <p className="exec-sbx-receipt-actions">
          <button type="button" className="exec-sbx-link" onClick={() => void copy(key)}>Copy reference</button>
          {" · "}
          <button
            type="button"
            className="exec-sbx-link"
            onClick={() => {
              setOutcome(null);
              setSummary("");
              setCopied(null);
            }}
          >
            Write another
          </button>
        </p>
        {copied === null ? null : <p className="exec-sbx-note" role="status">{copied}</p>}
        {unknown === null ? null : (
          <p className="exec-sbx-refusal" role="alert">
            An earlier attempt may have been recorded too (reference {unknown.key}). Check the certification history before sending that text again.
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <>
        <label className="exec-sbx-label" htmlFor={fieldId}>What you checked, and what you concluded</label>
        <textarea
          id={fieldId}
          className="exec-sbx-textarea"
          rows={4}
          value={summary}
          disabled={busy}
          aria-describedby={hintId}
          placeholder={`At least ${NOTE_MIN} characters`}
          onChange={(event) => {
            setSummary(event.target.value);
            // A refusal belongs to the text that was refused.
            if (outcome?.kind === "refused") setOutcome(null);
          }}
        />
        <div className="exec-sbx-form-foot">
          <button
            type="button"
            className="exec-dock-btn"
            data-variant="primary"
            disabled={block !== null || busy}
            aria-describedby={hintId}
            aria-busy={busy ? "true" : undefined}
            onClick={() => void submit()}
          >
            {busy ? "Recording" : "Record review note"}
          </button>
          <span id={hintId} className="exec-sbx-hint">
            {block !== null ? block.text : `${count} characters`}
          </span>
        </div>
        {outcome?.kind === "refused" ? (
          <p className="exec-sbx-refusal" role="alert">
            The server did not record this note ({outcome.status}). {outcome.reason}
          </p>
        ) : null}
        {unknown === null ? null : (
          <div className="exec-sbx-refusal" role="alert" data-outcome="unknown">
            <p>Unknown: it may have been recorded. {unknown.reason}</p>
            {unknown.fingerprint === currentFingerprint ? (
              <p>Retrying sends the same reference ({unknown.key}), so nothing is duplicated.</p>
            ) : (
              <p>
                An earlier attempt may have been recorded (reference {unknown.key}). This text is different, so it will be sent
                under a new reference and both could exist.
              </p>
            )}
          </div>
        )}
      </>
    );
  }

  return (
    <SectionPanel level={2} title="Record review note" aside="Portal evidence">
      <p className="exec-sbx-note">{LEAD}</p>
      {body}
    </SectionPanel>
  );
}
