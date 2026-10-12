/**
 * New approval request — the loop's entry door, now the N29 consumer (codex
 * handoff 2026-08-31): submit goes through `POST /governance/approvals`
 * (`governance.approval-create-request.v1`) and the screen binds the
 * response's five truths — created, replayed, duplicate-with-existing-id,
 * typed failure, offline.
 *
 * Request-key discipline (N29 §2): a key is minted per submit INTENT and
 * survives only to retry the SAME payload — edit anything and the next submit
 * is a new intent with a new key. Double-click cannot create two approvals:
 * the button is disabled in flight and a landed submit replays by key.
 *
 * The artifact digest is never read from this form (N29 §3): the server pins
 * it from its own run registry, and the screen says so where the digest used
 * to be.
 */
import { useRef, useState } from "react";

import type { ApprovalCreateOutcome, ExecutionApi } from "../api/ports";
import { ExecutionDecisionBar } from "../components/decisionBar";
import { useRunSuggestions, type RunOption } from "../runSuggestions";
import { ChoiceMenu } from "../components/choiceMenu";

const MIN_SUMMARY = 8;

/** The decision bar's reasons block, which the submit button points at when it is dead. */
const LOCK_REASON_ID = "new-approval-lock-reason";

/**
 * This screen used to offer three alphas by name — "Carry v3.2", "Grid v2.1",
 * "VnMomo v0.9" — with two evidence runs and two methodology claims beside
 * them. They were the reviewed cast, and the comment here said a picks endpoint
 * did not exist yet.
 *
 * On dev it does: the alpha fleet publishes 206 alphas, and not one of them is
 * called any of those three. So the entry form to the whole governance loop was
 * offering an operator a choice between records that do not exist, and the only
 * way to find that out was to submit and be refused.
 *
 * The alpha list now comes from the fleet the server publishes. Runs and claims
 * have no published candidate list, so they are typed rather than invented, and
 * the screen says so — the POST remains the validator, which is what the old
 * comment correctly promised and the fabricated options quietly undermined.
 */
export interface ApprovalAlphaOption {
  id: string;
  label: string;
}

function mintKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `req_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function NewApprovalRequestScreen({
  onSubmit,
  outcome,
  submitting,
  onReset,
  alphaOptions = [],
  alphaOptionsReason = null,
  runOptions = [],
  runOptionsReason = null,
  initial,
}: {
  /** The container's port call. The screen never touches fetch. */
  onSubmit: (fields: { alphaId: string; evidenceRunId: string; methodologyClaimId: string; summary: string }) => void;
  outcome: ApprovalCreateOutcome | null;
  submitting: boolean;
  onReset: () => void;
  /** The alphas the fleet actually publishes. Empty means the screen asks for an id instead of offering one. */
  alphaOptions?: readonly ApprovalAlphaOption[];
  /** Why the list is empty, in the server's words, shown where the list would have been. */
  alphaOptionsReason?: string | null;
  /** Completed Research runs the reader may pick; picking one fills the alpha and the run together. */
  runOptions?: readonly RunOption[];
  runOptionsReason?: string | null;
  /** Ids a link from Research already named (`?alpha=&run=&claim=`). */
  initial?: { alphaId?: string; runId?: string; claimId?: string };
}) {
  const [alphaId, setAlphaId] = useState<string>(initial?.alphaId ?? "");
  const [runId, setRunId] = useState<string>(initial?.runId ?? "");
  const [claimId, setClaimId] = useState<string>(initial?.claimId ?? "");
  const [summary, setSummary] = useState("");

  const alpha = alphaOptions.find((a) => a.id === alphaId) ?? null;
  const pickedRun = runOptions.find((o) => o.runId === runId) ?? null;
  // Every field the server needs, and none of them guessed on the reader's behalf.
  const ready = summary.trim().length >= MIN_SUMMARY
    && alphaId.trim().length > 0 && runId.trim().length > 0 && claimId.trim().length > 0;

  /*
   * §3.5: the button names the blocker it actually has. Adding the three ids to
   * `ready` without this would have left it saying "summary needs at least …"
   * while the real obstacle was an empty alpha — a dead control explaining the
   * wrong thing is worse than one explaining nothing.
   */
  const missing = [
    alphaId.trim() ? null : "an alpha",
    runId.trim() ? null : "an evidence run",
    claimId.trim() ? null : "a methodology claim",
  ].filter(Boolean) as string[];
  const blocker = missing.length > 0
    ? `Still needed: ${missing.join(", ")}.`
    : `summary needs at least ${MIN_SUMMARY} characters — it is the reviewer's first sentence`;
  const settled = outcome !== null && (outcome.kind === "created" || outcome.kind === "replayed");

  return (
    <section className="exec-gate exec-gov" aria-label="New approval request" data-hifi-exact="new-request-entry">
      <header className="exec-nr-head">
        <p className="exec-gate-kicker">Loop entry · Research → Gate R1</p>
        <h1 className="exec-gov-h1">New approval request</h1>
        <p className="exec-nr-lede" role="note" data-entry-hint>
          Usually this starts in Research: publish a Release Candidate from a frozen run and its R1 request is created for you.
          This form is for a request that did not come from one. <a href="/research/quantbt/runs">Run Library →</a>
        </p>
        <ol className="exec-gf-steps exec-nr-steps" aria-label="Where this request sits in the loop">
          <li data-state="current" aria-current="step">Declare · you, now</li>
          <li data-state="ahead">R1 · a quant reviewer, not you</li>
          <li data-state="ahead">R2 · capital, only after R1 approves</li>
        </ol>
      </header>

      {settled && (outcome.kind === "created" || outcome.kind === "replayed") ? (
        <div className="exec-gov-panel">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">
              {outcome.kind === "replayed" ? "Request replayed — same intent, no second approval" : "Request created"}
            </span>
            {outcome.kind === "replayed" ? <span className="exec-gov-chip" data-fill="good">REPLAYED</span> : <span className="exec-gov-chip" data-fill="good">PENDING</span>}
          </div>
          <div className="exec-gov-kv">
            <span className="exec-gov-k">approval</span>
            <span className="exec-gov-v">{outcome.approvalId} · R1 · {outcome.subjectLabel} · {outcome.status}</span>
            <span className="exec-gov-k">SLA</span>
            <span className="exec-gov-v">{outcome.slaDueAt ? `review due ${outcome.slaDueAt.slice(0, 16).replace("T", " ")} UTC` : "SLA not stated"}{outcome.quorumRequired !== null ? ` · quorum ${outcome.quorumRequired}` : ""}</span>
            <span className="exec-gov-k">policy</span>
            <span className="exec-gov-v">{outcome.policyVersion ?? "not stated"}</span>
            <span className="exec-gov-k">separation of duty</span>
            <span className="exec-gov-v">
              {outcome.requester ? `${outcome.requester} is recorded as requester — ` : ""}the requester can never
              approve; the Inbox dims the row for you
            </span>
          </div>
          <p className="exec-gate-note">
            The row is PENDING in the <a href="/governance/approvals">Approval Inbox</a> now
            {outcome.kind === "replayed" ? " — this submit matched an earlier one by request key, so nothing was duplicated" : ""}.
          </p>
        </div>
      ) : (
        <div className="exec-nr">
          <div className="exec-nr-form exec-gov-panel">
            <div className="exec-nr-field">
              <span className="exec-role-th">Evidence run</span>
              <span className="exec-nr-help">The completed Research run this request rests on.</span>
              {runOptions.length > 0 ? (
                <ChoiceMenu
                  label="Pick a completed run from Research"
                  value={runOptions.some((o) => o.runId === runId) ? runId : ""}
                  disabled={submitting}
                  placeholder="Pick a completed run"
                  variant="field"
                  options={runOptions.map((o) => ({
                    value: o.runId,
                    label: o.alphaName ?? o.alphaId,
                    hint: `${o.runId.slice(0, 22)}…${o.createdMs ? ` · ${new Date(o.createdMs).toISOString().slice(0, 10)}` : ""}`,
                    icon: <i className="exec-mark" data-tone={o.claims && o.claims.length > 0 ? undefined : "mute"} title={o.claims && o.claims.length > 0 ? "completed · claim listed" : "completed · no claim listed"} />,
                  }))}
                  onChange={(next) => {
                    const picked = runOptions.find((o) => o.runId === next);
                    if (!picked) return;
                    setRunId(picked.runId);
                    setAlphaId(picked.alphaId);
                    // a claim the list named is a choice the server can verify; exactly one listed is taken, several or none are left to the reader
                    setClaimId(picked.claims && picked.claims.length === 1 ? picked.claims[0]!.id : "");
                  }}
                />
              ) : runOptionsReason ? (
                <span className="exec-nr-help">{runOptionsReason}</span>
              ) : null}
            </div>
            {alphaOptions.length > 0 ? (
              <div className="exec-nr-field">
                <span className="exec-role-th">Alpha</span>
                <ChoiceMenu
                  label="Alpha (from the alpha registry)"
                  value={alphaId}
                  disabled={submitting}
                  placeholder="Pick an alpha"
                  title={submitting ? "The request is in flight." : undefined}
                  options={alphaOptions.map((o) => ({ value: o.id, label: o.label }))}
                  onChange={setAlphaId}
                />
              </div>
            ) : null}
            <div className="exec-nr-field">
              <span className="exec-role-th">Methodology claim</span>
              {pickedRun?.claims && pickedRun.claims.length > 1 ? (
                <ChoiceMenu
                  label="Pick a methodology claim for this run"
                  value={pickedRun.claims.some((c) => c.id === claimId) ? claimId : ""}
                  disabled={submitting}
                  placeholder="Pick a claim"
                  variant="field"
                  options={pickedRun.claims.map((c) => ({ value: c.id, label: c.id.length > 28 ? `${c.id.slice(0, 18)}…${c.id.slice(-6)}` : c.id, hint: [c.grade, c.state].filter(Boolean).join(" · ") || undefined }))}
                  onChange={setClaimId}
                />
              ) : pickedRun?.claims?.length === 1 ? (
                <span className="exec-nr-claim" data-claims-note title={claimId}>
                  <span className="exec-nr-claim-id">{claimId.length > 28 ? `${claimId.slice(0, 18)}…${claimId.slice(-6)}` : claimId}</span>
                  <span className="exec-nr-help">the only claim the Run Library lists for this run</span>
                </span>
              ) : pickedRun && pickedRun.claims !== undefined ? (
                <span className="exec-nr-help" data-claims-note>
                  {pickedRun.claims === null ? `The Run Library cannot list claims for this run (${pickedRun.claimsReason ?? "not published"}) — type the id below.` : "The Run Library lists no eligible claim for this run; the server will refuse a typed one that is not eligible."}
                </span>
              ) : (
                <span className="exec-nr-help">Pick a run first, or type the claim id below.</span>
              )}
            </div>
            {alpha && alpha.label.includes("already in the loop") ? (
              <p className="exec-gate-note" data-tone="warn" role="note">! {alpha.label}</p>
            ) : null}
            {/* The ids themselves: always editable, the server is the authority. Open when there is no list to pick from, or the id typed is not one of the picks. */}
            <details className="exec-nr-manual" open={runOptions.length === 0 || (runId !== "" && pickedRun === null) ? true : undefined}>
              <summary>Ids{runOptions.length > 0 ? " — edit by hand" : ""}</summary>
              <label className="exec-nr-field">
                <span className="exec-nr-help">Evidence run id</span>
                <input className="exec-role-control" value={runId} onChange={(e) => setRunId(e.target.value)} aria-label="Evidence run (from the run library)" disabled={submitting} placeholder="run id" />
              </label>
              {alphaOptions.length === 0 ? (
                <label className="exec-nr-field">
                  <span className="exec-nr-help">Alpha id</span>
                  <input className="exec-role-control" value={alphaId} onChange={(e) => setAlphaId(e.target.value)} aria-label="Alpha (from the alpha registry)" disabled={submitting} placeholder={alphaOptionsReason ?? "alpha id"} />
                </label>
              ) : null}
              <label className="exec-nr-field">
                <span className="exec-nr-help">Methodology claim id</span>
                <input className="exec-role-control" value={claimId} onChange={(e) => setClaimId(e.target.value)} aria-label="Methodology claim" disabled={submitting} placeholder="claim id" />
              </label>
              <p className="exec-nr-help" data-ids-note>An id the server does not know is refused, never guessed.</p>
            </details>
            <label className="exec-px-note exec-nr-field">
              <span className="exec-role-th exec-px-notelabel">Summary · the reviewer&apos;s first sentence</span>
              <textarea
                className="exec-px-notebox"
                value={summary}
                rows={3}
                disabled={submitting}
                placeholder="What this alpha does, and why the evidence supports opening the loop for it."
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
          </div>
          <aside className="exec-nr-aside exec-gov-panel" aria-label="What happens next">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">What happens next</span></div>
            <ol className="exec-nr-next">
              <li><b>Digest</b><span>Artifact digest — pinned SERVER-side from the run registry at submit, never taken from this form.</span></li>
              <li><b>Reviewer</b><span>A quant reviewer decides — never you. The SLA clock starts at submit.</span></li>
              <li><b>Duplicates</b><span>Open work for the same alpha × run is refused with the existing approval id; a failed submit retries safely.</span></li>
            </ol>
          </aside>
        </div>
      )}

      {outcome?.kind === "duplicate" ? (
        <div className="exec-gov-panel" role="alert">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">Open work already exists</span>
            <span className="exec-gov-chip" data-fill="warn">DUPLICATE</span>
          </div>
          <p className="exec-gate-note">
            {outcome.reason}{" "}
            {outcome.existingApprovalId ? (
              <a href={`/governance/approvals/${outcome.existingApprovalId}/r1`}>open {outcome.existingApprovalId} →</a>
            ) : (
              <a href="/governance/approvals">open the Inbox →</a>
            )}
          </p>
        </div>
      ) : null}
      {outcome?.kind === "failed" ? (
        <div className="exec-gov-panel" role="alert">
          <div className="exec-gov-panelhead">
            <span className="exec-gov-paneltitle">{outcome.offline ? "The request never left this machine" : "The server refused the request"}</span>
            <span className="exec-gov-chip" data-fill="bad">{outcome.offline ? "OFFLINE" : "REFUSED"}</span>
          </div>
          <p className="exec-gate-note">{outcome.reason}</p>
        </div>
      ) : null}

      <ExecutionDecisionBar
        label="Submit decision"
        reasonsId={LOCK_REASON_ID}
        verdict={settled ? "SUBMITTED" : submitting ? "SENDING" : ready ? "READY" : "INCOMPLETE"}
        tone={settled ? "good" : submitting ? "warn" : ready ? "good" : "mute"}
        reasons={[
          settled
            ? "the reviewer takes it from here — track it in the Inbox"
            : submitting
              ? "submitting — the button stays down so a double-click cannot create two approvals"
              : ready
                ? "submit opens a PENDING R1 row — the reviewer, not you, decides"
                : blocker,
        ]}
        actions={
          settled ? (
            <>
              <a className="exec-role-control exec-btn-ghost" href="/governance/approvals">Open Approval Inbox</a>
              <button type="button" className="exec-role-control exec-btn-ghost" onClick={() => { setSummary(""); onReset(); }}>
                New request
              </button>
            </>
          ) : (
            <button
              type="button"
              className="exec-role-control exec-btn-apply"
              disabled={!ready || submitting}
              // The sentence is already on screen in the decision bar; these
              // two attributes attach it to the control that is dead, so the
              // reader does not have to guess which line explains it.
              aria-describedby={!ready || submitting ? LOCK_REASON_ID : undefined}
              title={submitting
                ? "Submitting — the button stays down so a double-click cannot create two approvals."
                : ready
                  ? undefined
                  : `${blocker[0].toUpperCase()}${blocker.slice(1)}.`}
              onClick={() => onSubmit({ alphaId, evidenceRunId: runId, methodologyClaimId: claimId, summary: summary.trim() })}
            >
              {outcome?.kind === "failed" ? "Retry submit" : "Submit for R1 review"}
            </button>
          )
        }
      />
    </section>
  );
}

/**
 * Owns the request-key lifecycle: minted per submit intent, kept only while
 * the payload is unchanged (so a retry replays), discarded on edit or reset.
 */
export function NewApprovalRequestContainer({ api }: { api: ExecutionApi }) {
  // Read once from the address bar: no router dependency, and a later edit of the form is never overwritten by the URL.
  const [initial] = useState(() => {
    const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
    return {
      alphaId: params.get("alpha") ?? undefined,
      runId: params.get("run") ?? undefined,
      claimId: params.get("claim") ?? undefined,
    };
  });
  const suggestions = useRunSuggestions();
  const [outcome, setOutcome] = useState<ApprovalCreateOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const intent = useRef<{ payload: string; key: string } | null>(null);
  // A ref, not state: React batches a double-click's handlers before state
  // lands, and the second click must be refused SYNCHRONOUSLY.
  const inFlight = useRef(false);

  return (
    <NewApprovalRequestScreen
      initial={initial}
      runOptions={suggestions.options}
      runOptionsReason={suggestions.reason}
      outcome={outcome}
      submitting={submitting}
      onReset={() => {
        intent.current = null;
        setOutcome(null);
      }}
      onSubmit={(fields) => {
        if (inFlight.current) return;
        inFlight.current = true;
        const payload = JSON.stringify([fields.alphaId, fields.evidenceRunId, fields.methodologyClaimId, fields.summary]);
        if (!intent.current || intent.current.payload !== payload) {
          intent.current = { payload, key: mintKey() };
        }
        setSubmitting(true);
        void api
          .createApprovalRequest({ requestKey: intent.current.key, ...fields })
          .then((result) => {
            inFlight.current = false;
            setOutcome(result);
            setSubmitting(false);
          });
      }}
    />
  );
}
