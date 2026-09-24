/**
 * Screen 07 — S3 Freeze / integrity / what-if (P16 + RS-02).
 *
 * The hi-fi promises a chain: three digests link, an ordering verdict passes,
 * a what-if grid re-scores the neighbourhood. What the source publishes is
 * narrower and the screen says so in the same breath as every green mark:
 *
 *  - a **match is a retained-binding match**. The contract states its own
 *    scope — `PORTAL_RETAINED_DIGEST_BINDING_ONLY` — and this screen never
 *    prints "chain intact", never colours the artifact bytes green, and never
 *    lets `PARTIAL` read as whole.
 *  - **`BLOCKED` empties the table on purpose.** A frozen table filled from a
 *    local default when a binding mismatched would be the worst lie on the
 *    surface: it would look like this run's parameters.
 *  - **what-if is unavailable, so there is no slider.** Not a disabled one: a
 *    control that looks adjustable implies a question the source can answer.
 *
 * One POST exists on this screen and it fires from a click, with the
 * same-origin CSRF proof. Nothing on mount, no fold change and no re-render
 * ever sends it.
 */

import { useEffect } from "react";
import { Link } from "react-router-dom";

import { ProvenanceStrip } from "./ProvenanceStrip";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import { CURRENT_SOURCE_LANE_COPY } from "./researchRefusal";
import {
  BLOCKED_NOTE,
  FREEZE_GAP_WORDS,
  FREEZE_WITHHELD_WORDS,
  INTEGRITY_KEYS,
  PARTIAL_SCOPE_NOTE,
  freezeGapReason,
  type CurrentSourceFreeze,
  type FreezeAvailability,
  type FreezeDetail as FreezeDetailDocument,
  type FreezeSourceGap,
  type FreezeWindow,
  type FrozenParameter,
  type Integrity,
  type IntegrityCheck,
} from "./freezeClient";
import { deepDiveHref, type EvidenceCursor } from "./evidenceCursor";
import type { RetainedSlot, VerifySlot } from "./useFreeze";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/**
 * Spec 07 §2.1 fixes a subtitle this run cannot honestly carry: "Selection
 * closed before any out-of-sample bar was read — and every artifact below can
 * prove it, or the run is BLOCKED." That sentence asserts the ordering the
 * source states it does **not** assert, and the P16 handoff forbids exactly
 * that claim. The title is the spec's, verbatim; the subtitle says what this
 * screen can actually prove.
 */
export const FREEZE_SUBTITLE =
  "What was frozen, and what that freeze can honestly be checked against. Every match below is a match between digests Portal retained — the source artifact's own bytes were never opened here.";

export const FREEZE_RULES_FOOTER =
  "A verification on this screen re-reads retained bindings; it never re-runs the engine, opens an artifact or evaluates a parameter. Where the source publishes no ordering, no selection artifact and no what-if grid, the panels say which kind of absence that is rather than showing an empty chart or a control that cannot act.";

/** Spec 07 §2.2, verbatim — and the reason the two axes are never merged. */
export const TWO_CLOCKS_NOTE =
  "two clocks, never one axis — wall-clock proves WHO knew WHEN; data-time proves WHAT was knowable.";

const CHECK_LABEL: Record<(typeof INTEGRITY_KEYS)[number], string> = {
  P04_ADAPTER_CONTRACT: "adapter contract",
  P10_MANIFEST_BINDING: "manifest binding",
  P04_FIXED_PARAMETER_BUNDLE: "fixed parameter bundle",
};

/* ------------------------------------------------------------------ parts */

function Withheld({ availability, what }: { availability: FreezeAvailability; what?: string }) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      title={availability.reason_code ?? availability.state}
    >
      {what ? `${what} — ` : ""}
      {FREEZE_WITHHELD_WORDS[availability.state]}
    </span>
  );
}

function Gap({ gap, what }: { gap: FreezeSourceGap; what: string }) {
  return (
    <span className="flex items-baseline gap-1.5" data-gap-fact={what} data-gap-state={gap.state}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {what}
      </span>
      <span
        className="mono text-[10px] italic"
        style={{ color: "var(--ink-faint)" }}
        title={freezeGapReason(gap)}
      >
        {FREEZE_GAP_WORDS[gap.state]}
      </span>
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  ...rest
}: {
  children: React.ReactNode;
  tone?: string;
  border?: string;
} & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
      style={{ color: tone, borderColor: border, background: "var(--paper-raised)" }}
      {...rest}
    >
      {children}
    </span>
  );
}

function iso(at: number): string {
  return new Date(at).toISOString().slice(0, 16).replace("T", " ") + "Z";
}

/* --------------------------------------------------------------- integrity */

/**
 * The three named checks, and the scope sentence that qualifies all of them.
 *
 * A matched check is marked in the good colour; the panel's own heading says
 * what kind of match it is, and the artifact bytes sit in the same panel as a
 * `NOT_ATTESTED` fact so the two are read together rather than apart.
 */
function IntegrityPanel({
  integrity,
  verify,
  onVerify,
}: {
  integrity: Integrity;
  verify: VerifySlot;
  onVerify: () => void;
}) {
  const blocked = integrity.state === "BLOCKED";
  const byKey = new Map(integrity.checks.map((check) => [check.key, check] as const));

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-integrity={integrity.state}
      data-verification-scope={integrity.verification_scope}
      style={{
        borderColor: blocked ? "var(--bad)" : "var(--line)",
        background: blocked ? "var(--bad-bg-soft)" : "var(--paper-raised)",
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          retained binding check
        </h3>
        <Chip
          data-integrity-state={integrity.state}
          tone={blocked ? "var(--bad)" : "var(--role-holdout)"}
          border={blocked ? "var(--bad)" : "var(--role-holdout)"}
        >
          {integrity.state.toLowerCase()}
        </Chip>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
          {integrity.verification_scope.toLowerCase().replace(/_/g, " ")}
        </span>

        <button
          type="button"
          className="btn-ghost mono ml-auto text-[10px]"
          data-action="verify"
          onClick={onVerify}
          disabled={verify.state === "verifying"}
          title={
            verify.state === "verifying"
              ? "a verification is already in flight"
              : "re-read the retained bindings"
          }
        >
          {verify.state === "verifying" ? "verifying…" : "verify now"}
        </button>
      </div>

      {/* The scope, in words, beside every mark it qualifies. */}
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-scope-note>
        {blocked ? BLOCKED_NOTE : PARTIAL_SCOPE_NOTE}
      </p>

      <ul className="flex flex-col gap-1">
        {INTEGRITY_KEYS.map((key) => {
          const check = byKey.get(key);
          return (
            <li key={key} className="flex flex-wrap items-baseline gap-2" data-check={key}>
              <span className="mono text-[10px]" style={{ minWidth: 150 }}>
                {CHECK_LABEL[key]}
              </span>
              {check === undefined ? (
                <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
                  not published
                </span>
              ) : (
                <CheckRow check={check} />
              )}
            </li>
          );
        })}
      </ul>

      {/*
        * The one fact that stops a row of matches reading as a chain: the
        * source artifact's bytes were never attested here.
        */}
      <Gap gap={integrity.source_artifact_bytes} what="source artifact bytes" />

      {verify.state === "done" ? (
        <div className="flex flex-col gap-0.5" data-verify-result={verify.verification.result}>
          <p className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
            re-read {iso(verify.verification.verified_at_utc_ms)} ·{" "}
            {verify.verification.result.toLowerCase().replace(/_/g, " ")} · freeze revision{" "}
            {verify.verification.freeze_revision ?? "not published"}
          </p>
          {/*
            * The scope of the answer the reader just asked for, from that
            * answer — not borrowed from the snapshot beside it. The two agree
            * today because both describe the same run at the same moment; the
            * day they do not, this line is the one that is true.
            */}
          <p
            className="mono text-[9px]"
            style={{ color: "var(--ink-faint)" }}
            data-verify-scope={verify.verification.verification_scope}
          >
            this verification covers {verify.verification.verification_scope.toLowerCase().replace(/_/g, " ")}
          </p>
        </div>
      ) : verify.state === "refused" ? (
        <p className="text-[11px]" style={{ color: "var(--bad)" }} data-verify-refusal>
          <RefusalNote refusal={verify.refusal} />
        </p>
      ) : null}
    </section>
  );
}

function CheckRow({ check }: { check: IntegrityCheck }) {
  const matched = check.state === "MATCH";
  return (
    <>
      <Chip
        data-check-state={check.state}
        tone={matched ? "var(--good)" : check.state === "MISMATCH" ? "var(--bad)" : "var(--ink-faint)"}
        border={matched ? "var(--good)" : check.state === "MISMATCH" ? "var(--bad)" : "var(--line)"}
      >
        {check.state.toLowerCase()}
      </Chip>
      {/*
        * Both digests are printed for a mismatch, because "does not match" is
        * not actionable without them — and neither is ever shortened or
        * compared here.
        */}
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-expected={check.key}>
        expected {check.expected_digest ?? "not published"}
      </span>
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-observed={check.key}>
        observed {check.observed_digest ?? "not published"}
      </span>
    </>
  );
}

/* ------------------------------------------------------------ the ordering */

function WindowRow({ window, label }: { window: FreezeWindow | null; label: string }) {
  if (window === null) {
    return (
      <span className="flex items-baseline gap-1.5" data-window-row={label}>
        <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          {label}
        </span>
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          not published
        </span>
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-baseline gap-2" data-window-row={label}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      <span className="mono text-[10px]">
        {iso(window.start_utc_ms)} → {iso(window.end_exclusive_utc_ms)}
      </span>
      {window.bars !== null ? (
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {window.bars} bars
        </span>
      ) : null}
      <Chip data-window-role={window.data_role}>{window.data_role.toLowerCase().replace(/_/g, " ")}</Chip>
      <Chip data-window-input={window.child_input_state}>
        {window.child_input_state.toLowerCase().replace(/_/g, " ")}
      </Chip>
      {window.evaluation_state !== null ? (
        <Chip data-window-evaluation={window.evaluation_state}>
          {window.evaluation_state.toLowerCase().replace(/_/g, " ")}
        </Chip>
      ) : null}
    </span>
  );
}

/* --------------------------------------------------------- frozen profile */

function FrozenParameters({ parameters, blocked }: { parameters: readonly FrozenParameter[]; blocked: boolean }) {
  if (blocked) {
    return (
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--bad)" }} data-frozen-blocked>
        No frozen parameter is shown while a retained binding mismatches. Filling this table from a
        local default would put numbers here that are not this run's.
      </p>
    );
  }
  if (parameters.length === 0) {
    return (
      <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-frozen-empty>
        the source published no frozen parameter for this run
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-1.5" data-frozen={parameters.length}>
      {parameters.map((parameter) => (
        <div key={parameter.name} className="flex items-center gap-3" data-frozen-parameter={parameter.name}>
          <span className="mono text-[10.5px]" style={{ flex: "0 0 auto", minWidth: 78 }}>
            {parameter.name}
          </span>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)", flex: "0 0 auto", minWidth: 96 }}>
            {parameter.minimum} … {parameter.maximum} · {parameter.step}
          </span>
          <span className="mono text-[11px] font-semibold" data-frozen-value={parameter.name}>
            {parameter.frozen_value}
          </span>
          <span
            className="relative h-[12px] flex-1 rounded-[2px] border"
            style={{ borderColor: "var(--line-soft)", background: "var(--paper)" }}
            title={`${parameter.frozen_value} sits at ${parameter.position_percent}% of the declared range`}
          >
            {/* The server's placement, again: the browser never recomputes it. */}
            <span
              data-frozen-position={parameter.name}
              className="absolute top-0 h-full w-[2px]"
              style={{ left: `${parameter.position_percent}%`, background: "var(--good)" }}
            />
          </span>
        </div>
      ))}

      {/* The declared bound state, said once — the same shape Screen 06 uses. */}
      {[...new Set(parameters.map((parameter) => parameter.bound_state))].map((bound) => (
        <span
          key={bound}
          className="mono text-[9px]"
          style={{ color: "var(--ink-faint)" }}
          data-bound-state={bound}
        >
          every frozen parameter above: {bound.toLowerCase().replace(/_/g, " ")}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------- retained custody */

function RetainedPanel({ slot, onNeeded }: { slot: RetainedSlot; onNeeded: () => void }) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-retained={slot.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        retained custody check
      </h3>

      {slot.state === "ready" ? (
        <RetainedRows freeze={slot.freeze} />
      ) : slot.state === "not-applicable" ? (
        /* RF-05 CG-P13-09: a typed 200 — this run's profile is one the retained
           lane never holds. Nothing is pending and nothing failed. */
        <p
          className="text-[11px] leading-[1.5]"
          style={{ color: "var(--ink-soft)" }}
          data-retained-not-applicable
          title={`${slot.answer.lane.reason_code} · profile ${slot.answer.lane.run_profile} · adapter ${slot.answer.lane.run_adapter_contract_digest}`}
        >
          <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>not applicable</span> — this run is
          bound to the P04 fixed qualification, which the retained lane never holds. There is no manifest, row count or
          batch receipt to compare, and nothing is pending.
        </p>
      ) : slot.state === "refused" ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-retained-refusal>
          {slot.laneState ? (
            /* The server names why the lane is empty; its message text is not read. */
            <span data-lane-state={slot.laneState}>{CURRENT_SOURCE_LANE_COPY[slot.laneState]}</span>
          ) : (
            <RefusalNote refusal={slot.refusal} />
          )}
        </p>
      ) : (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading…
        </p>
      )}
    </section>
  );
}

function RetainedRows({ freeze }: { freeze: CurrentSourceFreeze }) {
  const { integrity } = freeze;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-baseline gap-2">
        <Chip
          data-retained-state={integrity.state}
          tone={integrity.state === "MATCH" ? "var(--good)" : "var(--bad)"}
          border={integrity.state === "MATCH" ? "var(--good)" : "var(--bad)"}
        >
          {integrity.state.toLowerCase()}
        </Chip>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-scope-code>
          {integrity.verification_scope.toLowerCase().replace(/_/g, " ")}
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-retained-rows>
          {integrity.retained_row_count} retained rows
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          retained {iso(freeze.provenance.retained_at_utc_ms)}
        </span>
      </div>

      {/* Both digests, printed, never compared here. */}
      <div className="flex flex-col gap-1">
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-manifest>
          manifest expected {integrity.expected_manifest_digest} · observed{" "}
          {integrity.observed_manifest_digest}
        </span>
        <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-retained-import>
          import expected {integrity.expected_retained_import_digest} · observed{" "}
          {integrity.observed_retained_import_digest}
        </span>
      </div>
      {/*
        * RS-02 is explicit that this `MATCH` is Portal retained custody —
        * manifest rows, counts and a batch receipt — and not an artifact-byte,
        * causal-order, selection or broker pass. The sentence travels with it.
        */}
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-retained-scope>
        A match here means the retained manifest, its row counts and its batch receipt agree with what
        Portal imported. It is not a check of artifact bytes, of causal order, of a selection, or of
        anything a broker saw.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

export interface FreezeScreenProps {
  runId: string;
  detail: FreezeDetailDocument | null;
  state: ResearchState;
  cursor: EvidenceCursor;
  verify: VerifySlot;
  onVerify: () => void;
  retained: RetainedSlot;
  ensureRetained: () => void;
  onReread: () => void;
}

export function FreezeScreen({
  runId,
  detail,
  state,
  cursor,
  verify,
  onVerify,
  retained,
  ensureRetained,
  onReread,
}: FreezeScreenProps) {
  const freeze = detail?.freeze;
  const blocked = freeze?.integrity.state === "BLOCKED";

  return (
    <div className="flex flex-col gap-3" data-screen="freeze-detail" data-run={runId}>
      <nav className="flex flex-wrap items-center gap-1.5 text-[11px]" aria-label="Breadcrumb">
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/evidence`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="back-to-hub"
        >
          Evidence Flow
        </Link>
        <span style={{ color: "var(--line-strong)" }}>/</span>
        <span className="mono">{runId}</span>
        <span style={{ color: "var(--line-strong)" }}>/</span>
        <span className="mono" style={{ color: "var(--ink-faint)" }}>
          Stage 3 · Freeze
        </span>
        <span style={{ color: "var(--line-strong)" }}>·</span>
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/search`, cursor)}
          className="mono"
          style={{ color: "var(--accent)" }}
          data-action="back-to-search"
        >
          ← S2 Search
        </Link>
      </nav>

      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-light" style={{ fontFamily: "var(--font-display)" }}>
          S3 · Freeze — ordering &amp; integrity
        </h1>
        <p className="text-[13.5px] italic" style={{ color: "var(--ink-mute)" }} data-subtitle>
          {FREEZE_SUBTITLE}
        </p>
      </div>

      {detail && freeze ? (
        <div
          className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[6px] border px-3.5 py-2"
          data-freeze-strip={freeze.source_profile.state}
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        >
          <Chip data-source-profile={freeze.source_profile.state} tone="var(--accent)" border="var(--accent)">
            {freeze.source_profile.state.toLowerCase().replace(/_/g, " ")}
          </Chip>
          <span className="flex items-baseline gap-1.5" data-selection-state={freeze.selection.state}>
            <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              selection
            </span>
            <span className="mono text-[10px]">{freeze.selection.state.toLowerCase().replace(/_/g, " ")}</span>
          </span>
          {/* The contract's readiness, which this screen never showed. */}
          <Chip data-readiness={detail.readiness}>readiness {detail.readiness.toLowerCase()}</Chip>
          <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
            as of {new Date(detail.as_of_utc_ms).toISOString()}
          </span>
        </div>
      ) : null}

      {detail ? <ProvenanceStrip provenance={detail.provenance} /> : null}

      <ResearchPanel
        title="freeze"
        meta={detail?.revision ? `revision ${detail.revision}` : undefined}
        state={state}
        minBodyHeight={240}
        recovery={
          state.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread freeze
            </button>
          ) : undefined
        }
      >
        {detail && freeze ? (
          <div className="flex flex-col gap-3">
            <IntegrityPanel integrity={freeze.integrity} verify={verify} onVerify={onVerify} />

            <section
              className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
              data-panel="frozen-parameters"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  frozen parameters
                </h3>
                {freeze.selection.parameter_bundle_digest !== null ? (
                  <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-bundle-digest>
                    bundle {freeze.selection.parameter_bundle_digest}
                  </span>
                ) : null}
              </div>
              <FrozenParameters parameters={freeze.frozen_parameters} blocked={blocked} />
              {/*
                * There is no selection artifact and no selected trial. Saying
                * so here, beside the parameters, stops the table reading as
                * "the winner of something".
                */}
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                <Gap gap={freeze.selection.strict_outer_oos} what="strict outer OOS" />
                <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-selection-refs>
                  selection artifact · selected trial · selection sequence — none published
                </span>
              </div>
            </section>

            <section
              className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
              data-panel="ordering"
              data-ordering-state={freeze.ordering.state}
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  ordering
                </h3>
                {/*
                  * `NOT_ASSERTED` is not a failed causality check and not a
                  * passed one. No verdict chip is drawn for it at all.
                  */}
                <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={freeze.ordering.reason_code}>
                  {freeze.ordering.state.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
              <Gap gap={freeze.ordering.wall_clock} what="wall clock ordering" />
              <div className="flex flex-col gap-1.5" data-data-time={freeze.ordering.data_time.state}>
                <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  data time{" "}
                  {freeze.ordering.data_time.chronology_kind !== null
                    ? `· ${freeze.ordering.data_time.chronology_kind.toLowerCase().replace(/_/g, " ")}`
                    : ""}
                </span>
                <WindowRow window={freeze.ordering.data_time.is} label="IS" />
                <WindowRow window={freeze.ordering.data_time.outer_oos} label="outer OOS" />
                <WindowRow window={freeze.ordering.data_time.holdout} label="holdout" />
              </div>
              <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-two-clocks>
                {TWO_CLOCKS_NOTE}
              </p>
              <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-ordering-note>
                Only one of those two clocks is published for this run. These are the data windows —
                what was knowable. They are not a wall-clock timeline and not a causal verdict, because
                the source asserted neither.
              </p>
            </section>

            <section
              className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
              data-panel="what-if"
              data-what-if={freeze.what_if.state}
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                  what-if
                </h3>
                <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} title={freeze.what_if.reason_code}>
                  {freeze.what_if.state.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
              {/*
                * No slider, no grid, not even a disabled one. A control that
                * looks adjustable implies a question this source can answer,
                * and `may_submit` / `may_create` are both pinned false.
                */}
              <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                No grid is drawn and no control is offered. Re-scoring a neighbourhood needs an
                objective definition and an evaluation the source does not publish, and a slider that
                cannot move is still a promise that it could.
              </p>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-whatif-grid={freeze.what_if.grid.state}>
                  grid — {freeze.what_if.grid.state.toLowerCase().replace(/_/g, " ")}
                </span>
                <span
                  className="mono text-[9px]"
                  style={{ color: "var(--ink-faint)" }}
                  data-action-evaluate={freeze.what_if.actions.diagnostic_evaluate.state}
                  data-may-submit={String(freeze.what_if.actions.diagnostic_evaluate.may_submit)}
                >
                  diagnostic evaluate — {freeze.what_if.actions.diagnostic_evaluate.state.toLowerCase().replace(/_/g, " ")}
                </span>
                <span
                  className="mono text-[9px]"
                  style={{ color: "var(--ink-faint)" }}
                  data-action-sibling={freeze.what_if.actions.sibling_draft.state}
                  data-may-create={String(freeze.what_if.actions.sibling_draft.may_create)}
                >
                  sibling draft — {freeze.what_if.actions.sibling_draft.state.toLowerCase().replace(/_/g, " ")}
                </span>
              </div>
            </section>

            <section
              className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
              data-panel="inspection"
              data-inspection-state={freeze.inspection.state}
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            >
              <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                fold inspection
              </h3>
              <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
                {freeze.inspection.requested_fold === null
                  ? "No fold was requested."
                  : `Fold ${freeze.inspection.requested_fold} was requested.`}{" "}
                This run has no fold selection artifact, so the request is answered{" "}
                {freeze.inspection.state.toLowerCase().replace(/_/g, " ")}.
              </p>
              <Withheld availability={freeze.inspection.availability} />
            </section>

            <RetainedPanel slot={retained} onNeeded={ensureRetained} />

            {Object.keys(detail.source_absences).length > 0 ? (
              <section
                className="flex flex-wrap gap-x-5 gap-y-1.5 rounded-[8px] border px-4 py-3"
                data-source-absences
                style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
              >
                {Object.entries(detail.source_absences).map(([name, gap]) => (
                  <Gap key={name} gap={gap} what={name.replace(/_/g, " ")} />
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </ResearchPanel>

      <footer className="flex flex-col gap-1">
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
          {FREEZE_RULES_FOOTER}
        </p>
      </footer>
    </div>
  );
}
