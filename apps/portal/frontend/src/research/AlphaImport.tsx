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
 * time, and the "rules of this screen" footer. The HiFi's four stepper entries
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
  ImportRefusal,
  MirrorField,
  RegistrationResponse,
  RegistryEntry,
  SourceResponse,
} from "./alphaImportClient";
import { LineageLink, lineageHref } from "./LineageLink";
import {
  ANATOMY_SUBSTAGE_NOTE,
  CODE_ANATOMY,
  UNLOCK_FOOTER,
  UNLOCK_MAP,
} from "./codeAnatomy";
import { ResearchPanel } from "./ResearchPanel";
import { formatBytes, formatUtc, groupDecimalString } from "./researchFormat";
import { ShortId } from "./ShortId";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** Spec 14 §2.2 — shown whenever a gate has failed. */
export const FAIL_CLOSED_NOTE =
  "fail-closed: a red gate stops the import — there is no provisional registration.";

/** Spec 14 §2.3 — shown on a DRAFT registration. */
export const DRAFT_NOTE = "a DRAFT version can run as evidence but cannot compose rc_";

/** Spec 14 §4 pitfall 8 — shown when more than one file is offered. */
export const SINGLE_FILE_ERROR =
  "single-file contract — bundle imports inside the module or wait for package support (v2).";

/** Stagger between gate rows. Suppressed under `prefers-reduced-motion`. */
export const GATE_STAGGER_MS = 120;

/** HiFi title, verbatim. */
export const IMPORT_TITLE = "Alpha Import — standardize the code artifact";

/**
 * HiFi subtitle, rewritten to what this release does (DQ-05): the HiFi says the
 * contract mirrors the built-in's class module and the artifact is "signed";
 * v1 is a literal `ALPHA_CONTRACT` plus one function, and nothing is signed.
 */
export const IMPORT_SUBTITLE =
  "One .py module with one literal ALPHA_CONTRACT. Quarantine is fail-closed: nothing is registered until all seven gates pass, and a registration is an immutable av_.";

/**
 * HiFi meta line, with the real endpoint family and the real permission split
 * (`alpha-import.controller.ts:147` membership; activate is ADMIN-only).
 */
export const IMPORT_META =
  "POST /api/v1/research/alphas/import/* · workspace members · activation ADMIN-only · browser never executes code";

/**
 * Field rules under the mirror. Every pattern is the contract's own
 * (`research-alpha-import.v1.schema.json`); a test reads the schema and
 * compares, so the sentence cannot drift from the validator.
 */
export const RULE_PATTERNS = {
  alphaId: "^[a-z][a-z0-9-]{2,63}$",
  versionLabel: "^av_[0-9]+(?:_[0-9]+){2}$",
  timeframe: "^[1-9][0-9]*(?:m|h|d|w)$",
} as const;

/** HiFi "rules of this screen", held to the v1 contract. */
export const SCREEN_RULES =
  "No browser upload executes code. The server computes the digest before anything else. Routes are decided by the installed release and each run's preflight — never by this page, never inferred from the file. A new import is always a new immutable av_; nothing is ever patched in place.";

/**
 * OL-01 — running an imported version is not admitted yet. Run admission
 * accepts only the installed built-in adapter (`run-admission.service.ts:153,160`),
 * so the HiFi's "new run with this av_ →" is a typed absence, not a link.
 */
export const RUN_NOT_ADMITTED = {
  code: "RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE",
  label: "new run with this av_",
  reason:
    "Not admitted yet (OL-01): run admission has no installed executor for an imported version, and refuses a DRAFT as RESEARCH_RUN_ALPHA_NOT_ACTIVE.",
} as const;

/** Registry rows the HiFi draws that no v1 response carries (typed absences). */
export const REGISTRATION_ABSENT = {
  capability: {
    code: "NOT_IN_V1_CONTRACT",
    text: "not recorded at import — the installed release and each run's preflight decide routes (DQ-05)",
  },
  signature: {
    code: "NOT_PUBLISHED",
    text: "not part of registration — no signature or SBOM is produced for an import in this release",
  },
} as const;

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
 * Measured from the HiFi markup, block by block; token for every hex
 * (#faf9f5 paper, #fff paper-raised, #f4f2ec paper-sunken, #e3e0d7 line,
 * #efede4 line-soft, #c9c5ba ≈ line-strong, #939db0 ink-faint, #4e5a6e
 * ink-soft, #0f4c5c accent, #e2edf0 accent-soft, #1e7b4f good, #9a6a1f
 * accent-2, #fdfbf5 ≈ paper).
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
.ai-sub { font-family: var(--font-display); font-style: italic; font-size: 13.5px; color: var(--ink-faint); margin: 0; }
.ai-meta { flex: 0 1 auto; font-family: var(--font-mono); font-size: 10px; color: var(--ink-faint); overflow-wrap: anywhere; }
.ai-stepper { display: flex; gap: 4px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper-raised); box-shadow: 0 1px 2px rgba(28,37,50,.05); padding: 5px; overflow-x: auto; }
.ai-step { display: flex; align-items: center; gap: 8px; border: 0; border-radius: 5px; padding: 5px 12px; background: transparent; color: var(--ink); flex: none; cursor: pointer; text-align: left; }
.ai-step[aria-selected="true"] { background: var(--accent-soft); }
.ai-step .num { width: 20px; height: 20px; flex: none; display: inline-flex; align-items: center; justify-content: center; border-radius: 999px; font-family: var(--font-mono); font-size: 10px; font-weight: 700; border: 1.5px solid var(--ink-faint); color: var(--ink-mute); }
.ai-step[data-progress="done"] .num { border-color: var(--good); color: var(--good); }
.ai-step[data-progress="failed"] .num { border-color: var(--bad); color: var(--bad); }
.ai-step[aria-selected="true"] .num { border-color: var(--accent); color: var(--accent); }
.ai-step .txt { display: flex; flex-direction: column; align-items: flex-start; }
.ai-step .lbl { font-size: 11.5px; font-weight: 500; }
.ai-step .sub { font-size: 9px; color: var(--ink-faint); }
.ai-cols { display: flex; gap: 12px; flex-wrap: wrap; align-items: flex-start; }
.ai-cols[data-stretch] { align-items: stretch; }
.ai-card { border: 1px solid var(--line); border-radius: 8px; background: var(--paper-raised); min-width: 0; }
.ai-card[data-shadow] { box-shadow: 0 1px 2px rgba(28,37,50,.05); }
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
.ai-explain { font-size: 10px; color: var(--ink-soft); line-height: 1.5; margin: 0; }
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
.ai-lifecycle { font-family: var(--font-mono); font-size: 9px; font-weight: 700; border: 1px solid var(--accent-2); color: var(--accent-2); border-radius: 3px; padding: 0 5px; line-height: 15px; }
.ai-lifecycle[data-lifecycle="ACTIVE"] { border-color: var(--good); color: var(--good); }
.ai-registry { display: flex; flex-wrap: wrap; gap: 6px; }
.ai-regentry { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--paper); padding: 6px 10px; font-size: 10px; }
.ai-foot { display: flex; flex-direction: column; gap: 3px; border-top: 1px solid var(--line); padding-top: 8px; }
.ai-foot .t { font-family: var(--font-body); font-size: 9.5px; letter-spacing: .1em; text-transform: uppercase; color: var(--ink-faint); margin: 0; font-weight: 400; }
.ai-foot p { font-size: 11px; color: var(--ink-soft); line-height: 1.6; margin: 0; }
.ai-alert { display: flex; flex-direction: column; gap: 4px; border: 1px solid var(--bad); border-radius: 6px; background: var(--bad-bg-soft); padding: 8px 12px; }
.ai-sr { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.ai-anatomy summary { cursor: pointer; padding: 8px 14px; font-size: 10px; text-transform: uppercase; letter-spacing: .07em; font-weight: 500; color: var(--ink-soft); }
@media (max-width: 720px) {
  .ai-page { padding: 12px 16px 40px; }
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
}: {
  label: string;
  onClick: () => void;
  /** Why the control is inert, or null when it is pressable. */
  reason: string | null;
  action: string;
  disabled?: boolean;
}) {
  const inert = disabled === true || reason !== null;
  return (
    <span className="ai-controls">
      <button
        type="button"
        className="ai-btn"
        onClick={onClick}
        disabled={inert}
        title={inert ? (reason ?? "This request is already in flight.") : undefined}
        data-action={action}
      >
        {label}
      </button>
      {reason ? (
        <span className="ai-reason" data-disabled-reason={action}>
          {reason}
        </span>
      ) : null}
    </span>
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
              {field.check}
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

/** CG-P07-04: `0.214 ms · analyser`, or the whole ms Control API measured. */
export function gateTiming(gate: GateRow): string | null {
  if (gate.state === "SKIPPED") return null;
  if (gate.timing_source === "ANALYSER" && typeof gate.analyser_us === "number") {
    return `${(gate.analyser_us / 1000).toFixed(3)} ms · analyser`;
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
      ) : entry.lifecycle_state === "DRAFT" ? (
        <span style={{ color: "var(--ink-mute)" }}>{ACTIVATION_NOT_ADMITTED}</span>
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
      <summary>Code anatomy — current single-file contract</summary>

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
                <header className="flex flex-wrap items-center gap-2 border-b px-3 py-[7px]" style={{ borderColor: "var(--line-soft)" }}>
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
                <pre className="mono m-0 overflow-x-auto px-3 py-[9px] text-[10.5px] leading-[1.65]" style={{ background: "var(--paper)", color: "var(--ink)" }}>
                  {entry.code}
                </pre>
                <p className="m-0 border-t px-3 py-1.5 text-[10.5px] leading-[1.5]" style={{ borderColor: "var(--paper-sunken)", color: "var(--ink-soft)" }}>
                  {entry.note}
                </p>
              </section>
            ))}
          </div>

          <aside
            className="flex min-w-0 flex-1 basis-[260px] flex-col gap-[5px] rounded-[8px] border px-3.5 py-[11px]"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
            data-unlock-map
          >
            <h3 className="ai-label" style={{ color: "var(--accent)", fontWeight: 700 }}>
              what this release proves
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
  /** Set once the user offered more than one file. */
  multiFileRejected?: boolean;
  onMultiFileRejected?: () => void;

  parse: SourceResponse | null;
  gates: GatesResponse | null;
  registration: RegistrationResponse | null;
  activation: ActivationResponse | null;
  registry: readonly RegistryEntry[];

  parseState: ResearchState;
  gatesState: ResearchState;
  registerState: ResearchState;
  registryState: ResearchState;
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
}

/** Shown when a DRAFT is registered but this account may not activate it. */
export const ACTIVATION_NOT_ADMITTED =
  "Activation needs a workspace ADMIN. This account can register a draft but not activate it.";

export type ImportStep = 1 | 2 | 3;

/** The three authority states (DQ-06), with the HiFi's label + sub-line shape. */
export const IMPORT_STEPS: readonly { n: ImportStep; key: string; label: string; sub: string }[] = [
  { n: 1, key: "source", label: "Source & mirror", sub: "one .py — contract + code" },
  { n: 2, key: "gates", label: "Quarantine gates", sub: "7 gates · fail-closed" },
  { n: 3, key: "register", label: "Register av_", sub: "DRAFT → ACTIVE" },
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
    parseState,
    gatesState,
    registerState,
    registryState,
    activationPending,
    refusal,
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

  const [view, setView] = useState<ImportStep>(() => stepForReceipts(gates, registration));
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

  const parsedOk = parse?.parse_ok === true;
  const anyGateFailed = Boolean(gates?.gates.some((gate) => gate.state === "FAIL"));
  const gatesAllPass = gates?.all_pass === true;
  /* Lifecycle may only ever report the server's own word. */
  const lifecycle = activation?.lifecycle_state ?? registration?.lifecycle_state ?? null;
  const visibleRegistry = alphaId.trim() ? registry.filter((entry) => entry.alpha_id === alphaId.trim()) : registry;
  const registeredEntry = registration
    ? registry.find((entry) => entry.alpha_version_id === registration.alpha_version_id) ?? null
    : null;
  const chip = importChip(parse, registration, activation);

  const progress: Record<ImportStep, StepProgress> = {
    1: parse ? (parsedOk ? "done" : "failed") : "open",
    2: gates ? (gatesAllPass ? "done" : "failed") : "open",
    3: registration ? "done" : "open",
  };

  function acceptFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      onMultiFileRejected?.();
      return;
    }
    const file = files[0];
    void file.text().then((text) => onSourceChange(text, file.name));
  }

  const byteLength = sourceText ? new TextEncoder().encode(sourceText).byteLength : null;

  return (
    <div data-screen="alpha-import" className="ai-page" style={{ background: "var(--paper)" }}>
      <style>{AI_CSS}</style>

      {/* ------------------------------------------------------------ header */}
      <header className="ai-head" data-panel="header">
        <div className="l">
          <nav className="ai-crumb" aria-label="Breadcrumb">
            <a href="/research/quantbt/journey">Journey</a>
            <span className="sep" aria-hidden="true">/</span>
            <span className="here" aria-current="page">Alpha Import</span>
            <span className="sep" aria-hidden="true">·</span>
            {/* Plain navigation to the preflight screen. It is not a way to run
                this import: that is not admitted yet (OL-01, step 3). */}
            <a className="next" href="/research/quantbt/runs/new">next: New Run →</a>
          </nav>
          <div className="ai-titlerow">
            <h1 className="ai-title">{IMPORT_TITLE}</h1>
            {chip ? (
              <span className="ai-chip" data-chip={chip.key} data-import-chip>
                {chip.label}
              </span>
            ) : null}
          </div>
          <p className="ai-sub" data-subtitle>
            {IMPORT_SUBTITLE}
          </p>
        </div>
        <span className="ai-meta" data-meta>
          {IMPORT_META}
        </span>
      </header>

      {refusal ? (
        <div role="alert" className="ai-alert" data-refusal={refusal.code ?? "UNKNOWN"}>
          <span className="mono text-[10px] uppercase tracking-[.06em]" style={{ color: "var(--bad)" }}>
            {refusal.code ?? `http ${refusal.status}`}
          </span>
          {/* The screen's sentence for the code (VD-P23-01); the server's text is detail. */}
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
            {refusal.message}
          </span>
          {refusal.requestId ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-mute)" }}>
              request {refusal.requestId}
            </span>
          ) : null}
        </div>
      ) : null}

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
            onClick={() => setView(step.n)}
          >
            <span className="num" aria-hidden="true">
              {step.n}
            </span>
            <span className="txt">
              <span className="lbl">{step.label}</span>
              <span className="sub">{step.sub}</span>
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
              <h2 className="ai-label">1 · contract mirror — declared inside the .py, field by field</h2>
              <span className="m">
                single file · {parse ? parse.schema_version : "research.alpha-source.v1"}
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
            <div className="ai-mirror-body">
              <ResearchPanel title="parsed contract mirror" state={parseState} variant="plain" minBodyHeight={0}>
                {parse ? <MirrorTable mirror={parse.mirror} /> : null}
              </ResearchPanel>
            </div>
            <p className="ai-rules" data-mirror-rules>
              Structure rules are in Code anatomy below. Field rules are validation, not suggestion:{" "}
              <span className="mono">alpha_id {RULE_PATTERNS.alphaId}</span> (assigned at registration) · version →{" "}
              <span className="mono">{RULE_PATTERNS.versionLabel}</span>, immutable · parameter_space is int_range /
              float_range (low, high, step), categorical or fixed · timeframes{" "}
              <span className="mono">{RULE_PATTERNS.timeframe}</span> · a field outside the v1 contract is never inferred.
            </p>
          </div>

          <div className="ai-side">
            <div className="ai-card" data-pad>
              <h2 className="ai-label">drop one .py file</h2>
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
                  {fileName ?? "choose one .py file, or drop it here"}
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".py"
                    className="sr-only"
                    aria-label="Alpha source file"
                    onChange={(event) => acceptFiles(event.target.files)}
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
                  {byteLength !== null ? `${formatBytes(byteLength)} · ` : null}
                  ONE .py — contract + code, nothing else
                </span>
                <span className="quarantine">held in quarantine — no strategy code is executed at upload</span>
              </div>

              {multiFileRejected ? (
                <p role="alert" className="m-0 text-[11px]" style={{ color: "var(--bad)" }} data-single-file-error>
                  {SINGLE_FILE_ERROR}
                </p>
              ) : null}

              <label className="ai-paste">
                <span className="ai-label">or paste the module</span>
                <textarea
                  value={sourceText}
                  onChange={(event) => onSourceChange(event.target.value, fileName)}
                  rows={6}
                  spellCheck={false}
                  aria-label="Alpha source text"
                />
              </label>

              <StepButton
                label="Parse"
                action="parse"
                onClick={onParse}
                reason={
                  sourceText.trim().length === 0
                    ? "Drop a .py file or paste the module first."
                    : busy ?? (parse !== null ? "Parsed. Change the module to parse it again." : null)
                }
              />
              {parsedOk ? (
                <button type="button" className="ai-btn self-start" data-quiet data-nav="2" onClick={() => setView(2)}>
                  Continue to gates →
                </button>
              ) : null}

              <p className="ai-explain">
                One file is the whole artifact: the literal ALPHA_CONTRACT and one plain function live inside it.
                Engine config, fees and windows are declared at New Run, never in the file. The digest is computed
                server-side; a mismatch is refused as RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH.
              </p>
            </div>

            <div className="ai-card" data-pad data-entrypoint-card>
              <h2 className="ai-label">entrypoint shape (v1 single-file contract)</h2>
              <pre className="ai-entry">{"ALPHA_CONTRACT = { … }     # one literal\ndef generate_signals(context): …"}</pre>
              <p className="ai-note">
                One literal declaration and one plain function, defined in a restricted namespace and never called at
                import. Classes, decorators and imports are not accepted by this release (DQ-05).
              </p>
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
            <h2 className="ai-label">2 · quarantine gates — fail-closed, every gate named</h2>
            <span className="m">
              {gates ? (
                <>
                  {"receipt "}
                  <ShortId id={gates.gate_receipt_id} label="gate receipt" />
                  {" · expires "}
                  {formatUtc(gates.expires_at_utc_ms) ?? "time not published"}
                </>
              ) : (
                "seven gates, one server request"
              )}
            </span>
          </div>

          <StepButton
            label="Run gates"
            action="run-gates"
            onClick={onRunGates}
            reason={
              parse === null
                ? "Parse a source first — the gates run against the server's parse receipt."
                : !parsedOk
                  ? "The parse did not complete. The mirror in step 1 shows which fields are missing."
                  : busy ?? (gates !== null ? "The gates ran for these bytes." : null)
            }
          />

          {busyStep === "gates" ? (
            <RunningGates />
          ) : (
            <ResearchPanel title="import gates" state={gatesState} variant="plain" minBodyHeight={0}>
              {gates ? <GateList gates={gates.gates} reducedMotion={reducedMotion} /> : null}
            </ResearchPanel>
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

          <p className="ai-amber">
            A red gate stops the gates where they stand — later gates are SKIPPED and the source stays in quarantine.
            No manual override: fix the .py and import it again — new bytes, new digest, new receipt.
          </p>

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
            <h2 className="ai-label">3 · registration — what the registry writes</h2>

            <div className="ai-controls py-1">
                <label className="flex items-center gap-2">
                  <span className="ai-label">alpha id</span>
                  <input
                    value={alphaId}
                    onChange={(event) => onAlphaIdChange(event.target.value)}
                    className="mono rounded-[6px] border px-2 py-1 text-[11px]"
                    style={{ borderColor: "var(--line)", background: "var(--paper)" }}
                    aria-label="Alpha id"
                  />
                </label>
                <StepButton
                  label="Register draft"
                  action="register"
                  onClick={onRegister}
                  reason={
                    gates === null
                      ? "Run the gates first."
                      : anyGateFailed
                        ? "A gate failed. Fix the module and submit it again."
                        : !gatesAllPass
                          ? "All seven gates must pass."
                          : alphaId.trim().length === 0
                            ? "Name the alpha this version belongs to."
                            : busy ?? (registration !== null ? "Registered." : null)
                  }
                />
              </div>

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

            <p className="ai-explain">
              Import states: DRAFT → ACTIVE → SUPERSEDED. Only ACTIVE composes a release candidate. Activation is a
              registry action, not a code change.
            </p>

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
                      ? "Activation is in flight."
                      : activationRefusal && !activationRefusal.mayRetry
                        ? "The server refused this activation."
                        : busy
                  }
                />
                {activationRefusal ? (
                  <p role="alert" className="m-0 text-[10.5px]" style={{ color: "var(--bad)" }} data-activation-refusal>
                    {activationRefusal.message}
                  </p>
                ) : null}
              </>
            ) : registration && lifecycle === "DRAFT" ? (
              <p className="m-0 text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-activation-not-admitted>
                {ACTIVATION_NOT_ADMITTED}
              </p>
            ) : null}
          </div>

          <div className="ai-next" data-where-next>
            <h2 className="ai-label">where it goes next</h2>
            {registration ? (
              <p>
                The registered artifact is <span className="mono">{registration.version_label}</span> of{" "}
                <span className="mono">{registration.alpha_id}</span>, pinned to source digest{" "}
                <Digest value={registration.source_digest} label="source digest" />. A run that binds it
                inherits that digest.
              </p>
            ) : (
              <p>Nothing is registered yet. A version exists only after all seven gates pass and you register it.</p>
            )}
            <div className="links">
              {/* OL-01: a typed absence, never a working link. */}
              <span
                className="absent"
                title={RUN_NOT_ADMITTED.reason}
                data-absent-action="new-run"
                data-absent-code={RUN_NOT_ADMITTED.code}
              >
                {RUN_NOT_ADMITTED.label} →
              </span>
              {registration ? (
                <LineageLink to={lineageHref(registration.alpha_id)} action="open-lineage">
                  lineage
                </LineageLink>
              ) : null}
              <a href="/research/quantbt/runs">run library</a>
            </div>
            <p className="ai-reason" data-run-not-admitted>
              {RUN_NOT_ADMITTED.reason}
            </p>
          </div>
        </div>

        {/* -------------------------------------------------------- registry */}
        <div className="ai-card" data-pad>
          <h2 className="ai-label">alpha registry{alphaId.trim() ? ` — ${alphaId.trim()}` : ""}</h2>
          <ResearchPanel title="alpha registry" state={registryState} variant="plain" minBodyHeight={0}>
            <div className="ai-registry" data-registry-strip>
              {visibleRegistry.length === 0 ? (
                <span className="text-[10.5px]" style={{ color: "var(--ink-mute)" }}>
                  {alphaId.trim() ? "No versions for this alpha id." : "No imported versions in this workspace yet."}
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
          </ResearchPanel>
        </div>
      </section>

      {/* ------------------------------------------------------------ footer */}
      <footer className="ai-foot" data-panel="rules">
        <h2 className="t">rules of this screen</h2>
        <p>{SCREEN_RULES}</p>
      </footer>
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
            not read yet — the registry list has not returned this version
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
            <span className="soft">none — no earlier version of this alpha was recorded</span>
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
        <Row k="signed publication" absent={REGISTRATION_ABSENT.signature.code}>
          {REGISTRATION_ABSENT.signature.text}
        </Row>
      </dl>
      {registration.replayed ? (
        <span className="mono pt-1 text-[9.5px]" style={{ color: "var(--ink-mute)" }}>
          replayed — identical bytes were already registered
        </span>
      ) : null}
    </div>
  );
}
