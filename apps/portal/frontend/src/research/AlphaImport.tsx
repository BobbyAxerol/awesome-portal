/**
 * Screen 14 — Alpha Import (P07 composition scope).
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
 * Composition note: the step controls live *outside* `ResearchPanel`, and each
 * panel holds only what the server returned. That split is deliberate. A
 * panel's state describes its own request, and `ResearchPanel` correctly
 * withholds both content and actions when that request failed — so a form kept
 * inside one would vanish the moment a parse went `unavailable`, taking the
 * user's pasted source with it. Local input is not a server fact and does not
 * inherit a server fact's state.
 *
 * The component is presentational. `useAlphaImport` wires the five real
 * operations; mounting this on a product route is P09's shared-route work, so
 * the fixture lane renders this form with local data and issues no request.
 */

import { useEffect, useRef, useState } from "react";

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
import {
  ANATOMY_SUBSTAGE_NOTE,
  CODE_ANATOMY,
  UNLOCK_FOOTER,
  UNLOCK_MAP,
} from "./codeAnatomy";
import { ResearchPanel } from "./ResearchPanel";
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

/* ------------------------------------------------------------------ parts */

function StepMarker({
  n,
  title,
  done,
  blocked,
}: {
  n: number;
  title: string;
  done: boolean;
  blocked: boolean;
}) {
  const tone = blocked ? "var(--ink-faint)" : done ? "var(--good)" : "var(--ink)";
  return (
    <div className="flex items-baseline gap-2" data-step-marker={n} data-blocked={blocked || undefined}>
      <span
        className="mono flex-none rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
        style={{ color: tone, borderColor: tone }}
      >
        {n}
      </span>
      <h2 className="mono text-[10.5px] uppercase tracking-[.07em]" style={{ color: tone }}>
        {title}
      </h2>
    </div>
  );
}

/**
 * A step control, plus the sentence that says why it cannot be pressed.
 *
 * §3.5: a disabled control the reader expected to use has to state its reason.
 * The reason is both the tooltip and a visible line, because a tooltip alone
 * reaches neither touch nor keyboard — and a greyed button beside no
 * explanation reads as broken rather than as waiting. `.btn-ghost` also carries
 * no disabled styling of its own, so the dimming is set here.
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
    <span className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        className="btn-ghost mono self-start text-[10px]"
        style={inert ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
        onClick={onClick}
        disabled={inert}
        title={inert ? (reason ?? "This request is already in flight.") : undefined}
        data-action={action}
      >
        {label}
      </button>
      {reason ? (
        <span
          className="text-[10.5px]"
          style={{ color: "var(--ink-faint)" }}
          data-disabled-reason={action}
        >
          {reason}
        </span>
      ) : null}
    </span>
  );
}

export function formatMirrorValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(formatMirrorValue).join(" · ");
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => `${key}: ${formatMirrorValue(entry)}`).join(" · ");
  return "";
}

function MirrorTable({ mirror }: { mirror: readonly MirrorField[] }) {
  return (
    <div className="overflow-x-auto" data-mirror>
      <dl style={{ minWidth: 470 }}>
        {mirror.map((field) => (
          <div
            key={field.field}
            data-mirror-field={field.field}
            data-mirror-state={field.state}
            className="flex items-baseline gap-2.5 border-b py-[3px] last:border-b-0"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <dt className="mono flex-none text-[10px]" style={{ width: 196, color: "var(--ink-soft)" }}>
              {field.field}
            </dt>
            <dd className="mono flex-1 break-words text-[11px]" style={{ color: "var(--ink)" }}>
              {/* A field the parser did not find has no value to print. The chip
                  carries that fact; an invented dash would read as a value. */}
              {field.state === "parsed" ? formatMirrorValue(field.value) : null}
            </dd>
            <span
              className="mono flex-none rounded-[3px] border px-1 text-[8.5px] font-bold leading-[14px]"
              style={{
                color: field.state === "parsed" ? "var(--good)" : "var(--bad)",
                borderColor: field.state === "parsed" ? "var(--good)" : "var(--bad)",
              }}
            >
              {field.state}
            </span>
          </div>
        ))}
      </dl>
    </div>
  );
}

function gateTone(state: GateRow["state"]): string {
  if (state === "PASS") return "var(--good)";
  if (state === "FAIL") return "var(--bad)";
  /* `SKIPPED` is de-emphasised, not decorative: it is the word that tells the
     reader the gate never ran. `--line-strong` is a border tone and fell below
     readable contrast on paper when it was used as text here. */
  return "var(--ink-mute)";
}

function GateList({
  gates,
  disclosure,
  reducedMotion,
}: {
  gates: readonly GateRow[];
  disclosure: string;
  reducedMotion: boolean;
}) {
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
    <div className="flex flex-col gap-1.5">
      <div className="mono flex gap-2 border-b pb-1 text-[9px] font-semibold uppercase" style={{ color: "var(--ink-faint)", borderColor: "var(--line-soft)" }} data-gate-header>
        <span className="w-[16px]">#</span><span className="w-[186px]">gate</span><span className="w-[58px]">state</span><span>elapsed</span>
      </div>
      <ol className="flex flex-col" role="list" data-gates>
        {gates.slice(0, revealed).map((gate) => (
          <li
            key={gate.n}
            data-gate={gate.name}
            data-gate-state={gate.state}
            className="mono flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 border-b py-1 text-[10.5px] last:border-b-0"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <span className="flex-none text-right" style={{ width: 16, color: "var(--ink-faint)" }}>
              {gate.n}
            </span>
            <span className="flex-none" style={{ width: 186 }}>
              {gate.name}
            </span>
            <span className="flex-none font-bold" style={{ width: 58, color: gateTone(gate.state) }}>
              <span aria-hidden="true">● </span>{gate.state}
            </span>
            <span className="flex-none" style={{ width: 52, color: "var(--ink-faint)" }}>
              {gate.ms} ms
            </span>
            {/* The engine's own sentence, on its own line so it is never cut. */}
            <span className="w-full break-words pl-[18px] text-[10px]" style={{ color: "var(--ink-soft)" }}>
              {gate.message}
            </span>
          </li>
        ))}
      </ol>

      {/* Gate 7's limit, read from the contract's constant rather than copied. */}
      <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-static-scan-disclosure>
        {disclosure}
      </p>
    </div>
  );
}

function RegistryChip({ entry, onActivate, busy, refusal }: { entry: RegistryEntry; onActivate?: (entry: RegistryEntry) => void; busy: boolean; refusal: ImportRefusal | null }) {
  const active = entry.lifecycle_state === "ACTIVE";
  const canActivate = entry.lifecycle_state === "DRAFT" && entry.may_activate && onActivate;
  return (
    <div
      data-registry-entry={entry.alpha_version_id}
      data-lifecycle={entry.lifecycle_state}
      className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] border px-3 py-2 text-[10px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-semibold" style={{ color: "var(--ink)" }}>{entry.display_name ?? entry.alpha_id}</span>
        <span className="mono">{entry.version_label}</span>
        <span className="mono" style={{ color: active ? "var(--good)" : "var(--role-holdout)" }}>{entry.lifecycle_state}</span>
        <span className="mono" style={{ color: "var(--ink-faint)" }}>rev {entry.alpha_revision}</span>
      </div>
      {canActivate ? (
        <button
          type="button"
          disabled={busy}
          title={busy ? "An activation request is already in progress." : undefined}
          onClick={() => onActivate(entry)}
          className="btn-ghost"
          aria-label={`Activate ${entry.version_label}`}>
          {busy ? "Activating…" : "Activate"}
        </button>
      ) : entry.lifecycle_state === "DRAFT" ? (
        <span style={{ color: "var(--ink-faint)" }}>{ACTIVATION_NOT_ADMITTED}</span>
      ) : null}
      {refusal ? <p role="alert" className="w-full" style={{ color: "var(--bad)" }}>{refusal.message}</p> : null}
    </div>
  );
}

/**
 * Code anatomy — decision `S14-VIS-01`.
 *
 * A presentation substage beneath parse, never a fourth authority state. It
 * holds no server fact, changes no enablement, and issues no request: it is the
 * module contract every import is measured against, open to read at any point
 * in the wizard.
 *
 * Collapsed by default so it does not push the gates below the fold on a first
 * visit, and rendered with `<details>` so it works without JavaScript state and
 * is reachable by keyboard for free.
 */
function CodeAnatomy() {
  return (
    <details className="rounded-[8px] border" style={{ borderColor: "var(--line)" }} data-code-anatomy>
      <summary
        className="mono cursor-pointer px-3 py-2 text-[10px] uppercase tracking-[.07em]"
        style={{ color: "var(--ink-soft)" }}
      >
        Code anatomy — current single-file contract
      </summary>

      <div className="flex flex-col gap-2.5 px-3 pb-3">
        {/* Said once, at the top: this is reference, not a step. */}
        <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }} data-anatomy-note>
          {ANATOMY_SUBSTAGE_NOTE}
        </p>

        <div className="flex flex-wrap items-start gap-3">
          <div className="flex min-w-[300px] flex-[1.5] flex-col gap-2.5">
            {CODE_ANATOMY.map((entry) => (
              <section
                key={entry.section}
                className="overflow-hidden rounded-[8px] border"
                style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
                data-anatomy-section={entry.section}
              >
                <header
                  className="flex flex-wrap items-center gap-2 border-b px-3 py-[7px]"
                  style={{ borderColor: "var(--line-soft)" }}
                >
                  <h4
                    className="text-[10px] font-medium uppercase tracking-[.07em]"
                    style={{ fontFamily: "var(--font-body)", color: "var(--ink-faint)" }}
                  >
                    {entry.section}
                  </h4>
                  <span className="ml-auto flex flex-wrap gap-1">
                    {entry.unlocks.map((item) => (
                      <span
                        key={item.label}
                        data-unlock={item.label}
                        data-unlock-kind={item.kind}
                        className="mono rounded-full border px-1.5 text-[8.5px] font-bold leading-[15px]"
                        style={{
                          color: item.kind === "gate" ? "var(--role-holdout)" : "var(--good)",
                          borderColor: item.kind === "gate" ? "var(--role-holdout)" : "var(--good)",
                          background: "var(--paper-raised)",
                        }}
                      >
                        {item.label}
                      </span>
                    ))}
                  </span>
                </header>
                {/* Read-only by construction: a `pre`, not an editor. The
                    module is authored in the reader's own tooling. */}
                <pre
                  className="mono m-0 overflow-x-auto px-3 py-2 text-[10.5px] leading-[1.65]"
                  style={{ background: "var(--paper)", color: "var(--ink)" }}
                >
                  {entry.code}
                </pre>
                <p
                  className="border-t px-3 py-1.5 text-[10.5px] leading-[1.5]"
                  style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }}
                >
                  {entry.note}
                </p>
              </section>
            ))}
          </div>

          <aside
            className="flex min-w-[260px] flex-1 flex-col gap-1.5 rounded-[8px] border px-3.5 py-3"
            style={{ borderColor: "var(--accent)", background: "var(--accent-soft)" }}
            data-unlock-map
          >
            <h4
              className="text-[10px] font-bold uppercase tracking-[.07em]"
              style={{ color: "var(--accent)" }}
            >
              what this release proves
            </h4>
            {UNLOCK_MAP.map((row) => (
              <span
                key={row.output}
                className="flex flex-col gap-px border-b py-[3px]"
                style={{ borderColor: "var(--line-soft)" }}
                data-unlock-output={row.output}
              >
                <span className="mono text-[10px] font-semibold">{row.output}</span>
                <span className="text-[10px]" style={{ color: "var(--ink-soft)" }}>
                  {row.routes}
                </span>
              </span>
            ))}
            <p className="text-[9.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
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
     flight nor after it succeeded for these bytes — both re-posted the same
     write. Changing the bytes drops every receipt and re-arms the chain. */
  const busy = busyStep !== null ? "A request is in flight." : null;

  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsedOk = parse?.parse_ok === true;
  const anyGateFailed = Boolean(gates?.gates.some((gate) => gate.state === "FAIL"));
  const gatesAllPass = gates?.all_pass === true;
  /* Lifecycle may only ever report the server's own word. */
  const lifecycle = activation?.lifecycle_state ?? registration?.lifecycle_state ?? null;
  const visibleRegistry = alphaId.trim() ? registry.filter((entry) => entry.alpha_id === alphaId.trim()) : registry;

  function acceptFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length > 1) {
      onMultiFileRejected?.();
      return;
    }
    const file = files[0];
    void file.text().then((text) => onSourceChange(text, file.name));
  }

  return (
    <div
      data-screen="alpha-import"
      className="flex flex-col gap-3.5 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-col gap-[3px] border-b pb-2.5" style={{ borderColor: "var(--line)" }}>
        <div className="flex flex-wrap gap-3 text-[10px] font-semibold" style={{ color: "var(--accent)" }}>
          <a href="/research/quantbt/journey">Journey map</a>
          <a href="/research/quantbt/runs">Run Library</a>
          <a href={registration ? `/research/quantbt/runs/new?alpha=${encodeURIComponent(registration.alpha_id)}&av=${encodeURIComponent(registration.alpha_version_id)}` : "/research/quantbt/runs/new"}>New Run →</a>
        </div>
        <h1
          className="text-[22px] font-light tracking-[-.01em]"
          style={{ fontFamily: "Newsreader, Georgia, serif" }}
        >
          Alpha Import
        </h1>
        <p
          className="text-[13.5px] italic"
          style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
        >
          One <span className="mono not-italic">.py</span> module, seven fail-closed gates, one
          immutable alpha version.
        </p>
      </header>

      {refusal ? (
        <div
          role="alert"
          data-refusal={refusal.code ?? "UNKNOWN"}
          className="flex flex-col gap-1 rounded-[6px] border px-3 py-2"
          style={{ borderColor: "var(--bad)", background: "var(--bad-bg-soft)" }}
        >
          <span className="mono text-[10px] uppercase tracking-[.06em]" style={{ color: "var(--bad)" }}>
            {refusal.code ?? `http ${refusal.status}`}
          </span>
          {/* The server's sentence, never a locally friendlier one. */}
          <span className="text-[11.5px] leading-[1.55]" style={{ color: "var(--ink-soft)" }}>
            {refusal.message}
          </span>
          {refusal.requestId ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              request {refusal.requestId}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------------------------------------- step 1 */}
      <section className="flex flex-col gap-2" data-step="1" aria-label="Step 1 — source">
        <StepMarker n={1} title="source" done={parsedOk} blocked={false} />

        <div
          data-dropzone
          data-over={dragOver || undefined}
          className="rounded-[10px] border-[1.5px] border-dashed px-6 py-5 text-center"
          style={{
            borderColor: dragOver ? "var(--accent)" : "var(--line-strong)",
            background: dragOver ? "var(--accent-soft)" : "var(--paper-raised)",
            color: "var(--ink-faint)",
          }}
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
          <label className="mono cursor-pointer text-[11px]">
            Drop one <span style={{ color: "var(--ink-soft)" }}>.py</span> file, or choose one
            <input
              ref={fileRef}
              type="file"
              accept=".py"
              className="sr-only"
              aria-label="Alpha source file"
              onChange={(event) => acceptFiles(event.target.files)}
            />
          </label>
          {fileName ? (
            <p className="mono pt-1 text-[10px]" style={{ color: "var(--ink)" }}>
              {fileName}
            </p>
          ) : null}
          {sourceText ? (
            <p className="mono pt-1 text-[9px]" style={{ color: "var(--ink-soft)" }} data-source-custody>
              {new TextEncoder().encode(sourceText).byteLength} UTF-8 bytes · {parse ? `server digest ${parse.source_digest.slice(0, 18)}…` : "server digest pending parse"} · {gates?.all_pass ? "seven gates passed" : "gate decision pending"}
            </p>
          ) : null}
        </div>

        {multiFileRejected ? (
          <p role="alert" className="text-[11px]" style={{ color: "var(--bad)" }} data-single-file-error>
            {SINGLE_FILE_ERROR}
          </p>
        ) : null}

        <label className="flex flex-col gap-1">
          <span className="mono text-[10px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
            or paste the module
          </span>
          <textarea
            value={sourceText}
            onChange={(event) => onSourceChange(event.target.value, fileName)}
            rows={6}
            spellCheck={false}
            className="mono rounded-[6px] border px-2 py-1.5 text-[11px]"
            style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
            aria-label="Alpha source text"
          />
        </label>

        <div className="flex flex-wrap items-center gap-2">
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
          {parse ? (
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
              source {parse.source_digest.slice(0, 14)} · analysis {parse.analysis_digest.slice(0, 14)}
            </span>
          ) : null}
        </div>

        <ResearchPanel
          title="parsed contract mirror"
          meta={parse ? parse.schema_version : undefined}
          state={parseState}
          minBodyHeight={96}
        >
          {parse ? <MirrorTable mirror={parse.mirror} /> : null}
        </ResearchPanel>

        {/* `S14-VIS-01`: a substage of parse, not a stage of the import. */}
        <CodeAnatomy />
      </section>

      {/* ---------------------------------------------------------- step 2 */}
      <section className="flex flex-col gap-2" data-step="2" aria-label="Step 2 — gates">
        <StepMarker n={2} title="gates" done={gatesAllPass} blocked={!parsedOk} />

        <StepButton
          label="Run gates"
          action="run-gates"
          onClick={onRunGates}
          reason={
            parse === null
              ? "Parse a source first — the gates run against the server's parse receipt."
              : !parsedOk
                ? "The parse did not complete. The mirror above shows which fields are missing."
                : busy ?? (gates !== null ? "The gates ran for these bytes." : null)
          }
        />

        <ResearchPanel
          title="import gates"
          meta={gates ? `receipt ${gates.gate_receipt_id.slice(0, 12)}` : undefined}
          state={gatesState}
          minBodyHeight={110}
        >
          {gates ? (
            <GateList
              gates={gates.gates}
              disclosure={gates.static_scan_disclosure}
              reducedMotion={reducedMotion}
            />
          ) : null}
        </ResearchPanel>

        {anyGateFailed ? (
          <p role="alert" className="text-[11px]" style={{ color: "var(--bad)" }} data-fail-closed-note>
            {FAIL_CLOSED_NOTE}
          </p>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- step 3 */}
      <section className="flex flex-col gap-2" data-step="3" aria-label="Step 3 — register">
        <StepMarker n={3} title="register" done={Boolean(registration)} blocked={!gatesAllPass} />

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2">
            <span className="mono text-[10px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
              alpha id
            </span>
            <input
              value={alphaId}
              onChange={(event) => onAlphaIdChange(event.target.value)}
              className="mono rounded-[6px] border px-2 py-1 text-[11px]"
              style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
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

        <ResearchPanel title="registration" state={registerState} minBodyHeight={86}>
          {registration ? (
            <div className="flex flex-col gap-1.5" data-registration={registration.alpha_version_id}>
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="mono text-[12px] font-semibold">{registration.version_label}</span>
                <span
                  className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
                  data-lifecycle={lifecycle}
                  style={{
                    color: lifecycle === "ACTIVE" ? "var(--good)" : "var(--ink-soft)",
                    borderColor: lifecycle === "ACTIVE" ? "var(--good)" : "var(--line-strong)",
                  }}
                >
                  {lifecycle}
                </span>
                <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                  {/* After activation the revision is the activation's, not the registration's. */}
                  rev {activation?.alpha_revision ?? registration.alpha_revision}
                </span>
                {registration.replayed ? (
                  <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                    replayed — identical bytes were already registered
                  </span>
                ) : null}
              </div>

              <details className="mono text-[9.5px]" data-registration-digest>
                <summary style={{ color: "var(--ink-faint)" }}>source digest {registration.source_digest.slice(0, 18)}…</summary>
                <span className="break-all">{registration.source_digest}</span>
              </details>

              {registration.supersedes ? (
                <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
                  supersedes {registration.supersedes}
                </span>
              ) : null}

              {activation?.superseded_alpha_version_id ? (
                <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }}>
                  superseded {activation.superseded_alpha_version_id}
                </span>
              ) : null}

              {/* The DRAFT limit disappears once the server says ACTIVE. */}
              {lifecycle === "DRAFT" ? (
                <span className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-draft-note>
                  {DRAFT_NOTE}
                </span>
              ) : null}
            </div>
          ) : null}
        </ResearchPanel>

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
            {/* The refusal sits beside the button that caused it, not in the
                page banner two thousand pixels above. */}
            {activationRefusal ? (
              <p role="alert" className="text-[10.5px]" style={{ color: "var(--bad)" }} data-activation-refusal>
                {activationRefusal.message}
              </p>
            ) : null}
          </>
        ) : registration && lifecycle === "DRAFT" ? (
          <p className="text-[10.5px]" style={{ color: "var(--ink-soft)" }} data-activation-not-admitted>
            {ACTIVATION_NOT_ADMITTED}
          </p>
        ) : null}
      </section>

      {/* -------------------------------------------------------- registry */}
      <ResearchPanel title="alpha registry" state={registryState} minBodyHeight={48}>
        <div className="flex flex-wrap gap-1.5" data-registry-strip>
          {visibleRegistry.length === 0 ? (
            <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }}>{alphaId.trim() ? "No versions for this alpha id." : "Enter an alpha id above to inspect its versions."}</span>
          ) : visibleRegistry.map((entry) => (
            <RegistryChip key={entry.alpha_version_id} entry={entry} onActivate={onActivateEntry} busy={busyStep !== null} refusal={activationAttemptId === entry.alpha_version_id ? activationRefusal : null} />
          ))}
        </div>
      </ResearchPanel>
    </div>
  );
}
