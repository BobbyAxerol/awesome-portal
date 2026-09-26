/**
 * Screen 09 · the sheet of a run that FAILED or was cancelled (spec 09 T06,
 * §10 FAILED row) and the final-audit block of a sheet with a claim (P18-T10).
 *
 * X2 · B5: a failed run has no claim, so the headline row is replaced by
 * "no claim — run failed at {stage}" (the server's own words), the stage
 * chain stops at the failing stage (its row red with the failure), the
 * artifacts print the terminal snapshot's states verbatim — ABORTED stays
 * ABORTED — and the equity frame says "series unavailable". Nothing here
 * computes: every word and state is the sealed core's.
 */

import { Link } from "react-router-dom";

import type { FinalAudit, FrozenCoreFailed } from "./reportClient";
import { STAGE_CHECK_WORDS, STAGE_LABEL } from "./reportClient";
import { releaseCandidateHref } from "./releaseCandidateClient";
import { shortDigest } from "./researchFormat";
import { reasonCodeSentence } from "./researchRefusal";
import { iso } from "./utcMinute";

const ARTIFACT_WORDS: Record<FrozenCoreFailed["artifacts"][number]["state"], string> = {
  PENDING: "pending — never written",
  WRITING: "writing — never sealed",
  SEALED: "sealed",
  ABORTED: "ABORTED",
};

function Absent({ code }: { code: string | null }) {
  return (
    <span className="rr-absent" title={code ?? undefined}>
      not published{code ? <span className="rr-reason"> · {code}</span> : null}
    </span>
  );
}

export function FailedSheet({ core, runId, seriesUnavailable }: { core: FrozenCoreFailed; runId: string; seriesUnavailable: string }) {
  const outcome = core.outcome;
  return (
    <>
      <section
        className="rr-block rr-keep"
        data-panel="failed-outcome"
        data-outcome={outcome.state}
        data-failed-stage={outcome.failed_stage}
        aria-label="run outcome"
        role="status"
        style={{ borderColor: "var(--bad)", background: "var(--bad-bg)" }}
      >
        <h2 className="t" style={{ color: "var(--bad)" }} data-failed-headline>
          {outcome.headline}
        </h2>
        <div className="b">
        <p className="rr-note" style={{ color: "var(--ink)" }}>
          <span className="rr-long" data-failure-code>
            {outcome.failure_code}
          </span>
          {outcome.failure_message ? <span data-failure-message> — {outcome.failure_message}</span> : null}
        </p>
        <p className="rr-caption" style={{ color: "var(--ink-soft)" }}>
          {outcome.state === "CANCELLED" ? "cancelled" : "failed"} {iso(outcome.failed_at_utc_ms)} · terminal progress sequence{" "}
          {outcome.terminal_sequence} · mandatory bundle {core.mandatory_bundle.toLowerCase()}. A run that ended without a
          sealed claim reports no metric, no equity path and no fold verdict.
        </p>
        </div>
      </section>

      <section className="rr-idcard rr-keep" data-panel="identity" aria-label="identity">
        <h2 className="rr-t2">Identity</h2>
        <dl className="rr-id">
          {core.identity.map((field) => (
            <div key={field.key} className="contents" data-identity={field.key}>
              <dt className="k">{field.label}</dt>
              <dd className="v rr-long">
                {field.value !== null && field.availability.state === "AVAILABLE" ? field.value : <Absent code={field.availability.reason_code} />}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rr-block" data-panel="equity" data-equity-state="NOT_PUBLISHED" aria-label="equity">
        <h2 className="t">Equity</h2>
        <div className="b">
          <p className="rr-note" data-series-unavailable>
            {seriesUnavailable}
          </p>
          <span className="rr-reason">{core.equity.availability.reason_code}</span>
        </div>
      </section>

      <div className="rr-chainrow">
        <section className="rr-block rr-flush" data-panel="stages" aria-label="stage checks">
          <h2 className="t">Stage checks — to the failure</h2>
          <table className="rr-table rr-chain">
            <tbody>
              {core.stages.map((stage) => (
                <tr
                  key={stage.key}
                  data-stage={stage.key}
                  data-stage-state={stage.state}
                  data-stage-check={stage.check.result}
                  style={stage.check.result === "FAIL" ? { color: "var(--bad)" } : undefined}
                >
                  <td className="key">
                    {stage.key} · {STAGE_LABEL[stage.key]}
                  </td>
                  <td className="desc">
                    {stage.check.text ?? (
                      <span className="rr-reason">
                        {reasonCodeSentence(stage.check.availability.reason_code ?? "") || stage.check.availability.reason_code}
                      </span>
                    )}
                  </td>
                  <td className="st" data-s={stage.check.result}>
                    {STAGE_CHECK_WORDS[stage.check.result]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rr-block rr-flush" data-panel="artifacts" aria-label="artifacts">
          <h2 className="t">Artifacts at the end of the run</h2>
          <div className="rr-artgrid">
            {core.artifacts.length === 0 ? <span className="rr-absent">the run wrote no artifact</span> : null}
            {core.artifacts.map((artifact) => (
              <div key={artifact.name} className="contents" data-artifact={artifact.name} data-artifact-state={artifact.state}>
                <span className="k rr-long">{artifact.name}</span>
                <span className="rr-long" data-tone={artifact.state === "SEALED" ? undefined : artifact.state} style={artifact.state === "ABORTED" ? { color: "var(--bad)", fontWeight: 600 } : undefined}>
                  {ARTIFACT_WORDS[artifact.state]}
                  {artifact.digest ? <span title={artifact.digest}> · sha256:{shortDigest(artifact.digest, 12)}…</span> : null}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="rr-pp rr-keep" data-promotion-provenance>
        <section data-panel="promotion" aria-label="promotion state">
          <h2 className="rr-t2">Promotion state</h2>
          <p className="rr-note" data-promotion-line>
            {core.promotion.line}
          </p>
          <p className="rr-note no-print">
            <Link to={releaseCandidateHref(runId)} data-action="promotion-release-candidate">
              release candidate screen →
            </Link>
          </p>
        </section>
        <section data-panel="provenance" aria-label="provenance of this report">
          <h2 className="rr-t2">Provenance of this report</h2>
          <p className="rr-note rr-long" data-provenance-line>
            {core.provenance.line}
          </p>
        </section>
      </div>
    </>
  );
}

const AUDIT_WORDS: Record<FinalAudit["kind"], string> = {
  REUSED_ORIGINAL: "reused original — this run is its own final audit",
  LINKED_CHILD: "linked child — a separate audit-of-selection run",
  NOT_PUBLISHED: "not published",
};

/** P18-T10: which execution is the final audit, with its source refs; never a second optimisation. */
export function FinalAuditBlock({ audit }: { audit: FinalAudit }) {
  return (
    <section className="rr-block rr-keep" data-panel="final-audit" data-final-audit={audit.kind} aria-label="final audit">
      <h2 className="t">Final audit</h2>
      <div className="b">
      <p className="rr-note" data-final-audit-kind>
        {AUDIT_WORDS[audit.kind]}
        {audit.final_audit_run_id ? <span className="rr-long"> · {audit.final_audit_run_id}</span> : null}
        {audit.kind === "NOT_PUBLISHED" && audit.reason_code ? <span className="rr-reason"> · {audit.reason_code}</span> : null}
      </p>
      {audit.kind !== "NOT_PUBLISHED" ? (
        <p className="rr-note" data-optimizer-reinvoked={String(audit.optimizer_reinvoked)}>
          optimizer re-invoked:{" "}
          <strong>{audit.optimizer_reinvoked === null ? "not determined" : audit.optimizer_reinvoked ? "yes" : "no"}</strong>
          {audit.optimizer_basis ? <span className="rr-reason"> · {audit.optimizer_basis}</span> : null}
          {audit.audit_target_kind ? <span className="rr-reason"> · target {audit.audit_target_kind}</span> : null}
        </p>
      ) : null}
      {audit.folds.length > 0 ? (
        <p className="rr-caption" data-final-audit-folds>
          {audit.folds
            .map((fold) => `fold ${fold.fold_id}: child #${fold.audit_ordinal ?? "—"} ${fold.candidate_id ? fold.candidate_id.slice(0, 8) : "—"} ${fold.state === "MATCH" ? "= θ*" : fold.state.toLowerCase().replace(/_/g, " ")}`)
            .join(" · ")}
        </p>
      ) : null}
      {audit.source_refs.length > 0 ? (
        <p className="rr-caption rr-long" data-final-audit-refs>
          {audit.source_refs.map((ref) => `${ref.key} ${ref.ref}`).join(" · ")}
        </p>
      ) : null}
      </div>
    </section>
  );
}
