/**
 * Screen 03 · Run Progress (P11 composition scope, HiFi release-v1.1).
 *
 * Evidence Flow over time, in the HiFi's order: header, run meta strip, claim
 * passport, progress (stage pills + overall + budget), fold Gantt beside the
 * artifact manifest, Live console / Stage log, the completion banner and the
 * rules footer. Spec 03's founding rule governs the whole screen — **the claim
 * is a forecast until Stage 5 issues it**, and nothing on this page may turn a
 * forecast into a fact.
 *
 * Decisions in force (RF-06): the HiFi wins on look and copy, the spec on
 * behaviour and data (DQ-02); five contract stages drawn as HiFi pills (DQ-04);
 * cells the source does not publish are shells that name the gap (DQ-14), and
 * copy that asserts a fact appears only when the fact is published (DQ-15).
 *
 * Three habits, each with a rule behind it:
 *
 *  - **The page never estimates.** `eta_s`, `pct`, `tqdm_line` and every
 *    counter are the server's. A `null` ETA renders as "not reported", never
 *    as a computed guess (spec 03 pitfall 1, §3.3).
 *  - **A sealed artifact is readiness, not authorization.** `reader_href` is
 *    `null` by contract in P11, so rows stay unlinked.
 *  - **Completion is `readiness.mandatory === "SEALED"` and nothing else.** No
 *    timer, animation or console line may produce a completion, an artifact,
 *    a claim, a counter or an ETA.
 */

import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";

import {
  NOT_PUBLISHED_CERTIFICATE,
  NOT_PUBLISHED_SELECTION,
  NOT_PUBLISHED_TIMELINE,
  type Artifact,
  type ConsoleLine,
  type DeniedArtifact,
  type EffectiveStatus,
  type FoldSegment,
  type HandoffCursor,
  type ProgressRead,
  type ProgressRefusal,
  type ProgressSnapshot,
  type RetainedArtifact,
  type Stage,
} from "./progressClient";
import { ArtifactPanel } from "./ArtifactPanel";
import { decodeInspectionCursor, encodeInspectionCursor, type InspectionCursor } from "./inspectionCursor";
import { ServedAttempts } from "./QueuePanel";
import { formatBytes, formatDuration, formatMetric, formatUtc, shortDigest } from "./researchFormat";
import { NotPublished, RunMetaStrip } from "./RunMetaStrip";
import { StageLedger, utcClock } from "./StageLedger";
import type { Transport } from "./useRunProgress";
import type { ResearchState } from "./state";
import { QUANTBT_ROOT } from "../features/quantbt/routes";

/* --------------------------------------------------------------- verbatim */

/** HiFi 03 subtitle (DQ-02: the HiFi wins on copy). */
export const SUBTITLE =
  "The same screen becomes the evidence: claims sit in forecast state while the engine works, and flip to issued the moment it finishes — nothing moves, nothing reloads.";

/** Transport labels: HiFi wording, the spec's 5 s floor (FE-S03-17). */
export const SSE_LIVE = "SSE streaming · poll floor 5s underneath";
export const SSE_POLL = "stream dropped · polling every 5s";
/** Live, stream closed (hidden tab, typed gap, reconnect pending): the floor still runs. */
export const SSE_RESTING = "stream closed · poll floor 5s underneath";
export const SSE_CLOSED = "stream closed at terminal frame";

export const NOT_ISSUED_NOTE =
  "the run failed before Stage 5 — no claim exists. Failure detail is in the console above.";

/** A run that ended without failing and without a claim, when the server gave no sentence. */
export const NO_CLAIM_NOTE = "This run ended without issuing a claim.";

export const OLDER_DROPPED = "· · · older lines dropped (kept server-side)";

/** HiFi rules footer, without the holdout sentence this build has no stage for (DQ-15). */
export const RULES_FOOTER =
  "SSE accelerates, polling underneath never stops — the screen degrades in speed, not in truth. Claims stay in forecast state until the engine issues them; this page never promotes a forecast to a fact.";

/** P11 publishes no reader route; the contract pins `reader_href` to null. */
export const ARTIFACT_NO_READER =
  "Sealed means the bytes are ready — reading them is a separate, authorized route this release does not publish.";

/** Spec 03 §22–§23, worded for the run state this Portal actually records. */
export const CANCEL_BODY =
  "The current trial finishes, then the run stops and is marked CANCELLED. Everything already sealed is kept.";

/** Why a fold row has no best J₁ / trial / params digest (DQ-14). */
export const FOLD_SELECTION_NOT_PUBLISHED =
  "The source has not published this fold's selection (best J₁, selected trial, params digest).";

/** CG-P11-03: the sealed holdout's DENIED card, in words. */
export const DENIED_HOLDOUT_NOTE = "sealed — unlock is a one-time audited workflow this release does not install";

/** CG-P11-07: the one action after a failed or cancelled run (spec 03 pitfall 9). */
export const NEW_RUN_FROM_LABEL = "new run with same draft →";
export const NEW_RUN_FROM_UNAVAILABLE =
  "This run's requested spec is not retained, so no new run can be seeded from it.";

/** HiFi `rate` cell: the source publishes an ETA from its trial rate, not the rate. */
export const RATE_NOT_PUBLISHED = "The source publishes an ETA derived from its trial rate, not the rate itself.";

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

/** HiFi console palette, mapped to the console tokens. */
const TONE_COLOR: Record<ConsoleLine["tone"], string> = {
  INFO: "var(--console-fg)",
  COMPLETE: "var(--console-good)",
  WARN: "var(--console-gold)",
  ERROR: "var(--console-bad)",
};

const TONE_LETTER: Record<ConsoleLine["tone"], string> = {
  INFO: "I",
  COMPLETE: "I",
  WARN: "W",
  ERROR: "E",
};

/* ----------------------------------------------------------------- styles */

const MONO = "var(--font-mono)";
const BODY = "var(--font-body)";
const DISPLAY = "var(--font-display)";

const CARD: CSSProperties = {
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--paper-raised)",
  boxShadow: "var(--shadow-e1)",
  padding: "14px 16px",
  display: "flex",
  flexDirection: "column",
  minWidth: 0,
};

const CARD_TITLE: CSSProperties = {
  fontFamily: BODY,
  fontSize: 10,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: ".07em",
  color: "var(--ink-faint)",
};

const CHIP: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10.5,
  border: "1px solid var(--line)",
  borderRadius: 999,
  background: "var(--paper-raised)",
  padding: "1px 8px",
  color: "var(--ink-soft)",
  whiteSpace: "nowrap",
};

/** HiFi `rp-pulse` through the shared motion vocabulary. */
function pulse(duration: string): { "data-motion": "pulse"; style: CSSProperties } {
  return { "data-motion": "pulse", style: { ["--rs-motion-duration" as string]: duration } as CSSProperties };
}

/* ------------------------------------------------------------- formatting */

/** `1,603` — thousands separators on every count. */
function count(value: number): string {
  return formatMetric(value, "count") ?? String(value);
}

function foldId(fold: number): string {
  return `fold_${String(fold).padStart(2, "0")}`;
}

/** `[I 04:12:31Z]` — level letter, UTC clock with its zone. */
export function consoleStamp(line: Pick<ConsoleLine, "tone" | "occurred_at_utc_ms">): string {
  return `[${TONE_LETTER[line.tone]} ${utcClock(line.occurred_at_utc_ms)}]`;
}

/* ------------------------------------------------------------------ parts */

/** A value the server did not send. Never `0`, `—` or `N/A` (§3.3). */
function Absent({ what = "not reported" }: { what?: string }) {
  return <span style={{ fontStyle: "italic", color: "var(--ink-faint)" }}>{what}</span>;
}

const STATUS_TONE: Record<EffectiveStatus, { fg: string; bg: string }> = {
  QUEUED: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  RUNNING: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  FINISHING: { fg: "var(--accent)", bg: "var(--accent-soft)" },
  COMPLETED: { fg: "var(--good)", bg: "var(--good-bg)" },
  FAILED: { fg: "var(--bad)", bg: "var(--bad-bg)" },
  CANCELLED: { fg: "var(--accent-2)", bg: "var(--accent-2-soft)" },
};

/** HiFi status chip: filled, no border, pulsing while the run is live. */
function StatusChip({ status, live }: { status: EffectiveStatus; live: boolean }) {
  const tone = STATUS_TONE[status];
  const motion = live ? pulse("1.8s") : null;
  return (
    <span
      data-status-pill={status}
      data-motion={motion?.["data-motion"]}
      style={{
        ...motion?.style,
        display: "inline-flex",
        alignItems: "center",
        borderRadius: 999,
        padding: "1px 8px",
        fontFamily: MONO,
        fontSize: 11,
        fontWeight: 600,
        background: tone.bg,
        color: tone.fg,
      }}
    >
      {status}
    </span>
  );
}

/**
 * The transport indicator.
 *
 * The label follows the transport, not the run (FE-S03-17). A dropped stream
 * is a grey dot and a changed label, never a banner: the page is still correct
 * on the poll floor (spec 03 pitfall 5).
 */
function TransportDot({ transport, live }: { transport: Transport; live: boolean }) {
  const streaming = transport === "stream" && live;
  const label = !live ? SSE_CLOSED : transport === "stream" ? SSE_LIVE : transport === "poll" ? SSE_POLL : SSE_RESTING;
  const motion = streaming ? pulse("1.4s") : null;
  return (
    <span
      data-transport={transport}
      style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: MONO, fontSize: 10, color: "var(--ink-soft)" }}
    >
      <span
        aria-hidden="true"
        data-motion={motion?.["data-motion"]}
        data-pulse={streaming ? "true" : undefined}
        style={{
          ...motion?.style,
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: streaming ? "var(--good)" : "var(--ink-faint)",
          flex: "none",
        }}
      />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------ cursor links */

type StageCursorTarget = { path: string; stage?: InspectionCursor["stage"] };

/** Where a sealed stage opens its deep dive (spec 03 §2.2). */
function stageTarget(key: Stage["key"]): StageCursorTarget {
  switch (key) {
    case "S1":
      return { path: "split" };
    case "S2":
      return { path: "search" };
    case "S3":
      return { path: "freeze" };
    case "S4":
      return { path: "evidence", stage: "execute" };
    default:
      return { path: "evidence", stage: "claim" };
  }
}

function runHref(runId: string, path: string, cursor: InspectionCursor): string {
  const hash = encodeInspectionCursor(cursor);
  return `${QUANTBT_ROOT}/runs/${encodeURIComponent(runId)}/${path}${hash ? `#${hash}` : ""}`;
}

/**
 * The evidence cursor for a fold: the fold, and its trial/params only when the
 * source published them — the fold's own `selection`, else the run's
 * structured hand-off cursor when it names this fold (CG-P11-03), else a
 * legacy free-text claim cursor. Nothing is inferred.
 */
function evidenceCursor(
  fold: number | null,
  folds: ProgressSnapshot["folds"],
  handoff: HandoffCursor | null,
  claimCursor: InspectionCursor,
): InspectionCursor {
  const target = fold ?? handoff?.fold ?? null;
  if (target === null) return {};
  const selection = folds.find((f) => f.fold === target)?.selection ?? NOT_PUBLISHED_SELECTION;
  if (selection.state === "AVAILABLE" && selection.trial !== null && selection.params_digest !== null) {
    return { fold: String(target), trial: String(selection.trial), params: selection.params_digest };
  }
  if (handoff !== null && handoff.fold === target) {
    return { fold: String(target), trial: String(handoff.trial), params: handoff.params_digest };
  }
  return {
    fold: String(target),
    ...(claimCursor.fold === String(target) && claimCursor.trial ? { trial: claimCursor.trial } : {}),
    ...(claimCursor.fold === String(target) && claimCursor.params ? { params: claimCursor.params } : {}),
  };
}

/** Where a failed/cancelled run's one action goes: Screen 02 seeded from this run. */
export function newRunFromHref(runId: string): string {
  return `${QUANTBT_ROOT}/runs/new?from=${encodeURIComponent(runId)}`;
}

/* ---------------------------------------------------------------- stages */

function StagePills({
  stages,
  claimState,
  runId,
  cursor,
}: {
  stages: readonly Stage[];
  claimState: ProgressSnapshot["claim"]["state"];
  runId: string;
  cursor: InspectionCursor;
}) {
  return (
    <div data-stage-rail style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {stages.map((stage, index) => {
        const issued = stage.key === "S5" && claimState === "ISSUED";
        const done = stage.state === "DONE";
        const running = stage.state === "RUNNING";
        const tone = issued
          ? { border: "var(--accent-2)", bg: "var(--accent-2-soft)", fg: "var(--accent-2)" }
          : running
            ? { border: "var(--accent)", bg: "var(--accent-soft)", fg: "var(--accent)" }
            : done
              ? { border: "var(--good)", bg: "var(--good-bg)", fg: "var(--good)" }
              : { border: "var(--line)", bg: "transparent", fg: "var(--ink-faint)" };
        const motion = running ? pulse("1.6s") : null;
        const style: CSSProperties = {
          ...motion?.style,
          fontFamily: MONO,
          fontSize: 9.5,
          borderRadius: 999,
          padding: "1px 8px",
          border: `1px solid ${tone.border}`,
          background: tone.bg,
          color: tone.fg,
          textDecoration: "none",
          whiteSpace: "nowrap",
          textTransform: "uppercase",
        };
        const label = `${done || issued ? "✓ " : ""}${stage.key} ${STAGE_LABEL[stage.key]}`;
        const target = stageTarget(stage.key);
        const linked = done || issued;
        return (
          <span key={stage.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {linked ? (
              <a
                data-stage={stage.key}
                data-stage-state={issued ? "ISSUED" : stage.state}
                href={runHref(runId, target.path, { ...(target.stage ? { stage: target.stage } : {}), ...cursor })}
                aria-label={`Stage ${stage.key.slice(1)} ${STAGE_LABEL[stage.key]} — open deep dive${cursor.fold ? ` at fold ${cursor.fold}` : ""}`}
                style={style}
              >
                {label}
              </a>
            ) : (
              <span
                data-stage={stage.key}
                data-stage-state={stage.state}
                data-motion={motion?.["data-motion"]}
                /* Not a control yet: focusable and announced as disabled rather
                   than silently inert (spec 03 §12). */
                aria-disabled="true"
                tabIndex={0}
                title={running ? "Running — the deep dive opens when the stage completes." : "Pending"}
                style={style}
              >
                {label}
              </span>
            )}
            {index < stages.length - 1 ? (
              <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 10, color: "var(--viz-legend-inactive)" }}>
                →
              </span>
            ) : null}
          </span>
        );
      })}
    </div>
  );
}

/* --------------------------------------------------------------- progress */

/** How the study row names the study the source ran (CG-P10-04). */
function studyLabel(snapshot: ProgressSnapshot, foldCount: number | null): ReactNode {
  const scope = snapshot.folds.find((f) => (f.selection ?? NOT_PUBLISHED_SELECTION).state === "AVAILABLE")?.selection?.scope;
  if (scope === "FIXED_PROFILE") return "fixed profile — no search";
  const global = scope === "GLOBAL_STUDY" || (snapshot.folds.length === 0 && snapshot.overall.trials_done > 0);
  if (global) return foldCount === null ? "global — scores every fold" : `global — scores all ${count(foldCount)} folds`;
  const latest = snapshot.folds.length > 0 ? snapshot.folds[snapshot.folds.length - 1].fold : null;
  if (latest === null) return null;
  return (
    <>
      {latest} / {foldCount === null ? <NotPublished reason="The fold count is not declared." /> : count(foldCount)}
    </>
  );
}

function ProgressCard({
  snapshot,
  live,
  foldCount,
}: {
  snapshot: ProgressSnapshot;
  live: boolean;
  /** `run.declared_folds` from the progress read, when declared. */
  foldCount: number | null;
}) {
  const { overall, budget } = snapshot;
  const pct = Math.max(0, Math.min(100, overall.pct));
  const budgetHot = budget.pct > 90;
  const budgetTone = budgetHot ? "var(--bad)" : "var(--role-holdout)";
  const barMotion = live ? pulse("2.4s") : null;
  const searchDone = snapshot.stages.find((s) => s.key === "S4")?.state === "DONE" || overall.trials_done >= overall.trials_declared;
  /* The server owns the ETA. Null means "not computable", said in words. */
  const eta =
    overall.eta_s !== null ? (
      formatDuration(overall.eta_s)
    ) : !live ? (
      <Absent what="none — run final" />
    ) : searchDone ? (
      <Absent what="search done" />
    ) : (
      <Absent />
    );
  const study = studyLabel(snapshot, foldCount);

  return (
    <div data-overall style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span
          role="progressbar"
          aria-label="Overall run progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
          style={{
            position: "relative",
            flex: 1,
            minWidth: "min(280px, 100%)",
            height: 14,
            borderRadius: 999,
            background: "var(--paper-sunken)",
            border: "1px solid var(--line-soft)",
            overflow: "hidden",
          }}
        >
          <span
            data-bar-pct={pct}
            data-motion={barMotion?.["data-motion"]}
            style={{
              ...barMotion?.style,
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${pct}%`,
              background: "linear-gradient(90deg, var(--viz-train), var(--accent))",
              transition: "width 400ms cubic-bezier(.2,0,.2,1)",
            }}
          />
          {/* Fold boundaries, only when the fold count is published. */}
          {foldCount !== null && foldCount > 1
            ? Array.from({ length: foldCount - 1 }, (_, i) => i + 1)
                .filter((i) => foldCount <= 10 || i % Math.ceil(foldCount / 8) === 0)
                .map((i) => (
                  <span
                    key={i}
                    data-fold-tick={i}
                    style={{
                      position: "absolute",
                      left: `${((i / foldCount) * 100).toFixed(1)}%`,
                      top: 0,
                      bottom: 0,
                      width: 1,
                      background: "var(--line)",
                    }}
                  />
                ))
            : null}
        </span>
        <span data-progress-text style={{ fontFamily: MONO, fontSize: 11, color: "var(--ink)", whiteSpace: "nowrap" }}>
          {count(overall.trials_done)} / {count(overall.trials_declared)} trials · {Math.round(pct)}%
        </span>
      </div>

      <div
        data-stat-row
        style={{ display: "flex", gap: "4px 22px", flexWrap: "wrap", fontFamily: MONO, fontSize: 10.5, color: "var(--ink-soft)" }}
      >
        {study !== null ? (
          <span data-study>
            study <span style={{ color: "var(--ink)" }}>{study}</span>
          </span>
        ) : null}
        <span data-elapsed>
          elapsed <span style={{ color: "var(--ink)" }}>{formatDuration(overall.elapsed_s) ?? <Absent />}</span>
        </span>
        <span data-eta>
          {/* The server owns the ETA. A null one is absent, never computed. */}
          eta <span style={{ color: "var(--ink)" }}>{eta}</span>
        </span>
        <span data-rate>
          rate <NotPublished reason={RATE_NOT_PUBLISHED} what="not reported" />
        </span>
        {/* The server builds this string; the page does not reformat it. */}
        <span data-tqdm style={{ color: "var(--ink-faint)" }}>
          {overall.tqdm_line}
        </span>
      </div>

      <div
        data-budget
        style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", fontFamily: MONO, fontSize: 10.5, color: "var(--ink-soft)" }}
      >
        <span style={{ flex: "none" }}>runtime budget</span>
        <span
          role="progressbar"
          aria-label="runtime budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.max(0, Math.min(100, budget.pct))}
          style={{ position: "relative", flex: 1, minWidth: 120, height: 8, borderRadius: 4, background: "var(--paper-sunken)", overflow: "hidden" }}
        >
          <span
            data-budget-hot={budgetHot || undefined}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: `${Math.max(0, Math.min(100, budget.pct))}%`,
              background: budgetTone,
              transition: "width 400ms cubic-bezier(.2,0,.2,1)",
            }}
          />
        </span>
        <span style={{ color: budgetTone, whiteSpace: "nowrap" }}>
          {/* Exact decimal strings, never parsed into a float. */}
          {budget.cap === null ? (
            <>
              {budget.used} {budget.unit} · <Absent what="no cap" />
            </>
          ) : (
            <>
              {budget.used}/{budget.cap} {budget.unit}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ gantt */

const FOLD_STATUS_TONE: Record<string, { fg: string; border: string; bg: string }> = {
  DONE: { fg: "var(--good)", border: "var(--good)", bg: "var(--good-bg)" },
  RUNNING: { fg: "var(--accent)", border: "var(--accent)", bg: "var(--paper-raised)" },
  FAILED: { fg: "var(--bad)", border: "var(--bad)", bg: "var(--bad-bg)" },
};

/** Compact cells replace rows past this many folds (HiFi: `NF > 8`). */
export const COMPACT_FOLDS = 8;

interface FoldGanttProps {
  folds: ProgressSnapshot["folds"];
  cursor: number | null;
  onPick: (fold: number) => void;
  foldTrials: Readonly<Record<number, number>>;
  /** The run's structured hand-off cursor, once published. */
  handoff: HandoffCursor | null;
  /** The claim's own legacy cursor text, when it names a fold. */
  claimCursor: InspectionCursor;
}

/**
 * The fill of one fold: **trial progress**, not wall time (FE-S03-07).
 *
 * A DONE fold is full; a FAILED fold is full and red. A RUNNING fold's share
 * of its trials is not published per fold, so its fill is not drawn — the
 * track pulses instead of guessing a width.
 */
function FoldFill({ fold }: { fold: ProgressSnapshot["folds"][number] }) {
  const timeline = fold.fold_timeline ?? NOT_PUBLISHED_TIMELINE;
  if (timeline.state === "COMPLETE" || timeline.state === "PARTIAL") {
    const starts = timeline.segments.map((s) => s.started_at_utc_ms);
    const ends = timeline.segments.map((s) => s.completed_at_utc_ms ?? s.started_at_utc_ms);
    const t0 = Math.min(...starts);
    const span = Math.max(1, Math.max(...ends) - t0);
    return (
      <>
        {timeline.segments.map((segment) => {
          const end = segment.completed_at_utc_ms ?? segment.started_at_utc_ms;
          return (
            <span
              key={segment.kind}
              data-fold-segment={`${fold.fold}:${segment.kind}`}
              data-segment-state={segment.state}
              title={`${segment.kind} · ${segment.state}`}
              style={{
                position: "absolute",
                top: 0,
                bottom: 0,
                left: `${((segment.started_at_utc_ms - t0) / span) * 100}%`,
                width: segment.kind === "freeze_tick" ? 2 : `${Math.max(1, ((end - segment.started_at_utc_ms) / span) * 100)}%`,
                background: SEGMENT_TONE[segment.kind],
              }}
            />
          );
        })}
      </>
    );
  }
  if (fold.state === "RUNNING") return null;
  return (
    <span
      data-fold-fill={fold.fold}
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        bottom: 0,
        width: "100%",
        background: fold.state === "FAILED" ? "var(--bad)" : "var(--viz-train)",
      }}
    />
  );
}

/** `prm_3a91c2` — the params digest as the HiFi prints it; full value in the title. */
function paramsTag(digest: string): string {
  return `prm_${shortDigest(digest, 6)}`;
}

function foldNote(
  fold: ProgressSnapshot["folds"][number],
  foldTrials: Readonly<Record<number, number>>,
  handoff: HandoffCursor | null,
  claimCursor: InspectionCursor,
): ReactNode {
  if (fold.state === "RUNNING") {
    const trial = foldTrials[fold.fold];
    return trial === undefined ? "running" : `trial ${count(trial)} · running`;
  }
  if (fold.state === "FAILED") return "failed";
  const selection = fold.selection ?? NOT_PUBLISHED_SELECTION;
  if (selection.state === "AVAILABLE" && selection.trial !== null && selection.params_digest !== null) {
    const objective =
      selection.objective === null ? "no search" : `${selection.scope === "GLOBAL_STUDY" ? "global " : ""}best J₁ ${formatMetric(selection.objective, "ratio") ?? selection.objective}`;
    return (
      <span title={[selection.objective, selection.params_digest].filter(Boolean).join(" · ")} data-fold-selection={selection.scope ?? undefined}>
        {objective} · trial {count(selection.trial)} · {paramsTag(selection.params_digest)}
      </span>
    );
  }
  if (handoff !== null && handoff.fold === fold.fold) {
    return `trial ${count(handoff.trial)} · ${paramsTag(handoff.params_digest)}`;
  }
  if (claimCursor.fold === String(fold.fold) && (claimCursor.trial || claimCursor.params)) {
    return [claimCursor.trial ? `trial ${claimCursor.trial}` : null, claimCursor.params ?? null].filter(Boolean).join(" · ");
  }
  return <NotPublished reason={FOLD_SELECTION_NOT_PUBLISHED} what="selection not published" />;
}

function FoldGantt({ folds, cursor, onPick, foldTrials, handoff, claimCursor }: FoldGanttProps) {
  const container = useRef<HTMLDivElement>(null);
  if (folds.length === 0) {
    return (
      <p style={{ fontSize: 11, color: "var(--ink-soft)", margin: 0 }} data-no-folds>
        No fold has reported yet.
      </p>
    );
  }

  const compact = folds.length > COMPACT_FOLDS;
  const running = folds.find((f) => f.state === "RUNNING")?.fold ?? null;

  /* Arrow keys move the cursor between folds (spec 03 §12). */
  const onKey = (event: KeyboardEvent<HTMLElement>, fold: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const index = folds.findIndex((f) => f.fold === fold);
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
    const next = folds[Math.max(0, Math.min(folds.length - 1, index + step))];
    onPick(next.fold);
    container.current?.querySelector<HTMLElement>(`[data-fold="${next.fold}"]`)?.focus();
  };

  /* Compact: every fold as a cell; detail rows for the picked fold ± 1, the
     running fold and the two ends (HiFi 32-fold demo). */
  const focus = cursor ?? running ?? folds[folds.length - 1].fold;
  const detail = compact
    ? folds.filter((f, i) => i === 0 || i === folds.length - 1 || Math.abs(f.fold - focus) <= 1 || f.fold === running)
    : folds;

  return (
    <div
      ref={container}
      data-gantt
      data-gantt-mode={compact ? "compact" : "rows"}
      role="group"
      aria-label="Fold Gantt"
      style={{ display: "flex", flexDirection: "column", gap: 2 }}
    >
      {compact ? (
        <>
          <div style={{ display: "flex", gap: 2, alignItems: "stretch" }} data-gantt-cells>
            {folds.map((fold) => {
              const selected = cursor === fold.fold;
              const tone = FOLD_STATUS_TONE[fold.state];
              const motion = fold.state === "RUNNING" ? pulse("1.8s") : null;
              return (
                <button
                  key={fold.fold}
                  type="button"
                  data-fold={fold.fold}
                  data-fold-state={fold.state}
                  data-selected={selected}
                  aria-pressed={selected}
                  title={`${foldId(fold.fold)} · ${fold.state.toLowerCase()}`}
                  onClick={() => onPick(fold.fold)}
                  onKeyDown={(event) => onKey(event, fold.fold)}
                  data-motion={motion?.["data-motion"]}
                  style={{
                    ...motion?.style,
                    position: "relative",
                    flex: 1,
                    minWidth: 6,
                    height: 20,
                    padding: 0,
                    borderRadius: 2,
                    overflow: "hidden",
                    background: "var(--paper)",
                    border: `1px solid ${fold.state === "RUNNING" ? "var(--accent)" : tone?.border ?? "var(--line)"}`,
                    outline: selected ? "1px solid var(--accent)" : undefined,
                    outlineOffset: 1,
                  }}
                >
                  <FoldFill fold={fold} />
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 9.5, color: "var(--ink-faint)", margin: "2px 0 4px" }}>
            compact plan — one cell per fold · click a cell to inspect it below · detail rows show the picked fold ± neighbours
          </span>
        </>
      ) : null}

      {detail.map((fold) => {
        const selected = cursor === fold.fold;
        const isRunning = fold.state === "RUNNING";
        const highlight = selected || (cursor === null && isRunning);
        const tone = FOLD_STATUS_TONE[fold.state];
        const motion = isRunning ? pulse("1.8s") : null;
        const timeline = fold.fold_timeline ?? NOT_PUBLISHED_TIMELINE;
        return (
          <button
            key={fold.fold}
            type="button"
            data-fold={compact ? undefined : fold.fold}
            data-fold-row={fold.fold}
            data-fold-state={fold.state}
            data-fold-timeline={timeline.state}
            data-selected={selected}
            aria-pressed={compact ? undefined : selected}
            onClick={() => onPick(fold.fold)}
            onKeyDown={(event) => onKey(event, fold.fold)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "3px 6px",
              borderRadius: 3,
              border: 0,
              borderLeft: `2px solid ${highlight ? "var(--accent)" : "transparent"}`,
              background: highlight ? "var(--accent-soft)" : "transparent",
              textAlign: "left",
              width: "100%",
              cursor: "pointer",
              font: "inherit",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 11, width: 58, flex: "none", color: "var(--ink-soft)" }}>
              {foldId(fold.fold)}
            </span>
            <span
              data-fold-track={fold.fold}
              data-motion={motion?.["data-motion"]}
              style={{
                ...motion?.style,
                position: "relative",
                flex: 1,
                minWidth: 40,
                height: 14,
                borderRadius: 999,
                background: "var(--paper-sunken)",
                overflow: "hidden",
                boxShadow: isRunning ? "inset 0 0 0 1px var(--accent)" : undefined,
              }}
            >
              <FoldFill fold={fold} />
            </span>
            <span
              style={{
                fontFamily: MONO,
                fontSize: 9,
                fontWeight: 700,
                width: 66,
                flex: "none",
                textAlign: "center",
                borderRadius: 999,
                padding: "1px 0",
                border: `1px solid ${tone?.border ?? "var(--line)"}`,
                color: tone?.fg ?? "var(--ink-faint)",
                background: tone?.bg ?? "transparent",
              }}
            >
              {fold.state}
            </span>
            <span
              data-fold-note={fold.fold}
              style={{
                fontFamily: MONO,
                fontSize: 9.5,
                width: 190,
                flex: "none",
                textAlign: "right",
                color: "var(--ink-faint)",
              }}
            >
              {foldNote(fold, foldTrials, handoff, claimCursor)}
            </span>
          </button>
        );
      })}
      {folds.some((f) => (f.fold_timeline ?? NOT_PUBLISHED_TIMELINE).state === "PARTIAL") ? (
        <p style={{ fontSize: 9.5, color: "var(--role-holdout)", margin: 0 }} data-timeline-partial>
          Some folds published only part of their Search / OOS / freeze facts. The published segments are drawn as they
          are; the gaps are not filled.
        </p>
      ) : null}
    </div>
  );
}

function CursorRow({
  fold,
  foldState,
  cursor,
  liveTrial,
}: {
  fold: number | null;
  foldState: string | null;
  /** The evidence cursor for this fold, from published facts only. */
  cursor: InspectionCursor;
  liveTrial: number | undefined;
}) {
  const trial = cursor.trial ?? (liveTrial !== undefined ? count(liveTrial) : null);
  const params = cursor.params ? paramsTag(cursor.params) : null;
  return (
    <div
      data-evidence-cursor
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 6,
        paddingTop: 6,
        marginTop: "auto",
        borderTop: "1px solid var(--line-soft)",
      }}
    >
      <span style={CARD_TITLE}>evidence cursor</span>
      <span style={CHIP} data-cursor-fold>
        fold <span style={{ color: "var(--ink)" }}>{fold === null ? <Absent what="none yet" /> : foldId(fold)}</span>
      </span>
      <span style={CHIP} data-cursor-trial>
        trial{" "}
        {trial === null ? (
          <NotPublished reason="The progress read publishes no selected trial for this fold." />
        ) : (
          <span style={{ color: "var(--ink)" }}>
            {"#"}
            {trial}
          </span>
        )}
      </span>
      <span style={CHIP} data-cursor-params>
        params{" "}
        {params !== null ? (
          <span style={{ color: "var(--accent)" }} title={cursor.params}>
            {params}
          </span>
        ) : foldState === "RUNNING" ? (
          <span style={{ color: "var(--accent-2)" }}>unfrozen</span>
        ) : (
          <NotPublished reason="The progress read publishes no params digest for this fold." />
        )}
      </span>
      <span style={{ fontSize: 9.5, color: "var(--ink-faint)" }}>
        handed to Evidence Flow at completion — you land on the same fold you watched
      </span>
    </div>
  );
}

/* -------------------------------------------------------------- artifacts */

const ARTIFACT_TONE: Record<Artifact["state"] | "DENIED", string> = {
  SEALED: "var(--good)",
  WRITING: "var(--accent)",
  PENDING: "var(--ink-faint)",
  ABORTED: "var(--bad)",
  DENIED: "var(--bad)",
};

function artifactNote(artifact: Artifact): ReactNode {
  if (artifact.state === "SEALED") {
    const bytes = artifact.size === null ? null : formatBytes(Number(artifact.size));
    const digest = shortDigest(artifact.digest);
    return (
      <span title={[artifact.size ? `${artifact.size} bytes` : null, artifact.digest].filter(Boolean).join(" · ")}>
        {bytes ?? artifact.size ?? <Absent what="size not reported" />}
        {digest ? <> · sha256:{digest}…</> : null}
      </span>
    );
  }
  if (artifact.state === "WRITING") return "writing…";
  if (artifact.state === "ABORTED") return "aborted";
  return "pending";
}

/** A withheld artifact: named, counted, never linked (CG-P11-03). */
function DeniedRow({ artifact }: { artifact: DeniedArtifact }) {
  const rows = artifact.rows === null ? null : formatMetric(artifact.rows, "count");
  const range =
    artifact.range === null ? null : `${formatUtc(artifact.range.start_utc_ms)} → ${formatUtc(artifact.range.end_exclusive_utc_ms)}`;
  return (
    <span
      data-artifact={artifact.name}
      data-artifact-state="DENIED"
      title={[artifact.reason_code, range].filter(Boolean).join(" · ")}
      style={{ display: "flex", alignItems: "baseline", gap: 10, fontSize: 11, borderBottom: "1px solid var(--paper-sunken)", padding: "3px 0", minWidth: 0 }}
    >
      <span style={{ width: 170, flex: "none", fontFamily: MONO, fontSize: 10.5 }}>{artifact.name}</span>
      <span
        style={{
          width: 76,
          flex: "none",
          fontFamily: MONO,
          fontSize: 9,
          letterSpacing: ".05em",
          textTransform: "uppercase",
          color: ARTIFACT_TONE.DENIED,
          borderLeft: `2px solid ${ARTIFACT_TONE.DENIED}`,
          paddingLeft: 5,
        }}
      >
        denied
      </span>
      <span style={{ flex: 1, minWidth: 0, color: "var(--ink-faint)", fontSize: 10 }}>
        {rows !== null ? `${rows} bars · ` : null}
        {DENIED_HOLDOUT_NOTE}
      </span>
    </span>
  );
}

function ArtifactsTable({ artifacts, denied = [] }: { artifacts: readonly Artifact[]; denied?: readonly DeniedArtifact[] }) {
  return (
    <div data-artifacts style={{ display: "flex", flexDirection: "column" }}>
      {artifacts.length === 0 && denied.length === 0 ? (
        <span style={{ fontSize: 10.5, color: "var(--ink-faint)", padding: "3px 0" }} data-artifacts-empty>
          No artifact has been announced yet.
        </span>
      ) : null}
      {artifacts.map((artifact) => {
        const tone = ARTIFACT_TONE[artifact.state];
        const motion = artifact.state === "WRITING" ? pulse("1.6s") : null;
        return (
          <span
            key={artifact.name}
            data-artifact={artifact.name}
            data-artifact-state={artifact.state}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              fontSize: 11,
              borderBottom: "1px solid var(--paper-sunken)",
              padding: "3px 0",
              minWidth: 0,
            }}
          >
            <span
              title={artifact.name}
              style={{
                width: 170,
                flex: "none",
                fontFamily: MONO,
                fontSize: 10.5,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                direction: "rtl",
                textAlign: "left",
              }}
            >
              {/* RTL keeps the file name, not the directory, when it clips. */}
              <bdi>{artifact.name}</bdi>
            </span>
            <span
              data-motion={motion?.["data-motion"]}
              style={{
                ...motion?.style,
                width: 76,
                flex: "none",
                fontFamily: MONO,
                fontSize: 9,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: tone,
                borderLeft: `2px solid ${artifact.state === "PENDING" ? "var(--viz-legend-inactive)" : tone}`,
                paddingLeft: 5,
              }}
            >
              {artifact.state}
            </span>
            <span style={{ flex: 1, minWidth: 0, color: "var(--ink-faint)", fontSize: 10 }}>{artifactNote(artifact)}</span>
          </span>
        );
      })}
      {denied.map((artifact) => (
        <DeniedRow key={artifact.name} artifact={artifact} />
      ))}
    </div>
  );
}

/** The server's bound on the retained list (`research-progress` OpenAPI). */
const RETAINED_LIMIT = 128;

/**
 * The run's retained tables, from the artifact authority (RF01-F6).
 *
 * A different set from the manifest above: these are the Parquet tables the
 * authority keeps — the only place `CORRUPT` and `MISSING` can appear. Each
 * goes through `ArtifactPanel`, so the P05 rules hold where they are shown.
 */
function RetainedTables({ retained }: { retained: readonly RetainedArtifact[] | undefined }) {
  if (retained === undefined) {
    return (
      <p style={{ fontSize: 10, color: "var(--ink-faint)", margin: 0 }} data-retained-not-published>
        This server does not publish retained tables for the progress read.
      </p>
    );
  }
  if (retained.length === 0) {
    return (
      <p style={{ fontSize: 10, color: "var(--ink-faint)", margin: 0 }} data-retained-none>
        No table has been retained for this run yet.
      </p>
    );
  }
  return (
    <details data-retained-tables open>
      <summary style={{ ...CARD_TITLE, cursor: "pointer" }}>retained tables · {retained.length}</summary>
      <div style={{ display: "grid", gap: 8, paddingTop: 6 }}>
        {retained.map((table, index) => (
          <ArtifactPanel
            key={`${table.table_kind}:${index}`}
            title={table.table_kind}
            facts={{ state: table.state, registered: true, serverAdmittedExport: false }}
            metadata={{
              rowCount: table.total_rows,
              byteSize: table.total_bytes,
              /* ArtifactPanel takes the exact ISO instant and formats it itself. */
              sealedAt: table.sealed_at_utc_ms !== null ? new Date(table.sealed_at_utc_ms).toISOString() : null,
            }}
          />
        ))}
      </div>
      {retained.length >= RETAINED_LIMIT ? (
        <p style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }} data-retained-capped>
          first {RETAINED_LIMIT} by table kind — the read is bounded
        </p>
      ) : null}
    </details>
  );
}

/* ---------------------------------------------------------------- console */

/** How far above the bottom a reader must scroll before auto-scroll lets go. */
export const FOLLOW_SLACK_PX = 40;

type ConsoleFilter = "all" | "fold" | "errors";

function TrialConsole({
  lines,
  olderLines,
  dropped,
  filter,
  foldFilter,
  live,
  connecting,
  follow,
  setFollow,
}: {
  lines: readonly ConsoleLine[];
  olderLines: readonly ConsoleLine[];
  dropped: boolean;
  filter: ConsoleFilter;
  foldFilter: number | null;
  live: boolean;
  connecting: boolean;
  follow: boolean;
  setFollow: (value: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const keep = (line: ConsoleLine) => {
    if (filter === "errors" && line.tone !== "ERROR" && line.tone !== "WARN") return false;
    if (filter === "fold" && foldFilter !== null && line.fold !== foldFilter) return false;
    return true;
  };
  const visible = lines.filter(keep);
  const history = olderLines.filter(keep);

  /* Auto-scroll sets `scrollTop` directly — `scrollIntoView` moves the page,
     not just the box (spec 03 pitfall 4). */
  useEffect(() => {
    if (!follow || !box.current) return;
    box.current.scrollTop = box.current.scrollHeight;
  }, [follow, visible.length, history.length]);

  const empty =
    visible.length === 0 && history.length === 0
      ? filter !== "all"
        ? "No line matches this filter."
        : connecting
          ? "connecting…"
          : live
            ? "Waiting for the first console observation…"
            : "No console observation has been published for this run."
      : null;


  return (
    <div
      ref={box}
      role="log"
      aria-live="polite"
      aria-label="Trial console"
      data-console-box
      data-research-panel="trial console"
      onScroll={(event) => {
        /* Scrolling up more than 40 px lets go; returning to the bottom takes
           it back (spec 03 §3.3). Wheel, drag and keyboard all land here. */
        const el = event.currentTarget;
        const fromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        if (fromBottom > FOLLOW_SLACK_PX && follow) setFollow(false);
        else if (fromBottom <= 1 && !follow) setFollow(true);
      }}
      style={{
        position: "relative",
        height: 330,
        overflowY: "auto",
        border: "1px solid var(--ink)",
        borderRadius: 8,
        background: "var(--console-bg)",
        padding: "12px 16px",
        fontFamily: MONO,
        fontSize: 10.5,
        lineHeight: 1.75,
        color: "var(--console-fg)",
      }}
    >
      {history.length > 0 ? (
        <div data-console-history>
          {history.map((line) => (
            <div key={line.sequence} data-history-line={line.sequence} style={{ color: "var(--console-faint)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {consoleStamp(line)} {line.text}
            </div>
          ))}
        </div>
      ) : null}
      {dropped ? (
        <div style={{ color: "var(--console-faint)" }} data-older-dropped>
          {OLDER_DROPPED}
        </div>
      ) : null}
      {empty !== null ? (
        <div style={{ color: "var(--console-faint)" }} data-console-empty>
          {empty}
        </div>
      ) : (
        visible.map((line) => (
          <div
            key={line.sequence}
            data-console-line={line.sequence}
            data-tone={line.tone}
            style={{ color: TONE_COLOR[line.tone], whiteSpace: "pre-wrap", wordBreak: "break-all" }}
          >
            {consoleStamp(line)} {line.text}
          </div>
        ))
      )}
      {live ? (
        <span
          data-motion="caret"
          style={{ ["--rs-motion-duration" as string]: "1s", color: "var(--console-accent)" } as CSSProperties}
          aria-hidden="true"
        >
          ▌
        </span>
      ) : null}
      {!follow ? (
        <button
          type="button"
          data-console-latest
          onClick={() => {
            setFollow(true);
            if (box.current) box.current.scrollTop = box.current.scrollHeight;
          }}
          style={{
            position: "sticky",
            bottom: 6,
            display: "block",
            marginLeft: "auto",
            border: "1px solid var(--viz-train)",
            borderRadius: 999,
            background: "var(--ink)",
            color: "var(--viz-train)",
            fontFamily: MONO,
            fontSize: 9.5,
            padding: "2px 10px",
            cursor: "pointer",
          }}
        >
          ↓ latest
        </button>
      ) : null}
    </div>
  );
}

/* --------------------------------------------------------------- passport */

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

/** Passport tone: gold forecast, green issued, red only for a failed run (FE-S03-15). */
function passportTone(claim: ProgressSnapshot["claim"], status: EffectiveStatus | null) {
  if (claim.state === "ISSUED") return { border: "var(--good)", head: "var(--good)", style: "solid" as const };
  if (claim.state === "FORECAST") return { border: "var(--viz-legend-inactive)", head: "var(--accent-2)", style: "dashed" as const };
  if (status === "FAILED") return { border: "var(--bad)", head: "var(--bad)", style: "solid" as const };
  return { border: "var(--viz-legend-inactive)", head: "var(--ink-soft)", style: "solid" as const };
}

function Field({ label, children, name }: { label: string; children: ReactNode; name: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }} data-passport-field={name}>
      <span style={{ ...CARD_TITLE, color: "var(--ink-faint)" }}>{label}</span>
      {children}
    </div>
  );
}

function valueStyle(kind: "forecast" | "issued" | "warn" | "neutral" | "bad"): CSSProperties {
  const base: CSSProperties = { fontFamily: MONO, fontSize: 11.5, overflowWrap: "anywhere" };
  switch (kind) {
    case "forecast":
      return { ...base, color: "var(--ink-faint)", border: "1px dashed var(--viz-legend-inactive)", borderRadius: 3, padding: "0 6px", fontStyle: "italic" };
    case "issued":
      return { ...base, color: "var(--ink)", borderLeft: "2px solid var(--good)", paddingLeft: 6 };
    case "warn":
      return { ...base, color: "var(--accent-2)", borderLeft: "2px solid var(--accent-2)", paddingLeft: 6 };
    case "bad":
      return { ...base, color: "var(--bad)", borderLeft: "2px solid var(--bad)", paddingLeft: 6 };
    default:
      return { ...base, color: "var(--ink-soft)", borderLeft: "2px solid var(--viz-legend-inactive)", paddingLeft: 6 };
  }
}

function ClaimPassport({
  claim,
  status,
  sealed,
  failure,
  readiness,
  handoffHref,
  handoffLabel,
  engineVersion,
}: {
  claim: ProgressSnapshot["claim"];
  status: EffectiveStatus | null;
  sealed: boolean;
  failure: ProgressSnapshot["failure"];
  readiness: ProgressSnapshot["readiness"];
  handoffHref: string;
  /** `fold 2 · trial 1`, when the cursor names them (spec 03 §8). */
  handoffLabel: string | null;
  engineVersion: string | null;
}) {
  const handoff = claim.handoff_cursor ?? null;
  const issued = claim.state === "ISSUED";
  const forecast = claim.state === "FORECAST";
  const certificate = claim.methodology_certificate ?? NOT_PUBLISHED_CERTIFICATE;
  const tone = passportTone(claim, status);
  const stateWord = issued ? "issued" : forecast ? "forecast" : "not issued";
  const note = issued
    ? engineVersion
      ? `issued by engine ${engineVersion} at COMPLETED — now authoritative`
      : "issued by the engine at COMPLETED — now authoritative"
    : forecast
      ? "computed from mode × schedule in the config; issued only when the engine completes"
      : status === "FAILED"
        ? "the run failed before Stage 5"
        : "the run ended without a claim";
  const textKind = issued ? "issued" : forecast ? "forecast" : status === "FAILED" ? "bad" : "neutral";

  return (
    <section
      data-claim={claim.state}
      data-research-panel="claim"
      aria-label={`claim passport — ${stateWord}`}
      style={{
        border: `1px ${tone.style} ${tone.border}`,
        borderRadius: 6,
        background: "var(--paper-raised)",
        boxShadow: "var(--shadow-e1)",
        /* The flip is a colour change and a badge swap, nothing louder. */
        transition: "border-color 240ms cubic-bezier(.2,0,.2,1)",
        minWidth: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "6px 10px",
          padding: "7px 14px",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        <span
          data-claim-badge
          style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 600, color: tone.head }}
        >
          claim passport — {stateWord}
        </span>
        <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{note}</span>
        {sealed ? (
          <a
            data-open-evidence
            href={handoffHref}
            aria-label={handoffLabel ? `open evidence flow at ${handoffLabel}` : "open evidence flow"}
            title={handoffLabel ?? undefined}
            style={{
              marginLeft: "auto",
              display: "inline-block",
              border: "1px solid var(--accent)",
              borderRadius: 6,
              background: "var(--accent)",
              color: "var(--accent-contrast)",
              padding: "4px 14px",
              fontFamily: MONO,
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: ".05em",
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            open evidence flow →
          </a>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", padding: "10px 14px" }}>
        <Field label="claim" name="claim">
          {/* The server builds this sentence for every state; the page never
              composes a claim string of its own. */}
          <span style={{ ...valueStyle(textKind), opacity: issued ? 1 : 0.85 }} data-claim-text>
            {claim.state === "NOT_ISSUED" ? notIssuedText(claim.text, status) : claim.text}
          </span>
        </Field>
        <Field label="certification" name="certification">
          {certificate.state === "ISSUED" && certificate.grade !== null ? (
            <span
              style={valueStyle("warn")}
              data-certificate={certificate.grade}
              title={certificate.issued_at_utc_ms === null ? undefined : `issued ${formatUtc(certificate.issued_at_utc_ms)}`}
            >
              {certificate.grade} — issued by engine
            </span>
          ) : (
            <span style={valueStyle(forecast ? "forecast" : "neutral")}>
              <NotPublished
                reason={certificate.reason_code}
                what={certificate.state === "NOT_ISSUED" ? "not issued" : "not published"}
              />
            </span>
          )}
        </Field>
        <Field label="seal" name="readiness">
          <span style={valueStyle(sealed ? "issued" : "neutral")} data-readiness>
            mandatory {readiness.mandatory} · optional {readiness.optional}
          </span>
        </Field>
        {handoff !== null ? (
          <Field label="hand-off cursor" name="handoff">
            <span style={valueStyle(issued ? "issued" : "neutral")} data-handoff-cursor title={handoff.params_digest}>
              fold {count(handoff.fold)} · trial {count(handoff.trial)} · {paramsTag(handoff.params_digest)}
            </span>
          </Field>
        ) : null}
        {issued && claim.cursor !== null ? (
          <Field label="claim cursor" name="cursor">
            <span style={valueStyle("issued")} data-claim-cursor>
              {claim.cursor}
            </span>
          </Field>
        ) : null}
        {failure !== null ? (
          <Field label="failure" name="failure">
            <span role="alert" style={valueStyle("bad")} data-failure={failure.code}>
              {/* The engine's code and sentence, verbatim. */}
              {failure.code} — {failure.message}
            </span>
          </Field>
        ) : null}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ done banner */

function DoneBanner({
  runId,
  issued,
  cursor,
}: {
  runId: string;
  issued: boolean;
  cursor: InspectionCursor;
}) {
  const links: [Stage["key"], string][] = [
    ["S1", "S1 split"],
    ["S2", "S2 search"],
    ["S3", "S3 freeze"],
    ["S4", "S4 replay"],
    ["S5", "S5 claim"],
  ];
  return (
    <div
      data-done-banner
      style={{
        border: "1px solid var(--good)",
        borderRadius: 8,
        background: "var(--good-bg)",
        padding: "12px 16px",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
      }}
    >
      <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, color: "var(--good)" }}>
        {issued ? "✓ RUN COMPLETE — CLAIMS ISSUED" : "✓ RUN COMPLETE — ARTIFACTS SEALED"}
      </span>
      <span style={{ fontSize: 11.5, color: "var(--ink-soft)", flex: 1, minWidth: 260 }}>
        {issued
          ? "The claim bar above is now authoritative. Continue into the evidence with the cursor you watched:"
          : "No claim was issued for this run. Continue into the evidence with the cursor you watched:"}
      </span>
      <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
        {links.map(([key, label]) => {
          const target = stageTarget(key);
          return (
            <a
              key={key}
              data-done-link={key}
              href={runHref(runId, target.path, { ...(target.stage ? { stage: target.stage } : {}), ...cursor })}
              style={{
                border: "1px solid var(--accent)",
                borderRadius: 6,
                padding: "3px 10px",
                fontFamily: MONO,
                fontSize: 10,
                color: "var(--accent)",
              }}
            >
              {label}
            </a>
          );
        })}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------- cancel dialog */

function CancelDialog({
  runId,
  onKeep,
  onConfirm,
}: {
  runId: string;
  onKeep: () => void;
  onConfirm: () => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  useEffect(() => keep.current?.focus(), []);
  return (
    <div
      data-cancel-overlay
      onClick={onKeep}
      style={{ position: "fixed", inset: 0, zIndex: 60, display: "grid", placeItems: "center", padding: 16 }}
    >
      <span aria-hidden="true" style={{ position: "absolute", inset: 0, background: "var(--ink)", opacity: 0.35 }} />
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="rp-cancel-title"
        aria-describedby="rp-cancel-body"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          if (event.key === "Escape") onKeep();
        }}
        style={{
          position: "relative",
          width: "min(440px, 100%)",
          border: "1px solid var(--line)",
          borderRadius: 8,
          background: "var(--paper-raised)",
          boxShadow: "var(--shadow-raised)",
          padding: "16px 18px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}
      >
        <h2 id="rp-cancel-title" style={{ fontFamily: DISPLAY, fontSize: 18, fontWeight: 400, margin: 0, wordBreak: "break-all" }}>
          Cancel {runId}?
        </h2>
        <p id="rp-cancel-body" style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0, lineHeight: 1.5 }}>
          {CANCEL_BODY}
        </p>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button
            ref={keep}
            type="button"
            data-action="cancel-dismiss"
            onClick={onKeep}
            style={{
              border: "1px solid var(--line)",
              borderRadius: 6,
              background: "var(--paper-raised)",
              color: "var(--ink-soft)",
              padding: "4px 12px",
              fontFamily: MONO,
              fontSize: 10.5,
            }}
          >
            keep running
          </button>
          <button
            type="button"
            data-action="cancel-confirm"
            onClick={onConfirm}
            style={{
              border: "1px solid var(--bad)",
              borderRadius: 6,
              background: "var(--bad)",
              color: "var(--accent-contrast)",
              padding: "4px 12px",
              fontFamily: MONO,
              fontSize: 10.5,
            }}
          >
            cancel run
          </button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------- state skeleton */

const STATE_GLYPH: Record<string, string> = {
  loading: "·",
  empty: "∅",
  partial: "◐",
  stale: "◷",
  denied: "⊘",
  unavailable: "⚠",
  "failed-retryable": "↻",
  terminal: "■",
  commissioned: "◇",
};

/** One screen-level notice instead of one per card (FE-S03-14). */
function StateNotice({ state }: { state: ResearchState }) {
  const withheld = !(state.state === "available" || state.retainsContent);
  return (
    <div
      data-research-state={state.state}
      role={withheld ? "alert" : "status"}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        border: "1px solid var(--line)",
        borderRadius: 6,
        background: withheld ? "var(--paper-sunken)" : "var(--paper-raised)",
        padding: "8px 12px",
      }}
    >
      <span aria-hidden="true" style={{ fontFamily: MONO, fontSize: 11, color: "var(--ink-faint)" }}>
        {STATE_GLYPH[state.state] ?? "·"}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--ink-faint)" }}>
          {state.state}
        </span>
        {state.reason ? <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{state.reason}</span> : null}
      </span>
    </div>
  );
}

function Skeleton({ height }: { height: number }) {
  return (
    <div role="status" aria-label="Loading" style={{ display: "flex", flexDirection: "column", gap: 8, minHeight: height }}>
      {[72, 96, 60].map((width, index) => (
        <span key={index} aria-hidden="true" style={{ display: "block", borderRadius: 4, background: "var(--paper-sunken)", height: 12, width: `${width}%` }} />
      ))}
    </div>
  );
}

function Card({
  title,
  meta,
  name,
  children,
  style,
  gap = 6,
}: {
  title: string;
  meta?: ReactNode;
  name: string;
  children: ReactNode;
  style?: CSSProperties;
  gap?: number;
}) {
  return (
    <section data-research-panel={name} aria-label={name} style={{ ...CARD, gap, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ ...CARD_TITLE, margin: 0 }}>{title}</h2>
        {meta ? <span style={{ fontFamily: MONO, fontSize: 9.5, color: "var(--ink-faint)", textAlign: "right" }}>{meta}</span> : null}
      </div>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- header */

const ROOT: CSSProperties = {
  width: "100%",
  maxWidth: 1440,
  margin: "0 auto",
  padding: "16px 24px 56px",
  display: "flex",
  flexDirection: "column",
  gap: 14,
  background: "var(--paper)",
  color: "var(--ink)",
  fontFamily: BODY,
  fontSize: 13,
  boxSizing: "border-box",
  minWidth: 0,
};

function Header({
  runId,
  title,
  right,
  children,
}: {
  runId: string;
  title: string;
  right?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header
      style={{
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "flex-end",
        gap: "10px 16px",
        borderBottom: "1px solid var(--line)",
        paddingBottom: 10,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0, flex: "1 1 360px" }}>
        <nav
          aria-label="Research breadcrumbs"
          style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 12, color: "var(--ink-soft)" }}
        >
          <a href={`${QUANTBT_ROOT}/runs`} style={{ color: "var(--accent)" }}>
            Runs
          </a>
          <span aria-hidden="true" style={{ color: "var(--ink-faint)" }}>
            /
          </span>
          <span style={{ fontFamily: MONO, wordBreak: "break-all" }} data-breadcrumb-run>
            {runId}
          </span>
          <span aria-hidden="true" style={{ color: "var(--ink-faint)" }}>
            /
          </span>
          <span style={{ color: "var(--ink)" }}>Progress</span>
        </nav>
        <h1
          style={{
            fontFamily: DISPLAY,
            fontSize: 22,
            fontWeight: 300,
            letterSpacing: "-.01em",
            lineHeight: "normal",
            margin: 0,
            overflowWrap: "anywhere",
          }}
        >
          {title}
        </h1>
        <p style={{ fontFamily: DISPLAY, fontStyle: "italic", fontSize: 13.5, color: "var(--ink-faint)", margin: 0 }}>{SUBTITLE}</p>
        {children}
      </div>
      {right ? <div style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>{right}</div> : null}
    </header>
  );
}

/**
 * CG-P11-07: no automatic or in-place retry. A failed or cancelled run offers
 * exactly one action — a new run seeded from its admitted requested spec —
 * or says why it cannot (spec 03 pitfall 9).
 */
function NewRunFrom({ runId, read }: { runId: string; read: ProgressRead }) {
  const from = read.current.new_run_from;
  if (from?.state === "AVAILABLE") {
    return (
      <a
        data-action="new-run-from"
        href={newRunFromHref(runId)}
        title="Opens New Run seeded from this run's requested spec; it is admitted as a new run through a fresh preflight."
        style={{
          border: "1px solid var(--accent)",
          borderRadius: 6,
          padding: "3px 12px",
          fontFamily: MONO,
          fontSize: 10,
          letterSpacing: ".05em",
          color: "var(--accent)",
          textDecoration: "none",
          whiteSpace: "nowrap",
        }}
      >
        {NEW_RUN_FROM_LABEL}
      </a>
    );
  }
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }} data-retry-reason>
      {from ? NEW_RUN_FROM_UNAVAILABLE : "this release does not offer retry from Run Progress"}
    </span>
  );
}

function RulesFooter() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
      <span style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-faint)" }}>
        rules of this screen
      </span>
      <p style={{ fontSize: 11, color: "var(--ink-soft)", lineHeight: 1.6, margin: 0 }} data-rules-footer>
        {RULES_FOOTER}
      </p>
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
  /** Shown only while older retained lines remain (spec 03 §25). */
  canLoadOlder?: boolean;
  foldCursor: number | null;
  onPinFold: (fold: number) => void;
  cancelling: boolean;
  onCancel: (reason: string) => void;
  refusal?: ProgressRefusal | null;
  foldTrials?: Readonly<Record<number, number>>;
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
    canLoadOlder = false,
    foldCursor,
    onPinFold,
    cancelling,
    onCancel,
    refusal = null,
    foldTrials = {},
  } = props;

  const [confirming, setConfirming] = useState(false);
  const [tab, setTab] = useState<"live" | "stage">("live");
  const [filter, setFilter] = useState<ConsoleFilter>("all");
  const [follow, setFollow] = useState(true);

  const status = read?.current.effective_status ?? null;
  /* Live while the Portal says so and the source has not already reported a
     terminal frame — the source's frame lands a read before `current` does,
     and a cancel button on a finished run is a control that cannot work. */
  const sourceTerminal = snapshot?.status === "COMPLETED" || snapshot?.status === "FAILED";
  const live = (status === "QUEUED" || status === "RUNNING" || status === "FINISHING") && !sourceTerminal;
  /* Completion is the source's seal and nothing else. */
  const sealed = snapshot?.readiness.mandatory === "SEALED";
  /* CG-P11-03: identity and the declared fold count come with the read. */
  const identity = read === null ? undefined : (read.run ?? null);
  const declared = identity?.declared_folds;
  const foldCount = declared?.state === "DECLARED" ? declared.count : null;
  const engineVersion = identity?.engine_release_id ?? null;

  const statusSlot =
    status !== null ? (
      <>
        <StatusChip status={status} live={live} />
        {read?.current.terminal_resolution === "CONTROL_CANCELLATION" ? (
          <span
            data-terminal-resolution
            style={{ fontFamily: MONO, fontSize: 10, color: "var(--accent-2)", border: "1px solid var(--accent-2)", borderRadius: 3, padding: "0 5px" }}
          >
            resolved by cancellation
          </span>
        ) : null}
      </>
    ) : null;

  /* ------------------------------------------------ run not found (404) */
  if (refusal?.notFound || (read === null && state.state === "empty")) {
    return (
      <div data-screen="run-progress" data-run-not-found style={ROOT}>
        <Header runId={runId} title={`Run not found — ${runId}`} />
        <section style={{ ...CARD, gap: 8 }}>
          <h2 style={{ ...CARD_TITLE, margin: 0 }}>run not found</h2>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
            This run does not exist in this workspace, or you cannot read it here. No progress has been inferred.
          </p>
          <a href={`${QUANTBT_ROOT}/runs`} style={{ fontFamily: MONO, fontSize: 10.5 }}>
            Open Run Library →
          </a>
        </section>
      </div>
    );
  }

  /* --------------------------------------------- run without a source */
  if (read && snapshot === null && (read.availability === "QUEUED_NO_SOURCE" || read.availability === "CANCELLED_BEFORE_SOURCE")) {
    const queued = read.availability === "QUEUED_NO_SOURCE";
    return (
      <div data-screen="run-progress" data-no-source={read.availability} style={ROOT}>
        <Header
          runId={runId}
          title={`${queued ? "Run queued" : "Run cancelled"} — ${runId}`}
          right={<TransportDot transport={transport} live={live} />}
        />
        <RunMetaStrip runId={runId} identity={identity} status={statusSlot} />
        <section style={{ ...CARD, gap: 8 }}>
          <h2 style={{ ...CARD_TITLE, margin: 0 }}>{queued ? "queued — waiting for a worker" : "cancelled before the source reported"}</h2>
          <p style={{ fontSize: 12, color: "var(--ink-soft)", margin: 0 }}>
            {queued
              ? "The run is queued; no source progress has been published yet. This page updates on its own when a worker claims it."
              : "The run was cancelled before source progress began. No progress, artifact or claim exists for it."}
          </p>
          {read.current.terminal_materialization === "PENDING" && !queued ? (
            <span data-terminal-materialization style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>
              The cancellation is recorded; its terminal record is still being written.
            </span>
          ) : null}
          <ServedAttempts queue={read.queue} attempts={read.attempts} open />
          {!queued ? <NewRunFrom runId={runId} read={read} /> : null}
        </section>
        <RulesFooter />
      </div>
    );
  }

  /* ----------------------------------------------------- full screen */
  const content = state.state === "available" || state.retainsContent;
  const connecting = read === null;
  const claimCursor = snapshot?.claim.cursor ? decodeInspectionCursor(snapshot.claim.cursor).cursor : {};
  const folds = snapshot?.folds ?? [];
  const handoff = snapshot?.claim.handoff_cursor ?? null;
  const cursor = evidenceCursor(foldCursor, folds, handoff, claimCursor);
  const handoffHref = runHref(runId, "evidence", { stage: "summary", ...cursor });
  const handoffLabel = cursor.fold && cursor.trial ? `fold ${cursor.fold} · trial ${cursor.trial}` : null;
  const cursorFold = folds.find((f) => f.fold === foldCursor) ?? null;
  const terminalStatus = status === "FAILED" || status === "CANCELLED";
  const title = `${status === "COMPLETED" ? "Run completed" : "Run progress"} — ${runId}`;

  const tabButton = (key: "live" | "stage", label: string) => (
    <button
      key={key}
      type="button"
      role="tab"
      aria-selected={tab === key}
      data-tab={key}
      onClick={() => setTab(key)}
      style={{
        border: 0,
        borderRight: key === "live" ? "1px solid var(--line)" : 0,
        background: tab === key ? "var(--accent-soft)" : "var(--paper-raised)",
        color: tab === key ? "var(--accent)" : "var(--ink-soft)",
        padding: "4px 14px",
        fontFamily: MONO,
        fontSize: 10.5,
        cursor: "pointer",
      }}
    >
      {label}
    </button>
  );

  const chip = (key: ConsoleFilter, label: string, disabled = false) => (
    <button
      key={key}
      type="button"
      data-console-filter={label}
      data-selected={filter === key}
      aria-pressed={filter === key}
      disabled={disabled}
      /* §3.5: an inert control says why. */
      title={disabled ? "No fold has reported yet, so there is nothing to filter by." : undefined}
      onClick={() => setFilter(key)}
      style={{
        border: `1px solid ${filter === key ? "var(--accent)" : "var(--line)"}`,
        borderRadius: 999,
        background: filter === key ? "var(--accent-soft)" : "var(--paper-raised)",
        color: filter === key ? "var(--accent)" : "var(--ink-faint)",
        padding: "1px 8px",
        fontFamily: MONO,
        fontSize: 10,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {label}
    </button>
  );

  return (
    <div data-screen="run-progress" style={ROOT}>
      <Header runId={runId} title={title} right={<TransportDot transport={transport} live={live} />}>
        {read?.availability === "PENDING_SOURCE_CALLBACK" ? (
          <p style={{ fontSize: 10.5, color: "var(--role-holdout)", margin: 0 }} data-pending-source>
            The run exists. Waiting for its source to report progress.
          </p>
        ) : null}
        {snapshot?.source.partial ? (
          <p style={{ fontSize: 10.5, color: "var(--role-holdout)", margin: 0 }} data-source-partial>
            The source reports this projection as partial.
          </p>
        ) : null}
        {status !== null && !live && read?.current.terminal_materialization === "PENDING" ? (
          <p style={{ fontSize: 10.5, color: "var(--ink-faint)", margin: 0 }} data-terminal-materialization>
            The run is final; its terminal record is still being written.
          </p>
        ) : null}
      </Header>

      <RunMetaStrip runId={runId} identity={identity} status={statusSlot} panel />
      {read && (read.queue || (read.attempts?.length ?? 0) > 0) ? (
        <ServedAttempts queue={read.queue} attempts={read.attempts} />
      ) : null}

      {/* Partial source and pending callback already speak in the header. */}
      {state.state !== "available" &&
      !(state.state === "partial" && (snapshot?.source.partial || read?.availability === "PENDING_SOURCE_CALLBACK")) ? (
        <StateNotice state={state} />
      ) : null}

      {/* 1 · claim passport (HiFi: first card, FE-S03-16). */}
      {content && snapshot ? (
        <ClaimPassport
          claim={snapshot.claim}
          status={status}
          sealed={sealed}
          failure={snapshot.failure}
          readiness={snapshot.readiness}
          handoffHref={handoffHref}
          handoffLabel={handoffLabel}
          engineVersion={engineVersion}
        />
      ) : (
        <section data-research-panel="claim" style={{ ...CARD, borderStyle: "dashed", borderColor: "var(--viz-legend-inactive)" }}>
          <h2 style={{ ...CARD_TITLE, margin: 0, color: "var(--accent-2)" }}>claim passport — forecast</h2>
          {connecting ? <Skeleton height={40} /> : null}
        </section>
      )}

      {/* 2 · stage pills, overall, budget. */}
      <section data-research-panel="progress" aria-label="progress" style={{ ...CARD, gap: 8 }}>
        {content && snapshot ? (
          <>
            <StagePills stages={snapshot.stages} claimState={snapshot.claim.state} runId={runId} cursor={cursor} />
            <ProgressCard snapshot={snapshot} live={live} foldCount={foldCount} />
          </>
        ) : (
          <Skeleton height={86} />
        )}
      </section>

      {/* 3 · Gantt beside the artifact manifest (FE-S03-16). */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "stretch" }}>
        <Card
          name="folds"
          title={live ? "fold gantt — live · the evidence cursor follows the running fold" : "fold gantt — the evidence cursor follows the fold you pick"}
          meta={snapshot ? (foldCount !== null ? `${folds.length} of ${foldCount} folds reported` : `${folds.length} reported`) : undefined}
          style={{ flex: "1.15 1 0", minWidth: "min(460px, 100%)" }}
        >
          {content && snapshot ? (
            <>
              <FoldGantt
                folds={folds}
                cursor={foldCursor}
                onPick={onPinFold}
                foldTrials={foldTrials}
                handoff={handoff}
                claimCursor={claimCursor}
              />
              <CursorRow
                fold={foldCursor}
                foldState={cursorFold?.state ?? null}
                cursor={cursor}
                liveTrial={foldCursor !== null && cursorFold?.state === "RUNNING" ? foldTrials[foldCursor] : undefined}
              />
            </>
          ) : (
            <Skeleton height={86} />
          )}
        </Card>

        <Card
          name="artifacts"
          title="artifacts — appearing as they are built"
          meta={
            snapshot?.mandatory_bundle ? (
              <span title={`${snapshot.mandatory_bundle.size} bytes · ${snapshot.mandatory_bundle.digest}`}>
                bundle {formatBytes(Number(snapshot.mandatory_bundle.size)) ?? snapshot.mandatory_bundle.size} · sha256:
                {shortDigest(snapshot.mandatory_bundle.digest)}…
              </span>
            ) : (
              "manifest preview"
            )
          }
          style={{ flex: "1 1 0", minWidth: "min(380px, 100%)" }}
          gap={5}
        >
          {content && snapshot ? (
            <>
              <ArtifactsTable artifacts={snapshot.artifacts} denied={read?.denied_artifacts ?? []} />
              {/* Said once, plainly, so a missing link reads as a boundary. */}
              <span style={{ fontSize: 10, color: "var(--ink-faint)", lineHeight: 1.5, paddingTop: 4 }} data-artifact-no-reader>
                {ARTIFACT_NO_READER}
              </span>
              {read ? <RetainedTables retained={read.retained_artifacts} /> : null}
            </>
          ) : (
            <Skeleton height={72} />
          )}
        </Card>
      </div>

      {/* 4 · Live console / Stage log, with the run's own actions. */}
      <div data-run-actions style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span role="tablist" aria-label="Console view" style={{ display: "inline-flex", border: "1px solid var(--line)", borderRadius: 6, overflow: "hidden" }}>
          {tabButton("live", "Live console")}
          {tabButton("stage", "Stage log")}
        </span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }}>
          {tab === "live" ? "terminal surface keeps its own palette in both themes" : "structured ledger — one row per reported fold"}
        </span>
        {tab === "live" ? (
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {chip("all", "all")}
            {chip("fold", foldCursor === null ? "fold" : `fold ${foldCursor}`, foldCursor === null)}
            {chip("errors", "errors")}
            <button
              type="button"
              data-console-follow={String(follow)}
              aria-pressed={follow}
              onClick={() => setFollow(!follow)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 999,
                background: "var(--paper-raised)",
                color: follow ? "var(--accent)" : "var(--ink-faint)",
                padding: "1px 8px",
                fontFamily: MONO,
                fontSize: 10,
                cursor: "pointer",
              }}
            >
              auto-scroll {follow ? "on" : "off"}
            </button>
            {canLoadOlder ? (
              <button
                type="button"
                data-action="load-older"
                onClick={onLoadOlder}
                style={{
                  border: "1px solid var(--line)",
                  borderRadius: 999,
                  background: "var(--paper-raised)",
                  color: "var(--ink-faint)",
                  padding: "1px 8px",
                  fontFamily: MONO,
                  fontSize: 10,
                  cursor: "pointer",
                }}
              >
                load older
              </button>
            ) : null}
          </span>
        ) : null}
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8 }}>
          {read !== null && terminalStatus ? <NewRunFrom runId={runId} read={read} /> : null}
          {read?.current.may_cancel && live ? (
            <button
              type="button"
              data-action="cancel"
              disabled={cancelling}
              title={cancelling ? "The cancellation request is already in flight." : undefined}
              onClick={() => setConfirming(true)}
              style={{
                border: "1px solid var(--line)",
                borderRadius: 6,
                background: "var(--paper-raised)",
                color: "var(--bad)",
                padding: "3px 12px",
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                cursor: cancelling ? "not-allowed" : "pointer",
              }}
            >
              {cancelling ? "cancelling…" : "cancel run"}
            </button>
          ) : null}
        </span>
      </div>

      {tab === "live" ? (
        <TrialConsole
          lines={lines}
          olderLines={olderLines}
          dropped={linesDropped}
          filter={filter}
          foldFilter={foldCursor}
          live={live}
          connecting={connecting}
          follow={follow}
          setFollow={setFollow}
        />
      ) : (
        <StageLedger
          folds={folds}
          foldTrials={foldTrials}
          cursor={foldCursor}
          studyTrials={snapshot ? { done: snapshot.overall.trials_done, declared: snapshot.overall.trials_declared } : null}
        />
      )}

      {sealed && snapshot ? <DoneBanner runId={runId} issued={snapshot.claim.state === "ISSUED"} cursor={cursor} /> : null}

      <RulesFooter />

      {confirming ? (
        <CancelDialog
          runId={runId}
          onKeep={() => setConfirming(false)}
          onConfirm={() => {
            setConfirming(false);
            onCancel("cancelled by portal operator");
          }}
        />
      ) : null}
    </div>
  );
}
