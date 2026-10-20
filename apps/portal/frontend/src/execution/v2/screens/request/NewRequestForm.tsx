/**
 * The New request form, shared by the route page and the queue drawer (one form, two frames).
 *
 * Sections, as the hi-fi has them: Alpha, Evidence run (+ Run Library), Methodology claim (+ "Ids · edit by hand"),
 * Summary with a live counter, then the "Still needed" bar with the one Submit button, then the outcome.
 *
 * What is deliberately not here: no auto-submit anywhere, and no form-level submit. The only call to the port is
 * `state.submit()` (or `state.retry()` for an uncertain send), and the only callers are button clicks. The form's
 * submit event is swallowed and Enter in an id field is swallowed, so a keystroke can never send a request. The Submit
 * button is aria-disabled, not disabled, so focus stays on it while a send is in flight. Prefill from a link fills the
 * fields and stops.
 */
import { useId } from "react";
import { Link } from "react-router-dom";

import { Flag } from "../../Flag";
import { ALPHA_SCOPE_LABEL, ID_PATTERN, ID_RULE, claimHint, runLabel, RUN_LIBRARY_HREF, stillNeeded, summaryCounter, MAX_SUMMARY, MIN_SUMMARY } from "./model";
import { MAX_RUN_PAGES, RUN_PAGE_LIMIT } from "./runLibrary";
import { OutcomePanel } from "./OutcomePanel";
import { stageActionRow } from "../../readers/stageActionEligibility";
import { stageActionReason } from "../stage/reasons";
import type { NewRequest } from "./useNewRequest";

export type FormVariant = "page" | "drawer";

export interface NewRequestFormProps {
  state: NewRequest;
  variant: FormVariant;
  /** Where "My access" goes when the server says the reader may not create requests. */
  accessHref: string;
}

const SUBMIT_LABEL = "Submit for R1 review";

function IdInput({ label, value, onChange, disabled, hint }: { label: string; value: string; onChange(v: string): void; disabled: boolean; hint: string }) {
  const id = useId();
  const errorId = `${id}-e`;
  const bad = value.trim() !== "" && !ID_PATTERN.test(value.trim());
  return (
    <div className="exec-rq-fld">
      <label htmlFor={id} className="exec-rq-label">{label}</label>
      <input
        id={id}
        className="exec-rq-control exec-rq-mono"
        value={value}
        disabled={disabled}
        autoComplete="off"
        spellCheck={false}
        placeholder={hint}
        aria-invalid={bad || undefined}
        aria-describedby={bad ? errorId : undefined}
        onChange={(e) => onChange(e.target.value)}
        // Enter in a single-line field must never send the request: the click on Submit is the only road.
        onKeyDown={(e) => {
          if (e.key === "Enter") e.preventDefault();
        }}
      />
      {bad ? <p id={errorId} className="exec-rq-error">Not a valid id: use {ID_RULE}, up to 191 characters.</p> : null}
    </div>
  );
}

export function NewRequestForm({ state, variant, accessHref }: NewRequestFormProps) {
  const base = useId();
  const f = state.fields;
  const { runs, validation, gate } = state;
  const settled = state.settled;
  // An uncertain send locks the payload: its idempotency key belongs to exactly these fields.
  const locked = settled || state.submitting || state.uncertain;
  const listReady = runs.status === "ok";
  const create = stageActionRow(state.eligibility, "approval.create");
  const alphaListed = state.alphas.some((a) => a.id === f.alphaId);
  const runListed = state.runOptions.some((o) => o.runId === f.runId);
  // FE-069: the server's catalog is the whole workspace's alphas; without one the picker holds the loaded runs' alphas and says so.
  const derivedAlphas = listReady && runs.catalog === null;
  const runsPending = runs.refreshing;
  const moreWhyId = `${base}-more-why`;
  const moreBlocked = runs.loadingMore || runs.capped || runsPending;
  const moreWhy = runs.capped
    ? `${(MAX_RUN_PAGES * RUN_PAGE_LIMIT).toLocaleString("en-US")} runs are loaded. Type the run id below for older ones.`
    : runs.loadingMore
      ? "The next page is loading."
      : "The runs of this alpha are loading.";
  const summary = validation.summary;
  const summaryBad = summary.state === "long" || summary.state === "hostile";
  const reasonId = `${base}-why`;
  const needId = `${base}-need`;
  const counterId = `${base}-count`;
  const summaryHelpId = `${base}-sumhelp`;
  const handOpen = runs.status === "unavailable" || (listReady && state.alphas.length === 0) || (f.runId !== "" && !runListed) || (f.alphaId !== "" && !alphaListed);

  const alphaPlaceholder = runs.status === "loading" ? "Reading completed runs…" : runs.status === "unavailable" ? "Run Library not available" : state.alphas.length === 0 ? (runs.catalog === null ? "No completed run to pick from" : "No alpha to pick from") : "Pick an alpha";
  const runPlaceholder = f.alphaId === "" ? "Pick an alpha first" : !alphaListed ? "This alpha is not in the list" : runsPending ? "Reading this alpha's completed runs…" : state.runOptions.length === 0 ? "This alpha has no completed run" : "Pick a completed run";
  // The server's scope of the create route's alpha, in words. Printed only when the eligibility read published one.
  const scope = create?.alphaScope != null ? ALPHA_SCOPE_LABEL[create.alphaScope] ?? null : null;

  const flag = (() => {
    if (gate.open) return <Flag kind="ok" label="Ready" />;
    if (gate.kind === "policy") return <Flag kind="attention" label="Not enabled" />;
    if (gate.kind === "sending") return <Flag kind="pending" label="Sending" />;
    if (gate.kind === "uncertain") return <Flag kind="unknown" label="Unconfirmed" />;
    if (gate.kind === "held") return <Flag kind="na" label="On hold" />;
    return <Flag kind="na" label="Incomplete" />;
  })();
  // FE-068: when Submit is closed by the delivery policy, the server's own reason for approval.create replaces the generic policy
  // sentence if it published one. It is text only: it never opens Submit and the gate above never reads it.
  const policyReason = gate.open || gate.kind !== "policy" ? null : stageActionReason(state.eligibility, "approval.create", gate.reason);
  // Submit is on, yet the reader's own check says the server will refuse: say so beside it. Advisory; the click still asks the server.
  const advice = gate.open && create !== undefined && create.verdict === "NOT_ELIGIBLE"
    ? `Your access check says this will be refused: ${stageActionReason(state.eligibility, "approval.create", "")}. Submit still asks the server.`
    : null;
  const sentence = gate.open
    ? "Everything needed is filled."
    : gate.kind === "policy"
      ? policyReason!
      : gate.kind === "sending"
        ? "Sending the request. It is shown as created only when the server says so."
        : gate.kind === "uncertain" || gate.kind === "held"
          ? gate.reason
          : gate.kind === "settled"
            ? "This request is recorded."
            : stillNeeded(validation.needs);

  return (
    <form
      className="exec-rq-form"
      data-variant={variant}
      noValidate
      aria-label="New approval request"
      // No form-level submit: a native submit event (Enter in a field, a script) is swallowed and goes nowhere.
      onSubmit={(e) => e.preventDefault()}
    >
      {state.notices.length > 0 ? (
        <ul className="exec-rq-notices" aria-label="About the link you came from">
          {state.notices.map((n) => <li key={n}>{n}</li>)}
        </ul>
      ) : null}

      <div className="exec-rq-panel" data-flush={variant === "drawer" ? "" : undefined}>
        <fieldset className="exec-rq-fields" disabled={locked}>
          <legend className="exec-rq-sr">Request fields</legend>

          <div className="exec-rq-fld">
            <label htmlFor={`${base}-alpha`} className="exec-rq-label">
              <span>Alpha</span>
              <span className="exec-rq-label-meta">{scope ?? "From completed runs"}</span>
            </label>
            <select
              id={`${base}-alpha`}
              className="exec-rq-control"
              value={alphaListed ? f.alphaId : ""}
              disabled={!listReady || state.alphas.length === 0}
              aria-describedby={!listReady || state.alphas.length === 0 ? `${base}-alpha-help` : undefined}
              onChange={(e) => state.setAlpha(e.target.value)}
            >
              <option value="">{alphaListed || f.alphaId === "" ? alphaPlaceholder : `${f.alphaId} (typed by hand)`}</option>
              {state.alphas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
            {runs.status === "unavailable" ? (
              <p id={`${base}-alpha-help`} className="exec-rq-note" role="status">Run Library not available: {runs.reason} Type the ids below; the server checks them.</p>
            ) : !listReady || state.alphas.length === 0 ? (
              <p id={`${base}-alpha-help`} className="exec-rq-note">{runs.status === "loading" ? "Reading the completed runs the Run Library lists." : (runs.catalog === null ? "The Run Library lists no completed run, so there is nothing to pick. Type the ids below; the server checks them." : "The Run Library lists no alpha, so there is nothing to pick. Type the ids below; the server checks them.")}</p>
            ) : derivedAlphas ? (
              <p className="exec-rq-note">The Run Library did not publish its alpha list, so these are the alphas of the runs loaded so far. If yours is missing, type its id below.</p>
            ) : null}
          </div>

          <div className="exec-rq-fld">
            <label htmlFor={`${base}-run`} className="exec-rq-label">
              <span>Evidence run</span>
              {/* A new tab: navigating away would silently lose the typed summary and ids. */}
              <Link className="exec-rq-link" to={RUN_LIBRARY_HREF} target="_blank" rel="noopener noreferrer">
                Run Library<span className="exec-rq-sr"> (opens in a new tab)</span>
              </Link>
            </label>
            <select
              id={`${base}-run`}
              className="exec-rq-control"
              value={runListed ? f.runId : ""}
              disabled={!listReady || !alphaListed || runsPending}
              aria-describedby={!listReady || !alphaListed || runsPending ? `${base}-run-help` : undefined}
              onChange={(e) => state.setRun(e.target.value)}
            >
              <option value="">{runListed || f.runId === "" ? runPlaceholder : `${f.runId} (typed by hand)`}</option>
              {state.runOptions.map((o) => <option key={o.runId} value={o.runId}>{runLabel(o)}</option>)}
            </select>
            {!listReady || !alphaListed || runsPending ? <p id={`${base}-run-help`} className="exec-rq-note">{!listReady ? "Runs are listed once the Run Library has been read." : runsPending ? "Reading this alpha's completed runs." : "Pick an alpha to see its completed runs."}</p> : null}
            {listReady && alphaListed && !runsPending ? (
              <p className="exec-rq-note" data-testid="run-count">
                {state.runOptions.length === 0
                  ? "The Run Library lists no completed run for this alpha. Type the run id below if you have one; the server checks it."
                  : runs.filteredRows !== null && runs.filter !== null
                    ? `Showing the newest ${state.runOptions.length.toLocaleString("en-US")} of ${runs.filteredRows.toLocaleString("en-US")} completed runs of this alpha. If yours is missing, type its id below.`
                    : `Showing ${state.runOptions.length.toLocaleString("en-US")} completed runs, newest first. If yours is missing, type its id below.`}
              </p>
            ) : null}
            {listReady && alphaListed && runs.hasMore ? (
              <div className="exec-rq-more">
                <button
                  type="button"
                  className="exec-rq-btn"
                  aria-disabled={moreBlocked}
                  aria-busy={runs.loadingMore || undefined}
                  aria-describedby={moreBlocked ? moreWhyId : undefined}
                  title={moreBlocked ? moreWhy : undefined}
                  onClick={() => {
                    if (!moreBlocked) runs.loadMore();
                  }}
                >
                  {runs.loadingMore ? "Loading runs…" : "Load more runs"}
                </button>
                {moreBlocked ? <span id={moreWhyId} className="exec-rq-note">{moreWhy}</span> : null}
              </div>
            ) : null}
            {runs.moreError !== null ? <p className="exec-rq-error" role="alert">{runs.moreError}</p> : null}
          </div>

          <div className="exec-rq-fld">
            <span className="exec-rq-label" id={`${base}-claim-l`}>Methodology claim</span>
            {state.claim.kind === "pick" ? (
              <select
                className="exec-rq-control"
                aria-labelledby={`${base}-claim-l`}
                value={state.claim.claims.some((c) => c.id === f.claimId) ? f.claimId : ""}
                onChange={(e) => state.setClaim(e.target.value)}
              >
                <option value="">Pick a claim</option>
                {state.claim.claims.map((c) => <option key={c.id} value={c.id}>{claimHint(c) ? `${c.id} · ${claimHint(c)}` : c.id}</option>)}
              </select>
            ) : state.claim.kind === "only" ? (
              <p className="exec-rq-claim">
                <span className="exec-rq-mono">{state.claim.claim.id}</span>
                <span className="exec-rq-meta"> the only claim the Run Library lists for this run{claimHint(state.claim.claim) ? ` · ${claimHint(state.claim.claim)}` : ""}</span>
              </p>
            ) : state.claim.kind === "pick-run" ? (
              <p className="exec-rq-note">Pick a run first, or type the claim id below.</p>
            ) : state.claim.kind === "typed" ? (
              <p className="exec-rq-note">This run is not in the list, so the claim is typed below. The server refuses a claim that is not eligible.</p>
            ) : state.claim.kind === "none-listed" ? (
              <p className="exec-rq-note">The Run Library lists no eligible claim for this run. The server refuses a typed one that is not eligible.</p>
            ) : state.claim.kind === "cannot-list" ? (
              <p className="exec-rq-note">The Run Library cannot list claims for this run ({state.claim.reason}). Type the claim id below.</p>
            ) : (
              <p className="exec-rq-note">The Run Library does not publish claims for this run. Type the claim id below.</p>
            )}

            <details className="exec-rq-hand" open={handOpen ? true : undefined}>
              <summary>Ids · edit by hand</summary>
              <div className="exec-rq-hand-body">
                <IdInput label="Alpha id" value={f.alphaId} onChange={state.setAlpha} disabled={locked} hint="alpha id" />
                <IdInput label="Evidence run id" value={f.runId} onChange={state.setRun} disabled={locked} hint="run id" />
                <IdInput label="Claim id" value={f.claimId} onChange={state.setClaim} disabled={locked} hint="claim id" />
                <p className="exec-rq-meta">An id the server does not know is refused, never guessed.</p>
              </div>
            </details>
          </div>

          <div className="exec-rq-fld">
            <label htmlFor={`${base}-summary`} className="exec-rq-label">
              <span>Summary</span>
              <span id={counterId} className="exec-rq-label-meta exec-rq-mono" data-state={summary.state}>{summaryCounter(summary)}</span>
            </label>
            <textarea
              id={`${base}-summary`}
              className="exec-rq-control"
              rows={variant === "drawer" ? 4 : 5}
              value={f.summary}
              placeholder="What this alpha does, and why the evidence supports opening the loop for it."
              aria-invalid={summaryBad || undefined}
              aria-describedby={`${counterId} ${summaryHelpId}`}
              onChange={(e) => state.setSummary(e.target.value)}
            />
            <p id={summaryHelpId} className={summaryBad ? "exec-rq-error" : "exec-rq-note"}>
              {summary.state === "hostile"
                ? `Remove hidden or direction-changing characters (${summary.hostile.join(", ")}). The reviewer reads this as plain text.`
                : summary.state === "long"
                  ? `Too long: ${MAX_SUMMARY.toLocaleString("en-US")} characters at most.`
                  : `${MIN_SUMMARY} to ${MAX_SUMMARY.toLocaleString("en-US")} characters. It is the reviewer's first sentence.`}
            </p>
          </div>
        </fieldset>
      </div>

      {state.outcome !== null ? (
        <OutcomePanel
          outcome={state.outcome}
          requestKey={state.requestKey}
          busy={state.submitting}
          onDismiss={state.dismissOutcome}
          onNew={state.reset}
          onRetry={state.retry}
          onDiscardUncertain={state.discardUncertain}
          originalCheck={state.originalCheck}
          onCheckOriginal={state.checkOriginal}
          accessHref={accessHref}
        />
      ) : null}

      {settled ? null : (
        <div className="exec-rq-bar">
          <div className="exec-rq-bar-text">
            <div>{flag}</div>
            <p id={needId} className="exec-rq-need">{sentence}</p>
          </div>
          <div className="exec-rq-bar-act">
            {/* aria-disabled, not disabled: a disabled button drops keyboard focus to the page while a send is in flight. */}
            <button
              type="button"
              className="exec-rq-submit"
              aria-disabled={!gate.open}
              aria-describedby={gate.open ? undefined : reasonId}
              title={gate.open ? undefined : policyReason ?? gate.reason}
              onClick={() => {
                if (gate.open) state.submit();
              }}
            >
              {SUBMIT_LABEL}
            </button>
            <span id={reasonId} className="exec-rq-why" role={gate.open ? undefined : "status"}>{gate.open ? "Nothing is sent until you click Submit." : policyReason ?? gate.reason}</span>
            {advice !== null ? <span className="exec-rq-why" role="status">{advice}</span> : null}
          </div>
        </div>
      )}
    </form>
  );
}
