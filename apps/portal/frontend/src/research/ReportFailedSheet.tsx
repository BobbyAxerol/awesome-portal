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

import type { FinalAudit, FrozenCoreFailed } from "./reportClient";
import { humanise } from "./humanise";
import { STAGE_CHECK_WORDS, STAGE_LABEL } from "./reportClient";
import { foldLabel, shortDigest, shortId } from "./researchFormat";
import { runLabelFor, runLabelOrShortId } from "./runLabels";

/** QA S09 (UX-22): `rwa_06GFEQ8XZ00VDADK2P63C144W3` is an opaque base32 tail `shortId` leaves whole; any id of this sheet reads prefix + 8. */
function clippedId(id: string): string {
  const match = /^([a-z]{2,5}_)(.+)$/.exec(id);
  return match && match[2]!.length > 8 ? `${match[1]}${match[2]!.slice(0, 8)}` : (shortId(id) ?? id);
}
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
    <span className="rr-absent" title={code ?? undefined} data-reason-code={code ?? undefined} tabIndex={code ? 0 : undefined}>
      not published
    </span>
  );
}

export function FailedSheet({ core, seriesUnavailable }: { core: FrozenCoreFailed; runId?: string; seriesUnavailable: string }) {
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
          <span className="rr-long" data-failure-code={outcome.failure_code} title={outcome.failure_code} tabIndex={0}>
            {outcome.failure_message ?? humanise(outcome.failure_code)}
          </span>
        </p>
        <p className="rr-caption" style={{ color: "var(--ink-soft)" }} title={`${core.equity.availability.reason_code ?? ""} · no metric, equity path or fold verdict is reported`}>
          {outcome.state === "CANCELLED" ? "cancelled" : "failed"} {iso(outcome.failed_at_utc_ms)}
        </p>
        </div>
      </section>

      <section className="rr-idcard rr-keep" data-panel="identity" aria-label="identity">
        <h2 className="rr-t2">Identity</h2>
        <dl className="rr-id">
          {core.identity.filter((field) => !["run_id", "alpha", "optimization"].includes(field.key) && !(field.key === "binding" && field.value === "PUBLISHABLE")).map((field) => (
            <div key={field.key} className="contents" data-identity={field.key}>
              <dt className="k">{field.label}</dt>
              <dd className="v rr-long">
                {field.value !== null && field.availability.state === "AVAILABLE" ? (
                  /* QA S09 (UX-22): an attempt or run id is a short id with the full one in the tooltip, never a 30-character token. */
                  /^(rrun|ratt|rwa)_/.test(field.value) ? <span title={field.value}>{runLabelFor(field.value) ?? clippedId(field.value)}</span> : field.value
                ) : (
                  <Absent code={field.availability.reason_code} />
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The outcome above already says no equity path is reported; the unavailable-series code is its tooltip. */}
      <span className="sr-only" hidden data-panel="equity" data-equity-state="NOT_PUBLISHED" data-series-unavailable title={`${seriesUnavailable} · ${core.equity.availability.reason_code ?? ""}`} />

      <div className="rr-chainrow">
        <section className="rr-block rr-flush" data-panel="stages" aria-label="stage checks">
          <h2 className="t">Stage checks</h2>
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
                  <td
                    className="key"
                    tabIndex={0}
                    title={stage.check.text ?? (reasonCodeSentence(stage.check.availability.reason_code ?? "") || stage.check.availability.reason_code || undefined)}
                  >
                    {stage.key} · {STAGE_LABEL[stage.key]}
                  </td>
                  {/* Only the stage that failed says why in text; the others' "no check was sealed" is each row's tooltip. */}
                  <td className="desc">{stage.check.result === "FAIL" ? stage.check.text : null}</td>
                  <td className="st" data-s={stage.check.result}>
                    {STAGE_CHECK_WORDS[stage.check.result]}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="rr-block rr-flush" data-panel="artifacts" aria-label="artifacts">
          <h2 className="t">Artifacts</h2>
          <div className="rr-artgrid">
            {core.artifacts.length === 0 ? <span className="rr-absent">none written</span> : null}
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
          <h2 className="rr-t2">Promotion</h2>
          <p className="rr-note" data-promotion-line title={core.promotion.line} tabIndex={0}>
            promotion — not published
          </p>
        </section>
        <span className="sr-only" hidden data-panel="provenance" data-provenance-line={core.provenance.line} title={core.provenance.line} />
      </div>
    </>
  );
}

const AUDIT_WORDS: Record<FinalAudit["kind"], string> = {
  REUSED_ORIGINAL: "this run is its own final audit",
  LINKED_CHILD: "a separate audit run",
  NOT_APPLICABLE: "not applicable · full-sample calibration has no untouched final audit",
  NOT_PUBLISHED: "not published",
};

/** P18-T10: which execution is the final audit, with its source refs; never a second optimisation. */
export function FinalAuditBlock({ audit }: { audit: FinalAudit }) {
  return (
    <section className="rr-block rr-keep" data-panel="final-audit" data-final-audit={audit.kind} aria-label="final audit">
      <h2 className="t">Final audit</h2>
      <div className="b">
      <p className="rr-note" data-final-audit-kind title={audit.reason_code ?? undefined}>
        {AUDIT_WORDS[audit.kind]}
        {audit.final_audit_run_id ? (
          <span className="rr-long" title={audit.final_audit_run_id}>
            {" · "}
            {runLabelOrShortId(audit.final_audit_run_id)}
          </span>
        ) : null}
        {audit.kind !== "NOT_PUBLISHED" ? (
          <span data-optimizer-reinvoked={String(audit.optimizer_reinvoked)} data-audit-target={audit.audit_target_kind ?? undefined} title={[audit.optimizer_basis, audit.audit_target_kind ? `target ${audit.audit_target_kind}` : null].filter(Boolean).join(" · ") || undefined}>
            {" · "}
            {audit.optimizer_reinvoked === null ? "optimizer re-run not determined" : audit.optimizer_reinvoked ? "optimizer re-run" : "optimizer not re-run"}
          </span>
        ) : null}
        {audit.folds.length > 0 ? (
          <span data-final-audit-folds>
            {" · "}
            {(() => {
              /* QA S09: nine identical "child #n abc = theta*" entries are one sentence. */
              const first = audit.folds[0]!;
              /* B11 S09: PER_FOLD_PARAMETER_SELECTIONS audits each fold against its own selection, not one theta*. */
              const ownTargets = audit.audit_target_kind === "PER_FOLD_PARAMETER_SELECTIONS";
              const same = !ownTargets && audit.folds.every((fold) => fold.state === "MATCH" && fold.candidate_id === first.candidate_id);
              if (same && first.candidate_id) return `${audit.folds.length} folds on candidate ${first.candidate_id.slice(0, 8)}`;
              return audit.folds
                .map((fold) => `${foldLabel(fold.fold_id)}: ${fold.candidate_id ? fold.candidate_id.slice(0, 8) : "not published"} ${fold.state === "MATCH" ? (ownTargets ? "= own selection" : "= θ*") : fold.state.toLowerCase().replace(/_/g, " ")}`)
                .join(" · ");
            })()}
          </span>
        ) : null}
      </p>
      {audit.source_refs.length > 0 ? (
        <span className="sr-only" hidden data-final-audit-refs title={audit.source_refs.map((ref) => `${ref.key} ${ref.ref}`).join(" · ")} />
      ) : null}
      </div>
    </section>
  );
}
