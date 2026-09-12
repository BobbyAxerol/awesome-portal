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
}) {
  const [alphaId, setAlphaId] = useState<string>("");
  const [runId, setRunId] = useState<string>("");
  const [claimId, setClaimId] = useState<string>("");
  const [summary, setSummary] = useState("");

  const alpha = alphaOptions.find((a) => a.id === alphaId) ?? null;
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
    ? `name ${missing.join(", ")} — the request is those ids`
    : `summary needs at least ${MIN_SUMMARY} characters — it is the reviewer's first sentence`;
  const settled = outcome !== null && (outcome.kind === "created" || outcome.kind === "replayed");

  return (
    <section className="exec-gate exec-gov" aria-label="New approval request" data-hifi-exact="new-request-entry">
      <div className="exec-gate-kicker">LOOP ENTRY · Research → Gate R1</div>
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">New approval request <span className="exec-gov-dim">—</span> evidence first, capital later</h1>
      </div>
      <div className="exec-gov-metaline">
        <span className="exec-gov-chip" data-fill="warn">ENTRY</span>
        <span className="exec-gov-meta">
          governance.approval-create-request.v1 · opens a PENDING row in the Approval Inbox · a quant
          reviewer decides at R1 · the SLA clock starts at submit
        </span>
      </div>
      <div className="exec-gate-stagechips" role="group" aria-label="Where this request sits in the loop">
        <span className="exec-gate-stagechip" data-state="eligible">1 · DECLARE — you, now</span>
        <span className="exec-gate-stagechip">2 · R1 — a quant reviewer, not you</span>
        <span className="exec-gate-stagechip">3 · R2 — capital, only after R1 approves</span>
        <span className="exec-gov-meta">the request you submit is step 1 of 3 — nothing trades until both gates say yes</span>
      </div>

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
        <div className="exec-gov-grid2" data-ratio="1.15">
          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Target &amp; evidence — declare before submit</span></div>
            <div className="exec-gov-kv">
              <span className="exec-gov-k">alpha</span>
              <span className="exec-gov-v">
                {alphaOptions.length > 0 ? (
                  <select className="exec-role-control" value={alphaId} onChange={(e) => setAlphaId(e.target.value)} aria-label="Alpha (from the alpha registry)" disabled={submitting}
                    title={submitting ? "The request is in flight." : undefined}>
                    <option value="">— pick an alpha —</option>
                    {alphaOptions.map((a) => (
                      <option key={a.id} value={a.id}>{a.label}</option>
                    ))}
                  </select>
                ) : (
                  <input className="exec-role-control" value={alphaId} onChange={(e) => setAlphaId(e.target.value)} aria-label="Alpha (from the alpha registry)" disabled={submitting}
                    placeholder={alphaOptionsReason ?? "type the id"} />
                )}
              </span>
              <span className="exec-gov-k">evidence run</span>
              <span className="exec-gov-v">
                {/* No candidate list is published for this; the id is typed and the POST validates it. */}
                <input className="exec-role-control" value={runId} onChange={(e) => setRunId(e.target.value)} aria-label="Evidence run (from the run library)" disabled={submitting}
                  placeholder="type the id" />
              </span>
              <span className="exec-gov-k">methodology claim</span>
              <span className="exec-gov-v">
                {/* No candidate list is published for this; the id is typed and the POST validates it. */}
                <input className="exec-role-control" value={claimId} onChange={(e) => setClaimId(e.target.value)} aria-label="Methodology claim" disabled={submitting}
                  placeholder="type the id" />
              </span>
              <span className="exec-gov-k">gate</span>
              <span className="exec-gov-v">R1 — research evidence. R2 (capital) requires an approved R1 and opens from its decision.</span>
            </div>
            <div className="exec-gov-kvfoot">
            {alpha && alpha.label.includes("already in the loop") ? (
              <p className="exec-gate-note" data-tone="warn" role="note">! {alpha.label}</p>
            ) : null}
            <p className="exec-gate-note">
              {/*
                * This said "ids picked from registries — never free-typed",
                * which stopped being true the moment the invented picker was
                * removed. Seen on the screen it sat directly under three text
                * fields and contradicted them. The second half was always the
                * real guarantee, and it still holds.
                */}
              no candidate list is published for these, so each id is typed · an id the server
              registry does not know is a typed 422, never a silent guess
            </p>
            <label className="exec-px-note">
              <span className="exec-px-notelabel">Summary (required — the reviewer&apos;s first sentence)</span>
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
          </div>
          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">What R1 will review</span></div>
            <div className="exec-gov-kv">
              <span className="exec-gov-k">artifact digest</span>
              <span className="exec-gov-v">pinned SERVER-side from the run registry at submit — never taken from this form</span>
              <span className="exec-gov-k">window roles</span>
              <span className="exec-gov-v">fixed by {claimId} — immutable after submit</span>
              <span className="exec-gov-k">separation of duty</span>
              <span className="exec-gov-v">the requester is recorded and can never approve — the Inbox dims the row for you</span>
              <span className="exec-gov-k">duplicates</span>
              <span className="exec-gov-v">open work for the same alpha × run is rejected with the EXISTING approval id — no twins</span>
              <span className="exec-gov-k">retry</span>
              <span className="exec-gov-v">a failed submit retries with the SAME request key — a submit that landed replays instead of duplicating</span>
            </div>
          </div>
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
        verdict={settled ? "SUBMITTED" : submitting ? "SENDING" : ready ? "READY" : "DRAFT"}
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
  const [outcome, setOutcome] = useState<ApprovalCreateOutcome | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const intent = useRef<{ payload: string; key: string } | null>(null);
  // A ref, not state: React batches a double-click's handlers before state
  // lands, and the second click must be refused SYNCHRONOUSLY.
  const inFlight = useRef(false);

  return (
    <NewApprovalRequestScreen
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
