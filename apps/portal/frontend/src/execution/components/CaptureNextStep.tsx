/**
 * FE-GOV-03 · the next review in the chain, created from the server's own capture context — never from ids a person types.
 *
 *   R1 read → `R2_CREATE`         (parent R1 + exact deployment / portfolio / risk-grant tuple)
 *   R2 read → `PAPER_EXIT_CREATE` (parent R2 + exact deployment)
 *
 * Creating the next review RECORDS that a Portal review exists. It is not approval of that gate, grants no execution, promotes nothing and asks the
 * source for nothing (`source_verdict: NOT_ASSERTED`). A blocked context is stated with its reason and draws no form: no role, earlier state or cached
 * capability can open it. The POST re-checks the source digest, scope, expiry, versions and the caller's current read rights.
 */
import { useMemo, useState } from "react";

import type { CaptureContext } from "../api/governanceContext";
import { reasonWords } from "../api/governanceContext";
import type { ContextRead } from "../api/governanceContext";
import type { PaperExitCreateInput, R2CaptureInput, ReviewCapture } from "../api/reviewCapture";
import { ChoiceMenu } from "./choiceMenu";
import { ReviewCapturePanel, type CaptureOutcome } from "./ReviewCapture";
import { QuietEmpty } from "./quietEmpty";

const CURRENCY = /^[A-Z0-9]{2,12}$/;

export interface CaptureSubmit {
  r2: (input: R2CaptureInput) => Promise<CaptureOutcome>;
  paperExit: (input: PaperExitCreateInput) => Promise<CaptureOutcome>;
}

export function CaptureNextStep({
  context,
  submit,
  recordHref,
}: {
  context: ContextRead<CaptureContext>;
  submit: CaptureSubmit;
  recordHref: (capture: ReviewCapture) => string;
}) {
  if (context.kind === "absent") return null;
  if (context.kind === "invalid") {
    return <p className="exec-gov-meta" data-capture-state="invalid">The next-review context in this read could not be validated, so no review can be created from here. Reload to read it again.</p>;
  }
  return <Form context={context.value} submit={submit} recordHref={recordHref} />;
}

function Form({ context, submit, recordHref }: { context: CaptureContext; submit: CaptureSubmit; recordHref: (capture: ReviewCapture) => string }) {
  const r2 = context.action === "R2_CREATE";
  const title = r2 ? "Next · create the R2 review" : "Next · create the Paper Exit review";
  const [picked, setPicked] = useState<number | null>(context.candidates.length === 1 ? 0 : null);
  const [typedCurrency, setTypedCurrency] = useState("");
  const candidate = picked === null ? null : context.candidates[picked] ?? null;

  const choices = useMemo(
    () => context.candidates.map((c, index) => ({
      value: String(index),
      label: c.deploymentId,
      hint: [c.portfolioId, c.riskGrantId ? `risk grant ${c.riskGrantId}` : "no risk grant recorded", c.currency ?? "currency not recorded"].join(" · "),
    })),
    [context.candidates],
  );

  if (!context.availability.available) {
    return (
      <section className="exec-capnext" aria-label={title} data-capture-state="blocked">
        <header className="exec-capnext-head">
          <span className="exec-gov-paneltitle">{title}</span>
          <span className="exec-gov-chip" data-fill="warn" title={context.availability.reasonCode ?? undefined}>not available</span>
        </header>
        <p className="exec-gov-meta">{reasonWords(context.availability.reasonCode)}. Creating it would only record a Portal review — it never approves a gate or grants execution.</p>
      </section>
    );
  }
  if (context.candidates.length === 0) {
    return <QuietEmpty icon="doc" prominent={false} label={title} title="No accepted deployment to review" line="The source published no accepted choice for this step, so nothing can be created." />;
  }

  const currency = r2 ? (candidate?.currency ?? (CURRENCY.test(typedCurrency) ? typedCurrency : null)) : null;
  const needCurrency = r2 && candidate !== null && candidate.currency === null;
  const reason =
    candidate === null ? "choose the deployment this review is for"
      : r2 && candidate.riskGrantId === null ? "the source recorded no risk grant for this choice, and an R2 review is bound to one"
        : r2 && currency === null ? "enter the review currency (2–12 capital letters or digits) — the source did not record one and it is never defaulted"
          : null;

  return (
    <div className="exec-capnext" data-capture-state="available">
      <ReviewCapturePanel
        action={context.action}
        title={title}
        capability={{ state: "AVAILABLE", inputs: null }}
        identity={[
          { label: r2 ? "R1 approval" : "R2 approval", value: context.parentApprovalId },
          { label: "version", value: String(context.expectedParentVersion) },
          { label: "source projection", value: context.projectionDigest ? `${context.projectionDigest.slice(0, 18)}…${context.projectionDigest.slice(-6)}` : null },
        ]}
        disabledReason={reason}
        recordHref={recordHref}
        controls={
          <div className="exec-capnext-controls">
            <div className="exec-nr-field">
              <span className="exec-role-th">Deployment</span>
              {context.candidates.length === 1 && candidate ? (
                <span className="exec-nr-claim"><span className="exec-nr-claim-id">{choices[0]!.label}</span><span className="exec-nr-help">{choices[0]!.hint}</span></span>
              ) : (
                <ChoiceMenu
                  label="Deployment for the next review"
                  variant="field"
                  placeholder="Choose a deployment"
                  value={picked === null ? "" : String(picked)}
                  options={choices}
                  onChange={(next) => setPicked(next === "" ? null : Number(next))}
                />
              )}
              {context.truncated ? <span className="exec-nr-help">Showing the first {context.candidates.length} accepted choices — a bounded list, not every deployment.</span> : null}
            </div>
            {needCurrency ? (
              <label className="exec-nr-field">
                <span className="exec-role-th">Review currency</span>
                <input className="exec-role-control" value={typedCurrency} aria-label="Review currency" placeholder="e.g. USDT" onChange={(e) => setTypedCurrency(e.target.value.toUpperCase())} />
                <span className="exec-nr-help">The scope you ask to review — not an FX conversion or a balance from the source.</span>
              </label>
            ) : null}
          </div>
        }
        onCapture={async (summary, requestKey) => {
          if (candidate === null) return { kind: "failed", reason: "No deployment was chosen." };
          if (!r2) {
            return submit.paperExit({
              workspace_id: context.workspaceId,
              request_key: requestKey,
              summary,
              r2_approval_id: context.parentApprovalId,
              expected_r2_version: context.expectedParentVersion,
              deployment_id: candidate.deploymentId,
              expected_projection_digest: context.projectionDigest as string,
            });
          }
          if (candidate.riskGrantId === null || currency === null) return { kind: "failed", reason: "The chosen tuple is incomplete." };
          return submit.r2({
            workspace_id: context.workspaceId,
            request_key: requestKey,
            summary,
            r1_approval_id: context.parentApprovalId,
            expected_r1_version: context.expectedParentVersion,
            portfolio_id: candidate.portfolioId,
            currency,
            deployment_id: candidate.deploymentId,
            risk_grant_id: candidate.riskGrantId,
            expected_projection_digest: context.projectionDigest as string,
          });
        }}
      />
    </div>
  );
}
