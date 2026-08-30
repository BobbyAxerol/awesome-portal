/**
 * New approval request — the loop's entry door (owner-commissioned 2026-08-30,
 * ROADMAP §H.2.1). No hi-fi exists; the composition follows the governance
 * grammar the three reviewed gate screens established (gov-head · metaline ·
 * grid2 · panels · sticky decision bar) so the door reads as part of the same
 * room it opens into.
 *
 * Everything here is registry-picked, never free-typed — the WF 1i rule. The
 * submit is a DECLARED DEMO: no contract publishes a create-request endpoint
 * (BR-EX-69), so the confirmation states exactly that and nothing pretends a
 * row was persisted.
 */
import { useMemo, useState } from "react";

import { NEW_REQUEST } from "../governance.smoke";
import { ExecutionDecisionBar } from "../components/decisionBar";

const MIN_SUMMARY = 8;

export function NewApprovalRequestScreen() {
  const [alphaId, setAlphaId] = useState<string>(NEW_REQUEST.alphas[0].id);
  const [runId, setRunId] = useState<string>(NEW_REQUEST.runs[0].id);
  const [claimId, setClaimId] = useState<string>(NEW_REQUEST.claims[0].id);
  const [summary, setSummary] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  const alpha = NEW_REQUEST.alphas.find((a) => a.id === alphaId)!;
  const run = NEW_REQUEST.runs.find((r) => r.id === runId)!;
  const claim = NEW_REQUEST.claims.find((c) => c.id === claimId)!;
  const ready = summary.trim().length >= MIN_SUMMARY;
  // Deterministic demo id — derived, not random, so tests and baselines hold.
  const demoId = useMemo(() => `AP-4${String(alphaId.length * 7 + runId.length).padStart(2, "0")}`, [alphaId, runId]);

  return (
    <section className="exec-gate exec-gov" aria-label="New approval request" data-hifi-exact="new-request-entry">
      <div className="exec-gate-kicker">LOOP ENTRY · Research → Gate R1</div>
      <div className="exec-gov-head">
        <h1 className="exec-gov-h1">New approval request <span className="exec-gov-dim">—</span> evidence first, capital later</h1>
      </div>
      <div className="exec-gov-metaline">
        <span className="exec-gov-chip" data-fill="warn">ENTRY</span>
        <span className="exec-gov-meta">
          opens a PENDING row in the Approval Inbox · quant reviewer decides at R1 · SLA{" "}
          {NEW_REQUEST.slaBudgetHours}h starts at submit · {NEW_REQUEST.policy}
        </span>
      </div>
      <div className="exec-gate-stagechips" role="group" aria-label="Where this request sits in the loop">
        <span className="exec-gate-stagechip" data-state="eligible">1 · DECLARE — you, now</span>
        <span className="exec-gate-stagechip">2 · R1 — a quant reviewer, not you</span>
        <span className="exec-gate-stagechip">3 · R2 — capital, only after R1 approves</span>
        <span className="exec-gov-meta">the request you submit is step 1 of 3 — nothing trades until both gates say yes</span>
      </div>
      <p className="exec-af-smoke">
        ! SMOKE DATA — the create-request endpoint is not published; this form is a declared demo
        and nothing is persisted. Delete when BR-EX-69 ships
      </p>

      {created ? (
        <div className="exec-gov-panel" data-smoke="true">
          <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Request created — demo</span></div>
          <div className="exec-gov-kv">
            <span className="exec-gov-k">request</span>
            <span className="exec-gov-v">{created} · R1 · {alpha.label}</span>
            <span className="exec-gov-k">evidence</span>
            <span className="exec-gov-v">{run.label}</span>
            <span className="exec-gov-k">next</span>
            <span className="exec-gov-v">a quant reviewer other than you decides at R1 (separation of duty)</span>
          </div>
          <p className="exec-gate-note">
            With BR-EX-69 this row would now be PENDING in the{" "}
            <a href="/governance/approvals">Approval Inbox</a> with its {NEW_REQUEST.slaBudgetHours}h
            SLA running. In this demo nothing was written — the confirmation is the specification.
          </p>
        </div>
      ) : (
        <div className="exec-gov-grid2" data-ratio="1.15">
          <div className="exec-gov-panel">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">Target &amp; evidence — declare before submit</span></div>
            <div className="exec-gov-kv" data-flush="true">
              <span className="exec-gov-k">alpha</span>
              <span className="exec-gov-v">
                <select className="exec-role-control" value={alphaId} onChange={(e) => setAlphaId(e.target.value)} aria-label="Alpha (from the alpha registry)">
                  {NEW_REQUEST.alphas.map((a) => (
                    <option key={a.id} value={a.id}>{a.label} — {a.note}</option>
                  ))}
                </select>
              </span>
              <span className="exec-gov-k">evidence run</span>
              <span className="exec-gov-v">
                <select className="exec-role-control" value={runId} onChange={(e) => setRunId(e.target.value)} aria-label="Evidence run (from the run library)">
                  {NEW_REQUEST.runs.map((r) => (
                    <option key={r.id} value={r.id}>{r.label}</option>
                  ))}
                </select>
              </span>
              <span className="exec-gov-k">methodology claim</span>
              <span className="exec-gov-v">
                <select className="exec-role-control" value={claimId} onChange={(e) => setClaimId(e.target.value)} aria-label="Methodology claim">
                  {NEW_REQUEST.claims.map((c) => (
                    <option key={c.id} value={c.id}>{c.label}</option>
                  ))}
                </select>
              </span>
              <span className="exec-gov-k">gate</span>
              <span className="exec-gov-v">R1 — research evidence. R2 (capital) requires an approved R1 and opens from its decision.</span>
            </div>
            <p className="exec-gate-note" data-tone="mute">
              evidence quick facts · <span className="exec-gov-v">{run.facts}</span>
            </p>
            {"warn" in alpha && alpha.warn ? (
              <p className="exec-gate-note" data-tone="warn" role="note">! {alpha.warn}</p>
            ) : null}
            <p className="exec-gate-note">
              ids picked from registries — never free-typed · the request carries the run digest,
              not the numbers: reviewers read evidence from the run itself
            </p>
            <label className="exec-px-note">
              <span className="exec-px-notelabel">Summary (required — the reviewer's first sentence)</span>
              <textarea
                className="exec-px-notebox"
                value={summary}
                rows={3}
                placeholder="What this alpha does, and why the evidence supports opening the loop for it."
                onChange={(e) => setSummary(e.target.value)}
              />
            </label>
          </div>
          <div className="exec-gov-panel" data-smoke="true">
            <div className="exec-gov-panelhead"><span className="exec-gov-paneltitle">What R1 will review</span></div>
            <div className="exec-gov-kv">
              <span className="exec-gov-k">evidence facts</span>
              <span className="exec-gov-v">{run.facts} — headline only; the reviewer decides from the run, not this line</span>
              <span className="exec-gov-k">artifact digest</span>
              <span className="exec-gov-v">{run.digest} · pinned at submit</span>
              <span className="exec-gov-k">window roles</span>
              <span className="exec-gov-v">fixed by {claim.id} — IS / outer OOS / holdout, immutable after submit</span>
              <span className="exec-gov-k">checklist</span>
              <span className="exec-gov-v">{NEW_REQUEST.policy} — the same versioned checklist the R1 screen renders</span>
              <span className="exec-gov-k">separation of duty</span>
              <span className="exec-gov-v">the requester can never approve — the Inbox dims the row for you</span>
              <span className="exec-gov-k">SLA</span>
              <span className="exec-gov-v">{NEW_REQUEST.slaBudgetHours}h review budget · overdue escalates in Command Center</span>
            </div>
          </div>
        </div>
      )}

      <ExecutionDecisionBar
        label="Submit decision"
        verdict={created ? "SUBMITTED" : ready ? "READY" : "DRAFT"}
        tone={created ? "good" : ready ? "good" : "mute"}
        reasons={
          created
            ? [`demo only — ${created} was not persisted (BR-EX-69)`]
            : [ready ? "submit opens a PENDING R1 row — the reviewer, not you, decides" : `summary needs at least ${MIN_SUMMARY} characters — it is the reviewer's first sentence`]
        }
        actions={
          created ? (
            <>
              <a className="exec-role-control exec-btn-ghost" href="/governance/approvals">Open Approval Inbox</a>
              <button type="button" className="exec-role-control exec-btn-ghost" onClick={() => { setCreated(null); setSummary(""); }}>
                New request
              </button>
            </>
          ) : (
            <button
              type="button"
              className="exec-role-control exec-btn-apply"
              disabled={!ready}
              onClick={() => setCreated(demoId)}
            >
              Submit for R1 review
            </button>
          )
        }
      />
    </section>
  );
}
