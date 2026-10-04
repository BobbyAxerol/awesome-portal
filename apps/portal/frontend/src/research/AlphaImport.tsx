/**
 * Screen 14 — Alpha Import (P07 composition scope, E6 HiFi rebuild).
 *
 * A three-step wizard: submit one `.py`, run seven fail-closed gates, then
 * register a DRAFT that an authorised actor may activate.
 *
 * Four rules from spec 14 shape almost everything here:
 *
 *  - **The browser never parses Python.** The mirror table is the server's AST
 *    result rendered read-only. There is no editable contract field anywhere,
 *    because the parameter space comes from the code: changing it means
 *    changing the file and submitting again.
 *  - **Fail-closed.** One red gate stops the import. Later gates render
 *    `SKIPPED`, step 3 stays disabled, and no provisional registration exists.
 *  - **Editing the source invalidates everything downstream.** A receipt
 *    belongs to exact bytes; reusing it for changed bytes would register
 *    something nobody gated.
 *  - **DRAFT is not ACTIVE.** Registration never activates implicitly;
 *    activation is a separate, permissioned action carrying a CAS revision.
 *
 * Layout (E6, `QuantBT 14 Alpha Import.dc.html`): a header with the state chip
 * and the endpoint meta line, a horizontal stepper card, one step's view at a
 * time (VD-TEXT-01: no subtitle, no rules footer). The HiFi's four stepper entries
 * are three here: Code anatomy is a presentation substage of step 1
 * (`S14-VIS-01`, DQ-06), never a fourth authority state.
 *
 * Every step view stays mounted and the inactive ones are `hidden`. A view is
 * a way of looking, not a lifecycle: the reader's pasted source, a gate list
 * mid-stagger and a refusal beside its button must survive a click on the
 * stepper, and nothing may be re-requested because a tab changed.
 *
 * Composition note: the step controls live *outside* `ResearchPanel`, and each
 * panel holds only what the server returned. A panel's state describes its own
 * request, and `ResearchPanel` withholds both content and actions when that
 * request failed — so a form kept inside one would vanish the moment a parse
 * went `unavailable`, taking the user's pasted source with it.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";

import type {
  ActivationResponse,
  GateRow,
  GatesResponse,
  ImportAttestation,
  ImportRefusal,
  MirrorField,
  RegistrationResponse,
  RegistryEntry,
  SourceResponse,
} from "./alphaImportClient";
import { LineageLink, lineageHref } from "./LineageLink";
import { newRunPrefillHref } from "./lineageClient";
import { smokeMotionAllowed } from "../execution/smokeMotion";
import {
  ANATOMY_SUBSTAGE_NOTE,
  CODE_ANATOMY,
  UNLOCK_FOOTER,
  UNLOCK_MAP,
} from "./codeAnatomy";
import { ResearchPanel } from "./ResearchPanel";
import { formatBytes, formatUtc, groupDecimalString } from "./researchFormat";
import { refusalDetail } from "./researchRefusal";
import { ShortId } from "./ShortId";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** Spec 14 §2.2 — shown whenever a gate has failed. */
export const FAIL_CLOSED_NOTE = "fail-closed: a red gate stops the import.";

/** Spec 14 §2.3 — shown on a DRAFT registration (VD-TEXT-01: shortened, same meaning). */
export const DRAFT_NOTE = "a DRAFT can run, not seal a candidate";

/** Spec 14 §4 pitfall 8 — shown when more than one file is offered. */
export const SINGLE_FILE_ERROR = "One file only.";

/** A file that is not `.py` is refused with this one line and never read (W2C). */
export const NON_PY_ERROR = ".py files only.";

/** Stagger between gate rows. Suppressed under `prefers-reduced-motion`. */
export const GATE_STAGGER_MS = 120;

/** HiFi title, verbatim. */
export const IMPORT_TITLE = "Import alpha";

/**
 * VD-TEXT-01 (2026-10-01): the subtitle under the title and the "rules of this
 * screen" footer are gone. The meta line keeps only the endpoint family; the
 * hard-coded permission claim ("activation ADMIN-only") is gone too — whether
 * this account may activate is the server's `may_activate` / `may_activate_reason`.
 */
export const IMPORT_META = "";

/**
 * Field rules under the mirror. Every pattern is the contract's own
 * (`research-alpha-import.v1.schema.json`); a test reads the schema and
 * compares, so the sentence cannot drift from the validator.
 */
/** The alpha id rule in words (`RULE_PATTERNS.alphaId`), shown beside the field when the typed id breaks it. */
export const ALPHA_ID_RULE = "a–z, 0–9, hyphen; 3–64; start with a letter.";

export const RULE_PATTERNS = {
  alphaId: "^[a-z][a-z0-9-]{2,63}$",
  versionLabel: "^av_[0-9]+(?:_[0-9]+){2}$",
  timeframe: "^[1-9][0-9]*(?:m|h|d|w)$",
} as const;

/**
 * Run admission for one registered version, as the server serves it
 * (`RegistryEntry.run_admission`, F1 CG-FG-S14-03). It is a caller/version
 * precheck, not an authorisation: a fresh preflight and create-time admission
 * still decide. The browser binds the answer; it never decides one.
 *
 * One sentence per contract code, typed over the contract's union so a new
 * code breaks the build instead of falling through to a guess.
 */
export type RunAdmission = NonNullable<RegistryEntry["run_admission"]>;
export type RunAdmissionCode = NonNullable<RunAdmission["code"]>;

export const RUN_ADMISSION_COPY: Record<RunAdmissionCode, string> = {
  RESEARCH_RUN_PRODUCER_UNAVAILABLE: "no run producer is available for this version",
  RESEARCH_RUN_CREATE_FORBIDDEN: "this account may not create runs",
  RESEARCH_RUN_ALPHA_NOT_ACTIVE: "this version is not ACTIVE",
  RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE: "no executor is installed for this version",
};

export const RUN_LINK_LABEL = "new run with this version";

/** The New Run route's own prefill contract (`NewRunRoute`: `?alpha=` + `?av=`). */
export function newRunHref(alphaId: string, alphaVersionId: string): string {
  return newRunPrefillHref(alphaId, alphaVersionId);
}

/** What the "new run with this av_" slot shows, from what the server has served. */
export type RunSlot =
  | { kind: "none" }
  | { kind: "admitted"; href: string }
  | { kind: "refused"; code: RunAdmissionCode | null; sentence: string | null }
  | { kind: "absent"; code: "REGISTRY_NOT_READ" | "NOT_PUBLISHED"; sentence: string };

/**
 * Nothing registered → nothing to run (`none`: no link, no reason). A registered
 * version whose registry row has not returned, or whose row carries no
 * `run_admission`, is a typed absence — never a guess either way.
 */
export function runSlot(registration: RegistrationResponse | null, entry: RegistryEntry | null): RunSlot {
  if (!registration) return { kind: "none" };
  if (!entry) {
    return { kind: "absent", code: "REGISTRY_NOT_READ", sentence: "run admission not read yet" };
  }
  const admission = entry.run_admission;
  if (!admission) return { kind: "absent", code: "NOT_PUBLISHED", sentence: "run admission — not published" };
  if (admission.may_create_run) return { kind: "admitted", href: newRunHref(entry.alpha_id, entry.alpha_version_id) };
  const code = admission.code ?? null;
  return { kind: "refused", code, sentence: code ? (RUN_ADMISSION_COPY as Record<string, string | undefined>)[code] ?? null : null };
}

/** Registry rows the HiFi draws that no v1 response carries (typed absences). */
export const REGISTRATION_ABSENT = {
  capability: {
    code: "NOT_IN_V1_CONTRACT",
    text: "not recorded at import — preflight decides routes",
  },
  /* No hard-coded signature fact: the "signed publication" row prints the
     attestation the server served, or says none was served (14-09). */
  attestationNotServed: {
    code: "ATTESTATION_NOT_SERVED",
    text: "not published — no attestation served",
  },
} as const;

/**
 * Why activation is not permitted, from the server's `may_activate_reason`
 * (F1 CG-FG-S14-02). Typed over the contract's union. With no served reason the
 * line says "not permitted" and nothing about a cause.
 */
export type ActivationReasonCode = NonNullable<RegistryEntry["may_activate_reason"]>;

export const ACTIVATION_REASON_COPY: Record<ActivationReasonCode, string> = {
  ROLE_NOT_ADMIN: "needs a workspace ADMIN",
  VERSION_NOT_IMPORTED: "not an imported version",
  VERSION_NOT_ACTIVATABLE: "this version cannot be activated",
};

export const ACTIVATION_NOT_PERMITTED = "Activation not permitted";
export const ACTIVATION_NO_REASON = "reason not published";

export function activationNotPermitted(reason: string | null | undefined): { sentence: string; code: string | null } {
  /* No served reason: the line says only "not permitted"; the tooltip says no reason was published. */
  if (!reason) return { sentence: ACTIVATION_NOT_PERMITTED, code: null };
  const known = (ACTIVATION_REASON_COPY as Record<string, string | undefined>)[reason];
  return { sentence: known ? `${ACTIVATION_NOT_PERMITTED} — ${known}` : ACTIVATION_NOT_PERMITTED, code: reason };
}

/** The "not permitted" line: the served reason's sentence and its code (mono). */
function ActivationNotPermitted({ reason }: { reason: string | null | undefined }) {
  const { sentence, code } = activationNotPermitted(reason);
  return (
    <span title={code ? undefined : ACTIVATION_NO_REASON}>
      {sentence}
      {code ? (
        <>
          {" · "}
          <span className="mono" data-activation-reason={code}>
            {code}
          </span>
        </>
      ) : null}
    </span>
  );
}

/**
 * The state of a panel whose request has not been made yet.
 *
 * Not `loading`: nothing is in flight. Not `available`: there is nothing to
 * show. `empty` with the step's own sentence is the honest pair — the frame
 * stays, and the reason says which step is still owed rather than implying the
 * server answered with nothing.
 */
export function awaitingStep(reason: string): ResearchState {
  return { state: "empty", reason, mayRetry: false, retainsContent: false };
}

/* ----------------------------------------------------------------- styles */

/*
 * Measured from the HiFi markup, block by block; every HiFi colour is written
 * as its token (paper, paper-raised, paper-sunken, line, line-soft,
 * line-strong, ink-faint, ink-soft, accent, accent-soft, good, accent-2, and
 * the card shadow as shadow-e1). Two HiFi values are near matches rather than
 * exact: the stronger hairline maps to line-strong and the near-paper tint to
 * paper. Literals stay in tokens.css only (U02 token gate).
 */
const AI_CSS = `
.ai-page { max-width: 1240px; margin: 0 auto; padding: 16px 24px 56px; display: flex; flex-direction: column; gap: 12px; color: var(--ink); font-family: var(--font-body); font-size: 13px; min-width: 0; }
.ai-page a { color: var(--accent); text-decoration: none; }
.ai-page a:hover { color: var(--accent-strong); text-decoration: underline; }
:where(.ai-page) button { font: inherit; }
/* A step view is hidden; Tailwind's flex class would otherwise win over the UA rule. */
.ai-page [hidden] { display: none !important; }
.ai-page .mono { font-family: var(--font-mono); }
.ai-head { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-end; gap: 10px 16px; border-bottom: 1px solid var(--line); padding-bottom: 10px; }
.ai-head > .l { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.ai-crumb { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-soft); }
.ai-crumb .sep { color: var(--ink-faint); }
.ai-crumb .here { color: var(--ink); }
.ai-crumb .next { font-family: var(--font-mono); font-size: 10px; }
.ai-titlerow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
.ai-title { font-family: var(--font-display); font-size: 22px; font-weight: 300; letter-spacing: -.01em; line-height: 1.25; margin: 0; }
.ai-chip { font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1px solid var(--accent-2); color: var(--accent-2); background: var(--paper-raised); border-radius: 999px; padding: 2px 10px; white-space: nowrap; }
.ai-chip[data-chip="QUARANTINE"] { border-style: dashed; }
.ai-chip[data-chip="ACTIVE"] { border-color: var(--good); color: var(--good); }
.ai-meta { flex: 0 1 auto; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); overflow-wrap: anywhere; }
.ai-stepper { display: flex; gap: 4px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); box-shadow: var(--shadow-e1); padding: 5px; overflow-x: auto; }
.ai-step { display: flex; align-items: center; gap: 8px; border: 0; border-radius: 5px; padding: 5px 12px; min-height: 40px; background: transparent; color: var(--ink); flex: none; cursor: pointer; text-align: left; }
.ai-step[aria-selected="true"] { background: var(--accent-soft); }
.ai-step .num { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1.5px solid var(--ink-faint); color: var(--ink-mute); }
.ai-step[data-progress="done"] .num { border-color: var(--good); color: var(--good); }
.ai-step[data-progress="failed"] .num { border-color: var(--bad); color: var(--bad); }
.ai-step[aria-selected="true"] .num { border-color: var(--accent); color: var(--accent); }
.ai-step .txt { display: flex; flex-direction: column; align-items: flex-start; }
.ai-step .lbl { font-size: 11.5px; font-weight: 500; }
.ai-cols { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
.ai-cols[data-stretch] { align-items: stretch; }
.ai-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); min-width: 0; }
.ai-card[data-shadow] { box-shadow: var(--shadow-e1); }
.ai-card[data-pad] { padding: 12px 14px; display: flex; flex-direction: column; gap: 5px; }
.ai-label { font-family: var(--font-body); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-faint); margin: 0; }
.ai-mirror-card { flex: 1.4; min-width: 460px; overflow-x: auto; }
.ai-mirror-head { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 12px; padding: 8px 14px; border-bottom: 1px solid var(--line-soft); }
.ai-mirror-head .m { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ai-mirror-cols { display: flex; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--ink-faint); border-bottom: 1px solid var(--line-soft); padding: 5px 14px; }
.ai-mirror-cols .k, .ai-row .k { width: 180px; flex: none; }
.ai-mirror-cols .v, .ai-row .v { flex: 1; min-width: 0; }
.ai-mirror-cols .c, .ai-row .c { width: 90px; flex: none; text-align: right; }
.ai-mirror-body { padding: 0 0 2px; }
.ai-mirror-body [data-research-state], .ai-mirror-body [aria-label="Loading"] { margin: 8px 14px; }
.ai-row { display: flex; align-items: baseline; gap: 0 8px; padding: 5px 14px; border-bottom: 1px solid var(--paper-sunken); margin: 0; }
.ai-row .k { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink-soft); overflow-wrap: anywhere; }
.ai-row .v { font-family: var(--font-mono); font-size: 10.5px; color: var(--ink); overflow-wrap: anywhere; margin: 0; }
.ai-row .c { font-family: var(--font-mono); font-size: 9px; font-weight: 700; margin: 0; }
.ai-absent { font-family: var(--font-mono); font-size: 8.5px; font-weight: 700; border: 1px dashed currentColor; border-radius: 3px; padding: 0 4px; line-height: 14px; }
.ai-rules { padding: 7px 14px; font-size: 10px; color: var(--ink-faint); line-height: 1.5; margin: 0; }
.ai-rules .mono { color: var(--ink-soft); }
.ai-side { flex: 1; min-width: 320px; display: flex; flex-direction: column; gap: 12px; }
.ai-drop { border: 1.5px dashed var(--line-strong); border-radius: 6px; background: var(--paper-raised); padding: 16px 14px; display: flex; flex-direction: column; gap: 3px; align-items: center; text-align: center; }
.ai-drop[data-over] { border-color: var(--accent); background: var(--accent-soft); }
.ai-drop .file { font-family: var(--font-mono); font-size: 11px; }
.ai-drop .custody { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ai-drop .quarantine { font-size: 10px; color: var(--accent-2); }
.ai-paste { display: flex; flex-direction: column; gap: 3px; }
.ai-paste textarea { font-family: var(--font-mono); font-size: 11px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); padding: 6px 8px; resize: vertical; min-height: 96px; width: 100%; box-sizing: border-box; color: var(--ink); }
.ai-entry { font-family: var(--font-mono); font-size: 10.5px; line-height: 1.7; color: var(--ink-soft); white-space: pre-wrap; margin: 0; }
.ai-note { font-size: 10px; color: var(--ink-faint); line-height: 1.5; margin: 0; }
.ai-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.ai-btn { font-family: var(--font-mono); font-size: 10px; font-weight: 600; border: 1px solid var(--accent); border-radius: 6px; background: var(--accent); color: var(--accent-contrast); padding: 5px 12px; cursor: pointer; }
.ai-btn[disabled] { background: var(--paper-sunken); border-color: var(--line); color: var(--ink-mute); cursor: not-allowed; }
.ai-btn[data-quiet] { background: var(--paper-raised); color: var(--accent); }
.ai-reason { font-size: 10.5px; color: var(--ink-mute); }
.ai-pipe { padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ai-pipe-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 8px; }
.ai-pipe-head .m { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); }
.ai-gate { display: flex; align-items: baseline; gap: 4px 10px; padding: 5px 0; border-bottom: 1px solid var(--paper-sunken); flex-wrap: wrap; }
.ai-gate .dot { width: 9px; height: 9px; border-radius: 50%; flex: none; border: 2px solid currentColor; background: var(--paper); }
.ai-gate[data-gate-state="PASS"] .dot { background: currentColor; }
.ai-gate .name { width: 210px; flex: none; font-family: var(--font-mono); font-size: 11px; font-weight: 600; color: var(--ink); }
.ai-gate .state { width: 76px; flex: none; font-family: var(--font-mono); font-size: 9px; font-weight: 700; }
.ai-gate .detail { flex: 1; min-width: 240px; font-size: 10.5px; color: var(--ink-soft); line-height: 1.5; overflow-wrap: anywhere; }
.ai-gate .timing { font-family: var(--font-mono); font-size: 9.5px; color: var(--ink-faint); white-space: nowrap; }
.ai-amber { font-size: 10px; color: var(--accent-2); line-height: 1.5; margin: 0; }
.ai-reg { flex: 1.2; min-width: 400px; }
.ai-kv { display: flex; gap: 12px; font-size: 11px; border-bottom: 1px solid var(--paper-sunken); padding: 3px 0; margin: 0; }
.ai-kv dt { width: 190px; flex: none; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); }
.ai-kv dd { flex: 1; min-width: 0; font-family: var(--font-mono); font-size: 10.5px; margin: 0; overflow-wrap: anywhere; }
.ai-kv dd .soft { color: var(--ink-faint); }
.ai-kv dd[data-absent] { font-style: italic; color: var(--ink-mute); font-size: 10px; }
.ai-next { flex: 1; min-width: 320px; border: 1px solid var(--accent-2); border-radius: 8px; background: var(--paper-raised); padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
.ai-next .ai-label { font-weight: 700; color: var(--accent-2); }
.ai-next p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.ai-next .links { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ai-next .links a, .ai-next .links .absent { border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); color: var(--ink-soft); padding: 6px 14px; font-family: var(--font-mono); font-size: 10px; text-decoration: none; }
.ai-next .links .absent { border-style: dashed; border-color: var(--accent-2); color: var(--accent-2); background: var(--paper-raised); cursor: not-allowed; }
.ai-gatestrip { display: flex; gap: 3px; height: 6px; }
.ai-gatestrip li { flex: 1 1 0; border-radius: 3px; }
.ai-gatestrip li[data-gate-cell="SKIPPED"] { opacity: .35; }
.ai-gatestrip li[data-motion="pulse"] { animation: ai-pulse 900ms ease-in-out infinite alternate; }
@keyframes ai-pulse { from { opacity: .35; } to { opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .ai-gatestrip li[data-motion="pulse"] { animation: none; } }
.ai-next[data-motion="true"] { animation: ai-reveal 180ms ease-out; }
@keyframes ai-reveal { from { opacity: .4; transform: translateY(3px); } to { opacity: 1; transform: none; } }
.ai-next .links a[data-primary="true"] { border-color: var(--accent); background: var(--accent); color: var(--accent-contrast); }
.ai-next .links a[data-primary="true"]:hover { color: var(--accent-contrast); text-decoration: none; filter: brightness(1.08); }
.ai-reglinks { display: inline-flex; gap: 6px; font-family: var(--font-mono); font-size: 9.5px; }
.ai-lifecycle { font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px solid var(--accent-2); color: var(--accent-2); border-radius: 3px; padding: 0 5px; line-height: 15px; }
.ai-lifecycle[data-lifecycle="ACTIVE"] { border-color: var(--good); color: var(--good); }
.ai-registry { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-more { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; margin-top: 8px; font-size: 10.5px; }
.ai-regentry { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); padding: 6px 10px; font-size: 10px; }
.ai-alert { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 12px; border: 1px solid var(--bad); border-radius: 6px; background: var(--bad-bg-soft); padding: 8px 12px; }
.ai-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.ai-anatomy summary { cursor: pointer; padding: 8px 14px; font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-soft); }
@media (max-width: 720px) {
  .ai-page { padding: 12px 16px 40px; }
  .ai-stepper { gap: 2px; padding: 3px; }
  .ai-step { flex: 1 1 0; min-width: 0; min-height: 44px; padding: 5px 8px; justify-content: center; }
  .ai-mirror-card, .ai-side, .ai-reg, .ai-next { min-width: 0; flex-basis: 100%; }
  .ai-mirror-cols .k, .ai-row .k { width: 156px; }
  .ai-mirror-cols .c, .ai-row .c { width: 84px; }
  .ai-kv dt { width: 132px; }
  .ai-gate .name { width: auto; min-width: 180px; }
  .ai-gate .detail { min-width: 0; flex-basis: 100%; padding-left: 19px; }
}
`;

/* ------------------------------------------------------------------ parts */

/**
 * A step control, plus the sentence that says why it cannot be pressed.
 *
 * §3.5: a disabled control the reader expected to use has to state its reason.
 * The reason is both the tooltip and a visible line, because a tooltip alone
 * reaches neither touch nor keyboard.
 */
function StepButton({
  label,
  onClick,
  disabled,
  reason,
  action,
  hint,
}: {
  label: string;
  onClick: () => void;
  /** Tooltip while the control is pressable (the honest "what this does"). */
  hint?: string;
  /** Why the control is inert, or null when it is pressable. */
  reason: string | null;
  action: string;
  disabled?: boolean;
}) {
  const inert = disabled === true || reason !== null;
  const reasonId = `ai-reason-${action}`;
  return (
    <span className="ai-controls no-print">
      <button
        type="button"
        className="ai-btn"
        onClick={onClick}
        disabled={inert}
        title={inert ? (reason ?? "A request is in flight.") : hint}
        aria-describedby={reason ? reasonId : undefined}
        data-action={action}
      >
        {label}
      </button>
      {/* The reason is the tooltip and the accessible description; the stepper already shows
          which step is owed, so it is not printed a second time (TEXT_C I7/I8). */}
      {reason ? (
        <span id={reasonId} className="ai-sr" data-disabled-reason={action}>
          {reason}
        </span>
      ) : null}
    </span>
  );
}

/**
 * The one place a refused step prints its refusal (W2C): a short line, an action only
 * where one helps, and the code, the server's text and the request id in the tooltip.
 */
function StepRefusal({ refusal, panel }: { refusal: ImportRefusal; panel?: string }) {
  const tip = refusalDetail({ code: refusal.code, detail: refusal.detail ?? null, requestId: refusal.requestId });
  return (
    <div
      role="alert"
      className="ai-alert"
      title={tip ?? undefined}
      /* The refused step keeps its named panel frame (a screen reader still lands on it by name). */
      data-research-panel={panel}
      data-state={panel ? refusal.state : undefined}
      aria-label={panel}
      data-refusal={refusal.neutral ? "DENIED" : (refusal.code ?? "UNKNOWN")}
      data-research-state={refusal.state}
    >
      <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {refusal.message}
      </span>
      {refusal.origin ? (
        <button type="button" className="ai-btn" data-action="reload" onClick={() => window.location.reload()}>
          Reload
        </button>
      ) : null}
    </div>
  );
}

/**
 * A SHA-256 digest as the HiFi prints it (`sha256:88c1f2…`): E1 `ShortId`
 * shows eight hex, the full value rides in its title, copy and `data-full-id`.
 */
function Digest({ value, label }: { value: string; label: string }) {
  const bare = value.startsWith("sha256:") ? value.slice("sha256:".length) : value;
  return (
    <span className="mono whitespace-nowrap" data-digest>
      sha256:
      <ShortId id={bare} label={label} />
      {bare.length > 8 ? "…" : null}
    </span>
  );
}

/**
 * A receipt id the server minted (`rgate_…`): a type prefix plus a 26-character
 * ULID (upper-case Crockford base32). The shared E1 `shortId` cuts only hex
 * tails, so a real receipt printed whole — 32 characters — while the canonical
 * fixture's `rgate-demo-01` never showed it. Same contract as `ShortId`: eight
 * characters on screen; the full value in the title, `data-full-id`, the
 * accessible name and the copy.
 */
const ULID_ID = /^([a-z][a-z0-9]{0,7}_)([0-9A-HJKMNP-TV-Z]{26})$/;

function UlidId({ id, shown, label }: { id: string; shown: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="mono"
      data-full-id={id}
      data-copied={copied || undefined}
      onClick={() => {
        void navigator.clipboard?.writeText(id).then(
          () => setCopied(true),
          () => undefined,
        );
      }}
      title={copied ? `${id} — copied` : `${id} — click to copy`}
      aria-label={`${label} ${id}, copy`}
      style={{ border: 0, padding: 0, background: "transparent", color: "inherit", fontSize: "inherit", fontWeight: "inherit", cursor: "copy", whiteSpace: "nowrap" }}
    >
      {shown}
    </button>
  );
}

function ReceiptId({ id, label }: { id: string; label: string }) {
  const match = ULID_ID.exec(id);
  return match ? <UlidId id={id} shown={`${match[1]}${match[2].slice(0, 8)}`} label={label} /> : <ShortId id={id} label={label} />;
}

/* ----------------------------------------------------------------- mirror */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** One parameter declaration as the HiFi prints it: `window (8, 64, 1)`. */
function formatParameter(name: string, declaration: unknown): string {
  if (isRecord(declaration)) {
    const kind = declaration.kind;
    if ((kind === "int_range" || kind === "float_range") && "low" in declaration) {
      return `${name} (${formatMirrorValue(declaration.low)}, ${formatMirrorValue(declaration.high)}, ${formatMirrorValue(declaration.step)})`;
    }
    if (kind === "categorical" && Array.isArray(declaration.values)) {
      return `${name} [${declaration.values.map(formatMirrorValue).join(", ")}]`;
    }
    if (kind === "fixed" && "value" in declaration) return `${name} = ${formatMirrorValue(declaration.value)}`;
  }
  return `${name}: ${formatMirrorValue(declaration)}`;
}

/**
 * A mirrored value as text. Exact: an integer keeps every digit (grouped, never
 * through a float), a list reads as a list, a parameter space reads as the
 * HiFi's `(low, high, step)` tuples. `null`/`undefined` is the empty string —
 * the caller renders the row's typed absence instead.
 */
export function formatMirrorValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number") return Number.isInteger(value) ? groupDecimalString(String(value)) : String(value);
  if (typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatMirrorValue).join(", ");
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > 0 && entries.every(([, entry]) => isRecord(entry) && typeof entry.kind === "string")) {
      return entries.map(([name, entry]) => formatParameter(name, entry)).join(" · ");
    }
    return entries.map(([key, entry]) => `${key}: ${formatMirrorValue(entry)}`).join(" · ");
  }
  return "";
}

/** CG-P07-03: the word a row without a value carries instead of one. */
const MIRROR_ABSENCE: Record<string, { label: string; color: string }> = {
  missing: { label: "missing", color: "var(--bad)" },
  server_assigned: { label: "at register", color: "var(--ink-mute)" },
  not_in_contract: { label: "not in v1", color: "var(--ink-mute)" },
};

/** CG-P07-03: the named gate's verdict for this field. VERIFY is not PASS. */
const MIRROR_CHECK_COLOR: Record<string, string> = {
  PASS: "var(--good)",
  FAIL: "var(--bad)",
  VERIFY: "var(--accent-2)",
  GATED: "var(--accent-2)",
  NOT_APPLICABLE: "var(--ink-mute)",
};

/** QA S14: the two raw enum tokens read as words; PASS / FAIL / VERIFY stay the contract's own verdicts. */
export const MIRROR_CHECK_WORD: Record<string, string> = { GATED: "gated", NOT_APPLICABLE: "not applicable" };

function MirrorValue({ field }: { field: MirrorField }) {
  const hasValue = field.state === "parsed" || field.state === "server_computed";
  if (hasValue && field.field === "artifact.digest" && typeof field.value === "string") {
    /* E1: a digest is prefix + 8 hex on screen, the full value in its title. */
    return <Digest value={field.value} label="artifact digest" />;
  }
  if (hasValue) return <>{formatMirrorValue(field.value)}</>;
  /* A field the parser did not find, or the v1 file cannot carry, has no value
     to print. Its typed absence says which; an invented dash would read as a value. */
  const absence = MIRROR_ABSENCE[field.state] ?? { label: field.state, color: "var(--ink-mute)" };
  return (
    <span className="ai-absent" style={{ color: absence.color }} data-absent={field.state}>
      {absence.label}
    </span>
  );
}

function MirrorTable({ mirror }: { mirror: readonly MirrorField[] }) {
  return (
    <dl data-mirror className="m-0 overflow-x-auto">
      {mirror.map((field) => {
        const detail = field.gate ? `${field.gate} · ${field.note}` : field.note;
        return (
          <div
            key={field.field}
            className="ai-row"
            title={detail}
            data-mirror-field={field.field}
            data-mirror-state={field.state}
            data-mirror-check={field.check}
          >
            <dt className="k">{field.field}</dt>
            <dd className="v">
              <MirrorValue field={field} />
            </dd>
            <dd className="c" style={{ color: MIRROR_CHECK_COLOR[field.check] ?? "var(--ink-soft)" }} data-mirror-verdict={field.check}>
              {MIRROR_CHECK_WORD[field.check] ?? field.check}
              {/* The note is the row's title on a pointer; this is the same
                  sentence for a screen reader, which never sees a title. */}
              <span className="ai-sr" data-mirror-note>
                {` — ${detail}`}
              </span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/* ------------------------------------------------------------------ gates */

/** CG-P07-04: `214 µs · analyser` (ms from 1 000 µs), or the whole ms Control API measured. */
export function gateTiming(gate: GateRow): string | null {
  if (gate.state === "SKIPPED") return null;
  if (gate.timing_source === "ANALYSER" && typeof gate.analyser_us === "number") {
    const us = gate.analyser_us;
    return `${us < 1000 ? `${us} µs` : `${(us / 1000).toFixed(1)} ms`} · analyser`;
  }
  if (gate.timing_source === "CONTROL_API") return `${gate.ms} ms · registry`;
  return `${gate.ms} ms`;
}

function gateTone(state: GateRow["state"] | "RUNNING"): string {
  if (state === "PASS") return "var(--good)";
  if (state === "FAIL") return "var(--bad)";
  if (state === "RUNNING") return "var(--accent-2)";
  /* `SKIPPED` is de-emphasised, not decorative: it tells the reader the gate
     never ran, so it keeps a readable tone rather than a border colour. */
  return "var(--ink-mute)";
}

/** The seven gate names, in the order the server runs them. */
export const GATE_ORDER = [
  "contract-complete",
  "entrypoint-importable",
  "digest-unique",
  "parameter-space-sane",
  "determinism-declared",
  "data-contract-known",
  "no-lookahead-static-scan",
] as const;

/**
 * CG-P07-04 · RUNNING. The gates run in one synchronous server request, so
 * the only honest RUNNING is "this request is in flight": all seven rows show
 * it together, and no row claims to have finished before the server says so.
 */
function RunningGates() {
  return (
    <ol className="m-0 flex list-none flex-col p-0" role="list" data-gates-running>
      {GATE_ORDER.map((name) => (
        <li key={name} className="ai-gate" data-gate={name} data-gate-state="RUNNING" style={{ color: gateTone("RUNNING") }}>
          <span className="dot" aria-hidden="true" data-motion="pulse" />
          <span className="name">{name}</span>
          <span className="state">RUNNING</span>
          <span className="detail">in one server request</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * F2b: one cell per gate, in the server's order, coloured by that row's own
 * `state` — a glance version of the list below. Before a receipt there are no
 * cells (never seven empty ones); while the request is in flight all seven pulse.
 */
function GateStrip({ gates, running }: { gates: readonly GateRow[] | null; running: boolean }) {
  if (!running && (gates === null || gates.length === 0)) return null;
  const cells = running ? GATE_ORDER.map((name, index) => ({ n: index + 1, name: name as string, state: "RUNNING" as const })) : gates!.map((gate) => ({ n: gate.n, name: gate.name, state: gate.state }));
  return (
    <ol className="ai-gatestrip m-0 list-none p-0" data-gate-strip aria-label="gate results" role="list">
      {cells.map((cell) => (
        <li
          key={cell.n}
          data-gate-cell={cell.state}
          data-motion={running ? "pulse" : undefined}
          title={`gate ${cell.n} · ${cell.name} — ${cell.state}`}
          aria-label={`gate ${cell.n} ${cell.name} ${cell.state}`}
          style={{ background: gateTone(cell.state) }}
        />
      ))}
    </ol>
  );
}

function GateList({ gates, reducedMotion }: { gates: readonly GateRow[]; reducedMotion: boolean }) {
  const [revealed, setRevealed] = useState(() => (reducedMotion ? gates.length : 0));

  useEffect(() => {
    if (reducedMotion) {
      setRevealed(gates.length);
      return;
    }
    setRevealed(0);
    const timers = gates.map((_, index) =>
      window.setTimeout(() => setRevealed((n) => Math.max(n, index + 1)), index * GATE_STAGGER_MS),
    );
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [gates, reducedMotion]);

  return (
    <ol className="m-0 flex list-none flex-col p-0" role="list" data-gates>
      {gates.slice(0, revealed).map((gate) => {
        const timing = gateTiming(gate);
        return (
          <li key={gate.n} className="ai-gate" data-gate={gate.name} data-gate-state={gate.state} style={{ color: gateTone(gate.state) }}>
            <span className="dot" aria-hidden="true" />
            <span className="name">
              <span className="ai-sr">{`gate ${gate.n}: `}</span>
              {gate.name}
            </span>
            <span className="state">{gate.state}</span>
            {/* The engine's own sentence, wrapped, never cut. */}
            <span className="detail" data-gate-message>
              {gate.message}
              {gate.quarantine_code ? (
                <span className="timing" data-gate-quarantine-code={gate.quarantine_code} title="The server's quarantine code for this gate">
                  {" · "}
                  {gate.quarantine_code}
                </span>
              ) : null}
              {timing ? (
                <span className="timing" data-gate-timing={gate.timing_source ?? "none"}>
                  {" · "}
                  {timing}
                </span>
              ) : (
                <span className="timing" data-gate-timing="none">
                  {" · not run"}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/* --------------------------------------------------------------- registry */

function RegistryChip({
  entry,
  onActivate,
  busy,
  refusal,
}: {
  entry: RegistryEntry;
  onActivate?: (entry: RegistryEntry) => void;
  busy: boolean;
  refusal: ImportRefusal | null;
}) {
  const canActivate = entry.lifecycle_state === "DRAFT" && entry.may_activate && onActivate;
  const registered = formatUtc(entry.registered_at_utc_ms);
  return (
    <div className="ai-regentry" data-registry-entry={entry.alpha_version_id} data-lifecycle={entry.lifecycle_state}>
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold">{entry.display_name ?? entry.alpha_id}</span>
        <span className="mono" title={entry.alpha_version_id}>{entry.version_label}</span>
        <span className="ai-lifecycle" data-lifecycle={entry.lifecycle_state}>{entry.lifecycle_state}</span>
        <span className="mono" style={{ color: "var(--ink-mute)" }}>rev {entry.alpha_revision}</span>
        {registered ? <span className="mono" style={{ color: "var(--ink-mute)" }}>{registered}</span> : null}
        {/* F2b: every version names its way on. The run link follows the server's own
            `run_admission` for that version; no row guesses an admission. */}
        <span className="ai-reglinks" data-registry-links>
          <LineageLink
            to={lineageHref(entry.alpha_id, { av: entry.alpha_version_id })}
            action="registry-lineage"
            title={`Attempt Lineage of ${entry.alpha_id}, at ${entry.version_label}`}
          >
            lineage →
          </LineageLink>
          {entry.run_admission?.may_create_run ? (
            <LineageLink to={newRunHref(entry.alpha_id, entry.alpha_version_id)} action="registry-new-run" title="New run with this version preselected — preflight still decides admission">
              run →
            </LineageLink>
          ) : null}
        </span>
      </div>
      {canActivate ? (
        <button
          type="button"
          disabled={busy}
          title={busy ? "An activation request is already in progress." : undefined}
          onClick={() => onActivate(entry)}
          className="ai-btn"
          data-quiet
          aria-label={`Activate ${entry.version_label}`}
        >
          {busy ? "Activating…" : "Activate"}
        </button>
      ) : entry.lifecycle_state === "DRAFT" && !entry.may_activate ? (
        <span style={{ color: "var(--ink-mute)" }} data-activation-not-permitted>
          <ActivationNotPermitted reason={entry.may_activate_reason} />
        </span>
      ) : null}
      {refusal ? <p role="alert" className="m-0 w-full" style={{ color: "var(--bad)" }}>{refusal.message}</p> : null}
    </div>
  );
}

/* ---------------------------------------------------------------- anatomy */

/**
 * Code anatomy — decision `S14-VIS-01`.
 *
 * A presentation substage beneath parse, never a fourth authority state. It
 * holds no server fact, changes no enablement, and issues no request. Collapsed
 * by default and a `<details>`, so it works without JavaScript state and is
 * reachable by keyboard for free.
 */
function CodeAnatomy() {
  return (
    <details className="ai-card ai-anatomy" data-shadow data-code-anatomy>
      <summary>Code anatomy</summary>

      <div className="flex flex-col gap-2.5 px-3.5 pb-3">
        <p className="ai-note" data-anatomy-note>
          {ANATOMY_SUBSTAGE_NOTE}
        </p>

        <div className="ai-cols">
          <div className="flex min-w-0 flex-[1.5] basis-[300px] flex-col gap-2.5">
            {CODE_ANATOMY.map((entry) => (
              <section
                key={entry.section}
                className="overflow-hidden rounded-[8px] border"
                style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
                data-anatomy-section={entry.section}
              >
                <header className="flex flex-wrap items-center gap-2 border-b px-3 py-[7px]" style={{ borderColor: "var(--line-soft)" }} title={entry.note}>
                  <h3 className="ai-label">{entry.section}</h3>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {entry.unlocks.map((item) => (
                      <span
                        key={item.label}
                        data-unlock={item.label}
                        data-unlock-kind={item.kind}
                        className="mono rounded-full border px-1.5 text-[8.5px] font-bold leading-[15px]"
                        style={{
                          color: item.kind === "gate" ? "var(--accent-2)" : "var(--good)",
                          borderColor: item.kind === "gate" ? "var(--accent-2)" : "var(--good)",
                          background: "var(--paper-raised)",
                        }}
                      >
                        {item.label}
                      </span>
                    ))}
                  </span>
                </header>
                {/* Read-only by construction: a `pre`, not an editor. */}
                <pre className="mono m-0 overflow-x-auto px-3 py-[9px] text-[10.5px] leading-[1.65]" style={{ background: "var(--paper)", color: "var(--ink)" }} title={entry.note} data-anatomy-note-for={entry.section}>
                  {entry.code}
                </pre>
              </section>
            ))}
          </div>

          <aside
            className="flex min-w-0 flex-1 basis-[260px] flex-col gap-[5px] rounded-[8px] border px-3.5 py-[11px]"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
            data-unlock-map
          >
            <h3 className="ai-label" style={{ color: "var(--accent)", fontWeight: 700 }}>
              Unlocks
            </h3>
            {UNLOCK_MAP.map((row) => (
              <span key={row.output} className="flex flex-col gap-px border-b py-[3px]" style={{ borderColor: "var(--line-soft)" }} data-unlock-output={row.output}>
                <span className="mono text-[10px] font-semibold">{row.output}</span>
                <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                  {row.routes}
                </span>
              </span>
            ))}
            <p className="m-0 text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              {UNLOCK_FOOTER}
            </p>
          </aside>
        </div>
      </div>
    </details>
  );
}

/* ----------------------------------------------------------------- screen */

export interface AlphaImportProps {
  /** Local source text. Owned by the caller so an edit can invalidate downstream. */
  sourceText: string;
  fileName: string | null;
  onSourceChange: (text: string, fileName: string | null) => void;
  /** The one step the outstanding refusal belongs to (its panel prints the refusal). */
  refusalStep?: "parse" | "gates" | "register" | "activate" | null;
  /** Set once the user offered more than one file. */
  multiFileRejected?: boolean;
  onMultiFileRejected?: () => void;

  parse: SourceResponse | null;
  gates: GatesResponse | null;
  registration: RegistrationResponse | null;
  activation: ActivationResponse | null;
  registry: readonly RegistryEntry[];
  /** Server `total` for the served list; shown as "top N / total" only when the list is capped. */
  registryTotal?: number | null;
  /** The `alpha_id` the served list was requested with; the server already filtered by it. */
  registryAlpha?: string;
  registryShowAll?: boolean;
  onToggleRegistryShowAll?: () => void;
  /** The server's opaque `next_cursor`; a "load more" row shows only while it is non-null. */
  registryNext?: string | null;
  registryMore?: "idle" | "loading" | "failed";
  onLoadMoreRegistry?: () => void;

  parseState: ResearchState;
  gatesState: ResearchState;
  registerState: ResearchState;
  registryState: ResearchState;
  /** Read the registry again after a failed read. */
  onRetryRegistry?: () => void;
  /** Whether an activation request is currently in flight. */
  activationPending?: boolean;

  refusal: ImportRefusal | null;

  alphaId: string;
  onAlphaIdChange: (value: string) => void;

  onParse: () => void;
  onRunGates: () => void;
  onRegister: () => void;
  onActivate: () => void;
  onActivateEntry?: (entry: RegistryEntry) => void;
  activationAttemptId?: string | null;
  /** True only when the server itself admitted activation for this actor. */
  activationAdmitted: boolean;
  /** The step in flight. Every write button is inert while one is outstanding. */
  busyStep?: "parse" | "gates" | "register" | "activate" | null;
  /** A refusal of the activate request, shown beside its button. */
  activationRefusal?: ImportRefusal | null;
  /** F2b: the alpha this screen was opened for (`?alpha=`), if any — gives the header a way back to its lineage. */
  contextAlpha?: string | null;
}

export type ImportStep = 1 | 2 | 3;

const STEP_HASH: Record<ImportStep, string> = { 1: "source", 2: "gates", 3: "register" };
/** `#step=gates` -> 2; anything else (absent, garbage) -> null. */
export function stepFromHash(hash: string): ImportStep | null {
  const word = new URLSearchParams(hash.replace(/^#/, "")).get("step");
  const found = (Object.keys(STEP_HASH) as unknown as string[]).find((key) => STEP_HASH[Number(key) as ImportStep] === word);
  return found === undefined ? null : (Number(found) as ImportStep);
}
/** The step lives in the hash (replace, no history entry); step 1 is the default and keeps the URL clean. */
function writeStepHash(step: ImportStep): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  if (step === 1) params.delete("step"); else params.set("step", STEP_HASH[step]);
  const hash = params.toString();
  const next = `${window.location.pathname}${window.location.search}${hash ? `#${hash}` : ""}`;
  if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) window.history.replaceState(window.history.state, "", next);
}

/** The three authority states (DQ-06), with the HiFi's label + sub-line shape. */
export const IMPORT_STEPS: readonly { n: ImportStep; key: string; label: string; sub: string }[] = [
  { n: 1, key: "source", label: "Source", sub: "Source & mirror — one .py, contract and code" },
  { n: 2, key: "gates", label: "Gates", sub: "Quarantine gates — 7 gates, fail-closed" },
  { n: 3, key: "register", label: "Register", sub: "Register version — DRAFT, then ACTIVE" },
];

type StepProgress = "done" | "failed" | "open";

/**
 * The step a reader is looking at, from what the server has returned: the
 * latest receipt wins, so a registration opens on step 3 and a gate result on
 * step 2. A local choice, never a server fact.
 */
export function stepForReceipts(gates: GatesResponse | null, registration: RegistrationResponse | null): ImportStep {
  if (registration) return 3;
  if (gates) return 2;
  return 1;
}

/**
 * The header chip (HiFi `stateChip`): nothing before a parse, QUARANTINE while
 * the parsed bytes are held and ungated or gated, then the server's lifecycle
 * word with the version label once registered.
 */
export function importChip(
  parse: SourceResponse | null,
  registration: RegistrationResponse | null,
  activation: ActivationResponse | null,
): { key: string; label: string } | null {
  const lifecycle = activation?.lifecycle_state ?? registration?.lifecycle_state ?? null;
  if (registration && lifecycle) return { key: lifecycle, label: `${lifecycle} · ${registration.version_label}` };
  if (parse) return { key: "QUARANTINE", label: "QUARANTINE" };
  return null;
}

export function AlphaImport(props: AlphaImportProps) {
  const {
    sourceText,
    fileName,
    onSourceChange,
    multiFileRejected,
    onMultiFileRejected,
    parse,
    gates,
    registration,
    activation,
    registry,
    registryTotal = null,
    registryAlpha = "",
    registryShowAll = false,
    onToggleRegistryShowAll,
    registryNext = null,
    registryMore = "idle",
    onLoadMoreRegistry,
    parseState,
    gatesState,
    registerState,
    registryState,
    onRetryRegistry,
    activationPending,
    refusal,
    refusalStep = null,
    alphaId,
    onAlphaIdChange,
    onParse,
    onRunGates,
    onRegister,
    onActivate,
    onActivateEntry,
    activationAttemptId = null,
    activationAdmitted,
    busyStep = null,
    activationRefusal = null,
    contextAlpha = null,
  } = props;
  /* RF-04 FE-S14-07: a button stays pressable neither while its request is in
     flight nor after it succeeded for these bytes. */
  const busy = busyStep !== null ? "A request is in flight." : null;

  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [view, setView] = useState<ImportStep>(() => {
    const wanted = stepFromHash(typeof window === "undefined" ? "" : window.location.hash);
    /* The pasted source is never persisted: a step that needs the parsed source or its gate receipt
       is restored only when that receipt is in memory, otherwise the wizard opens at step 1, silently. */
    if (wanted === 1 || (wanted === 2 && parse !== null) || (wanted === 3 && parse !== null && gates !== null)) return wanted;
    return stepForReceipts(gates, registration);
  });
  useEffect(() => { writeStepHash(view); }, [view]);
  /* Follow a new receipt, once, when it arrives: running the gates shows the
     gates, a registration shows the registry. Clicking the stepper afterwards
     is the reader's choice and is kept. */
  const receiptStep = busyStep === "gates" ? 2 : stepForReceipts(gates, registration);
  const lastReceiptStep = useRef(receiptStep);
  useEffect(() => {
    if (receiptStep !== lastReceiptStep.current) {
      lastReceiptStep.current = receiptStep;
      setView(receiptStep);
    }
  }, [receiptStep]);

  /* A refusal opens the step it belongs to, so it is never printed behind another tab. */
  useEffect(() => {
    if (refusalStep === "parse") setView(1);
    else if (refusalStep === "gates") setView(2);
    else if (refusalStep === "register" || refusalStep === "activate") setView(3);
  }, [refusalStep]);

  const [fileNote, setFileNote] = useState<string | null>(null);
  /* The pasted text a chosen file replaced, kept so the replacement can be undone. */
  const [replacedPaste, setReplacedPaste] = useState<string | null>(null);

  function onStepKey(event: React.KeyboardEvent<HTMLButtonElement>, n: ImportStep) {
    const next: ImportStep | null =
      event.key === "ArrowRight" ? ((n % 3) + 1) as ImportStep
      : event.key === "ArrowLeft" ? (n === 1 ? 3 : ((n - 1) as ImportStep))
      : event.key === "Home" ? 1
      : event.key === "End" ? 3
      : null;
    if (next === null) return;
    event.preventDefault();
    setView(next);
    document.getElementById(`ai-tab-${next}`)?.focus();
  }

  const parsedOk = parse?.parse_ok === true;
  const anyGateFailed = Boolean(gates?.gates.some((gate) => gate.state === "FAIL"));
  const gatesAllPass = gates?.all_pass === true;
  /* Lifecycle may only ever report the server's own word. */
  const lifecycle = activation?.lifecycle_state ?? registration?.lifecycle_state ?? null;
  /* The server filters by alpha_id. Only while the typed id is ahead of the
     served list (not yet requested) is the exact match applied locally, so a
     half-typed id never shows another alpha's versions. */
  const typedAlpha = alphaId.trim();
  /* QA S14 U11: a half-typed or malformed id is a typo to correct, never a filter. */
  const alphaIdInvalid = typedAlpha.length > 0 && !new RegExp(RULE_PATTERNS.alphaId).test(typedAlpha);
  const filterAlpha = alphaIdInvalid || registryShowAll ? "" : typedAlpha;
  const visibleRegistry = filterAlpha && filterAlpha !== registryAlpha ? registry.filter((entry) => entry.alpha_id === filterAlpha) : registry;
  const registryCapped = typeof registryTotal === "number" && registryTotal > registry.length;
  const registeredEntry = registration
    ? registry.find((entry) => entry.alpha_version_id === registration.alpha_version_id) ?? null
    : null;
  const chip = importChip(parse, registration, activation);
  const run = runSlot(registration, registeredEntry);
  /* The alpha the reader named: the registered one, else a whole typed id, else the one the screen was opened for. */
  const nextAlpha = registration?.alpha_id ?? (/^[a-z][a-z0-9-]{2,63}$/.test(typedAlpha) ? typedAlpha : contextAlpha);
  const stepRefusal = refusal && refusalStep !== null && refusalStep !== "activate" ? refusal : null;

  const progress: Record<ImportStep, StepProgress> = {
    1: parse ? (parsedOk ? "done" : "failed") : "open",
    2: gates ? (gatesAllPass ? "done" : "failed") : "open",
    3: registration ? "done" : "open",
  };

  function acceptFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      setFileNote(null);
      onMultiFileRejected?.();
      return;
    }
    const file = files[0];
    /* Never silently accepted: a non-.py file is refused before it is read. */
    if (!/\.py$/i.test(file.name)) {
      setFileNote(NON_PY_ERROR);
      return;
    }
    setFileNote(null);
    /* Last input wins: a file replaces the pasted text, with an undo. */
    const pasted = fileName === null && sourceText.trim().length > 0 ? sourceText : null;
    void file.text().then((text) => {
      setReplacedPaste(pasted);
      onSourceChange(text, file.name);
    });
  }

  const byteLength = sourceText ? new TextEncoder().encode(sourceText).byteLength : null;

  return (
    <div data-screen="alpha-import" className="ai-page" style={{ background: "var(--paper)" }}>
      <style>{AI_CSS}</style>

      {/* ------------------------------------------------------------ header */}
      <header className="ai-head" data-panel="header">
        <div className="l">
          <nav className="ai-crumb" aria-label="Screen path">
            {contextAlpha ? (
              <>
                <LineageLink to={lineageHref(contextAlpha)} action="back-to-lineage" title={`Lineage of ${contextAlpha}`}>
                  ← Lineage
                </LineageLink>
                <span className="sep" aria-hidden="true">/</span>
              </>
            ) : null}
            <LineageLink to="/research/quantbt/journey" title="Journey">Journey</LineageLink>
            {/* Screen 02. Once the server admits a run for the registered version the link is
                version-bound (its `run_admission`); otherwise it carries only the alpha in
                hand, never a guessed version. */}
            <LineageLink
              className="next"
              action="next-new-run"
              to={run.kind === "admitted" ? run.href : nextAlpha ? newRunPrefillHref(nextAlpha) : "/research/quantbt/runs/new"}
              title={run.kind === "admitted" ? "New run with this version preselected" : nextAlpha ? `New run for ${nextAlpha}` : "New run"}
            >
              New run →
            </LineageLink>
          </nav>
          <div className="ai-titlerow">
            <h1 className="ai-title">{IMPORT_TITLE}</h1>
            {chip ? (
              <span className="ai-chip" data-chip={chip.key} data-import-chip>
                {chip.label}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {/* A refusal no step claims (none attributed) still prints exactly once, here. */}
      {refusal && refusalStep === null ? <StepRefusal refusal={refusal} /> : null}

      {/* ----------------------------------------------------------- stepper */}
      <div className="ai-stepper" role="tablist" aria-label="Import steps" data-stepper>
        {IMPORT_STEPS.map((step) => (
          <button
            key={step.n}
            type="button"
            role="tab"
            id={`ai-tab-${step.n}`}
            aria-controls={`ai-step-${step.n}`}
            aria-selected={view === step.n}
            className="ai-step"
            data-step-marker={step.n}
            data-progress={progress[step.n]}
            tabIndex={view === step.n ? 0 : -1}
            title={step.sub}
            onClick={() => setView(step.n)}
            onKeyDown={(event) => onStepKey(event, step.n)}
          >
            <span className="num" aria-hidden="true">
              {step.n}
            </span>
            <span className="txt">
              <span className="lbl">{step.label}</span>
            </span>
            <span className="ai-sr">
              {progress[step.n] === "done" ? ", complete" : progress[step.n] === "failed" ? ", did not pass" : ", not done"}
            </span>
          </button>
        ))}
      </div>

      {/* ---------------------------------------------------------- step 1 */}
      <section
        id="ai-step-1"
        role="tabpanel"
        aria-labelledby="ai-tab-1"
        aria-label="Step 1 — source"
        hidden={view !== 1}
        className="flex flex-col gap-3"
        data-step="1"
      >
        <div className="ai-cols">
          <div className="ai-card ai-mirror-card" data-shadow>
            <div className="ai-mirror-head">
              <h2 className="ai-label">Contract</h2>
              <span className="m">
                {parse ? parse.schema_version : "research.alpha-source.v1"}
                {parse ? (
                  <>
                    {" · receipt expires "}
                    {formatUtc(parse.expires_at_utc_ms) ?? "time not published"}
                  </>
                ) : null}
              </span>
            </div>
            <div className="ai-mirror-cols" aria-hidden="true">
              <span className="k">field</span>
              <span className="v">declared value</span>
              <span className="c">check</span>
            </div>
            <div className="ai-mirror-body" data-mirror-rules title={`Field rules: alpha_id ${RULE_PATTERNS.alphaId} · version ${RULE_PATTERNS.versionLabel} · timeframe ${RULE_PATTERNS.timeframe}`}>
              {stepRefusal && refusalStep === "parse" ? (
                <StepRefusal refusal={stepRefusal} panel="parsed contract mirror" />
              ) : (
              <ResearchPanel title="parsed contract mirror" state={parseState} variant="plain" minBodyHeight={0}>
                {parse ? <MirrorTable mirror={parse.mirror} /> : null}
              </ResearchPanel>
              )}
            </div>
          </div>

          <div className="ai-side">
            <div className="ai-card" data-pad>
              <h2 className="ai-label">Source (.py)</h2>
              <div
                className="ai-drop"
                data-dropzone
                data-over={dragOver || undefined}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOver(false);
                  acceptFiles(event.dataTransfer?.files ?? null);
                }}
              >
                <label className="file cursor-pointer" style={{ color: fileName ? "var(--ink)" : "var(--accent)" }}>
                  {fileName ?? "Choose or drop file"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".py"
                    className="sr-only"
                    aria-label="Alpha source file"
                    onChange={(event) => {
                      acceptFiles(event.target.files);
                      event.target.value = "";
                    }}
                  />
                </label>
                <span className="custody" data-source-custody>
                  {parse ? (
                    <>
                      <Digest value={parse.source_digest} label="source digest" />
                      {" · "}
                    </>
                  ) : sourceText ? (
                    "digest computed at parse · "
                  ) : null}
                  {byteLength !== null ? formatBytes(byteLength) : null}
                </span>
              </div>

              {multiFileRejected ? (
                <p role="alert" className="m-0 text-[11px]" style={{ color: "var(--bad)" }} data-single-file-error>
                  {SINGLE_FILE_ERROR}
                </p>
              ) : null}

              {fileNote ? (
                <p role="alert" className="m-0 text-[11px]" style={{ color: "var(--bad)" }} data-file-error>
                  {fileNote}
                </p>
              ) : null}

              {replacedPaste !== null && fileName !== null ? (
                <p className="ai-note m-0" data-paste-undo>
                  Replaced pasted text.{" "}
                  <button
                    type="button"
                    className="btn-ghost"
                    data-action="undo-file"
                    onClick={() => {
                      onSourceChange(replacedPaste, null);
                      setReplacedPaste(null);
                    }}
                  >
                    Undo
                  </button>
                </p>
              ) : null}

              <label className="ai-paste">
                <span className="ai-label" title="Last input wins: a file replaces pasted text; typing clears the file.">
                  or paste
                </span>
                <textarea
                  value={sourceText}
                  onChange={(event) => {
                    setReplacedPaste(null);
                    setFileNote(null);
                    onSourceChange(event.target.value, null);
                  }}
                  rows={6}
                  spellCheck={false}
                  aria-label="Alpha source text"
                />
              </label>

              <StepButton
                label="Parse"
                action="parse"
                onClick={onParse}
                hint="Held in quarantine, not executed."
                reason={
                  sourceText.trim().length === 0
                    ? "Add a file or paste code."
                    : busy ?? (parse !== null ? "Parsed." : null)
                }
              />
              {parsedOk ? (
                <button type="button" className="ai-btn self-start" data-quiet data-nav="2" onClick={() => setView(2)}>
                  Continue to gates →
                </button>
              ) : null}
            </div>

            <div className="ai-card" data-pad data-entrypoint-card>
              <h2 className="ai-label" title="v1 single-file contract: one literal, one plain function. No classes, decorators or imports.">Entrypoint</h2>
              <pre className="ai-entry" title="One literal, one plain function. No classes, decorators or imports.">{"ALPHA_CONTRACT = { … }     # one literal\ndef generate_signals(context): …"}</pre>
            </div>
          </div>
        </div>

        {/* `S14-VIS-01`: a substage of parse, not a stage of the import. */}
        <CodeAnatomy />
      </section>

      {/* ---------------------------------------------------------- step 2 */}
      <section
        id="ai-step-2"
        role="tabpanel"
        aria-labelledby="ai-tab-2"
        aria-label="Step 2 — gates"
        hidden={view !== 2}
        className="flex flex-col gap-3"
        data-step="2"
      >
        <div className="ai-card ai-pipe" data-shadow>
          <div className="ai-pipe-head">
            <h2 className="ai-label">Gates</h2>
            <span className="m">
              {gates ? (
                <>
                  {"receipt "}
                  <ReceiptId id={gates.gate_receipt_id} label="gate receipt" />
                  {" · expires "}
                  {formatUtc(gates.expires_at_utc_ms) ?? "time not published"}
                </>
              ) : null}
            </span>
          </div>

          <StepButton
            label="Run gates"
            action="run-gates"
            onClick={onRunGates}
            reason={
              parse === null
                ? "Parse first."
                : !parsedOk
                  ? "Parse failed."
                  : busy ?? (gates !== null ? "Gates ran." : null)
            }
          />

          <GateStrip gates={gates?.gates ?? null} running={busyStep === "gates"} />

          {busyStep === "gates" ? (
            <RunningGates />
          ) : stepRefusal && refusalStep === "gates" ? (
            <StepRefusal refusal={stepRefusal} panel="import gates" />
          ) : (
            /* QA S14 U9: "Gates run once a source parses." is false after a parse; the Run gates button says the rest. */
            gates === null && gatesState.state === "empty" && parse !== null ? null : (
              <ResearchPanel title="import gates" state={gatesState} variant="plain" minBodyHeight={0}>
                {gates ? <GateList gates={gates.gates} reducedMotion={reducedMotion} /> : null}
              </ResearchPanel>
            )
          )}

          {anyGateFailed ? (
            <p role="alert" className="m-0 text-[11px]" style={{ color: "var(--bad)" }} data-fail-closed-note>
              {FAIL_CLOSED_NOTE}
            </p>
          ) : null}

          {/* Gate 7's limit, read from the contract's constant rather than copied. */}
          {gates ? (
            <p className="ai-note mono" data-static-scan-disclosure>
              {gates.static_scan_disclosure}
            </p>
          ) : null}

          <p className="ai-amber" title="No override — fix the .py and import again." data-no-override>No override.</p>

          {gatesAllPass ? (
            <button type="button" className="ai-btn self-start" data-quiet data-nav="3" onClick={() => setView(3)}>
              Continue to register →
            </button>
          ) : null}
        </div>
      </section>

      {/* ---------------------------------------------------------- step 3 */}
      <section
        id="ai-step-3"
        role="tabpanel"
        aria-labelledby="ai-tab-3"
        aria-label="Step 3 — register"
        hidden={view !== 3}
        className="flex flex-col gap-3"
        data-step="3"
      >
        <div className="ai-cols" data-stretch>
          <div className="ai-card ai-reg" data-pad>
            <h2 className="ai-label">Registration</h2>

            <div className="ai-controls py-1">
                <label className="flex items-center gap-2">
                  <span className="ai-label">Alpha id</span>
                  <input
                    value={alphaId}
                    onChange={(event) => onAlphaIdChange(event.target.value)}
                    className="mono rounded-[6px] border px-2 py-1 text-[11px]"
                    style={{ borderColor: "var(--line)", background: "var(--paper)" }}
                    aria-label="Alpha id"
                    aria-invalid={alphaIdInvalid || undefined}
                    aria-describedby={alphaIdInvalid ? "ai-alpha-id-rule" : undefined}
                    data-alpha-id-input
                  />
                </label>
                {alphaIdInvalid ? (
                  <span id="ai-alpha-id-rule" className="m-0 text-[10.5px]" role="alert" style={{ color: "var(--bad)" }} data-alpha-id-invalid>
                    {ALPHA_ID_RULE}
                  </span>
                ) : null}
                <StepButton
                  label="Register draft"
                  action="register"
                  onClick={onRegister}
                  reason={
                    gates === null
                      ? "Run gates first."
                      : anyGateFailed
                        ? "A gate failed."
                        : !gatesAllPass
                          ? "Gates must pass."
                          : alphaId.trim().length === 0
                            ? "Name the alpha."
                            : alphaIdInvalid
                              ? "Alpha id invalid."
                              : busy ?? (registration !== null ? "Registered." : null)
                  }
                />
              </div>

            {/* QA S14 U9: "Registration opens once all seven gates pass." is false once they have. */}
            {stepRefusal && refusalStep === "register" ? (
              <StepRefusal refusal={stepRefusal} panel="registration" />
            ) : registration === null && registerState.state === "empty" && gatesAllPass ? null : (
              <ResearchPanel title="registration" state={registerState} variant="plain" minBodyHeight={0}>
                {registration ? (
                  <RegistrationRows
                    registration={registration}
                    activation={activation}
                    lifecycle={lifecycle}
                    entry={registeredEntry}
                  />
                ) : null}
              </ResearchPanel>
            )}

            {/* Activation is a separate, permissioned act — never implied by a
                successful registration, and never offered unless the server said so. */}
            {activationAdmitted && lifecycle === "DRAFT" ? (
              <>
                <StepButton
                  label="Activate this version"
                  action="activate"
                  onClick={onActivate}
                  reason={
                    activationPending
                      ? "Activating."
                      : activationRefusal && !activationRefusal.mayRetry
                        ? "Refused."
                        : busy
                  }
                />
                {activationRefusal ? (
                  <p role="alert" className="m-0 text-[10.5px]" style={{ color: "var(--bad)" }} data-activation-refusal>
                    {activationRefusal.message}
                  </p>
                ) : null}
              </>
            ) : registration && lifecycle === "DRAFT" && !registration.may_activate ? (
              /* The reason is the server's (`may_activate_reason`); none served → no cause is named. */
              <p className="m-0 text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-activation-not-admitted>
                <ActivationNotPermitted reason={registration.may_activate_reason ?? registeredEntry?.may_activate_reason} />
              </p>
            ) : null}
          </div>

          <div
            key={registration?.alpha_version_id ?? "none"}
            className="ai-next"
            data-where-next
            data-motion={registration && smokeMotionAllowed() ? "true" : "false"}
          >
            <h2 className="ai-label">Next</h2>
            {registration ? (
              <p>
                <span className="mono">{registration.version_label}</span> of{" "}
                <span className="mono">{registration.alpha_id}</span> ·{" "}
                <Digest value={registration.source_digest} label="source digest" />
              </p>
            ) : (
              <p>Not registered.</p>
            )}
            <div className="links">
              {/* F1 CG-FG-S14-03: the slot follows the server's `run_admission` for this
                  version. Before anything is registered there is no slot at all. */}
              {run.kind === "admitted" ? (
                <LineageLink to={run.href} primary action="new-run-with-version" title="Preflight still decides admission." extra={{ "data-run-admission": "admitted" }}>
                  {RUN_LINK_LABEL} →
                </LineageLink>
              ) : run.kind !== "none" ? (
                <span
                  className="absent"
                  data-absent-action="new-run"
                  data-absent-code={run.code ?? "NOT_PUBLISHED"}
                  title={run.kind === "refused" ? (run.sentence ?? undefined) : run.sentence}
                  data-run-admission={run.kind}
                >
                  {RUN_LINK_LABEL} →
                </span>
              ) : null}
              {registration ? (
                <LineageLink
                  to={lineageHref(registration.alpha_id, { av: registration.alpha_version_id })}
                  action="open-lineage"
                  primary={run.kind !== "admitted"}
                  title={`Attempt Lineage of ${registration.alpha_id}, at ${registration.version_label}`}
                >
                  lineage →
                </LineageLink>
              ) : null}
              <LineageLink
                to={nextAlpha ? `/research/quantbt/runs?group=1&alpha=${encodeURIComponent(nextAlpha)}` : "/research/quantbt/runs"}
                action="open-run-library"
                title={nextAlpha ? `Library, filtered to ${nextAlpha}` : "Library"}
              >
                Library
              </LineageLink>
            </div>
            {run.kind === "refused" ? (
              <p className="ai-reason" data-run-not-admitted data-run-admission-code={run.code ?? undefined}>
                <span title={run.code ? undefined : "reason not published"}>{run.sentence ?? "Not admitted"}</span>
                {run.code ? (
                  <>
                    {" · "}
                    <span className="mono">{run.code}</span>
                  </>
                ) : null}
              </p>
            ) : run.kind === "absent" ? (
              <p className="ai-reason" data-run-not-admitted data-run-admission-code={run.code}>
                {run.sentence}
              </p>
            ) : null}
          </div>
        </div>

        {/* -------------------------------------------------------- registry */}
        <div className="ai-card" data-pad>
          <h2 className="ai-label">
            alpha registry{filterAlpha ? ` — ${filterAlpha}` : ""}
            {onToggleRegistryShowAll && (registryShowAll || (typedAlpha && !alphaIdInvalid)) ? (
              <button type="button" className="btn-ghost" data-action="registry-show-all" aria-pressed={registryShowAll} onClick={onToggleRegistryShowAll} style={{ marginLeft: 8 }}>
                {registryShowAll ? "filter by this alpha" : "show all alphas"}
              </button>
            ) : null}
            {registryCapped ? (
              <span className="mono" data-registry-total title="Newest versions only; the total is the server's count.">
                {" "}· top {registry.length} / {registryTotal}
              </span>
            ) : null}
          </h2>
          {/* An answered-but-empty read is a state the panel would swallow behind its generic
              notice; the screen's own sentence is the one that says what is missing. */}
          <ResearchPanel
            title="alpha registry"
            state={registryState.state === "empty" ? { ...registryState, state: "available", reason: "", retainsContent: true } : registryState}
            variant="plain"
            minBodyHeight={0}
            recovery={onRetryRegistry ? <button type="button" onClick={onRetryRegistry} className="btn-ghost self-start" data-action="retry-registry">Retry registry read</button> : undefined}
          >
            <div className="ai-registry" data-registry-strip>
              {visibleRegistry.length === 0 ? (
                <span className="text-[10.5px]" style={{ color: "var(--ink-mute)" }} data-registry-empty>
                  {filterAlpha ? "No versions for this alpha." : "No versions yet."}
                </span>
              ) : (
                visibleRegistry.map((entry) => (
                  <RegistryChip
                    key={entry.alpha_version_id}
                    entry={entry}
                    onActivate={onActivateEntry}
                    busy={busyStep !== null}
                    refusal={activationAttemptId === entry.alpha_version_id ? activationRefusal : null}
                  />
                ))
              )}
            </div>
            {registryNext !== null && onLoadMoreRegistry ? (
              <div className="ai-more" data-registry-more={registryMore}>
                <button
                  type="button"
                  className="btn-ghost"
                  data-action="load-more-registry"
                  disabled={registryMore === "loading"}
                  aria-busy={registryMore === "loading"}
                  title={`Read the next page. The ${registry.length} loaded stay.`}
                  onClick={onLoadMoreRegistry}
                >
                  {registryMore === "loading" ? "loading…" : "load more"}
                </button>
                {registryMore === "failed" ? (
                  <span role="alert" data-registry-more-failed style={{ color: "var(--bad)" }}>
                    Next page failed.
                  </span>
                ) : null}
              </div>
            ) : null}
          </ResearchPanel>
        </div>
      </section>

    </div>
  );
}

/* ---------------------------------------------------------- registration */

function Row({ k, children, absent }: { k: string; children: ReactNode; absent?: string }) {
  return (
    <div className="ai-kv" data-reg-row={k}>
      <dt>{k}</dt>
      <dd data-absent={absent}>{children}</dd>
    </div>
  );
}

/**
 * The HiFi's "signed publication" row, from the attestation the server served
 * (14-09). It prints each part's served state and reason code — whatever they
 * are — and asserts no fact of its own. With no attestation in the response it
 * says so, rather than stating what this release does or does not produce.
 */
function SignedPublicationRow({ attestation }: { attestation: ImportAttestation | null }) {
  if (!attestation) {
    return (
      <Row k="signed publication" absent={REGISTRATION_ABSENT.attestationNotServed.code}>
        {REGISTRATION_ABSENT.attestationNotServed.text}
      </Row>
    );
  }
  const parts = [
    { key: "signature", label: "signature", part: attestation.signature },
    { key: "sbom", label: "SBOM", part: attestation.sbom },
  ];
  return (
    <div className="ai-kv" data-reg-row="signed publication" title={`scope ${attestation.scope}`} data-attestation-scope={attestation.scope}>
      <dt>signed publication</dt>
      <dd data-absent={parts.every(({ part }) => part.state === "NOT_PUBLISHED") ? attestation.signature.reason_code : undefined}>
        {parts.map(({ key, label, part }) => (
          <span key={key} className="block" data-attestation-part={key} data-attestation-state={part.state} data-attestation-code={part.reason_code}>
            {label} {part.state.toLowerCase().replace(/_/g, " ")}
            {" · "}
            {part.reason_code}
          </span>
        ))}
      </dd>
    </div>
  );
}

function RegistrationRows({
  registration,
  activation,
  lifecycle,
  entry,
}: {
  registration: RegistrationResponse;
  activation: ActivationResponse | null;
  lifecycle: string | null;
  entry: RegistryEntry | null;
}) {
  return (
    <div className="flex flex-col" data-registration={registration.alpha_version_id}>
      <dl className="m-0">
        <Row k="alpha_id">
          {registration.alpha_id}
          {entry?.display_name ? <span className="soft"> · {entry.display_name}</span> : null}
        </Row>
        <Row k="alpha_version_id">
          <span style={{ color: "var(--good)" }}>{registration.version_label}</span>
          <span className="soft"> · </span>
          <ShortId id={registration.alpha_version_id} label="alpha version" />
          <span className="soft"> (immutable)</span>
        </Row>
        <Row k="artifact digest">
          <Digest value={registration.source_digest} label="artifact digest" />
        </Row>
        {entry ? (
          <Row k="entrypoint">{entry.entrypoint}</Row>
        ) : (
          <Row k="entrypoint" absent="REGISTRY_NOT_READ">
            not read yet — registry row not returned
          </Row>
        )}
        <Row k="import state">
          <span className="ai-lifecycle" data-lifecycle={lifecycle}>
            {lifecycle}
          </span>
          {/* After activation the revision is the activation's, not the registration's. */}
          <span className="soft"> · rev {activation?.alpha_revision ?? registration.alpha_revision}</span>
          {lifecycle === "DRAFT" ? (
            <>
              <span className="soft"> · </span>
              <span style={{ color: "var(--accent-2)" }} data-draft-note>
                {DRAFT_NOTE}
              </span>
            </>
          ) : null}
        </Row>
        <Row k="supersedes">
          {registration.supersedes ? (
            <>
              {"supersedes "}
              <ShortId id={registration.supersedes} label="superseded version" />
            </>
          ) : (
            <span className="soft">none — no earlier version recorded</span>
          )}
          {activation?.superseded_alpha_version_id ? (
            <>
              {" · superseded "}
              <ShortId id={activation.superseded_alpha_version_id} label="superseded version" />
            </>
          ) : null}
        </Row>
        {entry ? <Row k="registered at">{formatUtc(entry.registered_at_utc_ms) ?? "time not published"}</Row> : null}
        <Row k="capability registration" absent={REGISTRATION_ABSENT.capability.code}>
          {REGISTRATION_ABSENT.capability.text}
        </Row>
        <SignedPublicationRow attestation={registration.import_attestation ?? entry?.import_attestation ?? null} />
      </dl>
      {registration.replayed ? (
        <span className="mono pt-1 text-[9.5px]" style={{ color: "var(--ink-mute)" }}>
          replayed — identical bytes were already registered
        </span>
      ) : null}
    </div>
  );
}
