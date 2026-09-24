/**
 * Screen 03 · Run Progress (P11 composition scope).
 *
 * Evidence Flow over time: stage rail, overall + budget, fold Gantt, trial
 * console, artifacts, claim passport. Spec 03's founding rule governs the
 * whole screen — **the claim is a dashed forecast until Stage 5 issues it**,
 * and nothing on this page may turn a forecast into a fact.
 *
 * Three habits, each with a rule behind it:
 *
 *  - **The page never estimates.** `eta_s`, `pct`, `tqdm_line` and every
 *    counter are the server's. A `null` ETA renders as "not reported", never
 *    as a computed guess (spec 03 pitfall 1, §3.3).
 *  - **A sealed artifact is readiness, not authorization.** `reader_href` is
 *    `null` by contract in P11, so the card stays rich and stays unlinked —
 *    an invented route would offer bytes this browser may not read.
 *  - **Completion is `readiness.mandatory === "SEALED"` and nothing else.** No
 *    timer, animation or console line may produce a completion, an artifact,
 *    a claim, a counter or an ETA.
 */

import { useEffect, useRef, useState } from "react";

import {
  NOT_PUBLISHED_CERTIFICATE,
  NOT_PUBLISHED_TIMELINE,
  type Artifact,
  type ConsoleLine,
  type EffectiveStatus,
  type FoldSegment,
  type MethodologyCertificate,
  type ProgressRead,
  type ProgressSnapshot,
  type RetainedArtifact,
  type Stage,
} from "./progressClient";
import { ArtifactPanel } from "./ArtifactPanel";
import { encodeInspectionCursor } from "./inspectionCursor";
import { ResearchPanel } from "./ResearchPanel";
import type { Transport } from "./useRunProgress";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

export const SUBTITLE =
  "The run narrates itself: stages, folds, trials, artifacts — and a claim that stays a dashed forecast until Stage 5 issues it.";

export const SSE_LIVE = "SSE live · poll floor 5s";
export const SSE_CLOSED = "stream closed — final state";

export const NOT_ISSUED_NOTE =
  "the run failed before Stage 5 — no claim exists. Failure detail is in the console above.";

/** A run that ended without failing and without a claim, when the server gave no sentence. */
export const NO_CLAIM_NOTE = "This run ended without issuing a claim.";

export const OLDER_DROPPED = "· · · older lines dropped (kept server-side)";

export const RULES_FOOTER =
  "A dashed claim is a forecast, not a promise — the engine issues the real one at Stage 5 or not at all. Progress numbers come from the orchestrator event stream; the page never estimates. A budget kill is a verdict, not an accident — it ships with its error code.";

/** P11 publishes no reader route; the contract pins `reader_href` to null. */
export const ARTIFACT_NO_READER =
  "Sealed means the bytes are ready — reading them is a separate, authorized route this release does not publish.";

const STAGE_LABEL: Record<Stage["key"], string> = {
  S1: "Split",
  S2: "Search",
  S3: "Freeze",
  S4: "Execute",
  S5: "Claim",
};

/** Spec 03 §2.4: search is mist, OOS is teal, the freeze tick is gold. */
const SEGMENT_TONE: Record<FoldSegment["kind"], string> = {
  search: "var(--viz-train)",
  oos: "var(--role-oos)",
  freeze_tick: "var(--role-holdout)",
};

const TONE_COLOR: Record<ConsoleLine["tone"], string> = {
  INFO: "var(--viz-train)",
  COMPLETE: "var(--viz-train)",
  WARN: "var(--role-holdout)",
  ERROR: "var(--bad)",
};

/* ------------------------------------------------------------------ parts */

/** A value the server did not send. Never `0`, `—` or `N/A` (§3.3). */
function Absent({ what = "not reported" }: { what?: string }) {
  return (
    <span className="italic" style={{ color: "var(--ink-faint)" }}>
      {what}
    </span>
  );
}

function StatusPill({ status }: { status: EffectiveStatus }) {
  const tone =
    status === "COMPLETED"
      ? "var(--good)"
      : status === "FAILED"
        ? "var(--bad)"
        : status === "CANCELLED"
          ? "var(--role-holdout)"
          : "var(--accent)";
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] font-bold leading-[16px]"
      data-status-pill={status}
      style={{ color: tone, borderColor: tone }}
    >
      {status}
    </span>
  );
}

/**
 * The transport indicator.
 *
 * A dropped stream is a grey dot and a changed label, never a banner: the page
 * is still correct on the poll floor, and a red banner would report an outage
 * that is not happening (spec 03 pitfall 5).
 */
function TransportDot({ transport, live }: { transport: Transport; live: boolean }) {
  const streaming = transport === "stream";
  return (
    <span className="flex items-center gap-1.5" data-transport={transport}>
      <span
        aria-hidden="true"
        className={`inline-block h-[7px] w-[7px] rounded-full ${streaming && live ? "motion-safe:animate-pulse" : ""}`}
        data-pulse={streaming && live ? "true" : undefined}
        style={{ background: streaming && live ? "var(--good)" : "var(--ink-faint)" }}
      />
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
        {live ? SSE_LIVE : SSE_CLOSED}
      </span>
    </span>
  );
}

function StageRail({
  stages,
  claimState,
}: {
  stages: readonly Stage[];
  claimState: ProgressSnapshot["claim"]["state"];
}) {
  return (
    <div className="flex flex-wrap gap-2" data-stage-rail>
      {stages.map((stage) => {
        const issued = stage.key === "S5" && claimState === "ISSUED";
        const done = stage.state === "DONE";
        const running = stage.state === "RUNNING";
        const tone = issued
          ? "var(--role-holdout)"
          : done
            ? "var(--accent)"
            : running
              ? "var(--good)"
              : "var(--line-strong)";
        return (
          <div
            key={stage.key}
            data-stage={stage.key}
            data-stage-state={issued ? "ISSUED" : stage.state}
            /* A pending stage is not a control: it is announced as disabled
               rather than silently inert. */
            aria-disabled={stage.state === "PENDING" || undefined}
            className="flex min-w-[124px] flex-1 flex-col gap-[3px] rounded-[6px] border px-2.5 py-2"
            style={{
              borderColor: tone,
              background: done || issued ? "var(--accent-soft)" : "var(--paper-raised)",
              opacity: stage.state === "PENDING" ? 0.6 : 1,
            }}
          >
            <span className="mono text-[10px] font-semibold" style={{ color: tone }}>
              {stage.key} · {STAGE_LABEL[stage.key]}
            </span>
            <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }}>
              {issued ? "ISSUED" : stage.state}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Bar({ pct, tone, label }: { pct: number; tone: string; label: string }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <span
      className="relative block h-[14px] flex-1 overflow-hidden rounded-[5px]"
      style={{ background: "var(--paper-sunken)" }}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuenow={clamped}
      aria-valuemax={100}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-[5px]"
        style={{ width: `${clamped}%`, background: tone }}
        data-bar-pct={clamped}
      />
    </span>
  );
}

function OverallBlock({ snapshot }: { snapshot: ProgressSnapshot }) {
  const { overall, budget } = snapshot;
  /* Budget is a cost, not progress: gold, and red past 90% (pitfall 7). */
  const budgetTone = budget.pct > 90 ? "var(--bad)" : "var(--role-holdout)";
  return (
    <div className="flex flex-col gap-2" data-overall>
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="mono w-[62px] flex-none text-[9.5px] uppercase" style={{ color: "var(--ink-faint)" }}>
          overall
        </span>
        <Bar pct={overall.pct} tone="var(--accent)" label="Overall run progress" />
        <span className="mono flex-none text-[10.5px]">{overall.pct}%</span>
        <span className="mono flex-none text-[10px]" style={{ color: "var(--ink-soft)" }}>
          elapsed {overall.elapsed_s}s
        </span>
        <span className="mono flex-none text-[10px]" style={{ color: "var(--ink-soft)" }} data-eta>
          {/* The server owns the ETA. A null one is absent, never computed. */}
          eta {overall.eta_s === null ? <Absent /> : `${overall.eta_s}s`}
        </span>
        <span className="mono flex-none text-[10px]" style={{ color: "var(--ink-soft)" }}>
          trials {overall.trials_done}/{overall.trials_declared}
        </span>
      </div>

      {/* The server builds this string; the page does not reformat it. */}
      <p className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-tqdm>
        {overall.tqdm_line}
      </p>

      <div className="flex flex-wrap items-center gap-2.5" data-budget>
        <span className="mono w-[62px] flex-none text-[9.5px] uppercase" style={{ color: "var(--ink-faint)" }}>
          budget
        </span>
        <Bar pct={budget.pct} tone={budgetTone} label="Compute budget used" />
        <span className="mono flex-none text-[10px]" style={{ color: budgetTone }}>
          {/* Exact decimal strings, never parsed into a float. */}
          {budget.used}/{budget.cap === null ? <Absent what="no cap" /> : budget.cap} {budget.unit}
        </span>
      </div>
    </div>
  );
}

/**
 * Fold timeline.
 *
 * The contract publishes a start and an end per fold, not the search / OOS /
 * freeze segments the hi-fi sketches, so one band per fold is drawn and
 * nothing is subdivided. Inventing the segment boundaries would draw a
 * methodology the server never described.
 */
function FoldGantt({
  folds,
  now,
  cursor,
  onPick,
}: {
  folds: ProgressSnapshot["folds"];
  /**
   * The server's notion of "now" (`updated_at_utc_ms`).
   *
   * A running fold has no end, so its band needs an upper bound. Taking the
   * last completed fold's end gave the newest fold a zero-width band — it had
   * only just started, so its start *was* the frame's end. The local clock is
   * not an option: spec 03 forbids the page inventing time. The snapshot's own
   * `updated_at_utc_ms` is the one honest answer.
   */
  now: number;
  cursor: number | null;
  onPick: (fold: number) => void;
}) {
  if (folds.length === 0) {
    return (
      <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-no-folds>
        No fold has reported yet.
      </p>
    );
  }

  const starts = folds.map((f) => f.started_at_utc_ms).filter((v): v is number => v !== null);
  const ends = folds.map((f) => f.completed_at_utc_ms).filter((v): v is number => v !== null);
  const t0 = starts.length > 0 ? Math.min(...starts) : 0;
  const t1 = Math.max(t0 + 1, ...ends, now);
  const span = t1 - t0;
  const compact = folds.length >= 20;

  return (
    <div
      className={compact ? "flex flex-wrap items-end gap-[3px]" : "flex flex-col"}
      data-gantt
      data-gantt-mode={compact ? "compact" : "rows"}
    >
      {folds.map((fold) => {
        const selected = cursor === fold.fold;
        const running = fold.state === "RUNNING";
        const start = fold.started_at_utc_ms;
        const end = fold.completed_at_utc_ms ?? (running ? t1 : null);
        const left = start === null ? 0 : ((start - t0) / span) * 100;
        const width = start === null || end === null ? 2 : Math.max(1.5, ((end - start) / span) * 100);

        if (compact) {
          return (
            <button
              key={fold.fold}
              type="button"
              data-fold={fold.fold}
              data-fold-state={fold.state}
              data-selected={selected}
              onClick={() => onPick(fold.fold)}
              title={`fold_${String(fold.fold).padStart(2, "0")} · ${fold.state}`}
              className="h-[34px] w-[10px] rounded-[2px]"
              style={{
                background: running ? "var(--viz-train)" : "var(--role-oos)",
                outline: selected ? "1.5px solid var(--accent)" : undefined,
              }}
            />
          );
        }

        /*
         * The source owns the segmentation.
         *
         * `COMPLETE` is the only state that may be drawn as a full
         * Search → OOS → freeze Gantt. `PARTIAL` draws exactly the segments
         * that exist and names the condition — the gaps are not filled,
         * because splitting a whole-fold span would describe a method the
         * source never observed. `NOT_PUBLISHED`, and an absent field on a
         * pre-amendment snapshot, keep the single whole-fold band.
         */
        const timeline = fold.fold_timeline ?? NOT_PUBLISHED_TIMELINE;
        const segmented = timeline.state === "COMPLETE" || timeline.state === "PARTIAL";

        return (
          <button
            key={fold.fold}
            type="button"
            data-fold={fold.fold}
            data-fold-state={fold.state}
            data-fold-timeline={timeline.state}
            data-selected={selected}
            onClick={() => onPick(fold.fold)}
            className="flex items-center gap-2.5 border-b py-1 text-left last:border-b-0"
            style={{ borderColor: "var(--line-soft)" }}
          >
            <span className="mono flex-none text-[9.5px]" style={{ width: 62, color: "var(--ink-soft)" }}>
              fold_{String(fold.fold).padStart(2, "0")}
            </span>
            <span
              className="relative h-[10px] flex-1 rounded-[2px]"
              style={{
                background: "var(--paper-sunken)",
                outline: selected ? "1.5px solid var(--accent)" : undefined,
              }}
            >
              {segmented ? (
                timeline.segments.map((segment) => {
                  const segStart = segment.started_at_utc_ms;
                  const segEnd = segment.completed_at_utc_ms ?? now;
                  return (
                    <span
                      key={segment.kind}
                      className="absolute inset-y-0 rounded-[2px]"
                      data-fold-segment={`${fold.fold}:${segment.kind}`}
                      data-segment-state={segment.state}
                      title={`${segment.kind} · ${segment.state}`}
                      style={{
                        left: `${((segStart - t0) / span) * 100}%`,
                        width: `${Math.max(1, ((segEnd - segStart) / span) * 100)}%`,
                        background: SEGMENT_TONE[segment.kind],
                      }}
                    />
                  );
                })
              ) : (
                <span
                  className="absolute inset-y-0 rounded-[2px]"
                  style={{
                    left: `${left}%`,
                    width: `${width}%`,
                    background: running ? "var(--viz-train)" : "var(--role-oos)",
                  }}
                  data-fold-band={fold.fold}
                />
              )}
            </span>
            <span
              className="mono flex-none pl-2 text-[9px]"
              style={{ width: 72, color: "var(--ink-faint)" }}
            >
              {fold.state}
            </span>
          </button>
        );
      })}
      {folds.some((f) => (f.fold_timeline ?? NOT_PUBLISHED_TIMELINE).state === "PARTIAL") ? (
        <p className="text-[9.5px]" style={{ color: "var(--role-holdout)" }} data-timeline-partial>
          Some folds published only part of their Search / OOS / freeze facts. The published
          segments are drawn as they are; the gaps are not filled.
        </p>
      ) : null}
    </div>
  );
}

/**
 * Trial console.
 *
 * Auto-scroll sets `scrollTop` directly — `scrollIntoView` moves the page, not
 * just the box, which is a project-wide rule (spec 03 pitfall 4). Scrolling up
 * turns it off, because fighting a reader for the scroll position is the
 * fastest way to make a log unusable.
 */
function TrialConsole({
  lines,
  olderLines,
  dropped,
  onLoadOlder,
  foldFilter,
}: {
  lines: readonly ConsoleLine[];
  olderLines: readonly ConsoleLine[];
  dropped: boolean;
  onLoadOlder: () => void;
  foldFilter: number | null;
}) {
  const [follow, setFollow] = useState(true);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);
  const [filterFold, setFilterFold] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  const visible = lines.filter((line) => {
    if (showErrorsOnly && line.tone !== "ERROR" && line.tone !== "WARN") return false;
    if (filterFold && foldFilter !== null && line.fold !== foldFilter) return false;
    return true;
  });

  useEffect(() => {
    if (!follow || !box.current) return;
    box.current.scrollTop = box.current.scrollHeight;
  }, [follow, visible.length]);

  return (
    <div className="flex flex-col gap-1.5" data-console>
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          ["all", !showErrorsOnly && !filterFold, () => { setShowErrorsOnly(false); setFilterFold(false); }],
          [foldFilter === null ? "fold" : `fold ${foldFilter}`, filterFold, () => { setFilterFold(true); setShowErrorsOnly(false); }],
          ["errors", showErrorsOnly, () => { setShowErrorsOnly(true); setFilterFold(false); }],
        ].map(([label, active, onClick]) => (
          <button
            key={String(label)}
            type="button"
            data-console-filter={String(label)}
            data-selected={Boolean(active)}
            onClick={onClick as () => void}
            disabled={String(label).startsWith("fold") && foldFilter === null}
            /* §3.5: a control the reader expected to use has to say why it is
               inert. There is nothing to filter by until a fold reports. */
            title={
              String(label).startsWith("fold") && foldFilter === null
                ? "No fold has reported yet, so there is nothing to filter by."
                : undefined
            }
            className="mono rounded-[4px] border px-2 py-px text-[9px]"
            style={{
              borderColor: active ? "var(--accent)" : "var(--line)",
              color: active ? "var(--accent)" : "var(--ink-faint)",
            }}
          >
            {String(label)}
          </button>
        ))}
        <button
          type="button"
          data-console-follow={String(follow)}
          onClick={() => setFollow((value) => !value)}
          className="mono rounded-[4px] border px-2 py-px text-[9px]"
          style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}
        >
          {follow ? "auto-scroll on" : "↓ latest"}
        </button>
        <button
          type="button"
          data-action="load-older"
          onClick={onLoadOlder}
          className="mono rounded-[4px] border px-2 py-px text-[9px]"
          style={{ borderColor: "var(--line)", color: "var(--ink-faint)" }}
        >
          load older
        </button>
      </div>

      <div
        ref={box}
        role="log"
        aria-live="polite"
        aria-label="Trial console"
        data-console-box
        onWheel={(event) => {
          if (event.deltaY < 0) setFollow(false);
        }}
        className="mono flex h-[260px] max-h-[260px] flex-col gap-px overflow-y-auto rounded-[6px] px-3 py-2 text-[10.5px]"
        style={{ background: "var(--ink)", color: "var(--paper)" }}
      >
        {dropped ? (
          <span style={{ color: "var(--ink-faint)" }} data-older-dropped>
            {OLDER_DROPPED}
          </span>
        ) : null}
        {visible.length === 0 ? (
          <span style={{ color: "var(--ink-faint)" }} data-console-empty>
            No console observation has been published for this run.
          </span>
        ) : (
          visible.map((line) => (
            <span key={line.sequence} data-console-line={line.sequence} data-tone={line.tone}>
              <span style={{ color: "var(--ink-faint)" }}>
                [{new Date(line.occurred_at_utc_ms).toISOString().slice(11, 19)}]{" "}
              </span>
              <span style={{ color: TONE_COLOR[line.tone] }}>{line.text}</span>
            </span>
          ))
        )}
      </div>
      {olderLines.length > 0 ? (
        <details data-console-history className="rounded-[6px] border px-3 py-2" style={{ borderColor: "var(--line)" }} open>
          <summary className="mono cursor-pointer text-[10px]">Earlier retained lines · {olderLines.length}</summary>
          <ol className="mono mt-2 max-h-[260px] overflow-y-auto text-[10px]">
            {olderLines.map((line) => (
              <li key={line.sequence} data-history-line={line.sequence}>
                [{new Date(line.occurred_at_utc_ms).toISOString().slice(11, 19)}] {line.text}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
    </div>
  );
}

function ArtifactsStrip({ artifacts }: { artifacts: readonly Artifact[] }) {
  return (
    <div className="flex flex-col gap-1.5" data-artifacts>
      <div className="flex flex-wrap gap-2">
        {artifacts.map((artifact) => {
          const sealed = artifact.state === "SEALED";
          const tone =
            artifact.state === "SEALED"
              ? "var(--good)"
              : artifact.state === "ABORTED"
                ? "var(--bad)"
                : artifact.state === "WRITING"
                  ? "var(--role-holdout)"
                  : "var(--line-strong)";
          return (
            <span
              key={artifact.name}
              data-artifact={artifact.name}
              data-artifact-state={artifact.state}
              className="flex min-w-[168px] flex-col gap-[2px] rounded-[6px] border px-2.5 py-1.5"
              style={{
                borderColor: tone,
                borderStyle: artifact.state === "PENDING" ? "dashed" : "solid",
                background: "var(--paper-raised)",
                opacity: artifact.state === "PENDING" ? 0.65 : 1,
              }}
            >
              <span className="mono text-[10.5px] font-semibold">{artifact.name}</span>
              <span className="mono text-[9px]" style={{ color: tone }}>
                {artifact.state.toLowerCase()}
                {sealed && artifact.size !== null ? ` · ${artifact.size}` : ""}
              </span>
              {artifact.digest !== null ? (
                <span className="mono text-[8.5px]" style={{ color: "var(--ink-faint)" }}>
                  {artifact.digest.slice(0, 16)}
                </span>
              ) : null}
            </span>
          );
        })}
      </div>
      {/* Said once, plainly, so a missing link reads as a boundary rather than
          as a bug the reader should report. */}
      <p className="text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-artifact-no-reader>
        {ARTIFACT_NO_READER}
      </p>
    </div>
  );
}

/** The server's bound on the retained list (`research-progress` OpenAPI). */
const RETAINED_LIMIT = 128;

/**
 * The run's retained tables, from the artifact authority (RF01-F6).
 *
 * A different set from the bundle strip above: those are the files the source
 * journals, these are the Parquet tables the authority keeps — the only place
 * `CORRUPT` and `MISSING` can appear. Each goes through `ArtifactPanel`, so the
 * P05 rules (export needs sealed + registered + a server action; no `READY`)
 * hold where artifacts are actually shown. Rows come from the authority
 * itself, so they are registered; no reader route is published, so no export.
 */
function RetainedTables({ retained }: { retained: readonly RetainedArtifact[] | undefined }) {
  if (retained === undefined) {
    return (
      <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-retained-not-published>
        This server does not publish retained tables for the progress read.
      </p>
    );
  }
  if (retained.length === 0) {
    return (
      <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-retained-none>
        No table has been retained for this run yet.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2" data-retained-tables>
      <div className="grid gap-2 md:grid-cols-2">
        {retained.map((table, index) => (
          <ArtifactPanel
            key={`${table.table_kind}:${index}`}
            title={table.table_kind}
            facts={{ state: table.state, registered: true, serverAdmittedExport: false }}
            metadata={{
              rowCount: table.total_rows,
              byteSize: table.total_bytes,
              sealedAt: table.sealed_at_utc_ms !== null ? new Date(table.sealed_at_utc_ms).toISOString() : null,
            }}
          />
        ))}
      </div>
      {retained.length >= RETAINED_LIMIT ? (
        <p className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-retained-capped>
          first {RETAINED_LIMIT} by table kind — the read is bounded
        </p>
      ) : null}
    </div>
  );
}

/**
 * The methodology certificate chip.
 *
 * A run certificate fact, not an engine capability, a preflight ceiling or a
 * token inside the claim prose. `ISSUED` with a real grade is the only state
 * that authorises the chip; every other state omits it rather than recovering
 * a grade by parsing anything.
 */
function CertificateChip({ certificate }: { certificate: MethodologyCertificate }) {
  if (certificate.state !== "ISSUED" || certificate.grade === null) return null;
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
      data-certificate={certificate.grade}
      style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      title={
        certificate.issued_at_utc_ms === null
          ? undefined
          : `issued ${new Date(certificate.issued_at_utc_ms).toISOString()}`
      }
    >
      cert {certificate.grade}
    </span>
  );
}


/**
 * The server's own sentence wins. "The run failed" is only true of a run that
 * failed: a COMPLETED fixed qualification also ends NOT_ISSUED, and printing
 * the failure note over the server's text told the reader a finished run had
 * broken (RF-04, FE-S03-04).
 */
export function notIssuedText(serverText: string, status: string | null): string {
  if (serverText.trim() !== "") return serverText;
  return status === "FAILED" ? NOT_ISSUED_NOTE : NO_CLAIM_NOTE;
}

function ClaimPassport({
  claim,
  status,
}: {
  claim: ProgressSnapshot["claim"];
  status: EffectiveStatus;
}) {
  const issued = claim.state === "ISSUED";
  const certificate = claim.methodology_certificate ?? NOT_PUBLISHED_CERTIFICATE;
  const notIssued = claim.state === "NOT_ISSUED";
  const tone = notIssued ? "var(--bad)" : "var(--role-holdout)";
  return (
    <div
      className="flex flex-col gap-1.5 rounded-[8px] px-3.5 py-3"
      data-claim={claim.state}
      style={{
        border: `1.5px ${issued || notIssued ? "solid" : "dashed"} ${tone}`,
        background: "var(--paper)",
        /* The flip is a border-style change and a badge swap, nothing louder. */
        transition: "border-style 240ms",
      }}
    >
      <span className="flex flex-wrap items-center gap-2">
        <span
          className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
          style={{ color: tone, borderColor: tone }}
        >
          {claim.state === "NOT_ISSUED" ? "NOT ISSUED" : claim.state}
        </span>
        <StatusPill status={status} />
        <CertificateChip certificate={certificate} />
      </span>
      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)", opacity: issued ? 1 : 0.85 }}>
        {/* The server builds this sentence for both states; the page never
            composes a claim string of its own. */}
        {notIssued ? notIssuedText(claim.text, status) : claim.text}
      </p>
      {issued && claim.cursor !== null ? (
        <details className="mono text-[9.5px]" data-claim-cursor>
          <summary style={{ color: "var(--ink-faint)" }}>claim cursor</summary>
          <span className="break-all">{claim.cursor}</span>
        </details>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- screen */

export interface RunProgressProps {
  runId: string;
  read: ProgressRead | null;
  snapshot: ProgressSnapshot | null;
  state: ResearchState;
  transport: Transport;
  lines: readonly ConsoleLine[];
  olderLines?: readonly ConsoleLine[];
  linesDropped: boolean;
  onLoadOlder: () => void;
  foldCursor: number | null;
  onPinFold: (fold: number) => void;
  cancelling: boolean;
  onCancel: (reason: string) => void;
}

export function RunProgress(props: RunProgressProps) {
  const {
    runId,
    read,
    snapshot,
    state,
    transport,
    lines,
    olderLines = [],
    linesDropped,
    onLoadOlder,
    foldCursor,
    onPinFold,
    cancelling,
    onCancel,
  } = props;

  const [confirming, setConfirming] = useState(false);
  const status = read?.current.effective_status ?? null;
  const live = status === "QUEUED" || status === "RUNNING" || status === "FINISHING";
  /* Completion is the source's seal and nothing else. */
  const sealed = snapshot?.readiness.mandatory === "SEALED";

  if (read === null && state.state === "empty") {
    return (
      <main data-screen="run-progress" data-run-not-found className="px-4 py-6">
        <h1>Run not found in this workspace</h1>
        <p>The requested run is unavailable here. No progress has been inferred.</p>
        <a href="/research/quantbt/runs">Open Run Library →</a>
      </main>
    );
  }
  if (read && snapshot === null &&
      (read.availability === "QUEUED_NO_SOURCE" || read.availability === "CANCELLED_BEFORE_SOURCE")) {
    return (
      <main data-screen="run-progress" data-no-source={read.availability} className="px-4 py-6">
        <a href="/research/quantbt/runs">← Runs</a>
        <h1>{read.availability === "QUEUED_NO_SOURCE" ? "Run queued" : "Run cancelled"}</h1>
        <p>{read.availability === "QUEUED_NO_SOURCE"
          ? "The run is queued; no source progress has been published yet."
          : "The run was cancelled before source progress began. No progress or claim exists."}</p>
        {read.queue ? <p data-queue-class>Queue: {read.queue.queue_class}</p> : null}
      </main>
    );
  }

  return (
    <div
      data-screen="run-progress"
      className="flex flex-col gap-3 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-col gap-1.5 border-b pb-2.5" style={{ borderColor: "var(--line)" }}>
        <nav aria-label="Research breadcrumbs" className="mono text-[10px]">
          <a href="/research/quantbt/runs">Runs</a> <span aria-hidden="true">/</span> Progress
        </nav>
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            className="text-[22px] font-light tracking-[-.01em]"
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
          >
            {status === "COMPLETED" ? "Run completed" : "Run progress"} — {runId}
          </h1>
          {status !== null ? <StatusPill status={status} /> : null}
          <TransportDot transport={transport} live={live} />
          {read?.current.terminal_resolution === "CONTROL_CANCELLATION" ? (
            <span
              className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
              style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
              data-terminal-resolution
            >
              resolved by cancellation
            </span>
          ) : null}
        </div>
        <p
          className="text-[13px] italic"
          style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
        >
          {SUBTITLE}
        </p>
        {read?.availability === "PENDING_SOURCE_CALLBACK" ? (
          <p className="text-[10.5px]" style={{ color: "var(--role-holdout)" }} data-pending-source>
            The run exists. Waiting for its source to report progress.
          </p>
        ) : null}
        {snapshot?.source.partial ? (
          <p className="text-[10.5px]" style={{ color: "var(--role-holdout)" }} data-source-partial>
            The source reports this projection as partial.
          </p>
        ) : null}
      </header>

      {read && (read.queue || (read.attempts?.length ?? 0) > 0) ? (
        <details data-queue-attempts className="rounded-[6px] border px-3 py-2" style={{ borderColor: "var(--line)" }}>
          <summary className="cursor-pointer mono text-[10px]">
            Queue &amp; attempts · {read.queue?.queue_class ?? "class not published"} · {read.attempts?.length ?? 0} observed
          </summary>
          <ol className="mt-2 space-y-1">
            {(read.attempts ?? []).map((attempt) => (
              <li key={attempt.ordinal} className="mono text-[10px]">
                #{attempt.ordinal} · {attempt.state} · claimed {new Date(attempt.claimed_at_utc_ms).toISOString()}
                {attempt.started_at_utc_ms !== null ? ` · started ${new Date(attempt.started_at_utc_ms).toISOString()}` : ""}
                {attempt.ended_at_utc_ms !== null ? ` · ended ${new Date(attempt.ended_at_utc_ms).toISOString()}` : ""}
              </li>
            ))}
          </ol>
        </details>
      ) : null}
      <ResearchPanel title="stages" state={state} minBodyHeight={64}>
        {snapshot ? <StageRail stages={snapshot.stages} claimState={snapshot.claim.state} /> : null}
      </ResearchPanel>

      <ResearchPanel title="progress" state={state} minBodyHeight={86}>
        {snapshot ? <OverallBlock snapshot={snapshot} /> : null}
      </ResearchPanel>

      <ResearchPanel
        title="folds"
        meta={snapshot ? `${snapshot.folds.length} reported` : undefined}
        state={state}
        minBodyHeight={86}
      >
        {snapshot ? (
          <FoldGantt
            folds={snapshot.folds}
            now={snapshot.updated_at_utc_ms}
            cursor={foldCursor}
            onPick={onPinFold}
          />
        ) : null}
      </ResearchPanel>

      <ResearchPanel title="trial console" state={state} minBodyHeight={120}>
        <TrialConsole
          lines={lines}
          olderLines={olderLines}
          dropped={linesDropped}
          onLoadOlder={onLoadOlder}
          foldFilter={foldCursor}
        />
      </ResearchPanel>

      <ResearchPanel title="artifacts" state={state} minBodyHeight={72}>
        {snapshot ? <ArtifactsStrip artifacts={snapshot.artifacts} /> : null}
      </ResearchPanel>

      <ResearchPanel title="retained tables" meta="artifact authority" state={state} minBodyHeight={56}>
        {read ? <RetainedTables retained={read.retained_artifacts} /> : null}
      </ResearchPanel>

      <ResearchPanel title="claim" state={state} minBodyHeight={86}>
        {snapshot && status !== null ? (
          <div className="flex flex-col gap-2">
            <ClaimPassport claim={snapshot.claim} status={status} />
            {sealed ? (
              <a
                data-open-evidence
                className="mono self-start text-[10px] font-semibold"
                href={`/research/quantbt/runs/${encodeURIComponent(runId)}/evidence#${encodeInspectionCursor({
                  stage: snapshot.claim.state === "ISSUED" ? "claim" : "summary",
                  ...(foldCursor !== null ? { fold: String(foldCursor) } : {}),
                })}`}
                style={{ color: "var(--accent)" }}
              >
                Open Evidence Flow →
              </a>
            ) : null}
            {snapshot.failure !== null ? (
              <p
                role="alert"
                className="mono text-[10.5px]"
                style={{ color: "var(--bad)" }}
                data-failure={snapshot.failure.code}
              >
                {/* The engine's code and sentence, verbatim. */}
                {snapshot.failure.code} — {snapshot.failure.message}
              </p>
            ) : null}
            <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-readiness>
              mandatory {snapshot.readiness.mandatory} · optional {snapshot.readiness.optional}
              {sealed ? " · sealed" : ""}
            </span>
          </div>
        ) : null}
      </ResearchPanel>

      <div className="flex flex-wrap items-center gap-2" data-run-actions>
        {read?.current.may_cancel ? (
          confirming ? (
            <>
              <span className="text-[10.5px]" style={{ color: "var(--bad)" }}>
                Cancel this run?
              </span>
              <button
                type="button"
                className="btn-ghost mono text-[10px]"
                data-action="cancel-confirm"
                disabled={cancelling}
                title={cancelling ? "The cancellation request is already in flight." : undefined}
                onClick={() => {
                  setConfirming(false);
                  onCancel("cancelled by portal operator");
                }}
              >
                {cancelling ? "cancelling…" : "Yes, cancel"}
              </button>
              <button
                type="button"
                className="btn-ghost mono text-[10px]"
                data-action="cancel-dismiss"
                onClick={() => setConfirming(false)}
              >
                Keep running
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-ghost mono text-[10px]"
              data-action="cancel"
              onClick={() => setConfirming(true)}
            >
              Cancel run
            </button>
          )
        ) : null}

        {read !== null && !read.current.may_retry ? (
          <span className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-retry-reason>
            This release does not offer retry from Run Progress.
          </span>
        ) : null}
      </div>

      <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
        {RULES_FOOTER}
      </p>
    </div>
  );
}
