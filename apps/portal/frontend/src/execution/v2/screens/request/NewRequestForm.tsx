/**
 * The New request form, shared by the route page and the queue drawer (one form, two frames).
 *
 * Sections, as the hi-fi has them: Alpha, Evidence run (+ Run Library), Methodology claim (+ "Ids · edit by hand"),
 * Summary with a live counter, then the "Still needed" bar with the one Submit button, then the outcome.
 *
 * What is deliberately not here: no auto-submit anywhere. The only call to the port is `state.submit()`, and the
 * only caller of that is the submit button's click (or the form's submit event, which a disabled default button
 * cannot raise). Prefill from a link fills the fields and stops.
 */
import { useId } from "react";
import { Link } from "react-router-dom";

import { Flag } from "../../Flag";
import { ID_PATTERN, ID_RULE, claimHint, runLabel, RUN_LIBRARY_HREF, stillNeeded, summaryCounter, MAX_SUMMARY, MIN_SUMMARY } from "./model";
import { OutcomePanel } from "./OutcomePanel";
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
  const locked = settled || state.submitting;
  const listReady = runs.status === "ok";
  const alphaListed = state.alphas.some((a) => a.id === f.alphaId);
  const runListed = state.runOptions.some((o) => o.runId === f.runId);
  const summary = validation.summary;
  const summaryBad = summary.state === "long" || summary.state === "hostile";
  const reasonId = `${base}-why`;
  const needId = `${base}-need`;
  const counterId = `${base}-count`;
  const summaryHelpId = `${base}-sumhelp`;
  const handOpen = runs.status === "unavailable" || (listReady && state.alphas.length === 0) || (f.runId !== "" && !runListed) || (f.alphaId !== "" && !alphaListed);

  const alphaPlaceholder = runs.status === "loading" ? "Reading completed runs…" : runs.status === "unavailable" ? "Run Library not available" : state.alphas.length === 0 ? "No completed run to pick from" : "Pick an alpha";
  const runPlaceholder = f.alphaId === "" ? "Pick an alpha first" : !alphaListed ? "This alpha has no listed run" : "Pick a completed run";

  const flag = (() => {
    if (gate.open) return <Flag kind="ok" label="Ready" />;
    if (gate.kind === "policy") return <Flag kind="attention" label="Not enabled" />;
    if (gate.kind === "sending") return <Flag kind="pending" label="Sending" />;
    return <Flag kind="na" label="Incomplete" />;
  })();
  const sentence = gate.open
    ? "Everything needed is filled."
    : gate.kind === "policy"
      ? gate.reason
      : gate.kind === "sending"
        ? "Sending the request. It is shown as created only when the server says so."
        : gate.kind === "settled"
          ? "This request is recorded."
          : stillNeeded(validation.needs);

  return (
    <form
      className="exec-rq-form"
      data-variant={variant}
      noValidate
      aria-label="New approval request"
      onSubmit={(e) => {
        e.preventDefault();
        state.submit();
      }}
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
              <span className="exec-rq-label-meta">From completed runs</span>
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
              <p id={`${base}-alpha-help`} className="exec-rq-note">{runs.status === "loading" ? "Reading the completed runs the Run Library lists." : "The Run Library lists no completed run, so there is nothing to pick. Type the ids below; the server checks them."}</p>
            ) : null}
          </div>

          <div className="exec-rq-fld">
            <label htmlFor={`${base}-run`} className="exec-rq-label">
              <span>Evidence run</span>
              <Link className="exec-rq-link" to={RUN_LIBRARY_HREF}>Run Library</Link>
            </label>
            <select
              id={`${base}-run`}
              className="exec-rq-control"
              value={runListed ? f.runId : ""}
              disabled={!listReady || !alphaListed}
              aria-describedby={!listReady || !alphaListed ? `${base}-run-help` : undefined}
              onChange={(e) => state.setRun(e.target.value)}
            >
              <option value="">{runListed || f.runId === "" ? runPlaceholder : `${f.runId} (typed by hand)`}</option>
              {state.runOptions.map((o) => <option key={o.runId} value={o.runId}>{runLabel(o)}</option>)}
            </select>
            {!listReady || !alphaListed ? <p id={`${base}-run-help`} className="exec-rq-note">{listReady ? "Pick an alpha to see its completed runs." : "Runs are listed once the Run Library has been read."}</p> : null}
            {listReady ? <p className="exec-rq-note">Lists the Run Library&apos;s latest 50 runs, completed ones only. If yours is missing, type its id below.</p> : null}
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
        <OutcomePanel outcome={state.outcome} requestKey={state.requestKey} onDismiss={state.dismissOutcome} onNew={state.reset} accessHref={accessHref} />
      ) : null}

      {settled ? null : (
        <div className="exec-rq-bar">
          <div className="exec-rq-bar-text">
            <div>{flag}</div>
            <p id={needId} className="exec-rq-need">{sentence}</p>
          </div>
          <div className="exec-rq-bar-act">
            <button
              type="submit"
              className="exec-rq-submit"
              disabled={!gate.open}
              aria-describedby={gate.open ? undefined : reasonId}
              title={gate.open ? undefined : gate.reason}
            >
              {SUBMIT_LABEL}
            </button>
            <span id={reasonId} className="exec-rq-why">{gate.open ? "Submitting twice creates one request." : gate.reason}</span>
          </div>
        </div>
      )}
    </form>
  );
}
