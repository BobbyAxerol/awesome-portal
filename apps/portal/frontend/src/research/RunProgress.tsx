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
  type CancelResponse,
  type DeniedArtifact,
  type EffectiveStatus,
  type FoldSegment,
  type MethodologyClaim,
  type ProgressRead,
  type ProgressRefusal,
  type ProgressSnapshot,
  type RetainedArtifact,
  type Stage,
} from "./progressClient";
import { ArtifactPanel } from "./ArtifactPanel";
import { decodeInspectionCursor, type InspectionCursor } from "./inspectionCursor";
import { DEFAULT_CURSOR, type EvidenceCursor } from "./evidenceCursor";
import { cursorForHandoff, type HandoffTarget } from "./handoffCursor";
import { runScreenHref, type RunScreen } from "./runScreenHref";
import { PlannedWindows } from "./PlannedWindows";
import { ServedAttempts } from "./QueuePanel";
import { formatBytes, formatDuration, formatMetric, formatUtc, shortDigest, shortId } from "./researchFormat";
import { useRunLabel } from "./runLabels";
import { NotPublished, RunMetaStrip } from "./RunMetaStrip";
import { STATE_WORD } from "./ResearchPanel";
import { StageLedger, isFixedProfileScope, utcClock } from "./StageLedger";
import type { FoldTrialIdentity, LiveBestObjective, Transport } from "./useRunProgress";
import type { ResearchState } from "./state";
import { QUANTBT_ROOT } from "../features/quantbt/routes";
import { RunExitBar } from "./RunExitBar";
import { libraryHref } from "./runLinks";
import { runStatusWord, runTerminalState } from "./runTerminalState";
import { ResearchScopedAnchor } from "./ResearchScopedLink";
import { trialLabel, trialTitle } from "./trialLabel";
import { humanise } from "./humanise";
import { PageHeader } from "./PageHeader";
import { reasonCodeSentence, REFUSAL_COPY } from "./researchRefusal";

/* --------------------------------------------------------------- verbatim */

/* VD-TEXT-01: the HiFi subtitle under the title, the "rules of this screen"
   footer and the design notes in the console strip are gone — the screen
   shows its state, not a paragraph about itself. */

/** Transport labels: HiFi wording, the spec's 5 s floor (FE-S03-17). */
export const SSE_LIVE = "SSE streaming · poll floor 5s underneath";
export const SSE_POLL = "stream dropped · polling every 5s";
/** Live, stream closed (hidden tab, typed gap, reconnect pending): the floor still runs. */
export const SSE_RESTING = "stream closed · poll floor 5s underneath";
/** The run is final (COMPLETED / FAILED / CANCELLED, or the source's terminal frame landed). */
export const SSE_CLOSED = "stream closed at terminal frame";
/**
 * FG 03-T: a stream that never opened is not one that closed at a terminal
 * frame. Three more states, each worded for what is actually true of it.
 */
/** No read has landed yet, and none was refused: the page is still loading. */
export const SSE_WAITING = "no stream yet · waiting for the first read";
/** The run was cancelled before its source reported: no stream ever existed for it. */
export const SSE_NEVER_OPENED = "no stream · cancelled before the source reported";

/**
 * A refused read: the server answered and said no (or did not answer). The
 * status the server gave is on the label; it is never turned into a guess about
 * the run. Only used when nothing is carrying the page — a live stream, or a
 * poll floor that is still allowed to run, keeps its own label.
 */
export function sseRefused(refusal: Pick<ProgressRefusal, "status" | "state">): string {
  const code = refusal.status > 0 ? ` (${refusal.status})` : "";
  if (refusal.status === 0) return "no stream · the server did not answer";
  if (refusal.state === "denied") return `no stream · access refused${code}`;
  if (refusal.status === 409) return `no stream · read again to refresh${code}`;
  if (refusal.state === "unavailable" || refusal.state === "failed-retryable" || refusal.state === "stale") {
    return `no stream · server unavailable${code}`;
  }
  return `no stream · request refused${code}`;
}

export type TransportFaceState = "terminal" | "never-opened" | "waiting" | "refused" | Transport;

/**
 * Which words the transport indicator prints, and why (FG 03-T).
 *
 * Before this, `!live` printed "stream closed at terminal frame" for every
 * state with no live status — including a page that had not read anything yet
 * and a read the server refused with a 503, 409 or 400.
 *
 * Order matters: a final run is final whatever a later console read said; a
 * run that never had a source never had a terminal frame; a live run whose
 * transport is carrying keeps the transport's label; only a page with no read
 * (or whose floor is stopped by the refusal) says the read was refused.
 */
export function transportFace(input: {
  transport: Transport;
  /** Live per the screen: a live status and no source terminal frame. */
  live: boolean;
  status: EffectiveStatus | null;
  availability: ProgressRead["availability"] | null;
  sourceTerminal: boolean;
  refusal: Pick<ProgressRefusal, "status" | "state" | "mayRetry"> | null;
}): { state: TransportFaceState; label: string } {
  const { transport, live, status, availability, sourceTerminal, refusal } = input;
  const finalStatus = status === "COMPLETED" || status === "FAILED" || status === "CANCELLED";
  if (availability === "CANCELLED_BEFORE_SOURCE") return { state: "never-opened", label: SSE_NEVER_OPENED };
  if (finalStatus || sourceTerminal) return { state: "terminal", label: SSE_CLOSED };
  if (status === null) {
    return refusal === null
      ? { state: "waiting", label: SSE_WAITING }
      : { state: "refused", label: sseRefused(refusal) };
  }
  /* A read exists and the run is live. The poll floor stops on a refusal that cannot be retried. */
  if (refusal !== null && !refusal.mayRetry && transport !== "stream") {
    return { state: "refused", label: sseRefused(refusal) };
  }
  if (!live) return { state: "terminal", label: SSE_CLOSED };
  return {
    state: transport,
    label: transport === "stream" ? SSE_LIVE : transport === "poll" ? SSE_POLL : SSE_RESTING,
  };
}

export const NOT_ISSUED_NOTE = "the run failed before Stage 5 — no claim exists";

/** A run that ended without failing and without a claim, when the server gave no sentence. */
export const NO_CLAIM_NOTE = "This run ended without issuing a claim.";

export const OLDER_DROPPED = "· · · older lines dropped (kept server-side)";

/** P11 publishes no reader route; the contract pins `reader_href` to null. */
export const ARTIFACT_NO_READER = "reader route — not published";

/** Said once as a tooltip on the evidence-cursor label: what the cursor is for. */
export const EVIDENCE_CURSOR_TITLE =
  "Handed to Evidence Flow at completion — you land on the same fold you watched.";

/** Tooltip on the gantt title: what picking a fold does. */
export const GANTT_TITLE_HINT = "The evidence cursor follows the fold you pick (the running fold while live).";

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

/**
 * QA S03 U4: the header counts what the read carries, once. "9 of 9 reported"
 * above three compact detail rows read as a contradiction; a count that is
 * short of the declared total says so, one that matches is just the count.
 */
export function foldsMeta(reported: number, declared: number | null): string {
  if (declared === null || reported === declared) return `${reported} ${reported === 1 ? "fold" : "folds"}`;
  return `${reported} of ${declared} folds`;
}

type FoldReporting = NonNullable<ProgressRead["current"]["fold_reporting"]>;

/** Tooltip on the overall percentage when the server published its basis. */
export const PCT_BASIS_HINT =
  "Source stage-weighted percentage — not trial completion, and a terminal failure does not force 100%.";
/** Tooltip on the elapsed time when the server published its basis. */
export const ELAPSED_BASIS_HINT =
  "Source journal age at its last event — not CPU time, queue age or a browser timer.";

/**
 * The fold counts, kept apart: declared (admission), planned (admission plan)
 * and reported (what the source journal observed). A planned or declared fold
 * is never counted as an observed one, so a failed run that reported none does
 * not read "x of 9 folds". Every number is the server's; nothing is derived.
 */
export function foldReportingWords(fr: FoldReporting): { text: string; title: string } {
  const parts: string[] = [fr.reported_count === null ? "none reported" : `${fr.reported_count} reported`];
  if (fr.declared_count !== null) parts.push(`${fr.declared_count} declared`);
  if (fr.planned_count !== null && fr.planned_count !== fr.declared_count) parts.push(`${fr.planned_count} planned`);
  const title = [
    `declared ${fr.declared_count ?? "not published"} · planned ${fr.planned_count ?? "not published"} · reported ${fr.reported_count ?? "no source snapshot"}`,
    fr.reported_count === null ? null : `done ${fr.done_count ?? "not published"} · failed ${fr.failed_count ?? "not published"}`,
    fr.reason_code,
    "Declared and planned folds are admission facts; only reported folds were observed by the source journal.",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
  return { text: parts.join(" · "), title };
}

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
      {runStatusWord(status)}
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
function TransportDot({
  transport,
  live,
  face,
}: {
  transport: Transport;
  live: boolean;
  face: { state: TransportFaceState; label: string };
}) {
  const streaming = transport === "stream" && live && face.state === "stream";
  const label = face.label;
  const motion = streaming ? pulse("1.4s") : null;
  return (
    <span
      data-transport={transport}
      data-transport-state={face.state}
      title={label}
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
      {/* W4A: a stream that is over is a grey dot; the words ride in its tooltip. */}
      {face.state === "terminal" || face.state === "never-opened" ? <span className="sr-only">{label}</span> : label}
    </span>
  );
}

/* ------------------------------------------------------------ cursor links */

type StageCursorTarget = { screen: RunScreen; stage?: EvidenceCursor["stage"] };

/** A chip opens the stage's own screen where one exists, else the hub tab (W5 §3.6). */
function stageTarget(key: Stage["key"]): StageCursorTarget {
  switch (key) {
    case "S1":
      return { screen: "split" };
    case "S2":
      return { screen: "search" };
    case "S3":
      return { screen: "freeze" };
    case "S4":
      return { screen: "execute" };
    default:
      return { screen: "hub", stage: "claim" };
  }
}

/** The typed cursor of what this page holds; `null` when it names no fold (a bare link). */
function typedCursor(cursor: InspectionCursor): EvidenceCursor | null {
  const fold = Number(cursor.fold);
  if (!Number.isSafeInteger(fold) || fold < 1) return null;
  const trial = Number(cursor.trial);
  return { ...DEFAULT_CURSOR, fold, trial: Number.isSafeInteger(trial) && trial >= 1 ? trial : null, params: cursor.params ?? null };
}

function runHref(runId: string, screen: RunScreen, cursor: InspectionCursor, stage?: EvidenceCursor["stage"]): string {
  return runScreenHref(runId, screen, typedCursor(cursor), stage ? { stage } : undefined);
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
  handoff: HandoffTarget | null,
  claimCursor: InspectionCursor,
): InspectionCursor {
  const target = fold ?? handoff?.fold ?? null;
  if (target === null) return {};
  const selection = folds.find((f) => f.fold === target)?.selection ?? NOT_PUBLISHED_SELECTION;
  if (selection.state === "AVAILABLE" && selection.trial !== null && selection.params_digest !== null) {
    return { fold: String(target), trial: String(selection.trial), params: selection.params_digest };
  }
  if (handoff !== null && handoff.fold === target) {
    return { fold: String(target), trial: String(handoff.trial), params: handoff.params };
  }
  return {
    fold: String(target),
    ...(claimCursor.fold === String(target) && claimCursor.trial ? { trial: claimCursor.trial } : {}),
    ...(claimCursor.fold === String(target) && claimCursor.params ? { params: claimCursor.params } : {}),
  };
}

/**
 * E10: a FAILED run the Portal closed itself (lost lease, retry never
 * dispatched, terminal record unrecordable) has no source failure; its reason
 * is the server's typed `current.terminal_reason`, shown the same way.
 */
function controlFailure(read: ProgressRead | null): ProgressSnapshot["failure"] {
  const reason = read?.current.terminal_reason;
  return reason && reason.origin === "CONTROL" ? { code: reason.code, message: reason.message } : null;
}

/** Where a failed/cancelled run's one action goes: Screen 02 seeded from this run. */
export function newRunFromHref(runId: string): string {
  return `${QUANTBT_ROOT}/runs/new?from=${encodeURIComponent(runId)}`;
}

/* ---------------------------------------------------------------- stages */

/** E10: the server's `current.failed_at` — where a FAILED run stopped. */
type FailedAt = NonNullable<ProgressRead["current"]["failed_at"]>;

function StagePills({
  stages,
  claimState,
  runId,
  cursor,
  failedAt = null,
}: {
  stages: readonly Stage[];
  claimState: ProgressSnapshot["claim"]["state"];
  runId: string;
  cursor: InspectionCursor;
  failedAt?: FailedAt | null;
}) {
  return (
    <div data-stage-rail style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
      {stages.map((stage, index) => {
        const issued = stage.key === "S5" && claimState === "ISSUED";
        /* HiFi S01/S03: the failing stage is red. Where it is comes from the
           server (`current.failed_at`), never from a local guess. */
        const failed = failedAt?.stage === stage.key;
        const done = stage.state === "DONE" && !failed;
        const running = stage.state === "RUNNING" && !failed;
        const tone = failed
          ? { border: "var(--bad)", bg: "var(--bad-bg)", fg: "var(--bad)" }
          : issued
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
        const label = `${failed ? "✕ " : done || issued ? "✓ " : ""}${stage.key} ${STAGE_LABEL[stage.key]}`;
        const target = stageTarget(stage.key);
        const linked = done || issued;
        return (
          <span key={stage.key} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            {linked ? (
              <ResearchScopedAnchor
                data-stage={stage.key}
                data-stage-state={issued ? "ISSUED" : stage.state}
                href={runHref(runId, target.screen, cursor, target.stage)}
                aria-label={`Stage ${stage.key.slice(1)} ${STAGE_LABEL[stage.key]}`}
                style={style}
              >
                {label}
              </ResearchScopedAnchor>
            ) : (
              <span
                data-stage={stage.key}
                data-stage-state={failed ? "FAILED" : stage.state}
                data-motion={motion?.["data-motion"]}
                /* Not a control yet: focusable and announced as disabled rather
                   than silently inert (spec 03 §12). */
                aria-disabled="true"
                tabIndex={0}
                title={
                  failed
                    ? failedAt?.basis === "SOURCE_RUNNING_STAGE"
                      ? `Failed during this stage${failedAt.fold === null ? "" : ` at fold ${failedAt.fold}`}.`
                      : "Failed before this stage started."
                    : running
                      ? "Running — the deep dive opens when the stage completes."
                      : "Pending"
                }
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
function studyLabel(
  snapshot: ProgressSnapshot,
  foldCount: number | null,
  foldCountReason: string | null,
  foldReporting: FoldReporting | null = null,
  liveStudyScope = false,
): ReactNode {
  const scope = snapshot.folds.find((f) => (f.selection ?? NOT_PUBLISHED_SELECTION).state === "AVAILABLE")?.selection?.scope;
  /* A causal run: one study per outer fold. The counts are the server's reported/planned folds, never the declared
     range and never a trial ordinal. */
  if (scope === PER_FOLD_STUDY || liveStudyScope) {
    const planned = foldReporting?.planned_count ?? foldCount;
    const reported = foldReporting?.reported_count ?? snapshot.folds.length;
    return (
      <span data-study-scope={PER_FOLD_STUDY} title="One study per outer fold; counts are the source's reported and the admission plan's planned folds.">
        per-fold studies — {count(reported)} reported / {planned === null ? <NotPublished reason={foldCountReason} /> : `${count(planned)} planned`}
      </span>
    );
  }
  /* 03-M: an imported fixed profile ran no search either — never a per-fold "study N / M". */
  if (isFixedProfileScope(scope)) return "fixed profile — no search";
  const global = scope === "GLOBAL_STUDY" || (snapshot.folds.length === 0 && snapshot.overall.trials_done > 0);
  if (global) return foldCount === null ? "global — scores every fold" : `global — scores all ${count(foldCount)} folds`;
  const latest = snapshot.folds.length > 0 ? snapshot.folds[snapshot.folds.length - 1].fold : null;
  if (latest === null) return null;
  return (
    <>
      {latest} / {foldCount === null ? <NotPublished reason={foldCountReason} /> : count(foldCount)}
    </>
  );
}

/** QA S03: two decimals on screen; the served string rides in the tooltip and `data-rate`. */
function rateText(rate: string): string {
  const decimals = rate.split(".")[1]?.length ?? 0;
  const n = Number(rate);
  return decimals > 2 && Number.isFinite(n) ? n.toFixed(2) : rate;
}

function ProgressCard({
  snapshot,
  live,
  foldCount,
  foldCountReason,
  bestObjective = null,
  liveRate,
  status = null,
  failedAt = null,
  foldReporting = null,
  liveStudyScope = false,
}: {
  /** The server's fold counts (declared / planned / reported), when published. */
  foldReporting?: FoldReporting | null;
  /** A `PER_FOLD_STUDY` trial event was seen before any fold published its selection. */
  liveStudyScope?: boolean;
  snapshot: ProgressSnapshot;
  /** QA S03 U2: a FAILED run says where it stopped; it never reads as a run that got 80% of the way. */
  status?: EffectiveStatus | null;
  failedAt?: FailedAt | null;
  /** `trial_completed.rate_trials_per_s` from the stream: the server's decimal string, null, or undefined when no event carried it. */
  liveRate?: string | null;
  /** The study's live best objective, exact as the last trial event served it. */
  bestObjective?: LiveBestObjective | null;
  live: boolean;
  /** `run.declared_folds` from the progress read, when declared. */
  foldCount: number | null;
  /** CG-P10-04: the server's `declared_folds.reason_code` when the count is not declared. */
  foldCountReason: string | null;
}) {
  const { overall, budget } = snapshot;
  const pct = Math.max(0, Math.min(100, overall.pct));
  const failed = status === "FAILED";
  const budgetHot = budget.pct > 90;
  const budgetTone = budgetHot ? "var(--bad)" : "var(--role-holdout)";
  const barMotion = live ? pulse("2.4s") : null;
  const searchDone = snapshot.stages.find((s) => s.key === "S4")?.state === "DONE" || overall.trials_done >= overall.trials_declared;
  /* The server owns the ETA. Null means "not computable", said in words. */
  const eta =
    failed ? null : overall.eta_s !== null ? (
      formatDuration(overall.eta_s)
    ) : !live ? null : searchDone ? (
      <Absent what="search done" />
    ) : (
      <Absent />
    );
  const study = studyLabel(snapshot, foldCount, foldCountReason, foldReporting, liveStudyScope);
  /* S03: the source's cumulative GLOBAL-study throughput, exactly as served (a decimal string, never re-rounded). */
  const rate = liveRate !== undefined ? liveRate : (overall.rate_trials_per_s ?? null);

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
              background: failed ? "var(--bad)" : "linear-gradient(90deg, var(--viz-train), var(--accent))",
              transition: "width 400ms cubic-bezier(.2,0,.2,1)",
            }}
          />
          {/* Fold boundaries, only when the fold count is published, and never over a
              stage-weighted percentage: its bar is not a fold-by-fold scale. */}
          {foldCount !== null && foldCount > 1 && snapshot.overall.pct_basis === undefined
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
        <span
          data-progress-text
          data-pct-basis={overall.pct_basis}
          title={overall.pct_basis !== undefined ? PCT_BASIS_HINT : undefined}
          style={{ fontFamily: MONO, fontSize: 11, color: "var(--ink)", whiteSpace: "nowrap" }}
        >
          {count(overall.trials_done)} / {count(overall.trials_declared)} trials
          {failed ? (
            <span data-failed-at={failedAt?.stage ?? "unknown"} style={{ color: "var(--bad)" }}>
              {" · "}
              {failedAt ? `at ${failedAt.stage}` : "failed"}
            </span>
          ) : (
            ` · ${Math.round(pct)}%`
          )}
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
        {bestObjective !== null ? (
          <span
            data-best-objective={bestObjective.value ?? "not-published"}
            title={
              bestObjective.fold === null
                ? "best objective · global study"
                : `best objective · fold ${bestObjective.fold}${bestObjective.studyId !== undefined ? ` · study ${bestObjective.studyId}` : ""}`
            }
          >
            best{" "}
            <span style={{ color: "var(--ink)" }}>
              {/* Exact decimal string as served; the tqdm line carries its 3-place rendering. */}
              {bestObjective.value === null ? <NotPublished what="not published" /> : bestObjective.value}
            </span>
          </span>
        ) : null}
        <span data-elapsed data-elapsed-basis={overall.elapsed_basis} title={overall.elapsed_basis !== undefined ? ELAPSED_BASIS_HINT : undefined}>
          elapsed <span style={{ color: "var(--ink)" }}>{formatDuration(overall.elapsed_s) ?? <Absent />}</span>
        </span>
        {failed || eta === null ? null : (
          <span data-eta>
            {/* The server owns the ETA. A null one is absent, never computed. */}
            eta <span style={{ color: "var(--ink)" }}>{eta}</span>
          </span>
        )}
        <span data-rate={rate ?? "not-published"} title={`Source-observed global study trials per second, cumulative${rate === null ? "" : ` · ${rate}`}`}>
          rate{" "}
          {rate === null ? (
            <NotPublished what="not published" />
          ) : (
            <span style={{ color: "var(--ink)" }}>{rateText(rate)} trials/s</span>
          )}
        </span>
        {/* The server builds this string; the page does not reformat it. */}
        {live ? (
          <span data-tqdm style={{ color: "var(--ink-faint)" }}>
            {overall.tqdm_line}
          </span>
        ) : null}
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
export const COMPACT_FOLDS = 12;

interface FoldGanttProps {
  folds: ProgressSnapshot["folds"];
  cursor: number | null;
  onPick: (fold: number) => void;
  foldTrials: Readonly<Record<number, number>>;
  /** Native study/trial identity of per-fold-study trial events, by fold. */
  foldTrialIds?: Readonly<Record<number, FoldTrialIdentity>>;
  /** The run's structured hand-off cursor, once published. */
  handoff: HandoffTarget | null;
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

/** The scope word of a per-fold causal study: each outer fold ran its own study. */
const PER_FOLD_STUDY = "PER_FOLD_STUDY";

/**
 * What a `PER_FOLD_STUDY` fold says about its trial: the native `study_id` and `source_trial_id` as served
 * (each absent when not published) and the cumulative display ordinal, which is NOT a native trial id.
 * Null for every other scope, so global and fixed runs keep their wording.
 */
export interface PerFoldTrial {
  studyId: string | null;
  sourceTrialId: string | null;
  ordinal: number | null;
}

export function perFoldTrial(
  fold: ProgressSnapshot["folds"][number],
  foldTrialIds: Readonly<Record<number, FoldTrialIdentity>>,
): PerFoldTrial | null {
  const selection = fold.selection ?? NOT_PUBLISHED_SELECTION;
  if (fold.state !== "RUNNING" && selection.state === "AVAILABLE" && selection.scope === PER_FOLD_STUDY) {
    return { studyId: selection.study_id ?? null, sourceTrialId: selection.source_trial_id ?? null, ordinal: selection.trial };
  }
  const live = foldTrialIds[fold.fold];
  if (fold.state === "RUNNING" && live !== undefined) {
    return { studyId: live.studyId ?? null, sourceTrialId: live.sourceTrialId ?? null, ordinal: live.ordinal };
  }
  return null;
}

/** The tooltip of a per-fold trial: both native ids, and the ordinal said to be cumulative. */
export function perFoldTrialTitle(trial: PerFoldTrial): string {
  return [
    `study ${trial.studyId ?? "not published"}`,
    `source trial id ${trial.sourceTrialId ?? "not published"}`,
    trial.ordinal === null ? null : `display ordinal ${count(trial.ordinal)} is cumulative across studies, not a native trial id`,
  ]
    .filter((line): line is string => line !== null)
    .join(" · ");
}

/** `study s2 · trial 1` — both native ids visible, each `not published` when the source omitted it. */
function PerFoldTrialChip({ trial, suffix = "" }: { trial: PerFoldTrial; suffix?: string }) {
  return (
    <span data-per-fold-trial title={perFoldTrialTitle(trial)} data-study-id={trial.studyId ?? undefined} data-source-trial-id={trial.sourceTrialId ?? undefined}>
      study {trial.studyId ?? <Absent what="id not published" />} · source {trial.sourceTrialId ?? <Absent what="id not published" />}
      {suffix}
    </span>
  );
}

function foldNote(
  fold: ProgressSnapshot["folds"][number],
  foldTrials: Readonly<Record<number, number>>,
  handoff: HandoffTarget | null,
  claimCursor: InspectionCursor,
  foldTrialIds: Readonly<Record<number, FoldTrialIdentity>> = {},
): ReactNode {
  const perFold = perFoldTrial(fold, foldTrialIds);
  if (fold.state === "RUNNING") {
    if (perFold !== null) return <PerFoldTrialChip trial={perFold} suffix=" · running" />;
    const trial = foldTrials[fold.fold];
    return trial === undefined ? "running" : `${trialLabel({ ordinal: count(trial) })} · running`;
  }
  if (fold.state === "FAILED") return "failed";
  const selection = fold.selection ?? NOT_PUBLISHED_SELECTION;
  if (selection.state === "AVAILABLE" && selection.trial !== null && selection.params_digest !== null) {
    const objective =
      selection.objective === null
        ? "no search"
        : `${selection.scope === "GLOBAL_STUDY" ? "global " : ""}${selection.objective_kind === "INNER_VALIDATION_DECAY_J" ? "inner J" : "best J₁"} ${formatMetric(selection.objective, "ratio") ?? selection.objective}`;
    if (perFold !== null) {
      return (
        <span
          title={[selection.objective, selection.objective_kind, selection.params_digest, perFoldTrialTitle(perFold)].filter(Boolean).join(" · ")}
          data-fold-selection={selection.scope ?? undefined}
        >
          {objective} · <PerFoldTrialChip trial={perFold} /> · {paramsTag(selection.params_digest)}
        </span>
      );
    }
    return (
      <span
        title={[
          selection.objective,
          selection.params_digest,
          selection.source_trial_id !== undefined ? trialTitle : null,
        ]
          .filter(Boolean)
          .join(" · ")}
        data-fold-selection={selection.scope ?? undefined}
        data-source-trial-id={selection.source_trial_id}
      >
        {objective} · {trialLabel({ ordinal: count(selection.trial), sourceId: selection.source_trial_id })} · {paramsTag(selection.params_digest)}
      </span>
    );
  }
  if (handoff !== null && handoff.fold === fold.fold) {
    return `trial ${count(handoff.trial)} · ${paramsTag(handoff.params)}`;
  }
  if (claimCursor.fold === String(fold.fold) && (claimCursor.trial || claimCursor.params)) {
    return [claimCursor.trial ? `trial ${claimCursor.trial}` : null, claimCursor.params ?? null].filter(Boolean).join(" · ");
  }
  return <NotPublished reason={FOLD_SELECTION_NOT_PUBLISHED} what="selection not published" />;
}

/**
 * W4A: a global study selects one trial for every fold, so nine identical
 * `global best J₁ … · trial 351 · prm_…` notes say one thing nine times. When
 * every finished fold carries the same served global selection it is printed
 * once above the rows; a fold that differs keeps its own note.
 */
function sharedGlobalSelection(
  folds: ProgressSnapshot["folds"],
  foldTrialIds: Readonly<Record<number, FoldTrialIdentity>>,
): ProgressSnapshot["folds"][number] | null {
  const done = folds.filter((f) => f.state === "DONE");
  if (done.length < 3 || done.length !== folds.length) return null;
  const key = (f: ProgressSnapshot["folds"][number]) => {
    const sel = f.selection ?? NOT_PUBLISHED_SELECTION;
    if (sel.state !== "AVAILABLE" || sel.scope !== "GLOBAL_STUDY" || sel.trial === null || sel.params_digest === null) return null;
    if (perFoldTrial(f, foldTrialIds) !== null) return null;
    return [sel.objective, sel.objective_kind, sel.trial, sel.source_trial_id, sel.params_digest].join("|");
  };
  const first = key(done[0]);
  return first !== null && done.every((f) => key(f) === first) ? done[0] : null;
}

function FoldGantt({ folds, cursor, onPick, foldTrials, foldTrialIds, handoff, claimCursor }: FoldGanttProps) {
  const container = useRef<HTMLDivElement>(null);
  const shared = folds.length === 0 ? null : sharedGlobalSelection(folds, foldTrialIds ?? {});
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
          <div
            style={{ display: "flex", gap: 2, alignItems: "stretch", marginBottom: 4 }}
            data-gantt-cells
            title="One cell per fold — click one to inspect it; the rows below show the picked fold and its neighbours."
          >
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
                  aria-label={`fold ${fold.fold}, ${fold.state.toLowerCase()}`}
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
              title={timeline.state === "NOT_PUBLISHED" && !isRunning ? `per-fold timeline — not published · ${timeline.reason_code}` : undefined}
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
              {shared !== null ? null : foldNote(fold, foldTrials, handoff, claimCursor, foldTrialIds)}
            </span>
          </button>
        );
      })}
      {shared !== null ? (
        <p data-shared-selection style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)", margin: "2px 0 0", textAlign: "right" }}>
          {foldNote(shared, foldTrials, handoff, claimCursor, foldTrialIds)} · all folds
        </p>
      ) : null}
      {folds.some((f) => (f.fold_timeline ?? NOT_PUBLISHED_TIMELINE).state === "PARTIAL") ? (
        <p style={{ fontSize: 9.5, color: "var(--role-holdout)", margin: 0 }} data-timeline-partial title="Published segments only; gaps are not filled.">
          partial folds
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
  perFold = null,
  evidenceHref = null,
}: {
  fold: number | null;
  foldState: string | null;
  /** The evidence cursor for this fold, from published facts only. */
  cursor: InspectionCursor;
  liveTrial: number | undefined;
  /** A per-fold study names its trial by `study_id` + `source_trial_id`; the ordinal is then only a tooltip. */
  perFold?: PerFoldTrial | null;
  /** F2b: Evidence Flow on this exact fold, offered once the fold is done. */
  evidenceHref?: string | null;
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
      <span style={CARD_TITLE} title={EVIDENCE_CURSOR_TITLE}>
        evidence cursor
      </span>
      <span style={CHIP} data-cursor-fold>
        fold <span style={{ color: "var(--ink)" }}>{fold === null ? <Absent what="none yet" /> : fold}</span>
      </span>
      <span
        style={CHIP}
        data-cursor-trial
        title={perFold !== null ? perFoldTrialTitle(perFold) : "Trial number as the progress read serves it (selection.trial)"}
        data-study-id={perFold?.studyId ?? undefined}
        data-source-trial-id={perFold?.sourceTrialId ?? undefined}
      >
        {perFold !== null ? "study " : "trial "}
        {perFold !== null ? (
          <span style={{ color: "var(--ink)" }}>
            {perFold.studyId ?? <Absent what="id not published" />}
            {" · source "}
            {perFold.sourceTrialId ?? <Absent what="id not published" />}
          </span>
        ) : trial === null ? (
          <NotPublished reason="The progress read publishes no selected trial for this fold." />
        ) : (
          <span style={{ color: "var(--ink)" }}>{trial}</span>
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
      {evidenceHref !== null && fold !== null && foldState === "DONE" ? (
        <ResearchScopedAnchor
          data-action="open-fold-evidence"
          href={evidenceHref}
          aria-label={`open ${foldId(fold)} in Evidence Flow`}
          title={`Open ${foldId(fold)} in Evidence Flow`}
          style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: "var(--accent)" }}
        >
          evidence →
        </ResearchScopedAnchor>
      ) : null}
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

function artifactNote(artifact: Artifact, compact = false): ReactNode {
  if (artifact.state === "SEALED") {
    const bytes = artifact.size === null ? null : formatBytes(Number(artifact.size));
    const digest = shortDigest(artifact.digest);
    return (
      <span title={[artifact.size ? `${artifact.size} bytes` : null, artifact.digest].filter(Boolean).join(" · ")}>
        {bytes ?? artifact.size ?? <Absent what="size not reported" />}
        {/* W4A: Run Progress (compact) keeps the digest in the tooltip; the Evidence Flow manifest still prints it. */}
        {digest && !compact ? <> · sha256:{digest}…</> : null}
      </span>
    );
  }
  if (artifact.state === "WRITING") return "writing…";
  if (artifact.state === "ABORTED") return "aborted";
  return "pending";
}

/** A withheld artifact: named, counted, never linked (CG-P11-03). */
function DeniedRow({ artifact, compact = false }: { artifact: DeniedArtifact; compact?: boolean }) {
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
      <span style={{ flex: 1, minWidth: 0, color: "var(--ink-faint)", fontSize: 10 }} title={compact ? DENIED_HOLDOUT_NOTE : undefined}>
        {rows !== null ? `${rows} bars · ` : null}
        {compact ? "holdout sealed" : DENIED_HOLDOUT_NOTE}
      </span>
    </span>
  );
}

export function ArtifactsTable({ artifacts, denied = [], compact = false }: { artifacts: readonly Artifact[]; denied?: readonly DeniedArtifact[]; compact?: boolean }) {
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
              data-artifact-path
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
              data-artifact-state-cell
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
              <span title={artifact.state}>{humanise(artifact.state)}</span>
            </span>
            <span data-artifact-note style={{ flex: 1, minWidth: 0, color: "var(--ink-faint)", fontSize: 10 }}>{artifactNote(artifact, compact)}</span>
          </span>
        );
      })}
      {denied.map((artifact) => (
        <DeniedRow key={artifact.name} artifact={artifact} compact={compact} />
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
/** W4A: lines a finished run's console prints before "show all (N)". */
export const CONSOLE_TAIL = 10;

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
  error = null,
  onRetry,
}: {
  /** QA S03: a console read that failed is an outage, never "nothing was published". */
  error?: ProgressRefusal | null;
  onRetry?: () => void;
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
  const allVisible = lines.filter(keep);
  const allHistory = olderLines.filter(keep);
  /* W4A: a finished run's log is a record, not a stream — print its last lines and offer the rest. */
  const [showAll, setShowAll] = useState(false);
  const total = allVisible.length + allHistory.length;
  const collapsed = !live && !connecting && !showAll && total > CONSOLE_TAIL;
  const visible = collapsed ? allVisible.slice(-CONSOLE_TAIL) : allVisible;
  const history = collapsed ? allHistory.slice(Math.max(0, allHistory.length - Math.max(0, CONSOLE_TAIL - allVisible.length))) : allHistory;

  /* Auto-scroll sets `scrollTop` directly — `scrollIntoView` moves the page,
     not just the box (spec 03 pitfall 4). */
  useEffect(() => {
    if (!follow || !box.current) return;
    box.current.scrollTop = box.current.scrollHeight;
  }, [follow, visible.length, history.length]);

  const empty =
    visible.length === 0 && history.length === 0
      ? filter === "errors"
        ? "No errors or warnings in this log."
        : filter === "fold"
          ? `No line for fold ${foldFilter ?? ""}.`.replace(" .", ".")
          : error !== null
            ? error.state === "denied"
              ? REFUSAL_COPY.denied
              : "The console did not load."
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
      tabIndex={0}
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
        border: "1px solid var(--console-faint)",
        borderRadius: 8,
        background: "var(--console-bg)",
        padding: "12px 16px",
        fontFamily: MONO,
        fontSize: 10.5,
        lineHeight: 1.75,
        color: "var(--console-fg)",
      }}
    >
      {!live && !connecting && total > CONSOLE_TAIL ? (
        <button
          type="button"
          data-action="console-show-all"
          aria-expanded={!collapsed}
          onClick={() => setShowAll(!showAll)}
          title={collapsed ? `Showing the last ${CONSOLE_TAIL} of ${total} lines.` : `Showing all ${total} lines.`}
          style={{
            display: "block",
            border: "1px solid var(--console-faint)",
            borderRadius: 999,
            background: "transparent",
            color: "var(--console-accent)",
            fontFamily: MONO,
            fontSize: 10,
            padding: "1px 10px",
            marginBottom: 6,
            cursor: "pointer",
          }}
        >
          {collapsed ? `show all (${total})` : `show last ${CONSOLE_TAIL}`}
        </button>
      ) : null}
      {history.length > 0 ? (
        <div data-console-history>
          {history.map((line) => (
            <div key={line.sequence} data-history-line={line.sequence} style={{ color: "var(--console-faint)", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {consoleStamp(line)} {line.text}
            </div>
          ))}
        </div>
      ) : null}
      {dropped && !collapsed ? (
        <div style={{ color: "var(--console-faint)" }} data-older-dropped>
          {OLDER_DROPPED}
        </div>
      ) : null}
      {empty !== null ? (
        <div style={{ color: "var(--console-faint)" }} data-console-empty data-console-error={error !== null ? error.state : undefined}>
          {empty}
          {error !== null && error.mayRetry && onRetry ? (
            <>
              {" "}
              <button
                type="button"
                data-action="retry-console"
                onClick={onRetry}
                style={{
                  border: "1px solid var(--console-faint)",
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--console-fg)",
                  fontFamily: MONO,
                  fontSize: 10,
                  padding: "1px 10px",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </>
          ) : null}
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
            border: "1px solid var(--console-accent)",
            borderRadius: 999,
            background: "var(--console-bg)",
            color: "var(--console-accent)",
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

/** QA S03: the short word a methodology claim's kind prints as. */
const CLAIM_KIND_LABEL: Record<MethodologyClaim["kind"], string> = {
  VALIDATION: "validation",
  CHRONOLOGY: "chronology",
  CAUSALITY: "causality",
  OOS_SELECTION: "OOS selection",
  HOLDOUT_STATE: "holdout",
  EXECUTION_CONTRACT: "execution",
  RUNTIME_AUTHORITY: "runtime",
};

/**
 * The run-scoped methodology facts the read serves (`progress.claims[]`).
 * An ISSUED one is a sealed QuantBT fact and prints as its served text; a
 * FORECAST one is dashed; an absent or inapplicable one says so with the
 * server's reason code in the tooltip — never a blank, never a 0.
 */
export function MethodologyClaims({ claims }: { claims: readonly MethodologyClaim[] }) {
  return (
    <span data-claims style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {claims.map((claim) => {
        const label = CLAIM_KIND_LABEL[claim.kind];
        const text = claim.text;
        const issued = claim.state === "ISSUED";
        const forecast = claim.state === "FORECAST";
        return (
          <span
            key={claim.kind}
            data-claim-kind={claim.kind}
            data-claim-state={claim.state}
            title={
              text !== null
                ? `${label} · ${text} · ${issued ? "sealed by QuantBT" : "forecast from the mode schedule"}`
                : `${label} · ${claim.state === "NOT_APPLICABLE" ? "not applicable" : "not published"} · ${claim.reason_code}`
            }
            style={{
              ...CHIP,
              borderStyle: forecast || text === null ? "dashed" : "solid",
              borderColor: issued ? "var(--good)" : "var(--viz-legend-inactive)",
              fontStyle: forecast || text === null ? "italic" : undefined,
            }}
          >
            <span style={{ color: "var(--ink-faint)" }}>{label}</span>{" "}
            <span style={{ color: issued ? "var(--ink)" : "var(--ink-faint)" }}>
              {text !== null ? humanise(text) : claim.state === "NOT_APPLICABLE" ? "n/a here" : "not published"}
            </span>
          </span>
        );
      })}
    </span>
  );
}

function ClaimPassport({
  claim,
  claims,
  status,
  sealed,
  failure,
  failedAt = null,
  readiness,
  handoffHref,
  handoffLabel,
  engineVersion,
}: {
  claim: ProgressSnapshot["claim"];
  /** `progress.claims[]`: the four methodology facts, when the read carries them. */
  claims?: readonly MethodologyClaim[];
  status: EffectiveStatus | null;
  sealed: boolean;
  failure: ProgressSnapshot["failure"];
  failedAt?: FailedAt | null;
  readiness: ProgressSnapshot["readiness"];
  handoffHref: string;
  /** `fold 2 · trial 1`, when the cursor names them (spec 03 §8). */
  handoffLabel: string | null;
  engineVersion: string | null;
}) {
  const issued = claim.state === "ISSUED";
  const forecast = claim.state === "FORECAST";
  const certificate = claim.methodology_certificate ?? NOT_PUBLISHED_CERTIFICATE;
  const sealedFacts = (claims ?? []).filter((c) => c.state === "ISSUED").length;
  const tone = passportTone(claim, status);
  /* QA S03: a run whose release claim is not issued but whose methodology facts are sealed says so, not "not issued". */
  const stateWord = issued
    ? "issued"
    : forecast
      ? "forecast"
      : sealedFacts > 0
        ? `${sealedFacts} ${sealedFacts === 1 ? "fact" : "facts"} sealed`
        : "not issued";
  const head = !issued && !forecast && sealedFacts > 0 && status !== "FAILED" ? "var(--good)" : tone.head;
  /* The not-issued fact is said once, in the header; the server's sentence rides in its tooltip. */
  const note = issued
    ? engineVersion
      ? `issued by engine ${engineVersion} at COMPLETED — now authoritative`
      : "issued by the engine at COMPLETED — now authoritative"
    : forecast
      ? "computed from mode × schedule in the config; issued only when the engine completes"
      : null;
  const textKind = issued ? "issued" : "forecast";
  /* F2b: a note longer than a short phrase rides in the badge's tooltip. */
  const noteIsLong = note !== null && note.split(/\s+/).length > 8;
  const notIssued = claim.state === "NOT_ISSUED";
  const badgeTitle = noteIsLong ? (note ?? undefined) : notIssued ? notIssuedText(claim.text, status) : undefined;
  const failureSentence =
    failure === null
      ? null
      : failure.message.trim() !== ""
        ? failure.message
        : (reasonCodeSentence(failure.code) ?? "The run failed before it could seal its evidence.");

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
          title={badgeTitle}
          style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", fontWeight: 600, color: head }}
        >
          claim passport — {stateWord}
        </span>
        {note === null || noteIsLong ? null : <span style={{ fontSize: 10.5, color: "var(--ink-faint)" }}>{note}</span>}
        {sealed ? (
          <ResearchScopedAnchor
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
          </ResearchScopedAnchor>
        ) : null}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 24px", padding: "10px 14px" }}>
        {notIssued ? null : (
          <Field label="claim" name="claim">
            {/* The server builds this sentence for every state; the page never
                composes a claim string of its own. */}
            <span style={valueStyle(textKind)} data-claim-text>
              {claim.text}
            </span>
          </Field>
        )}
        {!(notIssued && (status === "FAILED" || status === "CANCELLED")) && claims !== undefined && claims.length > 0 ? (
          <Field label="claims" name="claims">
            <MethodologyClaims claims={claims} />
          </Field>
        ) : null}
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
            <span
              aria-hidden="true"
              data-readiness-dot={sealed ? "sealed" : "open"}
              style={{
                display: "inline-block",
                width: 7,
                height: 7,
                borderRadius: "50%",
                marginRight: 6,
                background: sealed ? "var(--good)" : "var(--viz-legend-inactive)",
              }}
            />
            <span title={`mandatory ${humanise(readiness.mandatory)} · optional ${humanise(readiness.optional)}`}>
              {sealed ? "sealed" : humanise(readiness.mandatory)}
            </span>
          </span>
        </Field>
        {issued && claim.cursor !== null ? (
          <Field label="claim cursor" name="cursor">
            <span style={valueStyle("issued")} data-claim-cursor>
              {claim.cursor}
            </span>
          </Field>
        ) : null}
        {failure !== null ? (
          <Field label="failure" name="failure">
            <span role="alert" style={valueStyle("bad")} data-failure={failure.code} title={`${failure.code}${failure.message ? ` — ${failure.message}` : ""}`}>
              {/* W4A: where it stopped, then the server's own sentence once; the code is the tooltip. */}
              {failedAt ? `failed at ${failedAt.stage} ${STAGE_LABEL[failedAt.stage]} — ` : ""}
              {failureSentence}
            </span>
          </Field>
        ) : null}
      </div>
    </section>
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
function StateNotice({ state, onRetry, retrying = false, forceRetry = false }: { state: ResearchState; onRetry?: () => void; retrying?: boolean; forceRetry?: boolean }) {
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
        <span style={{ fontFamily: MONO, fontSize: 10, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--ink-faint)" }} title={STATE_WORD[state.state] ? state.state : undefined}>
          {STATE_WORD[state.state] ?? state.state}
        </span>
        {state.reason ? <span style={{ fontSize: 11.5, color: "var(--ink-soft)" }}>{state.reason}</span> : null}
      </span>
      {(state.mayRetry || forceRetry) && onRetry ? (
        <button
          type="button"
          data-action="retry"
          disabled={retrying}
          onClick={onRetry}
          style={{
            marginLeft: "auto",
            alignSelf: "center",
            border: "1px solid var(--accent)",
            borderRadius: 6,
            background: "var(--paper-raised)",
            color: "var(--accent)",
            padding: "3px 12px",
            fontFamily: MONO,
            fontSize: 10,
            letterSpacing: ".05em",
            textTransform: "uppercase",
            cursor: retrying ? "progress" : "pointer",
          }}
        >
          {retrying ? "retrying…" : "Retry"}
        </button>
      ) : null}
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
  hint,
  meta,
  name,
  children,
  style,
  gap = 6,
}: {
  title: string;
  /** Long rule text lives in a tooltip, never in the flow (VD-TEXT-01). */
  hint?: string;
  meta?: ReactNode;
  name: string;
  children: ReactNode;
  style?: CSSProperties;
  gap?: number;
}) {
  return (
    <section data-research-panel={name} aria-label={name} style={{ ...CARD, gap, ...style }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <h2 style={{ ...CARD_TITLE, margin: 0 }} title={hint}>
          {title}
        </h2>
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
  title,
  right,
  next,
  children,
}: {
  title: string;
  right?: ReactNode;
  /** F2b: where this run goes next — Evidence Flow, on the cursor this page already holds. */
  next?: { href: string; label: string; title: string };
  children?: ReactNode;
}) {
  /* W4A: one h1, `← Library · Evidence Flow →`, no crumb — the top bar already shows the path. */
  return (
    <PageHeader
      title={title}
      prev={{ label: "Library", href: libraryHref() }}
      next={next ? { label: "Evidence Flow", href: next.href } : undefined}
      copy
    >
      {right || children ? (
        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 14px" }}>
          {right}
          {children}
        </div>
      ) : null}
    </PageHeader>
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
      <ResearchScopedAnchor
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
      </ResearchScopedAnchor>
    );
  }
  return (
    <span style={{ fontFamily: MONO, fontSize: 10, color: "var(--ink-faint)" }} data-retry-reason>
      {from ? NEW_RUN_FROM_UNAVAILABLE : "this release does not offer retry from Run Progress"}
    </span>
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
  /** `trial_completed.best_objective` as the last event served it. */
  bestObjective?: LiveBestObjective | null;
  /** `trial_completed.rate_trials_per_s` as the last event served it (undefined = no event carried it). */
  liveRate?: string | null;
  /** The server's answer to this view's cancel request. */
  cancelResult?: CancelResponse | null;
  refusal?: ProgressRefusal | null;
  foldTrials?: Readonly<Record<number, number>>;
  /** Per-fold-study identity (`study_id`, `source_trial_id`) of the latest trial event of each fold. */
  foldTrialIds?: Readonly<Record<number, FoldTrialIdentity>>;
  /** QA S03: read again after a failed read. Absent = no Retry is drawn. */
  onRetry?: () => void;
  retrying?: boolean;
  /** The console page's own refusal (an outage there is not a page-wide failure). */
  consoleRefusal?: ProgressRefusal | null;
  onRetryConsole?: () => void;
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
    bestObjective = null,
    liveRate,
    cancelResult = null,
    refusal = null,
    foldTrials = {},
    foldTrialIds = {},
    onRetry,
    retrying = false,
    consoleRefusal = null,
    onRetryConsole,
  } = props;
  /* D1: the heading names the run as every other screen does — the server's label when a read published one. */
  const runLabel = useRunLabel(runId);

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
  /* FG 03-T: the transport words follow what is true of the transport — not-yet-read,
     refused and final are three different states (see `transportFace`). */
  const face = transportFace({
    transport,
    live,
    status,
    availability: read?.availability ?? null,
    sourceTerminal,
    refusal,
  });
  /* Completion is the source's seal and nothing else. */
  const sealed = snapshot?.readiness.mandatory === "SEALED";
  /* CG-P11-03: identity and the declared fold count come with the read. */
  const identity = read === null ? undefined : (read.run ?? null);
  const declared = identity?.declared_folds;
  const foldCount = declared?.state === "DECLARED" ? declared.count : null;
  /* The server's own code for an undeclared count; nothing is worded here. */
  const foldCountReason = declared?.state === "NOT_PUBLISHED" ? declared.reason_code : null;
  const engineVersion = identity?.engine_release_id ?? null;
  /* Published only by newer servers; absent keeps the older "x of N folds" header. */
  const foldReporting = read?.current.fold_reporting ?? null;

  const noSource = read !== null && snapshot === null && (read.availability === "QUEUED_NO_SOURCE" || read.availability === "CANCELLED_BEFORE_SOURCE");
  const statusSlot =
    status !== null ? (
      <>
        <StatusChip status={status} live={live} />
        {/* QA S03: on a run that never had a source the card says it once; the chip would say it twice. */}
        {read?.current.terminal_resolution === "CONTROL_CANCELLATION" && !noSource ? (
          <span
            data-terminal-resolution
            style={{ fontFamily: MONO, fontSize: 10, color: "var(--accent-2)", border: "1px solid var(--accent-2)", borderRadius: 3, padding: "0 5px" }}
          >
            resolved by cancellation
          </span>
        ) : null}
        {cancelResult !== null ? (
          <span
            data-cancel-marker={cancelResult.source_marker}
            data-cancel-status={cancelResult.status}
            aria-label={`cancel ${cancelResult.status}, source ${cancelResult.source_marker}`}
            title={`cancel ${cancelResult.status}`}
            style={{ fontFamily: MONO, fontSize: 10, color: "var(--accent-2)", border: "1px solid var(--accent-2)", borderRadius: 3, padding: "0 5px" }}
          >
            {cancelResult.source_marker}
          </span>
        ) : null}
      </>
    ) : null;

  /* ------------------------------------------------ run not found (404) */
  if (refusal?.notFound || (read === null && state.state === "empty")) {
    return (
      <div data-screen="run-progress" data-run-not-found style={ROOT}>
        <Header title="Run not available" />
        <section style={{ ...CARD, gap: 8 }}>
          <RunExitBar runId={runId} state={runTerminalState({ status: null, read: "not-found" })} />
        </section>
      </div>
    );
  }

  /* --------------------------------------------- run without a source */
  if (read && snapshot === null && (read.availability === "QUEUED_NO_SOURCE" || read.availability === "CANCELLED_BEFORE_SOURCE")) {
    const queued = read.availability === "QUEUED_NO_SOURCE";
    const noSourceState = runTerminalState({ status: queued ? "QUEUED" : "CANCELLED", read: "ok" });
    return (
      <div data-screen="run-progress" data-no-source={read.availability} style={ROOT}>
        <Header
          title={`${queued ? "Run queued" : "Run cancelled"} — ${runLabel ?? shortId(runId)}`}
          right={face.state === "never-opened" ? undefined : <TransportDot transport={transport} live={live} face={face} />}
        />
        <RunMetaStrip runId={runId} identity={identity} status={statusSlot} />
        <section style={{ ...CARD, gap: 8 }} data-run-phase={noSourceState.phase}>
          <h2
            style={{ ...CARD_TITLE, margin: 0 }}
            title={
              queued
                ? "The run is queued; no source progress has been published yet. This page updates on its own when a worker claims it."
                : "The run was cancelled before source progress began. No progress, artifact or claim exists for it."
            }
            aria-label={noSourceState.tip ?? undefined}
          >
            {noSourceState.banner}
          </h2>
          {read.current.terminal_materialization === "PENDING" && !queued ? (
            <span data-terminal-materialization style={{ fontSize: 10.5, color: "var(--ink-faint)" }} title="The cancellation is recorded; its terminal record is still being written.">
              writing terminal record…
            </span>
          ) : null}
          {queued || (read.attempts?.length ?? 0) > 0 ? <ServedAttempts queue={read.queue} attempts={read.attempts} open /> : null}
          {!queued ? (
            <span style={{ alignSelf: "flex-start" }}>
              <NewRunFrom runId={runId} read={read} />
            </span>
          ) : null}
          <RunExitBar runId={runId} state={{ ...noSourceState, banner: null }} hide={["progress", "new-run"]} />
        </section>
      </div>
    );
  }

  /* ----------------------------------------------------- full screen */
  const content = state.state === "available" || state.retainsContent;
  /* QA S03: "connecting" is only true while nothing has answered — a refused first read has stopped loading. */
  const connecting = read === null && refusal === null;
  const firstReadFailed = read === null && refusal !== null;
  const claimCursor = snapshot?.claim.cursor ? decodeInspectionCursor(snapshot.claim.cursor).cursor : {};
  const folds = snapshot?.folds ?? [];
  const handoff = cursorForHandoff(read);
  const cursor = evidenceCursor(foldCursor, folds, handoff, claimCursor);
  const handoffHref = runHref(runId, "hub", cursor, "summary");
  const handoffLabel = cursor.fold && cursor.trial ? `fold ${cursor.fold} · trial ${cursor.trial}` : null;
  const cursorFold = folds.find((f) => f.fold === foldCursor) ?? null;
  const terminalStatus = status === "FAILED" || status === "CANCELLED";
  const stateWord = status === "COMPLETED" || status === "FAILED" || status === "CANCELLED" ? `Run ${runStatusWord(status)}` : "Run progress";
  /* No read, no label: the heading never falls back to a raw id as prose. */
  const title = read === null && !runLabel ? stateWord : `${stateWord} — ${runLabel ?? shortId(runId)}`;
  const hasFoldLines = lines.length === 0 || lines.some((line) => line.fold !== null && line.fold !== undefined) || olderLines.some((line) => line.fold !== null && line.fold !== undefined);
  /* The next stage is only offered where there is something sealed to open. */
  const offerNext = read !== null && (!terminalStatus || sealed);

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
      <Header
        title={title}
        right={<TransportDot transport={transport} live={live} face={face} />}
        next={
          offerNext
            ? {
                href: handoffHref,
                label: "next: Evidence Flow →",
                title: handoffLabel ? `Opens Evidence Flow at ${handoffLabel}` : "Opens Evidence Flow on this run",
              }
            : undefined
        }
      >
        {read?.availability === "PENDING_SOURCE_CALLBACK" ? (
          <p style={{ fontSize: 10.5, color: "var(--role-holdout)", margin: 0 }} data-pending-source title="The run exists. Waiting for its source to report progress.">
            waiting for the source
          </p>
        ) : null}
        {snapshot?.source.partial ? (
          <p style={{ fontSize: 10.5, color: "var(--role-holdout)", margin: 0 }} data-source-partial>
            The source reports this projection as partial.
          </p>
        ) : null}
        {status !== null && !live && read?.current.terminal_materialization === "PENDING" ? (
          <p style={{ fontSize: 10.5, color: "var(--ink-faint)", margin: 0 }} data-terminal-materialization title="The run is final; its terminal record is still being written.">
            writing terminal record…
          </p>
        ) : null}
      </Header>

      {/* QA S03 NEW-3: a refused first read has no identity to wait for; the short id is in the breadcrumb once. */}
      {firstReadFailed ? null : <RunMetaStrip runId={runId} identity={identity} status={statusSlot} panel omitRunStatus />}
      {read && (read.queue || (read.attempts?.length ?? 0) > 0) ? (
        <ServedAttempts queue={read.queue} attempts={read.attempts} />
      ) : null}

      {/* Partial source and pending callback already speak in the header. */}
      {state.state !== "available" &&
      !(state.state === "partial" && (snapshot?.source.partial || read?.availability === "PENDING_SOURCE_CALLBACK")) ? (
        <StateNotice state={state} onRetry={onRetry} retrying={retrying} forceRetry={refusal?.status === 409} />
      ) : null}

      {firstReadFailed ? null : (
      <>
      {/* 1 · claim passport (HiFi: first card, FE-S03-16). */}
      {content && snapshot ? (
        <ClaimPassport
          claim={snapshot.claim}
          claims={read?.claims}
          status={status}
          sealed={sealed}
          failedAt={read?.current.failed_at ?? null}
          failure={snapshot.failure ?? controlFailure(read)}
          readiness={snapshot.readiness}
          handoffHref={handoffHref}
          handoffLabel={handoffLabel}
          engineVersion={engineVersion}
        />
      ) : (
        <section data-research-panel="claim" style={{ ...CARD, borderStyle: "dashed", borderColor: "var(--viz-legend-inactive)" }}>
          <h2 style={{ ...CARD_TITLE, margin: 0, color: "var(--accent-2)" }}>claim passport</h2>
          {connecting ? <Skeleton height={40} /> : null}
        </section>
      )}

      {/* 2 · stage pills, overall, budget. */}
      <section data-research-panel="progress" aria-label="progress" style={{ ...CARD, gap: 8 }}>
        {content && snapshot ? (
          <>
            <StagePills
              stages={snapshot.stages}
              claimState={snapshot.claim.state}
              runId={runId}
              cursor={cursor}
              failedAt={read?.current.failed_at ?? null}
            />
            <ProgressCard
              snapshot={snapshot}
              live={live}
              foldCount={foldCount}
              foldCountReason={foldCountReason}
              foldReporting={foldReporting}
              liveStudyScope={Object.keys(foldTrialIds).length > 0}
              bestObjective={bestObjective}
              liveRate={liveRate}
              status={status}
              failedAt={read?.current.failed_at ?? null}
            />
          </>
        ) : (
          <Skeleton height={86} />
        )}
      </section>

      {/* 3 · Gantt beside the artifact manifest (FE-S03-16). */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Card
          name="folds"
          title={live ? "fold gantt · live" : "fold gantt"}
          hint={GANTT_TITLE_HINT}
          meta={
            snapshot
              ? foldReporting
                ? (() => {
                    const words = foldReportingWords(foldReporting);
                    return (
                      <span data-fold-reporting={foldReporting.basis} title={words.title}>
                        {words.text}
                      </span>
                    );
                  })()
                : foldsMeta(folds.length, foldCount)
              : undefined
          }
          style={{ flex: "1.15 1 0", minWidth: "min(460px, 100%)" }}
        >
          {content && snapshot ? (
            <>
              {identity ? <PlannedWindows planned={identity.planned_folds} observed={folds} /> : null}
              <FoldGantt
                folds={folds}
                cursor={foldCursor}
                onPick={onPinFold}
                foldTrials={foldTrials}
                foldTrialIds={foldTrialIds}
                handoff={handoff}
                claimCursor={claimCursor}
              />
              <CursorRow
                fold={foldCursor}
                foldState={cursorFold?.state ?? null}
                cursor={cursor}
                liveTrial={foldCursor !== null && cursorFold?.state === "RUNNING" ? foldTrials[foldCursor] : undefined}
                perFold={cursorFold ? perFoldTrial(cursorFold, foldTrialIds) : null}
                evidenceHref={handoffHref}
              />
            </>
          ) : (
            <Skeleton height={86} />
          )}
        </Card>

        <Card
          name="artifacts"
          title="artifacts"
          hint={ARTIFACT_NO_READER}
          meta={
            snapshot?.mandatory_bundle ? (
              <span title={`${snapshot.mandatory_bundle.size} bytes · ${snapshot.mandatory_bundle.digest}`}>
                bundle {formatBytes(Number(snapshot.mandatory_bundle.size)) ?? snapshot.mandatory_bundle.size} · sha256:
                {shortDigest(snapshot.mandatory_bundle.digest)}…
              </span>
            ) : undefined
          }
          style={{ flex: "1 1 0", minWidth: "min(380px, 100%)" }}
          gap={5}
        >
          {content && snapshot ? (
            <>
              <ArtifactsTable artifacts={snapshot.artifacts} denied={read?.denied_artifacts ?? []} compact />
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
        {tab === "live" ? (
          <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
            {chip("all", "all")}
            {/* QA S03 U5: a global study's lines carry no fold, so the chip would filter to nothing. */}
            {hasFoldLines ? chip("fold", foldCursor === null ? "fold" : `fold ${foldCursor}`, foldCursor === null) : null}
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
          {read !== null && terminalStatus ? (
            <ResearchScopedAnchor href={libraryHref()} data-exit="library" style={{ fontFamily: MONO, fontSize: 10 }}>
              Library
            </ResearchScopedAnchor>
          ) : null}
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
          error={consoleRefusal}
          onRetry={onRetryConsole}
        />
      ) : (
        <StageLedger
          folds={folds}
          foldTrials={foldTrials}
          cursor={foldCursor}
          studyTrials={snapshot ? { done: snapshot.overall.trials_done, declared: snapshot.overall.trials_declared } : null}
        />
      )}

      </>
      )}

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
