/**
 * Screen 04 — Evidence Flow hub (P13 + RS-02).
 *
 * One hub, one cursor, seven tabs. The composition is the hi-fi's; what fills
 * it is only what the two generated contracts publish, and every panel the
 * source does not answer keeps its frame and says which kind of silence it is
 * (DQ-14).
 *
 * Numbers arrive as exact decimal strings. A tile shows them rounded by unit
 * (DQ-08: currency 2 dp grouped, a fraction as a percentage with 2 dp, a count
 * as an integer) and keeps the server's exact string in its title and in what
 * the reader copies. Nothing here recomputes a certificate from stage caps, a
 * return from an equity curve or a month from a day.
 *
 * The chart library lives in `EvidenceCharts.tsx` behind `React.lazy`, so the
 * route paints strip, header and tabs before ECharts is fetched (spec 04 §11).
 */

import { Component, lazy, Suspense, useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { usePresentation } from "../app/presentation";
import { RefusalNote, ResearchPanel } from "./ResearchPanel";
import {
  SERIES_POINT_CAP,
  WITHHELD_WORDS,
  isAvailable,
  unavailableReason,
  type Availability,
  type CurrentSourceClaimFact,
  type CurrentSourceClaimStrip,
  type CurrentSourceEvidence,
  type CurrentSourceEvidenceSeries,
  type CurrentSourceFoldVerdicts,
  type CurrentSourceNotApplicable,
  type EquityPoint,
  type FoldBoundary,
  type EvidenceHub,
  type EvidenceRefusal,
  type EvidenceSeries,
  type FoldNavigation,
  type Lifecycle,
  type Metric,
  type MonthlyReturnPoint,
  type OosPerformance,
  type PerformanceMetric,
  type RetainedSeriesKind,
  type SeriesKind,
} from "./evidenceClient";
import {
  EVIDENCE_STAGES,
  deepDiveHref,
  type EvidenceCursor,
  type EvidenceStage,
} from "./evidenceCursor";
import { CURRENT_SOURCE_LANE_COPY, reasonCodeSentence, refusalDetail } from "./researchRefusal";
import { formatMetric, shortDigest } from "./researchFormat";
import type { PassportSlot, RetainedSeriesSlot, SeriesSlot } from "./useEvidence";
import { isRetainedAnswer, retainedReadiness, type RunIdentitySlot } from "./retainedLane";
import type { ResearchState } from "./state";

/* The chart chunk. Five entry points, one module, fetched once. */
const EquityChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.EquityChart })));
const DrawdownChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.DrawdownChart })));
const RollingChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.RollingChart })));
const RollingSharpeChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.RollingSharpeChart })));
const DistributionChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.DistributionChart })));

/**
 * A UTC instant the way the HiFi writes one that carries a time:
 * `2026-08-12 04:18Z`. (The chart chunk has its own copy so this route chunk
 * does not import it.)
 */
function utcZ(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return "";
  const iso = new Date(ms).toISOString();
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}Z`;
}

/* --------------------------------------------------------------- verbatim */

/** Spec 04 §9 — the sentences that must not be paraphrased. */
export const CERT_TOOLTIP = "min of stage caps — S1 holdout seal binds";
export const WINDOW_DISCLOSURE =
  "headline = OOS only — IS and holdout never enter the headline row.";
export const DRAWER_FOOTER =
  "identity pinned at submit — the run read exactly this snapshot; Data Catalog module is SOON.";
export const COPY_LINK_IDLE = "copy evidence link";
export const COPY_LINK_DONE = "✓ evidence link copied";
/** Spec 04 §28. */
export const CHART_ENGINE_UNAVAILABLE = "chart engine unavailable — numbers unaffected";

/** Why a chart may be smaller than the run that produced it. */
export const SAMPLING_NOTE =
  "a chart is a bounded view of the source series; sampling changes the picture, never a metric above it.";

/** HiFi tab grammar: glyph or stage number, uppercase name. */
const STAGE_TAB: Record<EvidenceStage, { num: string; name: string }> = {
  summary: { num: "◈", name: "Summary" },
  split: { num: "S1", name: "Split" },
  search: { num: "S2", name: "Search" },
  freeze: { num: "S3", name: "Freeze" },
  execute: { num: "S4", name: "Execute" },
  claim: { num: "S5", name: "Claim" },
  atlas: { num: "◫", name: "Atlas" },
};

/** The HiFi breadcrumb tail for each tab (`crumbMap`). */
export const STAGE_CRUMB: Record<EvidenceStage, string> = {
  summary: "Summary",
  split: "Stage 1 · Split",
  search: "Stage 2 · Search",
  freeze: "Stage 3 · Freeze",
  execute: "Stage 4 · Execute",
  claim: "Stage 5 · Claim",
  atlas: "Atlas",
};

const STAGE_KEY = { split: "S1", search: "S2", freeze: "S3", execute: "S4" } as const;
type PreviewStage = keyof typeof STAGE_KEY;

/**
 * Where each stage tab's deep dive lives, and whether that screen exists yet.
 * Screen 08 is P17 and not built: its link stays refused with that reason.
 */
const DEEP_DIVE: Record<PreviewStage, { screen: string; path: string | null; phase?: string }> = {
  split: { screen: "05 Split", path: "split" },
  search: { screen: "06 Search", path: "search" },
  freeze: { screen: "07 Freeze", path: "freeze" },
  execute: { screen: "08 Execute", path: "execute" },
};

/**
 * The HiFi per-tab heading and the panels it draws (DQ-02: HiFi copy). Panel
 * titles only name what the panel would show; none asserts a fact this run
 * did not publish (DQ-15), so numbers and file names from the demo are gone.
 */
const STAGE_PREVIEW: Record<PreviewStage, { title: string; subtitle: string; panels: string[] }> = {
  split: {
    title: "Stage 1 · Split — fold construction",
    subtitle: "How time was divided before anything was searched. If this is wrong, every later stage is wrong.",
    panels: ["fold timeline", "fold table", "inner validation — containment", "stitched OOS provenance"],
  },
  search: {
    title: "Stage 2 · Search — why these params",
    subtitle:
      "Every trial, the funnel that narrowed them, and the decision that picked one — for the fold under the cursor.",
    panels: ["search configuration", "candidate funnel", "selection decision", "lineage — one unbroken chain"],
  },
  freeze: {
    title: "Stage 3 · Freeze — the hinge between Search and Execute",
    subtitle: "What was frozen, when, and proof that nothing drifted afterwards.",
    panels: ["three timestamps — ordering is the claim", "digest chain — drift detection"],
  },
  execute: {
    title: "Stage 4 · Execute — candle replay",
    subtitle:
      "The frozen params trading the OOS tape, one event at a time. Replay reads immutable artifacts — it never re-runs the strategy.",
    panels: ["candle replay", "event ledger", "event inspector", "why these params?"],
  },
};

/** Statuses of a run that will never seal evidence without a new attempt. */
const ENDED_UNSEALED = new Set(["CANCELLED", "FAILED", "RECOVERY_REQUIRED"]);
/** Statuses of a run still on its way to a seal. */
const LIVE = new Set(["DRAFT", "QUEUED", "RUNNING", "SEALING"]);

const PANEL_STYLE = {
  borderColor: "var(--line)",
  background: "var(--paper-raised)",
  boxShadow: "var(--shadow-e1)",
} as const;

/* ------------------------------------------------------------------ parts */

/**
 * A fact the server withheld.
 *
 * Each state keeps its own words: `NOT_APPLICABLE` says the question does not
 * arise for this run, `NOT_PUBLISHED` says it does and the source did not
 * answer, `PENDING_SOURCE_CALLBACK` says the answer is still coming. The
 * server's reason code rides in the title.
 */
export function Withheld({
  availability,
  what,
}: {
  availability: Availability | { state: keyof typeof WITHHELD_WORDS; reason_code: string | null };
  what?: string;
}) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      data-reason-code={availability.reason_code ?? undefined}
      title={reasonTitle(availability as Availability)}
    >
      {what ? `${what} — ` : ""}
      {WITHHELD_WORDS[availability.state]}
    </span>
  );
}

/**
 * A reason for a person, with its code kept for diagnostics: the RF-05
 * sentence when the shared module has one, else the bare code or state.
 */
export function reasonTitle(availability: Availability): string {
  const sentence = reasonCodeSentence(availability.reason_code);
  return sentence !== null ? `${sentence} (${availability.reason_code})` : unavailableReason(availability);
}

/**
 * A withheld fact whose panel has room to say why in words: the state word,
 * then the reason's sentence (DQ-14 — the shell keeps its place and its
 * reason). `extra` is a published fact that makes the reason concrete.
 */
function AbsenceNote({
  availability,
  what,
  extra,
}: {
  availability: Availability;
  what?: string;
  extra?: ReactNode;
}) {
  const sentence = reasonCodeSentence(availability.reason_code);
  return (
    <p
      className="text-[11px] leading-[1.5]"
      style={{ color: "var(--ink-soft)" }}
      data-absence-note={availability.state}
      data-reason-code={availability.reason_code ?? undefined}
    >
      <Withheld availability={availability} what={what} />
      {sentence !== null ? <span data-reason-sentence> — {sentence}</span> : null}
      {extra ? <> {extra}</> : null}
    </p>
  );
}

/** The panel label grammar of the HiFi: Inter 10px, uppercase, faint. */
function PanelLabel({ children }: { children: ReactNode }) {
  return (
    <h3
      className="text-[10px] font-medium uppercase tracking-[.07em]"
      style={{ color: "var(--ink-faint)", fontFamily: "var(--font-body)" }}
    >
      {children}
    </h3>
  );
}

/** A panel the source does not fill, kept at full size with its reason. */
function SourceGap({
  title,
  reason,
  children,
  id,
}: {
  title: string;
  reason: ReactNode;
  children?: ReactNode;
  id: string;
}) {
  return (
    <section className="flex flex-col gap-1.5 rounded-[8px] border p-4" data-gap={id} style={PANEL_STYLE}>
      <PanelLabel>{title}</PanelLabel>
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        {reason}
      </p>
      {children}
    </section>
  );
}

/** The HiFi identity pill: mono 11px on white, fully rounded. */
function Pill({
  children,
  tone = "var(--ink-soft)",
  background = "var(--paper-raised)",
  border = "var(--line)",
  ...rest
}: {
  children: ReactNode;
  tone?: string;
  background?: string;
  border?: string;
} & Record<string, unknown>) {
  return (
    <span
      className="mono whitespace-nowrap rounded-full border px-2 py-px text-[11px]"
      style={{ color: tone, borderColor: border, background }}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Tone of a run status word. The word itself is rendered exactly. */
function statusTone(status: string): { color: string; background: string } {
  if (status === "READY" || status === "COMPLETED") return { color: "var(--good)", background: "var(--good-bg)" };
  if (status === "FAILED" || status === "RECOVERY_REQUIRED") return { color: "var(--bad)", background: "var(--bad-bg)" };
  if (status === "CANCELLED") return { color: "var(--ink-soft)", background: "var(--paper-sunken)" };
  return { color: "var(--accent)", background: "var(--accent-soft)" };
}

/**
 * The status a hub declares for its run, or null when it does not.
 * `run_identity` is optional during a rolling deployment.
 */
function runStatus(hub: EvidenceHub | null): string | null {
  const status = hub?.core.run_identity?.status;
  return status && isAvailable(status.availability) ? status.value : null;
}

/**
 * RF-05 CG-P13-10/12: the Hub's lifecycle block, when it publishes one. It is
 * the typed answer to "is this run still on its way, or finished, and how" —
 * what `readiness` alone could not say about a cancelled run.
 */
function lifecycleOf(hub: EvidenceHub | null): Lifecycle | null {
  const lifecycle = hub?.lifecycle;
  return lifecycle && isAvailable(lifecycle.availability) ? lifecycle : null;
}

/**
 * The word the status pill prints: the lifecycle's `display_status` — the
 * same vocabulary Screen 01 uses (READY reads COMPLETED) — and, from an older
 * responder without the block, the durable status as sent.
 */
export function statusWord(hub: EvidenceHub | null): { word: string; durable: string | null; vocabulary: string | null } | null {
  const lifecycle = lifecycleOf(hub);
  if (lifecycle !== null && lifecycle.display_status !== null) {
    return { word: lifecycle.display_status, durable: lifecycle.durable_status, vocabulary: lifecycle.vocabulary };
  }
  const durable = runStatus(hub);
  return durable !== null ? { word: durable, durable, vocabulary: null } : null;
}

/* --------------------------------------------------------- claims passport */

/**
 * The spec's claim fields the Hub does not carry. Each keeps its cell in the
 * passport (spec 04 §22: "do not hide the chip"), so a reader sees which fact
 * is absent rather than a shorter card that looks complete.
 */
const UNPUBLISHED_CLAIM_FIELDS = [
  "validation_claim",
  "chronological_claim",
  "oos_used_for_selection",
  "holdout_state",
  "causality_claim",
] as const;

/** The HiFi passport label: Inter 10px, weight 500, uppercase, faint. */
const PASSPORT_LABEL = "text-[10px] font-medium uppercase tracking-[.07em]";

function PassportField({
  name,
  children,
  bar = false,
  ...rest
}: { name: string; children: ReactNode; bar?: boolean } & Record<string, unknown>) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5" data-claim-field={name} {...rest}>
      <span className={PASSPORT_LABEL} style={{ color: "var(--ink-faint)" }}>
        {name}
      </span>
      <span
        className="mono text-[12px]"
        style={{
          color: "var(--ink)",
          ...(bar ? { borderLeft: "2px solid var(--accent-2)", paddingLeft: 6 } : {}),
        }}
      >
        {children}
      </span>
    </div>
  );
}

function AbsentClaimField({ name, bar }: { name: string; bar?: boolean }) {
  return (
    <PassportField name={name} bar={bar} data-withheld="NOT_PUBLISHED" title={`${name} — not published by the Evidence Hub for this run`}>
      <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} />
    </PassportField>
  );
}

/**
 * The claims passport — the HiFi's white card of label/value cells with the
 * engine note at its right (DQ-02: the HiFi wins on look; spec 04 §2.1 drew a
 * sticky chip strip). It is not sticky: in the HiFi only the tab card sticks.
 *
 * The claim is rendered by its own state, never by its availability:
 * `NOT_ISSUED` with the server's sentence is an answer ("no claim was issued"),
 * not an available claim (FE-S04-01). A certificate chip appears only for a
 * typed `ISSUED` grade: a claim string never earns one.
 */
function ClaimPassport({
  hub,
  state,
  onJump,
  retained = null,
  laneReadiness = null,
}: {
  hub: EvidenceHub | null;
  state: ResearchState;
  onJump: (stage: EvidenceStage) => void;
  /** W3: the sealed retained WFO run's claim strip; null on the P04 lane. */
  retained?: CurrentSourceClaimStrip | null;
  /** W3b: the retained seal's readiness (progress read), printed instead of the P04 hub's. */
  laneReadiness?: string | null;
}) {
  const claim = hub?.claim ?? null;
  const certificate = claim?.methodology_certificate ?? null;
  const issued = certificate?.state === "ISSUED" && certificate.grade !== null;
  const contract = hub?.core.run_identity?.route.contract ?? null;
  const engine = hub?.core.engine_version ?? null;

  return (
    <div
      className="flex items-stretch rounded-[6px] border"
      data-claim-passport={claim?.state ?? state.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e1)" }}
    >
      <div className="flex min-w-0 flex-1 flex-wrap gap-x-6 gap-y-2 px-3.5 py-2.5">
        <PassportField name="stage 5 claim">
          {claim === null ? (
            <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-claim-pending>
              {state.state === "loading" ? "reading…" : "not read"}
            </span>
          ) : claim.state === "ISSUED" && claim.text !== null ? (
            <button
              type="button"
              className="mono text-left text-[12px]"
              style={{ color: "var(--ink)" }}
              data-claim-text
              aria-label="Stage 5 claim — jump to source"
              onClick={() => onJump("claim")}
            >
              {claim.text}
            </button>
          ) : claim.state === "NOT_ISSUED" ? (
            <button
              type="button"
              className="mono max-w-[560px] text-left text-[12px]"
              style={{ color: "var(--ink)" }}
              data-claim-not-issued
              aria-label="claim not issued — jump to source"
              title={claim.text ?? undefined}
              onClick={() => onJump("claim")}
            >
              NOT_ISSUED
              {claim.text !== null ? (
                <span className="text-[10.5px] italic" style={{ color: "var(--ink-soft)" }} data-claim-sentence>
                  {" "}
                  — {claim.text}
                </span>
              ) : null}
            </button>
          ) : claim.state === "FORECAST" && claim.text !== null ? (
            <span className="italic" data-claim-forecast style={{ color: "var(--accent-2)" }}>
              {claim.text} — forecast, not the issued claim
            </span>
          ) : (
            <Withheld
              /* A claim in state NOT_PUBLISHED is withheld even if an older
                 responder marks the block itself AVAILABLE. */
              availability={
                isAvailable(claim.availability)
                  ? { state: "NOT_PUBLISHED", reason_code: claim.availability.reason_code }
                  : claim.availability
              }
            />
          )}
        </PassportField>

        {retained ? <RetainedClaimFields claim={retained} onJump={onJump} /> : null}

        {retained ? null : UNPUBLISHED_CLAIM_FIELDS.map((name, index) => (
          <AbsentClaimField key={name} name={name} bar={index === 0} />
        ))}

        {retained ? null : contract !== null && isAvailable(contract.availability) && contract.value !== null ? (
          <PassportField name="execution_contract">
            <button
              type="button"
              className="mono text-[12px]"
              style={{ color: "var(--ink)" }}
              onClick={() => onJump("execute")}
              aria-label={`execution_contract ${contract.value} — jump to source`}
              title="the numeric contract every metric on this run was produced under"
            >
              {contract.value}
            </button>
          </PassportField>
        ) : (
          <PassportField name="execution_contract">
            <Withheld availability={contract?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }} />
          </PassportField>
        )}

        {retained ? null : <AbsentClaimField name="runtime authority" />}

        <PassportField name="certification">
          {issued && certificate ? (
            <button
              type="button"
              data-certificate={certificate.grade}
              title={CERT_TOOLTIP}
              aria-label={`certificate ${certificate.grade} — jump to source`}
              onClick={() => onJump("claim")}
              className="mono inline-flex items-center gap-1.5 text-[12px]"
              style={{ color: "var(--ink)" }}
            >
              <span
                className="inline-flex items-center rounded-[3px] border px-2 text-[13px] font-bold"
                style={{ color: "var(--accent-2)", borderColor: "var(--accent-2)", background: "var(--accent-2-soft)" }}
              >
                {certificate.grade}
              </span>
              <span className="text-[10px] underline" style={{ color: "var(--accent)" }}>
                open Stage 5 ↗
              </span>
            </button>
          ) : certificate?.state === "NOT_ISSUED" ? (
            <span data-certificate-state="NOT_ISSUED" title={certificate.reason_code ?? undefined}>
              NOT_ISSUED
            </span>
          ) : (
            <span data-certificate-state="NOT_PUBLISHED">
              <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: certificate?.reason_code ?? null }} />
            </span>
          )}
        </PassportField>
      </div>

      <div
        className="hidden max-w-[230px] flex-col justify-center gap-1 border-l px-3.5 py-2.5 sm:flex"
        style={{ borderColor: "var(--line-soft)" }}
        data-passport-note
      >
        <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
          Claims issued by{" "}
          <span className="mono">{engine !== null ? `quantbt-engine ${engine}` : "the engine"}</span>. The UI renders
          them — it never infers.
        </span>
        {hub ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {laneReadiness !== null ? (
              <span data-registry="research.current-source-evidence.v1">research.current-source-evidence.v1</span>
            ) : (
              <span data-registry={hub.metric_registry_version}>{hub.metric_registry_version}</span>
            )}
            {hub.oos_performance && laneReadiness === null ? (
              <>
                {" · "}
                <span
                  data-registry={hub.oos_performance.registry_version}
                  title={hub.oos_performance.report_locator ?? reasonTitle(hub.oos_performance.availability)}
                >
                  {hub.oos_performance.registry_version}
                </span>
              </>
            ) : null}
            {" · "}
            {laneReadiness !== null ? (
              <span data-readiness={laneReadiness} data-readiness-lane="retained" title="the retained seal, from the run's progress read">
                retained seal <b className="font-semibold" style={{ color: "var(--ink-soft)" }}>{laneReadiness}</b>
              </span>
            ) : (
              <span data-readiness={hub.readiness}>
                readiness <b className="font-semibold" style={{ color: "var(--ink-soft)" }}>{hub.readiness}</b>
              </span>
            )}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- run header */

/**
 * The HiFi identity line, one row: `run {id}` · status · mode · binding ·
 * dataset chip · route, and the engine with the created instant on the right.
 * Strings are printed exactly as the Hub sends them (FE-S04-11). The secondary
 * facts (route contract, config digest, seed, input scope, revision) live in
 * the dataset panel the chip opens — the HiFi strip has one row.
 */
function RunHeader({
  runId,
  hub,
  onToggleDataset,
  datasetOpen,
  datasetTrigger,
  datasetPanelId,
}: {
  runId: string;
  hub: EvidenceHub | null;
  onToggleDataset: () => void;
  datasetOpen: boolean;
  datasetTrigger: React.Ref<HTMLButtonElement>;
  datasetPanelId: string;
}) {
  const core = hub?.core ?? null;
  const identity = core?.run_identity;
  const status = statusWord(hub);

  return (
    <header
      className="mono flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[3px] border px-3 py-1.5 text-[11px]"
      data-run-header={runId}
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)", color: "var(--ink-faint)" }}
    >
      <span>
        run{" "}
        <span style={{ color: "var(--ink)" }} data-run-id>
          {hub?.run_id ?? runId}
        </span>
      </span>

      {/*
        * `run_identity` is additive and optional while the responder rolls
        * out. An older responder that does not send it leaves the header
        * thinner — the shell stays, and nothing is invented to fill it.
        */}
      {status !== null ? (
        <span
          className="inline-flex items-center rounded-full px-2 py-px text-[11px] font-semibold"
          style={statusTone(status.word)}
          data-run-status={status.word}
          data-durable-status={status.durable ?? undefined}
          title={
            status.vocabulary !== null
              ? `durable ${status.durable ?? "not published"} · ${status.vocabulary}`
              : `durable ${status.durable ?? "not published"}`
          }
        >
          {status.word}
        </span>
      ) : identity ? (
        <Withheld availability={identity.status.availability} what="status" />
      ) : null}

      {identity ? (
        <>

          {isAvailable(identity.mode.availability) && identity.mode.value !== null ? (
            <Pill data-mode={identity.mode.value}>
              {identity.mode.value}
              {isAvailable(identity.schedule.availability) && identity.schedule.value !== null
                ? ` · ${identity.schedule.value}`
                : ""}
            </Pill>
          ) : null}

          {isAvailable(identity.binding.availability) && identity.binding.alpha_name !== null ? (
            <Pill
              data-binding={identity.binding.alpha_version_id ?? ""}
              title={`${identity.binding.alpha_id ?? ""} · ${identity.binding.alpha_version_id ?? ""}`}
            >
              {identity.binding.alpha_name}
            </Pill>
          ) : (
            <Withheld availability={identity.binding.availability} what="binding" />
          )}
        </>
      ) : null}

      {core ? (
        <button
          ref={datasetTrigger}
          type="button"
          data-action="dataset-panel"
          aria-expanded={datasetOpen}
          aria-controls={datasetPanelId}
          onClick={onToggleDataset}
          title="dataset identity — digests pinned at submit"
          className="mono whitespace-nowrap rounded-full border px-2 py-px text-[11px]"
          style={{
            color: datasetOpen ? "var(--accent)" : "var(--ink-soft)",
            borderColor: datasetOpen ? "var(--accent)" : "var(--line)",
            background: datasetOpen ? "var(--accent-soft)" : "var(--paper-raised)",
          }}
        >
          <span data-instrument>
            {core.data.symbol ?? "symbol —"} · {core.data.timeframe ?? "timeframe —"}
          </span>{" "}
          · {core.data.dataset_id ?? "dataset"} {datasetOpen ? "▴" : "▾"}
        </button>
      ) : null}

      {identity && isAvailable(identity.route.id.availability) && identity.route.id.value !== null ? (
        <Pill data-route={identity.route.id.value}>route {identity.route.id.value}</Pill>
      ) : null}

      {core ? (
        <span className="ml-auto flex flex-wrap items-center gap-x-1.5">
          {core.engine_version !== null ? (
            <span data-engine={core.engine_version}>engine quantbt-engine {core.engine_version}</span>
          ) : (
            <Withheld availability={hub!.availability} what="engine" />
          )}
          {core.source_adapter_id !== null ? <span data-adapter={core.source_adapter_id}>· {core.source_adapter_id}</span> : null}
          {identity && isAvailable(identity.created_at_utc_ms.availability) && identity.created_at_utc_ms.value !== null ? (
            <span data-created title={new Date(identity.created_at_utc_ms.value).toISOString()}>
              · created {utcZ(identity.created_at_utc_ms.value)}
            </span>
          ) : null}
        </span>
      ) : null}
    </header>
  );
}

/* ---------------------------------------------------------- dataset panel */

/** A digest the width of a phone: shortened, whole in the title, copyable. */
function DigestValue({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const short = shortDigest(value, 16);
  const prefix = value.startsWith("sha256:") ? "sha256:" : "";
  return (
    <span className="inline-flex min-w-0 items-baseline gap-1.5" data-digest={value}>
      <span className="truncate" title={value} data-drawer-value>
        {prefix}
        {short}
        {short !== null && short.length < value.length - prefix.length ? "…" : ""}
      </span>
      <button
        type="button"
        className="mono text-[9.5px]"
        style={{ color: copied ? "var(--good)" : "var(--accent)" }}
        aria-label={`copy ${value}`}
        data-action="copy-digest"
        onClick={() => {
          void navigator.clipboard?.writeText(value).catch(() => undefined);
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? "✓ copied" : "copy"}
      </button>
    </span>
  );
}

/** One row of the panel's grid: label, then the Hub's value or its absence. */
function PanelRow({
  label,
  value,
  availability,
  digest = false,
  title,
}: {
  label: string;
  value: string | null;
  availability?: Availability;
  digest?: boolean;
  title?: string;
}) {
  const shown = value !== null && (availability === undefined || isAvailable(availability));
  return (
    <>
      <dt style={{ color: "var(--ink-faint)" }}>
        {label}
      </dt>
      <dd className="min-w-0" data-drawer-row={label}>
        {shown ? (
          digest ? (
            <DigestValue value={value as string} />
          ) : (
            <span data-header-value={label} data-drawer-value title={title}>
              {value}
            </span>
          )
        ) : (
          <span data-header-fact={label}>
            <Withheld availability={availability ?? { state: "NOT_PUBLISHED", reason_code: null }} />
          </span>
        )}
      </dd>
    </>
  );
}

/**
 * The dataset identity, inline under the header as the HiFi opens it (DQ-02;
 * spec 04 §2.3 drew a right drawer). The run's other pinned facts sit in the
 * same grid. Escape closes it and hands focus back to the chip (FE-S04-07).
 */
function DatasetPanel({ hub, id, onClose }: { hub: EvidenceHub; id: string; onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const core = hub.core;
  const identity = core.run_identity;
  return (
    <section
      id={id}
      aria-label="dataset identity"
      data-dataset-panel="dataset"
      className="flex flex-col gap-2 rounded-[6px] border px-4 py-3"
      style={{ borderColor: "var(--accent)", background: "var(--paper-raised)", boxShadow: "var(--shadow-e2)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2
          className="text-[10px] font-semibold uppercase tracking-[.07em]"
          style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
        >
          dataset identity — {core.data.dataset_id ?? "dataset"}
        </h2>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-drawer-footer>
          {DRAWER_FOOTER}
        </span>
      </div>
      <div className="flex flex-wrap gap-[18px]">
        <dl
          className="mono grid min-w-0 flex-[1.1] basis-[320px] gap-x-3.5 gap-y-0.5 text-[10.5px]"
          style={{ gridTemplateColumns: "auto minmax(0, 1fr)", color: "var(--ink)" }}
        >
          <PanelRow label="dataset" value={core.data.dataset_id} />
          <PanelRow label="symbol" value={core.data.symbol} />
          <PanelRow label="timeframe" value={core.data.timeframe} />
          <PanelRow
            label="OOS observations"
            value={core.data.oos_observation_count === null ? null : formatMetric(core.data.oos_observation_count, "count")}
          />
          <PanelRow label="dataset binding digest" value={core.dataset_binding_digest} digest />
          <PanelRow label="manifest digest" value={core.manifest_digest} digest />
          <PanelRow label="requested spec digest" value={core.requested_spec_digest} digest />
          <PanelRow label="effective spec digest" value={core.effective_spec_digest} digest />
          <PanelRow label="source transform digest" value={core.source_transform_digest} digest />
          {identity ? (
            <>
              {/*
                * A selected route id is not a route contract. The contract is
                * published as absent, and printing the id under that label would
                * upgrade a choice into an assertion about what the route enforces.
                */}
              <PanelRow label="route" value={identity.route.id.value} availability={identity.route.id.availability} />
              <PanelRow
                label="route contract"
                value={identity.route.contract.value}
                availability={identity.route.contract.availability}
              />
              <PanelRow
                label="config digest"
                value={identity.config_digest.value}
                availability={identity.config_digest.availability}
                digest
              />
              {/* `seed` null with NOT_APPLICABLE is a real selected null. */}
              <PanelRow
                label="seed"
                value={identity.seed.value === null ? null : String(identity.seed.value)}
                availability={identity.seed.availability}
              />
            </>
          ) : null}
          <PanelRow label="input scope" value={core.input_scope} />
          {/*
            * The revision is the run's identity on this screen, so it is shown
            * (shortened, whole in the title). It is never parsed, and nothing
            * the browser sends carries it.
            */}
          <PanelRow label="revision" value={hub.revision} availability={hub.revision === null ? hub.availability : undefined} digest />
          <PanelRow label="as of" value={utcZ(hub.as_of_utc_ms)} title={new Date(hub.as_of_utc_ms).toISOString()} />
        </dl>
        {/*
          * The hi-fi's coverage bar and gap scan read a dataset manifest this
          * screen does not receive. The panel keeps its place and says so
          * rather than drawing a coverage bar out of nothing.
          */}
        <div className="flex min-w-0 flex-1 basis-[300px] flex-col gap-1" data-gap="dataset-coverage">
          <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            coverage · gap scan · vendor
          </span>
          <div
            className="h-4 rounded-full border"
            style={{ background: "var(--paper-sunken)", borderColor: "var(--line-soft)" }}
            aria-hidden="true"
          />
          <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} /> — the Evidence contract publishes
            the dataset&apos;s identity and digests, not its coverage bar, gap scan or vendor. They are read from a dataset
            manifest no operation on this screen exposes.
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------ tabs + cursor, one card */

function tabSub(stage: EvidenceStage, cursor: EvidenceCursor, hub: EvidenceHub | null, summary: string | null = null): string {
  if (hub === null) return "—";
  if (stage === "summary" && summary !== null) return summary;
  if (stage === "summary") {
    const all = [...hub.metrics, ...(hub.oos_performance?.metrics ?? [])];
    const shown = all.filter((metric) => isAvailable(metric.availability)).length;
    return `${shown} of ${all.length} metrics · ${hub.series.length} series`;
  }
  if (stage === "claim") {
    const certificate = hub.claim.methodology_certificate;
    return certificate.state === "ISSUED" && certificate.grade !== null ? `cert ${certificate.grade}` : `claim ${hub.claim.state}`;
  }
  if (stage === "atlas") return "modes × routes";
  const row = hub.stages.find((entry) => entry.key === STAGE_KEY[stage]);
  const state = row ? row.state : "not published";
  if (stage === "execute") {
    const route = hub.core.run_identity?.route.id;
    return route && isAvailable(route.availability) && route.value !== null ? `${state} · ${route.value}` : state;
  }
  return `${state} · fold ${cursor.fold}`;
}

function StageTabs({
  cursor,
  hub,
  onStage,
  rowRef,
  summary = null,
}: {
  cursor: EvidenceCursor;
  hub: EvidenceHub | null;
  onStage: (stage: EvidenceStage) => void;
  rowRef?: React.Ref<HTMLDivElement>;
  /** W3b: the Summary tab's count on a retained run (tiles and series of the lane). */
  summary?: string | null;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const onKeyDown = (event: React.KeyboardEvent) => {
    const index = EVIDENCE_STAGES.indexOf(cursor.stage);
    const last = EVIDENCE_STAGES.length - 1;
    const next =
      event.key === "ArrowRight"
        ? Math.min(index + 1, last)
        : event.key === "ArrowLeft"
          ? Math.max(index - 1, 0)
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const stage = EVIDENCE_STAGES[next];
    onStage(stage);
    refs.current[stage]?.focus();
  };

  return (
    <div ref={rowRef} className="flex items-stretch overflow-x-auto" data-stage-tabs>
      <div role="tablist" aria-label="Evidence stages" className="flex items-stretch" onKeyDown={onKeyDown}>
        {EVIDENCE_STAGES.map((stage) => {
          const selected = cursor.stage === stage;
          const { num, name } = STAGE_TAB[stage];
          return (
            <button
              key={stage}
              ref={(node) => {
                refs.current[stage] = node;
              }}
              role="tab"
              type="button"
              id={`ef-tab-${stage}`}
              aria-selected={selected}
              aria-controls={`ef-panel-${stage}`}
              tabIndex={selected ? 0 : -1}
              data-tab={stage}
              onClick={() => onStage(stage)}
              className="flex flex-none flex-col items-start gap-0.5 border-r px-3.5 py-2 text-left"
              style={{
                borderRightColor: "var(--line-soft)",
                borderBottom: `2px solid ${selected ? "var(--accent)" : "transparent"}`,
                background: selected ? "var(--accent-soft)" : "transparent",
                color: "var(--ink)",
              }}
            >
              <span className="flex items-baseline gap-1.5">
                <span className="mono text-[10px]" style={{ color: selected ? "var(--accent)" : "var(--ink-faint)" }}>
                  {num}
                </span>
                <span className="text-[12px] font-medium uppercase tracking-[.05em]">{name}</span>
              </span>
              <span className="mono whitespace-nowrap text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-tab-sub>
                {tabSub(stage, cursor, hub, summary)}
              </span>
            </button>
          );
        })}
      </div>
      {/* The HiFi's next room: not a stage of this run, and not built. */}
      <div
        className="flex flex-none flex-col justify-center gap-0.5 border-l border-dashed px-3.5 py-2"
        style={{ borderColor: "var(--viz-legend-inactive)", opacity: 0.62 }}
        aria-hidden="true"
        data-promotion-soon
      >
        <span className="flex items-baseline gap-1.5">
          <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
            →
          </span>
          <span className="text-[12px] font-medium uppercase tracking-[.05em]" style={{ color: "var(--ink-soft)" }}>
            Promotion
          </span>
          <span className="mono rounded-[3px] border border-dashed px-1 text-[9px] font-semibold" style={{ color: "var(--ink-faint)", borderColor: "var(--ink-faint)" }}>
            SOON
          </span>
        </span>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          Approval Gate · Paper
        </span>
      </div>
    </div>
  );
}

function CursorPill({ children, ...rest }: { children: ReactNode } & Record<string, unknown>) {
  return (
    <span
      className="mono inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 py-px text-[11px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink-soft)" }}
      {...rest}
    >
      {children}
    </span>
  );
}

/** The HiFi's fold id: `fold_03` for fold 3 (spec 04 §3 folds are 1-based). */
export function foldId(fold: number): string {
  return `fold_${String(fold).padStart(2, "0")}`;
}

/** A deep-dive link whose screen has no route yet: shown, refused, with the phase. */
function UnbuiltLink({ label, why }: { label: string; why: string }) {
  return (
    <span title={why} aria-disabled="true" style={{ opacity: 0.6 }} data-unbuilt-link={label}>
      {label}
    </span>
  );
}

function CursorBar({
  runId,
  cursor,
  hub,
  folds,
  onFold,
  onReset,
  laneSelection = null,
}: {
  runId: string;
  cursor: EvidenceCursor;
  hub: EvidenceHub | null;
  folds: FoldNavigation | undefined;
  onFold: (fold: number) => void;
  onReset: () => void;
  /**
   * W3b: on a retained run with a GLOBAL schedule every fold froze the same
   * selection (P11 progress fold selection). An empty cursor shows it, marked
   * as the global selection rather than a cursor the reader chose.
   */
  laneSelection?: { trial: number | null; paramsDigest: string | null } | null;
}) {
  const [copied, setCopied] = useState(false);
  /*
   * The step buttons and the dropdown are bound to the folds P11 actually
   * observed, and to nothing else. This is a published observed set, not the
   * source's complete fold plan: its bound says "observed" so the selector
   * cannot be read as a promise about folds nobody has seen.
   */
  const published = folds !== undefined && isAvailable(folds.availability) ? folds.observed_folds : [];
  const count = folds?.published_fold_count ?? published.length;
  const index = published.indexOf(cursor.fold);
  const atFirst = published.length === 0 || index <= 0;
  const atLast = published.length === 0 || index === published.length - 1 || index === -1;
  const step = (delta: number) => {
    if (index === -1) return;
    const next = published[index + delta];
    if (next !== undefined) onFold(next);
  };
  const reason = unavailableReason(folds?.availability ?? { state: "NOT_PUBLISHED", reason_code: null });
  /* The bound is read aloud always, and shown only when it says something the
     dropdown does not: an unpublished set, or a fold outside it. */
  const anomalous = published.length === 0 || index === -1;

  const copyLink = useCallback(() => {
    const href = `${window.location.origin}${window.location.pathname}${deepDiveHref("", cursor)}`;
    void navigator.clipboard?.writeText(href).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [cursor]);

  const schedule = hub?.core.run_identity?.schedule;
  const base = `/research/quantbt/runs/${encodeURIComponent(runId)}`;
  const stepStyle = (disabled: boolean) => ({
    color: disabled ? "var(--viz-legend-inactive)" : "var(--ink-soft)",
    cursor: disabled ? "default" : "pointer",
  });

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-t px-3.5 py-[7px]"
      data-cursor-bar
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)", borderRadius: "0 0 6px 6px" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        evidence cursor
      </span>

      <span
        className="mono inline-flex items-center gap-[3px] whitespace-nowrap rounded-full border py-px pl-2 pr-1 text-[11px]"
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink-soft)" }}
        data-cursor-fold-pill
      >
        <span data-cursor-fold>fold</span>
        <button
          type="button"
          aria-label="previous fold"
          data-action="fold-previous"
          disabled={atFirst}
          title={published.length === 0 ? reason : atFirst ? "this is the first observed fold" : "previous fold"}
          onClick={() => step(-1)}
          className="mono px-[3px] text-[11px]"
          style={stepStyle(atFirst)}
        >
          ‹
        </button>
        {/* The HiFi dropdown, holding exactly the observed members. */}
        <select
          className="mono max-w-[150px] bg-transparent text-[11px]"
          style={{ color: "var(--ink)" }}
          data-fold-select
          aria-label="observed fold"
          aria-describedby="ef-fold-bound"
          title={published.length === 0 ? reason : `${count} observed folds`}
          disabled={published.length === 0}
          value={index === -1 ? "" : String(cursor.fold)}
          onChange={(event) => onFold(Number(event.target.value))}
        >
          {index === -1 ? <option value="">{foldId(cursor.fold)}</option> : null}
          {published.map((fold) => (
            <option key={fold} value={String(fold)}>
              {foldId(fold)}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-label="next fold"
          data-action="fold-next"
          disabled={atLast}
          title={published.length === 0 ? reason : atLast ? "this is the last observed fold" : "next fold"}
          onClick={() => step(1)}
          className="mono px-[3px] text-[11px]"
          style={stepStyle(atLast)}
        >
          ›
        </button>
      </span>
      <span
        id="ef-fold-bound"
        className={anomalous ? "mono text-[9.5px]" : "sr-only"}
        style={{ color: "var(--ink-faint)" }}
        data-fold-bound
      >
        {published.length > 0 ? (
          <>
            of {count} observed
            {index === -1 ? ` — fold ${cursor.fold} is not in the observed set` : ""}
          </>
        ) : (
          <>
            of <Withheld availability={folds?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }} what="observed folds" />
          </>
        )}
      </span>

      <CursorPill data-cursor-trial>
        trial{" "}
        {cursor.trial !== null ? (
          <span style={{ color: "var(--ink)" }}>#{cursor.trial}</span>
        ) : laneSelection?.trial != null ? (
          <span style={{ color: "var(--ink)" }} data-cursor-lane="global" title="the global selection every fold froze (progress read, ordinal)">
            #{laneSelection.trial} · global
          </span>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_TRIAL_CURSOR" }} />
        )}
      </CursorPill>

      <CursorPill data-cursor-params>
        params{" "}
        {cursor.params !== null ? (
          <span style={{ color: "var(--ink)" }}>{cursor.params}</span>
        ) : laneSelection?.paramsDigest != null ? (
          <span style={{ color: "var(--ink)" }} data-cursor-lane="global" title={laneSelection.paramsDigest}>
            {shortDigest(laneSelection.paramsDigest)}
          </span>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_PARAMS_DIGEST" }} />
        )}
      </CursorPill>

      <CursorPill data-cursor-seq>
        seq{" "}
        {cursor.seq !== null ? (
          <span style={{ color: "var(--ink)" }}>{cursor.seq}</span>
        ) : laneSelection !== null ? (
          <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-cursor-seq-none title="no event is selected; the retained replay is on S4">
            none selected
          </span>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_EVENT_SEQ" }} />
        )}
      </CursorPill>

      <CursorPill data-cursor-schedule>
        schedule{" "}
        {schedule && isAvailable(schedule.availability) && schedule.value !== null ? (
          <span style={{ color: "var(--ink)" }}>{schedule.value}</span>
        ) : (
          <Withheld availability={schedule?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }} />
        )}
      </CursorPill>

      {/* The Hub publishes one window, OOS; the switcher below says so. */}
      <CursorPill data-cursor-window>
        window <span style={{ color: "var(--ink)" }}>oos</span>
      </CursorPill>

      <span className="ml-1 text-[10px]" style={{ color: "var(--ink-faint)" }} data-deep-dives>
        deep dives:{" "}
        <Link to={deepDiveHref(`${base}/search`, { ...cursor, stage: "search" })} style={{ color: "var(--accent)" }}>
          S2 search
        </Link>{" "}
        ·{" "}
        <Link to={deepDiveHref(`${base}/freeze`, { ...cursor, stage: "freeze" })} style={{ color: "var(--accent)" }}>
          S3 freeze
        </Link>{" "}
        ·{" "}
        <UnbuiltLink label="S4 replay" why="Screen 08 is not built yet (P17), so this link would go nowhere." />{" "}
        ·{" "}
        <UnbuiltLink label="promotion" why="Screen 11 is not built yet (P21), so this link would go nowhere." />{" "}
        ·{" "}
        <Link to="/research/quantbt/journey" style={{ color: "var(--accent)" }}>
          journey map ↗
        </Link>
      </span>

      <span className="ml-auto flex items-center gap-1.5">
        <button
          type="button"
          data-action="reset-cursor"
          onClick={onReset}
          className="mono rounded-[6px] border px-2.5 py-px text-[10px]"
          style={{ color: "var(--accent)", borderColor: "var(--line)", background: "var(--paper-raised)" }}
        >
          reset to θ*
        </button>
        <button
          type="button"
          data-action="copy-link"
          onClick={copyLink}
          className="mono rounded-[6px] border px-3 py-[3px] text-[10px] uppercase tracking-[.06em]"
          style={{ color: "var(--accent)", borderColor: "var(--accent)", background: "transparent" }}
        >
          {copied ? COPY_LINK_DONE : COPY_LINK_IDLE}
        </button>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- metrics */

/** The tone of a signed fraction, read from the sign of the server's string. */
function signTone(metric: Metric): string {
  if (metric.unit !== "FRACTION" || metric.value === null) return "var(--ink)";
  if (metric.key === "MAX_DRAWDOWN_FRACTION") return "var(--bad)";
  return metric.value.trim().startsWith("-") ? "var(--bad)" : "var(--good)";
}

/**
 * The words the HiFi tile foot uses for the Hub's enums (`oos · percent · …`).
 * A lookup, nothing more: the unit is the one the server declared. `CURRENCY`
 * reads "currency", not a currency code — the contract publishes none, and
 * printing "USD" would assert one.
 */
export const SCOPE_WORD: Record<Metric["scope"], string> = {
  OOS: "oos",
  IS_PLUS_OOS: "is + oos",
  CHILD_TAPE: "child tape",
  NOT_PUBLISHED: "scope not published",
};
export const UNIT_WORD: Record<Metric["unit"], string> = {
  CURRENCY: "currency",
  FRACTION: "percent",
  COUNT: "count",
};
export const ORIGIN_WORD: Record<Metric["origin"], string> = {
  ENGINE_DIRECT: "engine-direct",
  SOURCE_DERIVED: "source-derived",
  NOT_PUBLISHED: "origin not published",
};

/** A metric string as the tile prints it: rounded by unit, one minus sign. */
export function tileValue(metric: Metric): string | null {
  if (metric.value === null) return null;
  const shown = formatMetric(metric.value, metric.unit.toLowerCase());
  return shown === null ? null : shown.replace(/^-/, "\u2212");
}

/**
 * One metric tile (FE-S04-02, DQ-08). The rounded value is for reading; the
 * exact server string is the tile's title, its data attribute, and what the
 * clipboard receives when the value is copied.
 */
function MetricTile({ metric }: { metric: Metric }) {
  const shown = isAvailable(metric.availability) && metric.value !== null;
  const display = shown ? tileValue(metric) : null;
  return (
    <div
      className="flex min-h-[90px] min-w-0 flex-col gap-[3px] rounded-[6px] border px-3 py-2"
      data-metric={metric.key}
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {metric.label}
      </span>
      {shown && metric.value !== null ? (
        <span
          className="mono text-[22px] font-semibold leading-[28px]"
          style={{ color: signTone(metric), fontVariantNumeric: "tabular-nums" }}
          data-metric-value={metric.key}
          data-exact={metric.value}
          title={metric.value}
          onCopy={(event) => {
            event.clipboardData.setData("text/plain", metric.value as string);
            event.preventDefault();
          }}
        >
          {display ?? metric.value}
        </span>
      ) : (
        <span className="leading-[28px]">
          <Withheld availability={metric.availability} />
        </span>
      )}
      <span
        className="mono text-[9.5px]"
        style={{ color: "var(--ink-faint)" }}
        data-metric-scope={metric.scope}
        title={`${metric.scope} · ${metric.unit} · ${metric.origin} · ${metric.definition_id}`}
      >
        {SCOPE_WORD[metric.scope]} · {UNIT_WORD[metric.unit]} · {ORIGIN_WORD[metric.origin]}
      </span>
    </div>
  );
}

/* ------------------------------------------------------ OOS performance */

/**
 * RF-05 CG-P13-03 — registry v3, QuantBT's own OOS performance figures.
 *
 * The tiles follow the HiFi row (`Final Equity · Total Return · Sharpe · Max
 * Drawdown · Trades`), then the rest of registry v3 and the v2 metrics that
 * are not in the HiFi row. A value is the engine's field, named by its
 * `source_locator` in the tile foot where the HiFi prints its source file.
 */
type TileKey = Metric["key"] | PerformanceMetric["key"];
export const TILE_ORDER: TileKey[] = [
  "FINAL_EQUITY",
  "NET_RETURN_FRACTION",
  "OOS_SHARPE",
  "MAX_DRAWDOWN_FRACTION",
  "TRADE_COUNT",
  "OOS_SORTINO",
  "OOS_CAGR_FRACTION",
  "OOS_PROFIT_FACTOR",
  "OOS_LONG_HIT_RATE_FRACTION",
  "OOS_SHORT_HIT_RATE_FRACTION",
  "OOS_SHARPE_DECAY",
  "BARS_PROCESSED",
  "INITIAL_EQUITY",
  "BENCHMARK_RETURN_FRACTION",
  "FUNDING_TOTAL",
];

/** QuantBT's long/short hit rates count bars, not trades: never "win rate". */
const HIT_RATE_KEYS = new Set<PerformanceMetric["key"]>(["OOS_LONG_HIT_RATE_FRACTION", "OOS_SHORT_HIT_RATE_FRACTION"]);

const RATIO_2DP = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** A ratio the way the HiFi prints Sharpe (`1.19`): two decimals, U+2212. */
export function formatRatio(value: string | null): string | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? RATIO_2DP.format(parsed).replace(/^-/, "\u2212") : null;
}

/**
 * A registry-v3 value as the tile prints it (DQ-08): a ratio to two
 * decimals, a fraction as a percentage with two. A hit rate is a share of
 * bars, not a change, so it carries no sign.
 */
export function performanceValue(metric: PerformanceMetric): string | null {
  if (metric.value === null) return null;
  if (metric.unit === "RATIO") return formatRatio(metric.value);
  const shown = formatMetric(metric.value, "fraction");
  if (shown === null) return null;
  return HIT_RATE_KEYS.has(metric.key) ? shown.replace(/^\+/, "") : shown.replace(/^-/, "\u2212");
}

/** The tile foot: segment · unit · the engine field it was read from. */
export function performanceFoot(metric: PerformanceMetric): string {
  const unit = HIT_RATE_KEYS.has(metric.key) ? "percent of bars" : metric.unit === "RATIO" ? "ratio" : "percent";
  const source =
    metric.source_locator ?? (metric.origin === "NOT_PUBLISHED" ? ORIGIN_WORD.NOT_PUBLISHED : "locator not published");
  return `${metric.scope.toLowerCase()} · ${unit} · ${source}`;
}

/** Everything the block says about where a v3 value came from, for the foot's title. */
function performanceProvenance(metric: PerformanceMetric, block: OosPerformance): string {
  const sample = block.return_sample;
  return [
    `${metric.scope} · ${metric.unit} · ${metric.origin} · ${metric.definition_id}`,
    `${block.registry_version}`,
    metric.source_locator !== null ? `field ${metric.source_locator}` : null,
    block.report_locator !== null ? `report ${block.report_locator}` : null,
    block.scope_locator !== null ? `scope ${block.scope_locator}` : null,
    sample !== null
      ? `sample ${sample.observation_count} ${sample.kind} returns · annualisation ${sample.annualization_periods}`
      : null,
    HIT_RATE_KEYS.has(metric.key) ? "a per-bar hit rate: the share of exposed bars that gained, not a trade win rate" : null,
  ]
    .filter((part): part is string => part !== null)
    .join("\n");
}

function PerformanceTile({ metric, block }: { metric: PerformanceMetric; block: OosPerformance }) {
  const shown = isAvailable(metric.availability) && metric.value !== null;
  const display = shown ? performanceValue(metric) : null;
  const tone =
    metric.key === "OOS_CAGR_FRACTION" && metric.value !== null
      ? metric.value.trim().startsWith("-")
        ? "var(--bad)"
        : "var(--good)"
      : "var(--ink)";
  return (
    <div
      className="flex min-h-[90px] min-w-0 flex-col gap-[3px] rounded-[6px] border px-3 py-2"
      data-metric={metric.key}
      data-registry-version={block.registry_version}
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {metric.label}
      </span>
      {shown && metric.value !== null ? (
        <span
          className="mono text-[22px] font-semibold leading-[28px]"
          style={{ color: tone, fontVariantNumeric: "tabular-nums" }}
          data-metric-value={metric.key}
          data-exact={metric.value}
          title={metric.value}
          onCopy={(event) => {
            event.clipboardData.setData("text/plain", metric.value as string);
            event.preventDefault();
          }}
        >
          {display ?? metric.value}
        </span>
      ) : (
        <span className="leading-[28px]">
          <Withheld availability={metric.availability} />
        </span>
      )}
      <span
        className="mono text-[9.5px]"
        style={{ color: "var(--ink-faint)" }}
        data-metric-scope={metric.scope}
        data-source-locator={metric.source_locator ?? undefined}
        title={performanceProvenance(metric, block)}
      >
        {/* A locator wraps at its own separators, never inside a word. */}
        {performanceFoot(metric)
          .split(/(?<=[./])/)
          .map((part, index) => (
            <span key={index}>
              {index > 0 ? <wbr /> : null}
              {part}
            </span>
          ))}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

/** Spec 04 §28: a chart chunk that fails to load hides the chart, never the numbers. */
class ChartBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <p className="mono text-[10.5px] italic" style={{ color: "var(--role-holdout)" }} data-chart-unavailable>
        {CHART_ENGINE_UNAVAILABLE}
      </p>
    ) : (
      this.props.children
    );
  }
}

/** Keeps the chart's height while its chunk loads, so nothing below jumps (spec 04 §25). */
function ChartFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <ChartBoundary>
      <Suspense
        fallback={
          <div
            className="mono flex items-center justify-center text-[10px] italic"
            style={{ height, color: "var(--ink-faint)", background: "var(--paper-sunken)", borderRadius: 4 }}
            data-chart-loading
          >
            drawing…
          </div>
        }
      >
        {children}
      </Suspense>
    </ChartBoundary>
  );
}

/** The sampling line a panel shows once its series has answered. */
function SamplingLine({ series }: { series: EvidenceSeries }) {
  return (
    <span
      className="mono ml-auto text-[9.5px]"
      style={{ color: "var(--ink-faint)" }}
      data-sampling={series.source_sample.sampling ?? "NOT_PUBLISHED"}
    >
      {formatMetric(series.source_sample.emitted_point_count, "count")}{" "}
      {series.source_sample.emitted_point_count === 1 ? "point" : "points"} from{" "}
      {series.source_sample.source_observation_count === null
        ? "an unpublished number of"
        : formatMetric(series.source_sample.source_observation_count, "count")}{" "}
      source observations · {series.source_sample.sampling ?? "sampling not published"}
    </span>
  );
}

/**
 * What a lazy series slot shows, whatever the answer turns out to be. Shared
 * by the full panels and the two halves of the rolling figure.
 */
function useSeriesBody({
  kind,
  link,
  slot,
  onNeeded,
  emptyReason,
  absentExtra,
  children,
}: {
  kind: SeriesKind;
  link: EvidenceHub["series"][number] | undefined;
  slot: SeriesSlot | undefined;
  onNeeded: (kind: SeriesKind) => void;
  emptyReason: string;
  absentExtra?: ReactNode;
  children: (series: EvidenceSeries) => ReactNode;
}): { body: ReactNode; state: string; ready: EvidenceSeries | null } {
  /* The read starts when the panel is on screen and its link says the series
     exists — not on mount, and never for a series the Hub declared absent. */
  const available = link !== undefined && isAvailable(link.availability);
  useEffect(() => {
    if (available) onNeeded(kind);
  }, [available, kind, onNeeded]);

  const answered = slot?.state === "ready" ? slot.series : null;
  /* RF-05: a series can itself answer NOT_APPLICABLE with its reason (e.g. a
     zero-month MONTHLY_RETURNS); that is an absence, not an empty chart. */
  const withheld = answered !== null && !isAvailable(answered.availability) ? answered.availability : null;
  const ready = withheld === null ? answered : null;
  const empty = ready !== null && ready.values.length === 0;

  const body = link === undefined ? (
    <AbsenceNote availability={{ state: "NOT_PUBLISHED", reason_code: null }} what={kind} />
  ) : !available ? (
    <AbsenceNote availability={link.availability} extra={absentExtra} />
  ) : withheld !== null ? (
    <AbsenceNote availability={withheld} extra={absentExtra} />
  ) : empty ? (
    /* FE-S04-10: an answered series with no points is not a blank body. */
    <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-series-empty>
      {emptyReason}
    </p>
  ) : ready ? (
    children(ready)
  ) : slot?.state === "refused" ? (
    <p className="text-[11px]" style={{ color: "var(--bad)" }} data-series-refusal>
      <RefusalNote refusal={slot.refusal} />
    </p>
  ) : slot?.state === "revision-mismatch" ? (
    <p className="text-[11px]" style={{ color: "var(--accent-2)" }} data-series-mismatch>
      this chart answered at a different projection revision than the summary above it, so it was
      discarded rather than drawn beside numbers it does not belong to.
    </p>
  ) : (
    <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-series-loading>
      reading…
    </p>
  );

  const state = withheld !== null ? "absent" : empty ? "empty" : (slot?.state ?? (available ? "idle" : "absent"));
  return { body, state, ready };
}

/**
 * The frame every lazy series panel keeps, whatever the answer turns out to be.
 *
 * Two HiFi grammars: a `figure` (EChart n in gold, Newsreader title, 16px
 * padding, raised) for the charts, and a `card` (uppercase label header, 14px
 * padding, flat) for the monthly strip.
 */
function SeriesPanel({
  kind,
  title,
  chartNo,
  variant = "figure",
  footnote,
  footer,
  link,
  slot,
  onNeeded,
  emptyReason,
  absentExtra,
  className,
  style,
  children,
}: {
  kind: SeriesKind;
  title: string;
  /** The HiFi's `EChart n` label; figures only. */
  chartNo?: number;
  variant?: "figure" | "card";
  footnote?: ReactNode;
  /** The provenance row under the chart (HiFi EChart 1). */
  footer?: (series: EvidenceSeries | null) => ReactNode;
  link: EvidenceHub["series"][number] | undefined;
  slot: SeriesSlot | undefined;
  onNeeded: (kind: SeriesKind) => void;
  /** What an answered series with no points means, in this panel's words. */
  emptyReason: string;
  /** A published fact that makes an absence concrete (e.g. the sample size). */
  absentExtra?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: (series: EvidenceSeries) => ReactNode;
}) {
  const { body, state, ready } = useSeriesBody({ kind, link, slot, onNeeded, emptyReason, absentExtra, children });

  if (variant === "card") {
    return (
      <section
        className={`flex min-w-0 flex-col gap-1.5 rounded-[8px] border p-3.5 ${className ?? ""}`}
        data-series-panel={kind}
        data-series-state={state}
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)", ...style }}
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <PanelLabel>{title}</PanelLabel>
          {ready ? <SamplingLine series={ready} /> : null}
        </div>
        {body}
        {footnote ? (
          <div className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
            {footnote}
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <figure
      className={`m-0 min-w-0 rounded-[8px] border p-4 ${className ?? ""}`}
      data-series-panel={kind}
      data-series-state={state}
      style={{ ...PANEL_STYLE, ...style }}
    >
      <figcaption className="mb-3 flex flex-wrap items-baseline gap-2">
        {chartNo !== undefined ? (
          <span className="mono text-[11px]" style={{ color: "var(--accent-2)" }} data-chart-no>
            EChart {chartNo}
          </span>
        ) : null}
        <span className="text-[15px]" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          {title}
        </span>
        {ready ? <SamplingLine series={ready} /> : null}
      </figcaption>
      {body}
      {footer ? footer(ready) : null}
      {footnote ? (
        <div className="mt-2 text-[12px] leading-[1.4]" style={{ color: "var(--ink-faint)" }}>
          {footnote}
        </div>
      ) : null}
    </figure>
  );
}

/**
 * The HiFi provenance row under EChart 1: SOURCE · SEGMENT · UNITS · TIMEZONE
 * · AS-OF · DIGEST. Each cell is a published fact or says it is not: the
 * series names its kind, its points are UTC milliseconds by contract, and the
 * as-of is the Hub's; segment, units and a content digest are not published.
 */
function ProvenanceRow({ hub, series, kind }: { hub: EvidenceHub; series: EvidenceSeries | null; kind: SeriesKind }) {
  const cells: [string, ReactNode][] = [
    ["source", `evidence series ${series?.kind ?? kind}`],
    ["segment", <Withheld key="segment" availability={{ state: "NOT_PUBLISHED", reason_code: "SERIES_SEGMENT_NOT_PUBLISHED" }} />],
    ["units", <Withheld key="units" availability={{ state: "NOT_PUBLISHED", reason_code: "SERIES_UNITS_NOT_PUBLISHED" }} />],
    ["timezone", "UTC"],
    ["as-of", utcZ(hub.as_of_utc_ms)],
    [
      "digest",
      <Withheld key="digest" availability={{ state: "NOT_PUBLISHED", reason_code: "SERIES_DIGEST_NOT_PUBLISHED" }} />,
    ],
  ];
  return (
    <div
      className="mt-2.5 flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-[10px]"
      style={{ borderColor: "var(--line-soft)" }}
      data-provenance={kind}
    >
      {cells.map(([label, value]) => (
        <span key={label} data-provenance-cell={label}>
          <span className="uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
            {label}
          </span>{" "}
          <span className="mono" style={{ color: "var(--ink)" }}>
            {value}
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * One half of the rolling figure: its own label, its own lazy series, and — as
 * an empty shell of the chart's height (DQ-14) — its typed reason when the
 * source did not publish it.
 */
function RollingHalf({
  kind,
  label,
  link,
  slot,
  onNeeded,
  absentExtra,
  children,
}: {
  kind: SeriesKind;
  label: string;
  link: EvidenceHub["series"][number] | undefined;
  slot: SeriesSlot | undefined;
  onNeeded: (kind: SeriesKind) => void;
  absentExtra?: ReactNode;
  children: (series: EvidenceSeries) => ReactNode;
}) {
  const { body, state, ready } = useSeriesBody({
    kind,
    link,
    slot,
    onNeeded,
    emptyReason: "the source published this window with no points, so no line is drawn.",
    absentExtra,
    children,
  });
  const drawn = ready !== null && ready.values.length > 0;
  return (
    <div className="flex min-w-0 flex-col gap-1.5" data-series-panel={kind} data-series-state={state}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="mono text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
          {label}
        </span>
        {ready ? <SamplingLine series={ready} /> : null}
      </div>
      {drawn ? (
        body
      ) : (
        <div
          className="flex items-center rounded-[4px] border border-dashed px-3"
          style={{ minHeight: 230, borderColor: "var(--line)", background: "var(--paper-sunken)" }}
          data-rolling-shell={kind}
        >
          {body}
        </div>
      )}
    </div>
  );
}

/**
 * HiFi EChart 3 — "Strategy behavior": rolling Sharpe and rolling beta. The
 * HiFi draws both on one chart with two axes; spec 04 §2.6 draws them as two
 * small charts side by side, which is what this does, so each keeps its own
 * reason when absent. Beta needs a benchmark series, and none is published
 * (the contract types `ROLLING_BETA_63` as an absence until one is).
 */
function RollingFigure({
  hub,
  series,
  ensureSeries,
  retained = false,
}: {
  hub: EvidenceHub;
  series: ReadonlyMap<SeriesKind, SeriesSlot>;
  ensureSeries: (kind: SeriesKind) => void;
  /** W3b: the links are the retained lane's; the footnote says so. */
  retained?: boolean;
}) {
  const linkFor = (kind: SeriesKind) => hub.series.find((entry) => entry.kind === kind);
  const sample = hub.oos_performance?.return_sample ?? null;
  const sharpeLink = linkFor("ROLLING_SHARPE_63");
  /* DQ-15: the concrete count is printed only when the Hub published it. */
  const belowWindow =
    sharpeLink?.availability.reason_code === "P13_OOS_DAILY_RETURNS_BELOW_ROLLING_WINDOW" &&
    sample !== null &&
    sample.kind === "DAILY_UTC_EQUITY" ? (
      <span className="mono" data-return-sample={sample.observation_count}>
        ({sample.observation_count} daily UTC returns published; the window needs 63.)
      </span>
    ) : undefined;
  return (
    <figure className="m-0 min-w-0 flex-[1.4_1_520px] rounded-[8px] border p-4" data-rolling-figure style={PANEL_STYLE}>
      <figcaption className="mb-3 flex flex-wrap items-baseline gap-2">
        <span className="mono text-[11px]" style={{ color: "var(--accent-2)" }} data-chart-no>
          EChart 3
        </span>
        <span className="text-[15px]" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          Strategy behavior — rolling 63-day Sharpe · rolling beta vs benchmark
        </span>
      </figcaption>
      <div className="grid gap-3.5 sm:grid-cols-2">
        <RollingHalf
          kind="ROLLING_SHARPE_63"
          label="rolling 63-day Sharpe"
          link={sharpeLink}
          slot={series.get("ROLLING_SHARPE_63")}
          onNeeded={ensureSeries}
          absentExtra={belowWindow}
        >
          {(loaded) => (
            <ChartFrame height={230}>
              <RollingSharpeChart series={loaded} />
            </ChartFrame>
          )}
        </RollingHalf>
        <RollingHalf
          kind="ROLLING_BETA_63"
          label="rolling 63-day beta vs benchmark"
          link={linkFor("ROLLING_BETA_63")}
          slot={series.get("ROLLING_BETA_63")}
          onNeeded={ensureSeries}
        >
          {/* The contract never gives this series values; if it ever did, this
              screen has no beta chart yet and says so instead of drawing one. */}
          {(loaded) => (
            <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {formatMetric(loaded.values.length, "count")} points published; this screen draws no beta chart yet.
            </p>
          )}
        </RollingHalf>
      </div>
      <div className="mt-2 text-[12px] leading-[1.4]" style={{ color: "var(--ink-faint)" }}>
        {retained
          ? "The retained walk-forward lane publishes neither series, so neither is drawn; the UI computes nothing."
          : "Read from the Evidence Hub's rolling series — QuantBT's rolling Sharpe over 63 daily OOS returns; the UI computes nothing."} A Sharpe that only lives in one regime, or a beta drifting toward 1, is a behavior
        finding the headline tiles cannot show.
      </div>
    </figure>
  );
}

/**
 * HiFi monthly cell tint: depth follows magnitude, `0.15 + 9·|r|`, capped at
 * 0.85. A colour depth for reading, not a number on screen — the value printed
 * under the cell is the server's own, rounded by DQ-08.
 */
export function monthTint(returnFraction: string): number {
  const magnitude = Math.abs(Number(returnFraction));
  if (!Number.isFinite(magnitude)) return 0.15;
  return Math.min(0.85, 0.15 + magnitude * 9);
}

function MonthlyHeat({ series }: { series: EvidenceSeries }) {
  const points = series.values as MonthlyReturnPoint[];
  return (
    <div className="flex items-end gap-[3px]" data-chart="monthly">
      {points.map((point) => {
        const negative = point.return_fraction.trim().startsWith("-");
        const month = new Date(point.month_start_utc_ms).toISOString().slice(0, 7);
        const shown = formatMetric(point.return_fraction, "fraction");
        /* HiFi tick: `7/26` — month without its zero, two-digit year. */
        const tick = `${month.slice(5).replace(/^0/, "")}/${month.slice(2, 4)}`;
        return (
          <span
            key={point.month_start_utc_ms}
            className="flex min-w-0 max-w-[56px] flex-1 flex-col gap-0.5"
            data-month={month}
            data-exact={point.return_fraction}
            title={`${month} · ${shown ?? point.return_fraction} · exact ${point.return_fraction}`}
          >
            <span
              className="block h-[26px] rounded-[3px]"
              data-month-cell
              style={{ background: negative ? "var(--bad)" : "var(--good)", opacity: monthTint(point.return_fraction) }}
            />
            <span
              className="mono text-center text-[8.5px]"
              style={{ color: negative ? "var(--bad)" : "var(--good)" }}
              data-month-value
            >
              {shown ?? point.return_fraction}
            </span>
            <span className="mono text-center text-[8px]" style={{ color: "var(--ink-faint)" }}>
              {tick}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- retained passport */

/**
 * Why a run has no retained passport, in words that name the cause
 * (FE-S04-09). RF-05 CG-P13-09 made the cause typed: a `409` carries
 * `details.lane_state`, so the sentence is chosen from that and never from the
 * server's message text. Without a lane state (an older responder) the code
 * alone decides, with one generic sentence.
 */
function passportCause(refusal: EvidenceRefusal): { key: string; sentence: string } | null {
  if (refusal.laneState) {
    return { key: refusal.laneState, sentence: CURRENT_SOURCE_LANE_COPY[refusal.laneState] };
  }
  if (refusal.code === "RESEARCH_CURRENT_SOURCE_CONFLICT") {
    return {
      key: "NOT_RETAINED",
      sentence: "not retained yet — no sealed retained artifact exists for this run. Nothing here is read from the live output instead.",
    };
  }
  return null;
}

/** Profile words for the typed not-applicable answer. */
const RUN_PROFILE_WORDS: Record<string, string> = {
  P04_FIXED_QUALIFICATION: "the P04 fixed qualification",
};

/**
 * RF-05 CG-P13-09: the lane answered `200` — this run's profile is one it
 * never holds. That is a fact about the run, rendered as not applicable with
 * its reason, and it is not an error: nothing is pending, nothing to retry.
 */
function PassportNotApplicable({ answer }: { answer: CurrentSourceNotApplicable }) {
  const profile = RUN_PROFILE_WORDS[answer.lane.run_profile] ?? answer.lane.run_profile;
  const sentence =
    reasonCodeSentence(answer.lane.reason_code) ??
    `This run is bound to ${profile}, which the retained lane never holds. Nothing is pending.`;
  return (
    <div className="flex flex-col gap-1.5" data-passport-not-applicable>
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-passport-cause="NOT_APPLICABLE">
        <Withheld availability={{ state: "NOT_APPLICABLE", reason_code: answer.lane.reason_code }} /> — {sentence} The
        lane retains <span className="mono">{answer.lane.retainable_profile_id}</span> runs only.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Pill data-run-profile={answer.lane.run_profile}>{answer.lane.run_profile}</Pill>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} title={answer.lane.run_adapter_contract_digest}>
          adapter contract {shortDigest(answer.lane.run_adapter_contract_digest, 12)}…
        </span>
      </div>
    </div>
  );
}

/**
 * Whether the passport read is skipped, and why. With a lifecycle block, only
 * an in-progress run is skipped — the lane would answer PENDING_SOURCE, and a
 * 409 on every visit is noise. Every other run is asked, and the lane's typed
 * answer is rendered. An older responder without the block keeps the RF-06
 * wave-A rule (skip a run the Hub says never sealed).
 */
function passportSkipOf(hub: EvidenceHub): { key: string; sentence: string } | null {
  const lifecycle = lifecycleOf(hub);
  if (lifecycle !== null) {
    return lifecycle.phase === "IN_PROGRESS"
      ? { key: "PENDING_SOURCE", sentence: `${CURRENT_SOURCE_LANE_COPY.PENDING_SOURCE} It is read once the run seals.` }
      : null;
  }
  const status = runStatus(hub);
  if (status !== null && ENDED_UNSEALED.has(status)) {
    return {
      key: "NOT_RETAINABLE",
      sentence: `not retainable — this run is ${status} and never sealed an output, so there is nothing to retain.`,
    };
  }
  if (hub.readiness === "NOT_READY" || (status !== null && LIVE.has(status))) {
    return {
      key: "NOT_SEALED",
      sentence: "not read — the hub has no sealed evidence for this run, so there is no retained output to ask for.",
    };
  }
  return null;
}

function PassportPanel({
  slot,
  onNeeded,
  skip,
}: {
  slot: PassportSlot;
  onNeeded: () => void;
  /** A typed reason not to ask: the run is still in progress (nothing to retain yet). */
  skip: { key: string; sentence: string } | null;
}) {
  /* FE-X-12, now server-driven: the read is skipped only while the Hub's
     lifecycle says the run is in progress; every other answer is the lane's. */
  const asks = skip === null;
  useEffect(() => {
    if (asks) onNeeded();
  }, [asks, onNeeded]);

  const refusal = slot.state === "refused" ? slot.refusal : null;
  const cause = refusal ? passportCause(refusal) : null;

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border p-4"
      data-passport={skip ? "skipped" : slot.state}
      style={PANEL_STYLE}
    >
      <PanelLabel>retained source passport</PanelLabel>

      {skip ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-passport-cause={skip.key}>
          {skip.sentence}
        </p>
      ) : slot.state === "ready" ? (
        <RetainedPassport evidence={slot.evidence} />
      ) : slot.state === "not-applicable" ? (
        <PassportNotApplicable answer={slot.answer} />
      ) : refusal ? (
        <div className="flex flex-col gap-1" data-passport-refusal data-lane-state={refusal.laneState ?? undefined}>
          {cause ? (
            <>
              <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-passport-cause={cause.key}>
                {cause.sentence}
              </p>
              {refusalDetail(refusal) ? (
                <p className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-refusal-detail>
                  {refusalDetail(refusal)}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
              <RefusalNote refusal={refusal} />
            </p>
          )}
        </div>
      ) : (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
          reading…
        </p>
      )}
    </section>
  );
}

function RetainedPassport({ evidence }: { evidence: CurrentSourceEvidence }) {
  const { passport, provenance } = evidence;
  const rows: [string, string, string][] = [
    ["initial equity", passport.initial_equity, "currency"],
    ["final equity", passport.final_equity, "currency"],
    ["net return", passport.net_return_fraction, "fraction"],
    ["max drawdown", passport.max_drawdown_fraction, "fraction"],
    ["retained positions", String(passport.retained_position_count), "count"],
    ["observations", String(passport.artifact_table_rows.observations), "count"],
    ["folds", String(passport.artifact_table_rows.folds), "count"],
    ["trials", String(passport.artifact_table_rows.trials), "count"],
    ["candidates", String(passport.artifact_table_rows.candidates), "count"],
  ];
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Pill data-profile={provenance.profile_id}>{provenance.profile_id}</Pill>
        <Pill data-source-adapter={provenance.source_adapter_id}>{provenance.source_adapter_id}</Pill>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          retained {utcZ(provenance.retained_at_utc_ms)}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
        {rows.map(([label, value, unit]) => (
          <div key={label} className="flex flex-col" data-passport-row={label}>
            <dt className="text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              {label}
            </dt>
            <dd className="mono text-[12px] font-semibold" title={value}>
              {formatMetric(value, unit) ?? value}
            </dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap gap-3">
        {(
          [
            ["route ledger", evidence.source_absences.route_ledger],
            ["audited fills", evidence.source_absences.audited_fills],
            ["benchmark", evidence.source_absences.benchmark],
          ] as const
        ).map(([label, fact]) => (
          <Withheld key={label} availability={fact.availability} what={label} />
        ))}
      </div>
    </>
  );
}

/* ------------------------------------------------- retained WFO lane (W3) */

/**
 * W3 · CG-P13-07 (A11): the claim cells a sealed retained WFO run answers,
 * verbatim QuantBT tokens in the HiFi order. A cell whose fact the source did
 * not publish keeps its place with the reason (spec 04 §22: never hide the
 * chip); `holdout` on the Delta WFO profile is a declaration (no holdout
 * segment), not a gap, and reads `n/a`.
 */
function RetainedClaimFields({
  claim,
  onJump,
}: {
  claim: CurrentSourceClaimStrip;
  onJump: (stage: EvidenceStage) => void;
}) {
  const cell = (
    name: string,
    fact: CurrentSourceClaimFact,
    stage: EvidenceStage,
    bar = false,
    detail?: string | null,
  ) => {
    if (fact.value === null) {
      return (
        <PassportField key={name} name={name} bar={bar} data-withheld={fact.state} data-claim-source={fact.source_key}>
          {fact.state === "NOT_APPLICABLE" ? (
            <span
              className="mono text-[12px]"
              style={{ color: "var(--ink-soft)" }}
              title={reasonTitle(fact.availability.state === "AVAILABLE" ? { state: "NOT_APPLICABLE", reason_code: fact.reason_code } as Availability : fact.availability as Availability)}
              data-claim-na
            >
              n/a
            </span>
          ) : (
            <Withheld availability={fact.availability as Availability} />
          )}
        </PassportField>
      );
    }
    const text = String(fact.value);
    return (
      <PassportField key={name} name={name} bar={bar} data-claim-value={text} data-claim-source={fact.source_key}>
        <button
          type="button"
          className="mono text-left text-[12px]"
          style={{ color: "var(--ink)" }}
          aria-label={`${name} ${text} — jump to source`}
          title={`QuantBT ${fact.source_key}${detail ? ` · ${detail}` : ""}`}
          onClick={() => onJump(stage)}
        >
          {text}
          {detail ? (
            <span className="text-[10px]" style={{ color: "var(--ink-faint)" }}>
              {" "}
              · {detail}
            </span>
          ) : null}
        </button>
      </PassportField>
    );
  };
  const contract = claim.execution_contract;
  const runtime = claim.runtime_authority;
  return (
    <>
      {cell("validation_claim", claim.validation_claim, "claim", true)}
      {cell("chronological_claim", claim.chronological_claim, "split")}
      {cell("oos_used_for_selection", claim.oos_used_for_selection, "search")}
      {cell("holdout_state", claim.holdout, "split")}
      {cell("causality_claim", claim.causality_claim, "claim")}
      {cell(
        "execution_contract",
        contract,
        "execute",
        false,
        contract.signal_phase && contract.fill_phase ? `${contract.signal_phase} → ${contract.fill_phase}` : null,
      )}
      {cell("runtime authority", runtime, "execute", false, runtime.final_account_runtime)}
    </>
  );
}

/** Verdict chip colours (HiFi `chipColors`): PASS green, WARN gold, DRAG filled red. */
const VERDICT_TONE: Record<string, string> = {
  PASS: "var(--good)",
  WARN: "var(--accent-2)",
  DRAG: "var(--bad)",
  NOT_EVALUATED: "var(--ink-faint)",
};

function signedRatio(value: string | null): string | null {
  const shown = formatRatio(value);
  if (shown === null || value === null) return null;
  return value.trim().startsWith("-") ? shown : `+${shown}`;
}

/** `−0.38%` — the fraction as a percentage, the screen's minus. */
function percentOf(value: string | null): string | null {
  return formatMetric(value, "fraction");
}

/**
 * W3 · CG-P13-08 (A09): the HiFi per-fold verdict table on the retained WFO
 * lane. Every number is QuantBT's (S_OOS, decay, trades) or a retained-path
 * derivation named in the rule footer (max DD, fold return, worst bar); the
 * verdict is the server's rule output — no threshold lives in this file.
 * Rows are worst first as served; "by fold" only reorders them.
 */
function RetainedVerdictTable({
  verdicts,
  runId,
  cursor,
  onFold,
}: {
  verdicts: CurrentSourceFoldVerdicts;
  runId: string;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
}) {
  const [order, setOrder] = useState<"worst" | "fold">("worst");
  const rows = order === "worst" ? verdicts.rows : [...verdicts.rows].sort((a, b) => a.source_ordinal - b.source_ordinal);
  const { counts, rule } = verdicts;
  const runPath = `/research/quantbt/runs/${encodeURIComponent(runId)}`;
  const meanOos = formatRatio(verdicts.mean_oos_sharpe);
  const meanDecay = signedRatio(verdicts.mean_decay);
  const dragging = verdicts.rows.filter((row) => row.verdict === "DRAG");

  return (
    <section
      className="overflow-x-auto rounded-[6px] border"
      data-retained-verdicts={verdicts.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <span className="inline-flex flex-wrap items-center gap-2.5">
          <PanelLabel>per-fold verdict — which fold carries the run, which fold drags it</PanelLabel>
          <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }} data-verdict-summary>
            {counts.drag} DRAG · {counts.warn} WARN · {counts.pass} PASS
            {counts.not_evaluated > 0 ? ` · ${counts.not_evaluated} not evaluated` : ""}
            {meanOos !== null ? (
              <span title={`${verdicts.mean_oos_sharpe} · mean S_OOS of the selected parameters`} data-verdict-fact="mean_oos_sharpe">
                {" "}
                — OOS {meanOos}
              </span>
            ) : null}
            {meanDecay !== null ? (
              <span title={`${verdicts.mean_decay} · mean decay of the selected parameters`} data-verdict-fact="mean_decay">
                , decay {meanDecay}
              </span>
            ) : null}
          </span>
        </span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {(
            [
              ["fold", "by fold"],
              ["worst", "worst first"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={order === key}
              data-verdict-sort={key}
              onClick={() => setOrder(key)}
              className="mono rounded-full border px-[9px] py-px text-[9px]"
              style={{
                borderColor: order === key ? "var(--accent)" : "var(--line)",
                background: order === key ? "var(--accent-soft)" : "var(--paper-raised)",
                color: order === key ? "var(--accent)" : "var(--ink-soft)",
              }}
            >
              {label}
            </button>
          ))}
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            {rule.version} · click a row to move the cursor
          </span>
        </span>
      </div>
      <table className="w-full min-w-[980px] border-collapse text-[12px]">
        <thead>
          <tr>
            {VERDICT_COLUMNS.map(([label, align]) => (
              <th
                key={label}
                scope="col"
                className="border-b px-3 py-[7px] text-[10px] font-medium uppercase tracking-[.07em]"
                style={{ color: "var(--ink-faint)", borderColor: "var(--line)", textAlign: align, minWidth: label === "OOS sharpe" ? 150 : undefined }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const fold = row.source_ordinal + 1;
            const current = cursor.fold === fold;
            const tone = VERDICT_TONE[row.verdict] ?? "var(--ink-faint)";
            const oos = row.oos_sharpe === null ? null : Number(row.oos_sharpe);
            const decay = row.decay === null ? null : Number(row.decay);
            const width = oos === null ? 0 : Math.max(0, Math.min(100, (oos / 1.5) * 100));
            const contribution = row.return_fraction === null ? null : Number(row.return_fraction);
            const withheld = (why: string) => (
              <span className="text-[10.5px] italic" style={{ color: "var(--ink-faint)" }} title={why}>
                not published
              </span>
            );
            const reason = row.reason_code ?? "RETAINED_FOLD_FACT_NOT_PUBLISHED";
            return (
              <tr
                key={row.fold_id}
                data-verdict-row={row.fold_id}
                data-verdict={row.verdict}
                data-current={current}
                aria-selected={current}
                tabIndex={0}
                onClick={() => onFold(fold)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onFold(fold);
                  }
                }}
                className="cursor-pointer"
                style={{
                  borderTop: "1px solid var(--line-soft)",
                  background: current ? "var(--accent-soft)" : "transparent",
                  boxShadow: `inset 2px 0 0 ${current ? "var(--accent)" : "transparent"}`,
                }}
              >
                <td className="mono px-3 py-1.5" title={`retained source fold id ${row.fold_id}`}>
                  {foldId(fold)}
                </td>
                <td className="px-3 py-1.5">
                  <span className="flex items-center gap-2">
                    <span className="relative h-2 flex-1 border" style={{ background: "var(--paper-sunken)", borderColor: "var(--line-soft)" }}>
                      <span
                        className="absolute bottom-0 left-0 top-0"
                        data-oos-bar={Math.round(width)}
                        style={{ width: `${width}%`, background: row.verdict === "DRAG" ? "var(--bad)" : "var(--role-oos)" }}
                      />
                    </span>
                    <span className="mono w-[44px] text-right" title={row.oos_sharpe ?? reason} data-exact={row.oos_sharpe ?? undefined}>
                      {formatRatio(row.oos_sharpe) ?? withheld(reason)}
                    </span>
                  </span>
                </td>
                <td
                  className="mono px-3 py-1.5 text-right"
                  style={{ color: decay !== null && decay > 0.3 ? "var(--bad)" : "var(--ink)" }}
                  title={row.decay ?? reason}
                >
                  {signedRatio(row.decay) ?? withheld(reason)}
                </td>
                <td className="mono px-3 py-1.5 text-right" title={row.oos_trades ?? reason}>
                  {formatMetric(row.oos_trades, "count") ?? withheld(reason)}
                </td>
                <td className="mono px-3 py-1.5 text-right" style={{ color: "var(--bad)" }} title={row.max_drawdown_fraction ?? reason}>
                  {percentOf(row.max_drawdown_fraction) ?? withheld(reason)}
                </td>
                <td
                  className="mono px-3 py-1.5 text-right"
                  style={{ color: contribution !== null && contribution < 0.02 ? "var(--accent-2)" : "var(--good)" }}
                  title={row.return_fraction !== null ? `${row.return_fraction} · fold return over its test window, from retained equity (compounds, not additive points)` : reason}
                >
                  {percentOf(row.return_fraction) ?? withheld(reason)}
                </td>
                <td className="px-3 py-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }} title={row.worst_return_fraction ?? reason}>
                  {row.worst_return_fraction !== null && row.worst_at_utc_ms !== null
                    ? `${percentOf(row.worst_return_fraction)} single bar · ${utcZ(row.worst_at_utc_ms)}`
                    : withheld(reason)}
                </td>
                <td className="px-3 py-1.5">
                  <span
                    className="mono rounded-full border px-2 py-px text-[9px] font-bold tracking-[.06em]"
                    data-verdict-chip={row.verdict}
                    title={
                      row.verdict === "NOT_EVALUATED"
                        ? reasonTitle({ state: "NOT_PUBLISHED", reason_code: row.reason_code } as Availability)
                        : row.failed_criteria.length > 0
                          ? `misses ${row.failed_criteria.join(", ").toLowerCase().replace(/_/g, " ")} under ${rule.version}`
                          : `meets every ${rule.version} bound`
                    }
                    style={{
                      borderColor: tone,
                      color: row.verdict === "DRAG" ? "var(--paper-raised)" : tone,
                      background: row.verdict === "DRAG" ? tone : "transparent",
                    }}
                  >
                    {row.verdict === "NOT_EVALUATED" ? "not evaluated" : row.verdict}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-1.5" onClick={(event) => event.stopPropagation()}>
                  <Link
                    to={deepDiveHref(`${runPath}/search`, { ...cursor, fold, stage: "search" })}
                    className="mono text-[10px]"
                    style={{ color: row.drag_target === "search" ? "var(--bad)" : "var(--accent)" }}
                    data-verdict-open="search"
                  >
                    search
                  </Link>{" "}
                  <span style={{ color: "var(--line)" }}>·</span>{" "}
                  <Link
                    to={deepDiveHref(`${runPath}/execute`, { ...cursor, fold, stage: "execute" })}
                    className="mono text-[10px]"
                    style={{ color: row.drag_target === "execute" ? "var(--bad)" : "var(--accent)" }}
                    data-verdict-open="replay"
                  >
                    replay
                  </Link>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 ? (
            <tr>
              <td colSpan={VERDICT_COLUMNS.length} className="px-3 py-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
                <Withheld availability={verdicts.availability as Availability} what="per-fold metrics" />
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <div
        className="border-t px-3 py-[7px] text-[10.5px] leading-[1.5]"
        style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }}
        data-verdict-foot
      >
        {dragging.length > 0
          ? `${dragging.map((row) => foldId(row.source_ordinal + 1)).join(", ")} ${dragging.length === 1 ? "drags" : "drag"}${
              dragging.some((row) => row.drag_target === "search") ? " — decay is a cause, so open search to see how the parameters were picked" : ""
            }. `
          : ""}
        S_OOS, decay and trades are QuantBT&apos;s per-fold score of the selected parameters; max dd, contribution
        and the worst bar are read from the retained equity inside each test window. Rule {rule.version}: PASS needs
        S_OOS ≥ {rule.pass.oos_sharpe_min}, decay ≤ {rule.pass.decay_max} and max dd ≥ {percentOf(rule.pass.max_drawdown_min)};
        one criterion inside S_OOS ≥ {rule.warn.oos_sharpe_min} / decay ≤ {rule.warn.decay_max} / max dd ≥{" "}
        {percentOf(rule.warn.max_drawdown_min)} is WARN; anything else is DRAG. The server applies the rule — this
        table only renders it.
      </div>
    </section>
  );
}

/**
 * W3 · CG-P13-05 (A02): the retained equity relation's caption. It says how
 * many of the retained observations are drawn, and — whatever was drawn —
 * where the whole relation's extrema are, so a sample never hides a trough.
 */
function RetainedSampleLine({ series }: { series: CurrentSourceEvidenceSeries }) {
  const sample = series.source_sample;
  const envelope = sample.envelope;
  const full = sample.sampling === "FULL";
  return (
    <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-retained-sampling={sample.sampling}>
      {full
        ? `all ${formatMetric(sample.source_observation_count, "count")} retained observations`
        : `${formatMetric(sample.emitted_point_count, "count")} of ${formatMetric(sample.source_observation_count, "count")} retained observations · extrema kept`}
      {envelope ? (
        <span data-envelope title={`min equity ${envelope.min_equity} at ${utcZ(envelope.min_equity_at_utc_ms)} · max equity ${envelope.max_equity} at ${utcZ(envelope.max_equity_at_utc_ms)} · deepest drawdown ${envelope.min_drawdown_fraction} at ${utcZ(envelope.min_drawdown_at_utc_ms)}`}>
          {" "}
          · range {formatMetric(envelope.min_equity, "currency")} – {formatMetric(envelope.max_equity, "currency")} · deepest
          drawdown {percentOf(envelope.min_drawdown_fraction)} at {utcZ(envelope.min_drawdown_at_utc_ms)}
        </span>
      ) : null}
    </span>
  );
}

function RetainedEquityPanels({
  slot,
  onNeeded,
  boundaries,
}: {
  slot: RetainedSeriesSlot;
  onNeeded: () => void;
  boundaries: FoldBoundary[];
}) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);
  const ready = slot.state === "ready" ? slot.series : null;
  const points = ready ? (ready.values as EquityPoint[]) : null;
  const state = (body: (points: EquityPoint[]) => ReactNode) =>
    slot.state === "refused" ? (
      <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
        <RefusalNote refusal={slot.refusal} />
      </p>
    ) : points === null ? (
      <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }}>
        reading…
      </p>
    ) : points.length === 0 ? (
      <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
        no series in artifact — see manifest
      </p>
    ) : (
      body(points)
    );
  return (
    <>
      <figure className="m-0 min-w-0 rounded-[8px] border p-4" style={PANEL_STYLE} data-retained-series="EQUITY" data-series-state={slot.state}>
        <figcaption className="mb-3 flex flex-wrap items-baseline gap-2">
          <span className="mono text-[11px]" style={{ color: "var(--accent-2)" }} data-chart-no>
            EChart 1
          </span>
          <span className="text-[15px]" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
            Equity — stitched OOS account
          </span>
          {ready ? <RetainedSampleLine series={ready} /> : null}
        </figcaption>
        {state((drawn) => (
          <ChartFrame height={380}>
            <EquityChart points={drawn} boundaries={boundaries} />
          </ChartFrame>
        ))}
        {ready ? (
          <div className="mono mt-2 flex flex-wrap gap-x-4 text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-retained-provenance>
            <span>source retained current-source · {ready.provenance.profile_id}</span>
            <span>units currency · UTC</span>
            <span title={ready.provenance.retained_import_digest}>retained import {shortDigest(ready.provenance.retained_import_digest, 12)}…</span>
          </div>
        ) : null}
      </figure>
      <figure className="m-0 min-w-0 rounded-[8px] border p-4" style={PANEL_STYLE} data-retained-series="UNDERWATER" data-series-state={slot.state}>
        <figcaption className="mb-3 flex flex-wrap items-baseline gap-2">
          <span className="mono text-[11px]" style={{ color: "var(--accent-2)" }} data-chart-no>
            EChart 2
          </span>
          <span className="text-[15px]" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
            Underwater — drawdown derived from equity
          </span>
        </figcaption>
        {state((drawn) => (
          <ChartFrame height={180}>
            <DrawdownChart points={drawn} boundaries={boundaries} />
          </ChartFrame>
        ))}
        <div className="mt-2 text-[12px] leading-[1.4]" style={{ color: "var(--ink-faint)" }}>
          Drawdown is a restatement of the equity series above, not a separate metric the engine computes.{" "}
          <span data-fold-boundaries={boundaries.length}>
            {boundaries.length > 0
              ? "Dashed lines mark where each fold's test window starts, from the retained fold plan."
              : "Fold boundaries are not marked: no fold start was published."}
          </span>
        </div>
      </figure>
    </>
  );
}

/* ------------------------------------------------------------------ tabs */

function TabHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div data-tab-heading>
      <h2 className="text-[23px] font-normal" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
        {title}
      </h2>
      <p className="mt-0.5 text-[13.5px] italic" style={{ fontFamily: "var(--font-display)", color: "var(--ink-faint)" }}>
        {subtitle}
      </p>
    </div>
  );
}

/** One HiFi segmented control: buttons in a bordered, clipped strip. */
function Segmented({
  options,
  label,
  ...rest
}: {
  options: { label: string; on: boolean; why?: string }[];
  label: string;
} & Record<string, unknown>) {
  return (
    <span
      className="inline-flex overflow-hidden rounded-[6px] border"
      style={{ borderColor: "var(--line)" }}
      role="group"
      aria-label={label}
      {...rest}
    >
      {options.map((entry) => (
        <button
          key={entry.label}
          type="button"
          /* Only the published choice is live; the rest keep their place, and
             their title says why they cannot be chosen. */
          disabled={!entry.on}
          aria-pressed={entry.on}
          title={entry.why}
          data-segment={entry.label}
          className="mono border-r px-3.5 py-1 text-[11px] last:border-r-0"
          style={{
            borderColor: "var(--line)",
            background: entry.on ? "var(--accent-soft)" : "var(--paper-raised)",
            color: entry.on ? "var(--accent)" : "var(--ink-soft)",
            cursor: entry.on ? "default" : "not-allowed",
          }}
        >
          {entry.label}
        </button>
      ))}
    </span>
  );
}

/**
 * The HiFi window switcher and the capital toggle. The Hub publishes the OOS
 * window only and one equity series in account currency, so OOS and Capital
 * are the live choices and the others keep their place with the reason.
 */
function WindowSwitcher() {
  const notWindow = "the Evidence Hub publishes the OOS window only";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5" data-window-switcher>
      <div className="flex flex-wrap items-center gap-2.5">
        <Segmented
          label="window"
          options={[
            { label: "IS", on: false, why: notWindow },
            { label: "OOS", on: true, why: "the window every metric and series on this tab describes" },
            { label: "Holdout Live", on: false, why: notWindow },
            { label: "Compare", on: false, why: notWindow },
          ]}
        />
        <span
          className="mono border-l-2 pl-1.5 text-[10px]"
          style={{ color: "var(--accent-2)", borderColor: "var(--accent-2)" }}
          data-window-disclosure
        >
          {WINDOW_DISCLOSURE}
        </span>
      </div>
      <Segmented
        label="equity scale"
        data-capital-toggle
        options={[
          { label: "Capital", on: true, why: "equity as the account holds it" },
          { label: "Rebased 100", on: false, why: "a rebased series is not published; this screen does not rebase one" },
        ]}
      />
    </div>
  );
}

/** Per-fold verdict columns, in the HiFi's order and alignment. */
const VERDICT_COLUMNS: [string, "left" | "right"][] = [
  ["fold", "left"],
  ["OOS sharpe", "left"],
  ["Δ decay", "right"],
  ["trades", "right"],
  ["max dd", "right"],
  ["contribution", "right"],
  ["worst moment", "left"],
  ["verdict", "left"],
  ["open", "left"],
];

/**
 * The per-fold verdict table, kept at full shape (DQ-14): header, sort pills
 * and column heads, with one row saying the rows are not published.
 */
/**
 * The verdict header (spec 04 §2.6: "5 folds · 3 PASS · 1 WARN · 1 DRAG — OOS
 * 1.186, decay +0.18 …"), in the slot the HiFi gives it — the per-fold
 * table's header. Each clause is printed only from a published fact (DQ-15):
 * the fold count is the observed set, the verdict tally is left to the
 * header's "per-fold metrics · not published" note (CG-P13-08), and OOS
 * Sharpe and decay are the registry-v3 values or their typed absences. The spec's closing clause about the claim is not asserted.
 */
function VerdictSummary({ hub }: { hub: EvidenceHub }) {
  const folds = hub.core.fold_navigation;
  const observed = folds && isAvailable(folds.availability) ? (folds.published_fold_count ?? folds.observed_folds.length) : null;
  const metrics = hub.oos_performance?.metrics ?? [];
  const sharpe = metrics.find((metric) => metric.key === "OOS_SHARPE");
  const decay = metrics.find((metric) => metric.key === "OOS_SHARPE_DECAY");
  const clause = (metric: PerformanceMetric | undefined, name: string, signed: boolean) => {
    if (metric === undefined) return null;
    if (isAvailable(metric.availability) && metric.value !== null) {
      const shown = formatRatio(metric.value);
      const sign = signed && !metric.value.trim().startsWith("-") ? "+" : "";
      return (
        <span data-verdict-fact={metric.key} data-exact={metric.value} title={metric.value}>
          {name} {sign}
          {shown ?? metric.value}
        </span>
      );
    }
    return (
      <span data-verdict-fact={metric.key} data-withheld={metric.availability.state} title={reasonTitle(metric.availability)}>
        {name} {WITHHELD_WORDS[metric.availability.state]}
      </span>
    );
  };
  const sharpeClause = clause(sharpe, "OOS Sharpe", false);
  const decayClause = clause(decay, "decay", true);
  return (
    <span className="mono text-[9px]" style={{ color: "var(--ink-soft)" }} data-verdict-summary>
      {observed !== null ? `${observed} observed ${observed === 1 ? "fold" : "folds"}` : "observed folds not published"}
      {sharpeClause !== null || decayClause !== null ? " — " : null}
      {sharpeClause}
      {sharpeClause !== null && decayClause !== null ? ", " : null}
      {decayClause}
    </span>
  );
}

function VerdictTable({ hub }: { hub: EvidenceHub }) {
  const perFold = hub.source_absences.per_fold_metrics;
  return (
    <section
      className="overflow-x-auto rounded-[6px] border"
      data-gap="per-fold-verdict"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2" style={{ borderColor: "var(--line)" }}>
        <span className="inline-flex flex-wrap items-center gap-2.5">
          <PanelLabel>per-fold verdict — which fold carries the run, which fold drags it</PanelLabel>
          <VerdictSummary hub={hub} />
        </span>
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {[
            ["by fold", true],
            ["worst first", false],
          ].map(([label, on]) => (
            <button
              key={String(label)}
              type="button"
              disabled
              title="no per-fold rows are published to sort"
              className="mono rounded-full border px-[9px] py-px text-[9px]"
              style={{
                borderColor: on ? "var(--accent)" : "var(--line)",
                background: on ? "var(--accent-soft)" : "var(--paper-raised)",
                color: on ? "var(--accent)" : "var(--ink-soft)",
                cursor: "not-allowed",
              }}
            >
              {label}
            </button>
          ))}
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
            per-fold metrics · not published
          </span>
        </span>
      </div>
      <table className="w-full min-w-[980px] border-collapse text-[12px]">
        <thead>
          <tr>
            {VERDICT_COLUMNS.map(([label, align]) => (
              <th
                key={label}
                scope="col"
                className="border-b px-3 py-[7px] text-[10px] font-medium uppercase tracking-[.07em]"
                style={{ color: "var(--ink-faint)", borderColor: "var(--line)", textAlign: align }}
              >
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={VERDICT_COLUMNS.length} className="px-3 py-1.5 text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {perFold ? <Withheld availability={perFold} what="per-fold metrics" /> : <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what="per-fold metrics" />}
            </td>
          </tr>
        </tbody>
      </table>
      <div
        className="border-t px-3 py-[7px] text-[10.5px] leading-[1.5]"
        style={{ borderColor: "var(--line-soft)", color: "var(--ink-soft)" }}
      >
        The Evidence contract publishes run-final metrics and six named series; it publishes no per-fold metric,
        verdict or threshold rule. A verdict drawn here would be this screen&apos;s opinion, not the engine&apos;s.
      </div>
    </section>
  );
}

/* ------------------------------------------------ W3b · retained headline */

/** A retained absence the UI names itself: the lane has no field for it. */
const RETAINED_NO_FIELD: Availability = { state: "NOT_PUBLISHED", reason_code: "UI_RETAINED_LANE_HAS_NO_FIELD" };
const RETAINED_NO_SERIES: Availability = { state: "NOT_PUBLISHED", reason_code: "UI_RETAINED_LANE_HAS_NO_SERIES" };

/** One headline tile on a retained WFO run: a value the lane published, or its typed absence. */
export interface RetainedTileFact {
  key: TileKey;
  label: string;
  /** The exact server string, or null with `absence`. */
  value: string | null;
  unit: "currency" | "fraction" | "count" | "ratio";
  /** The tile foot: where the value comes from, in the lane's words. */
  foot: string;
  absence: Availability | null;
}

const RETAINED_LABEL: Partial<Record<TileKey, string>> = {
  FINAL_EQUITY: "Final equity",
  NET_RETURN_FRACTION: "Net return",
  MAX_DRAWDOWN_FRACTION: "Max drawdown",
  TRADE_COUNT: "Trade count",
  OOS_SORTINO: "OOS Sortino",
  OOS_CAGR_FRACTION: "OOS CAGR",
  OOS_PROFIT_FACTOR: "OOS profit factor",
  OOS_LONG_HIT_RATE_FRACTION: "OOS long-bar hit rate",
  OOS_SHORT_HIT_RATE_FRACTION: "OOS short-bar hit rate",
  BARS_PROCESSED: "Bars processed",
  INITIAL_EQUITY: "Initial equity",
  BENCHMARK_RETURN_FRACTION: "Benchmark return",
  FUNDING_TOTAL: "Funding total",
};

function laneAbsence(entry: { state: string; reason_code?: string | null } | null | undefined, fallback: Availability): Availability {
  return entry ? { state: entry.state as Availability["state"], reason_code: entry.reason_code ?? null } : fallback;
}

/**
 * W3b — the fifteen headline tiles of a sealed retained WFO run, in the HiFi
 * order. The P04 hub answers this run with its own NOT_PUBLISHED; the retained
 * lane is the authority, so a tile shows the lane's value (the passport, or the
 * verdict block's fold means, labelled as such) or the lane's own absence.
 * Nothing is computed here: a mean over folds is the server's `mean_*`.
 */
export function retainedTiles(evidence: CurrentSourceEvidence): RetainedTileFact[] {
  const passport = evidence.passport;
  const verdicts = (evidence as Partial<CurrentSourceEvidence>).fold_verdicts ?? null;
  const absences = (evidence as Partial<CurrentSourceEvidence>).source_absences ?? null;
  const verdictsOk = verdicts !== null && verdicts.state === "AVAILABLE";
  const ACCOUNT = "retained stitched account";
  const fact = (
    key: TileKey,
    value: string | number | null | undefined,
    unit: RetainedTileFact["unit"],
    foot: string,
    absence: Availability = RETAINED_NO_FIELD,
    label?: string,
  ): RetainedTileFact => ({
    key,
    label: label ?? RETAINED_LABEL[key] ?? key,
    value: value === null || value === undefined ? null : String(value),
    unit,
    foot,
    absence: value === null || value === undefined ? absence : null,
  });
  return TILE_ORDER.map((key) => {
    switch (key) {
      case "FINAL_EQUITY":
        return fact(key, passport.final_equity, "currency", `${ACCOUNT} · currency · source-derived`);
      case "NET_RETURN_FRACTION":
        return fact(key, passport.net_return_fraction, "fraction", `${ACCOUNT} · percent · source-derived`);
      case "MAX_DRAWDOWN_FRACTION":
        return fact(key, passport.max_drawdown_fraction, "fraction", `${ACCOUNT} · percent · source-derived`);
      case "INITIAL_EQUITY":
        return fact(key, passport.initial_equity, "currency", `${ACCOUNT} · currency · source-derived`);
      case "BARS_PROCESSED":
        return fact(key, passport.artifact_table_rows.observations, "count", "retained observations · count · source-derived");
      case "OOS_SHARPE":
        return fact(
          key,
          verdictsOk ? verdicts.mean_oos_sharpe : null,
          "ratio",
          "mean of fold OOS Sharpe · QuantBT fold score",
          RETAINED_NO_FIELD,
          "OOS Sharpe · fold mean",
        );
      case "OOS_SHARPE_DECAY":
        return fact(
          key,
          verdictsOk ? verdicts.mean_decay : null,
          "ratio",
          "mean of fold decay · QuantBT fold score",
          RETAINED_NO_FIELD,
          "Sharpe decay · fold mean",
        );
      case "BENCHMARK_RETURN_FRACTION":
        return fact(key, null, "fraction", "retained lane · benchmark", laneAbsence(absences?.benchmark, RETAINED_NO_FIELD));
      case "TRADE_COUNT":
        return fact(key, null, "count", "per-fold OOS trades are in the verdict table");
      default:
        return fact(key, null, "fraction", "retained lane · no such field");
    }
  });
}

function RetainedTile({ tile }: { tile: RetainedTileFact }) {
  const raw = tile.value === null ? null : tile.unit === "ratio" ? formatRatio(tile.value) : formatMetric(tile.value, tile.unit);
  const shown = raw === null ? null : raw.replace(/^-/, "−");
  const negative = tile.value !== null && tile.value.trim().startsWith("-");
  const tone =
    tile.value === null || tile.unit === "currency" || tile.unit === "count"
      ? "var(--ink)"
      : tile.key === "MAX_DRAWDOWN_FRACTION" || negative
        ? "var(--bad)"
        : "var(--good)";
  return (
    <div
      className="flex min-h-[90px] min-w-0 flex-col gap-[3px] rounded-[6px] border px-3 py-2"
      data-metric={tile.key}
      data-metric-lane="retained"
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {tile.label}
      </span>
      {tile.value !== null ? (
        <span
          className="mono text-[22px] font-semibold leading-[28px]"
          style={{ color: tone, fontVariantNumeric: "tabular-nums" }}
          data-metric-value={tile.key}
          data-exact={tile.value}
          title={tile.value}
          onCopy={(event) => {
            event.clipboardData.setData("text/plain", tile.value as string);
            event.preventDefault();
          }}
        >
          {shown ?? tile.value}
        </span>
      ) : (
        <span className="leading-[28px]">
          <Withheld availability={tile.absence ?? RETAINED_NO_FIELD} />
        </span>
      )}
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-metric-scope="RETAINED">
        {tile.foot}
      </span>
    </div>
  );
}

/**
 * W3b — the Hub-shaped series links of a retained run: the lane's own derived
 * series where it publishes one, its typed absence where it does not (a
 * rolling beta needs the benchmark the lane names as unpublished).
 */
export function retainedSeriesLinks(evidence: CurrentSourceEvidence): EvidenceHub["series"] {
  const absences = (evidence as Partial<CurrentSourceEvidence>).source_absences ?? null;
  const mapped = (kind: RetainedSeriesKind) => {
    const entry = evidence.series.find((candidate) => candidate.kind === kind);
    return {
      kind,
      availability: entry ? (entry.availability as Availability) : RETAINED_NO_SERIES,
      href: entry?.href ?? null,
    } as unknown as EvidenceHub["series"][number];
  };
  return [
    mapped("MONTHLY_RETURNS"),
    mapped("RETURN_DISTRIBUTION"),
    mapped("ROLLING_RETURNS_20"),
    { kind: "ROLLING_SHARPE_63", availability: RETAINED_NO_SERIES, href: null } as EvidenceHub["series"][number],
    {
      kind: "ROLLING_BETA_63",
      availability: laneAbsence(absences?.benchmark, RETAINED_NO_SERIES),
      href: null,
    } as EvidenceHub["series"][number],
  ];
}

/** The retained kinds a Summary panel reads through the Hub-shaped panel frame. */
export const RETAINED_PANEL_KINDS: readonly RetainedSeriesKind[] = ["MONTHLY_RETURNS", "RETURN_DISTRIBUTION", "ROLLING_RETURNS_20"];

/** A retained series in the Hub series' shape: the value rows are the same types. */
export function asHubSeries(series: CurrentSourceEvidenceSeries): EvidenceSeries {
  return {
    schema_version: "research.evidence-series.v1",
    run_id: series.run_id,
    revision: series.revision,
    etag: series.etag,
    kind: series.kind,
    availability: series.availability,
    source_sample: {
      source_observation_count: series.source_sample.source_observation_count,
      emitted_point_count: series.source_sample.emitted_point_count,
      sampling: series.source_sample.sampling,
    },
    values: series.values,
  } as unknown as EvidenceSeries;
}

/** The HiFi behaviour tiles, each an empty cell with its reason (DQ-14). */
const BEHAVIOR_TILES = [
  "beta vs benchmark",
  "corr vs benchmark",
  "skew",
  "excess kurtosis",
  "win rate",
  "avg holding",
  "exposure L/S/F",
  "turnover",
] as const;

function BehaviorCard({ retained = null }: { retained?: CurrentSourceEvidence | null }) {
  const benchmark = retained ? ((retained as Partial<CurrentSourceEvidence>).source_absences?.benchmark ?? null) : null;
  const reasonFor = (label: string): Availability =>
    retained === null
      ? { state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_BEHAVIOR_ANALYTIC" }
      : label.includes("benchmark") && benchmark
        ? { state: benchmark.state as Availability["state"], reason_code: benchmark.reason_code ?? null }
        : RETAINED_NO_FIELD;
  return (
    <section
      className="flex min-w-0 flex-[1_1_340px] flex-col gap-1.5 rounded-[8px] border p-3.5"
      data-gap="behavior-tiles"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <PanelLabel>behavior — engine-published, UI renders</PanelLabel>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          {retained ? "retained walk-forward lane" : "segment not published"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {BEHAVIOR_TILES.map((label) => (
          <span
            key={label}
            className="flex min-w-0 flex-col gap-px rounded-[6px] border px-2.5 py-1.5"
            style={{ borderColor: "var(--line-soft)" }}
            data-behavior-tile={label}
          >
            <span className="text-[9px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
              {label}
            </span>
            <Withheld availability={reasonFor(label)} />
          </span>
        ))}
      </div>
      <span className="text-[10px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
        {retained
          ? "The retained walk-forward lane publishes no behaviour analytic, and no benchmark for the two benchmark tiles. "
          : "No behaviour analytic is published for this run. "}
        These tiles stay empty rather than being computed from the equity series, which would make the chart the source
        of a number the engine never issued.
      </span>
    </section>
  );
}

function SummaryTab({
  hub,
  runId,
  cursor,
  onFold,
  series,
  ensureSeries,
  passport,
  ensurePassport,
  retainedSeries,
  ensureRetainedSeries,
  retainedKinds,
  ensureRetainedKind,
}: {
  hub: EvidenceHub;
  runId: string;
  cursor: EvidenceCursor;
  onFold: (fold: number) => void;
  series: ReadonlyMap<SeriesKind, SeriesSlot>;
  ensureSeries: (kind: SeriesKind) => void;
  passport: PassportSlot;
  ensurePassport: () => void;
  retainedSeries: RetainedSeriesSlot;
  ensureRetainedSeries: () => void;
  retainedKinds: ReadonlyMap<RetainedSeriesKind, RetainedSeriesSlot>;
  ensureRetainedKind: (kind: RetainedSeriesKind) => void;
}) {
  /* W3: a sealed retained WFO run answers the equity, underwater and verdict
     panels from its retained lane; every other run keeps the Hub's. */
  const retained = passport.state === "ready" ? passport.evidence : null;
  /* Optional: a pre-W3 responder sends the passport without these blocks. */
  const verdicts = (retained as Partial<CurrentSourceEvidence> | null)?.fold_verdicts ?? null;
  const boundaries: FoldBoundary[] = verdicts
    ? [...verdicts.rows]
        .sort((left, right) => left.source_ordinal - right.source_ordinal)
        .filter((row) => row.test_start_utc_ms !== null)
        .map((row) => ({ at_utc_ms: row.test_start_utc_ms as number, label: foldId(row.source_ordinal + 1) }))
    : [];
  /* W3b: on a retained run the Hub's series links and slots are the lane's —
     the Hub answers this run with its own NOT_PUBLISHED, which describes the
     P04 hub, not the run. The panels keep their frames; only the source moves. */
  const laneHub: EvidenceHub = retained ? { ...hub, series: retainedSeriesLinks(retained) } : hub;
  const laneSeries: ReadonlyMap<SeriesKind, SeriesSlot> = retained
    ? new Map(
        RETAINED_PANEL_KINDS.flatMap((kind): [SeriesKind, SeriesSlot][] => {
          const slot = retainedKinds.get(kind);
          if (slot === undefined) return [];
          const mapped: SeriesSlot =
            slot.state === "ready" ? { state: "ready", series: asHubSeries(slot.series) } : (slot as SeriesSlot);
          return [[kind as SeriesKind, mapped]];
        }),
      )
    : series;
  const laneEnsure = useCallback(
    (kind: SeriesKind) => {
      if (retained === null) {
        ensureSeries(kind);
        return;
      }
      if ((RETAINED_PANEL_KINDS as readonly string[]).includes(kind)) ensureRetainedKind(kind as RetainedSeriesKind);
    },
    [retained, ensureSeries, ensureRetainedKind],
  );
  const linkFor = (kind: SeriesKind) => laneHub.series.find((entry) => entry.kind === kind);
  const performance = hub.oos_performance ?? null;
  /* One grid, HiFi row first. A registry-v3 key appears only when the Hub
     sends the block (an older responder does not); a v2 key only when sent. */
  const tiles = retained
    ? retainedTiles(retained).map((tile) => <RetainedTile key={tile.key} tile={tile} />)
    : TILE_ORDER.flatMap((key): ReactNode[] => {
        const v2 = hub.metrics.find((metric) => metric.key === key);
        if (v2) return [<MetricTile key={key} metric={v2} />];
        const v3 = performance?.metrics.find((metric) => metric.key === key);
        return v3 && performance ? [<PerformanceTile key={key} metric={v3} block={performance} />] : [];
      });
  /* A v2 key this screen does not order still gets its tile, after the rest. */
  const unordered = retained
    ? []
    : hub.metrics
        .filter((metric) => !TILE_ORDER.includes(metric.key))
        .map((metric) => <MetricTile key={metric.key} metric={metric} />);
  const publisher = retained ? "the retained lane" : "the Hub";
  const passportSkip = passportSkipOf(hub);

  return (
    <section data-screen-label="Summary" className="flex flex-col gap-3.5">
      <WindowSwitcher />

      {/* HiFi: five tiles to a row, never narrower than 150px. */}
      <div
        className="grid gap-2"
        style={{ gridTemplateColumns: "repeat(auto-fill, minmax(max(150px, calc((100% - 32px) / 5)), 1fr))" }}
        data-metrics
      >
        {tiles}
        {unordered}
      </div>

      {retained ? (
        <RetainedEquityPanels slot={retainedSeries} onNeeded={ensureRetainedSeries} boundaries={boundaries} />
      ) : null}

      {retained ? null : (
      <>
      <SeriesPanel
        kind="EQUITY_OOS"
        chartNo={1}
        title="Equity — stitched OOS account"
        link={linkFor("EQUITY_OOS")}
        slot={series.get("EQUITY_OOS")}
        onNeeded={ensureSeries}
        emptyReason="the source published this series with no points, so no curve is drawn."
        footer={(loaded) => (
          <>
            <ProvenanceRow hub={hub} series={loaded} kind="EQUITY_OOS" />
            {hub.warnings.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-0.5" data-warnings>
                {hub.warnings.map((warning) => (
                  <li
                    key={warning.definition_id}
                    data-warning={warning.definition_id}
                    data-warning-state={warning.state}
                    title={warning.reason_code ?? undefined}
                    className="text-[12px] leading-[1.4]"
                    style={{ color: warning.state === "ACTIVE" ? "var(--accent-2)" : "var(--ink-faint)" }}
                  >
                    {warning.copy}
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      >
        {(loaded) => (
          <ChartFrame height={380}>
            <EquityChart series={loaded} />
          </ChartFrame>
        )}
      </SeriesPanel>

      <SeriesPanel
        kind="EQUITY_OOS"
        chartNo={2}
        title="Underwater — drawdown derived from equity"
        link={linkFor("EQUITY_OOS")}
        slot={series.get("EQUITY_OOS")}
        onNeeded={ensureSeries}
        emptyReason="the source published this series with no points, so no drawdown is drawn."
        footnote={
          <>
            Drawdown is a restatement of the equity series above, not a separate metric the engine computes.{" "}
            <span data-fold-boundaries>
              Fold boundaries are not marked: the Hub publishes which folds were observed, not where each one starts.
            </span>
          </>
        }
      >
        {(loaded) => (
          <ChartFrame height={180}>
            <DrawdownChart series={loaded} />
          </ChartFrame>
        )}
      </SeriesPanel>
      </>
      )}

      {verdicts ? (
        <RetainedVerdictTable verdicts={verdicts} runId={runId} cursor={cursor} onFold={onFold} />
      ) : (
        <VerdictTable hub={hub} />
      )}

      <div className="flex flex-wrap gap-3.5">
        <RollingFigure hub={laneHub} series={laneSeries} ensureSeries={laneEnsure} retained={retained !== null} />
        <SeriesPanel
          kind="RETURN_DISTRIBUTION"
          chartNo={4}
          title="Return distribution — stitched OOS"
          className="flex-[1_1_380px]"
          link={linkFor("RETURN_DISTRIBUTION")}
          slot={laneSeries.get("RETURN_DISTRIBUTION")}
          onNeeded={laneEnsure}
          emptyReason="the source published no histogram bucket for this run, so no bar is drawn."
          footnote={`Bucket edges and counts as ${publisher} published them — the UI bins nothing.`}
        >
          {(loaded) => (
            <ChartFrame height={230}>
              <DistributionChart series={loaded} />
            </ChartFrame>
          )}
        </SeriesPanel>
      </div>

      <div className="flex flex-wrap gap-3.5">
        <SeriesPanel
          kind="MONTHLY_RETURNS"
          variant="card"
          title="monthly returns — stitched OOS"
          className="flex-[1.3_1_460px]"
          link={linkFor("MONTHLY_RETURNS")}
          slot={laneSeries.get("MONTHLY_RETURNS")}
          onNeeded={laneEnsure}
          emptyReason="no calendar month was published for this run — the source emitted 0 monthly values, so no cell is drawn. A month is never reduced from the equity series here."
          footnote="One cell per calendar month, value in %. Depth of tint = magnitude; the reading to look for is clustering — three red cells in a row is a regime, not noise."
        >
          {(loaded) => <MonthlyHeat series={loaded} />}
        </SeriesPanel>
        <BehaviorCard retained={retained} />
      </div>

      {/*
        * Not in the HiFi: before RF-05 this series stood in EChart 3's place.
        * Rolling Sharpe now takes that place; the 20-observation return is
        * still published evidence, so it keeps a figure of its own rather
        * than disappearing from the screen.
        */}
      <SeriesPanel
        kind="ROLLING_RETURNS_20"
        chartNo={5}
        title="Rolling 20-observation return — stitched OOS"
        link={linkFor("ROLLING_RETURNS_20")}
        slot={laneSeries.get("ROLLING_RETURNS_20")}
        onNeeded={laneEnsure}
        emptyReason="the source published no rolling window for this run, so no line is drawn."
        footnote={
          retained
            ? "Read from the retained lane's published rolling series — the UI computes nothing."
            : "Read from the Evidence Hub's published rolling series — the UI computes nothing."
        }
      >
        {(loaded) => (
          <ChartFrame height={230}>
            <RollingChart series={loaded} />
          </ChartFrame>
        )}
      </SeriesPanel>

      <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
        {SAMPLING_NOTE}{" "}
        {retained
          ? "The retained equity above draws every retained observation up to 2,000 and names its extrema past that; each retained series names its own sampling."
          : `Every Hub series is capped at ${SERIES_POINT_CAP} points by the contract.`}
      </p>

      <PassportPanel slot={passport} onNeeded={ensurePassport} skip={passportSkip} />
    </section>
  );
}

function StagePreviewTab({
  stage,
  cursor,
  hub,
  runId,
}: {
  stage: PreviewStage;
  cursor: EvidenceCursor;
  hub: EvidenceHub;
  runId: string;
}) {
  const dive = DEEP_DIVE[stage];
  const preview = STAGE_PREVIEW[stage];
  const key = STAGE_KEY[stage];
  const row = hub.stages.find((entry) => entry.key === key);

  return (
    <section data-screen-label={STAGE_CRUMB[stage]} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <TabHeading title={preview.title} subtitle={preview.subtitle} />
        {dive.path !== null ? (
          <Link
            to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/${dive.path}`, cursor)}
            data-deep-dive={stage}
            className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase tracking-[.05em]"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            open deep dive → {dive.screen}
          </Link>
        ) : (
          <span
            data-deep-dive={stage}
            title={`Screen ${dive.screen} has no published route yet (${dive.phase}), so this link would go nowhere.`}
            className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase tracking-[.05em]"
            style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.55, cursor: "not-allowed" }}
          >
            open deep dive → {dive.screen}
          </span>
        )}
      </div>

      <section
        className="flex flex-wrap items-baseline gap-3 rounded-[8px] border px-3.5 py-2.5"
        data-stage-row={key}
        style={PANEL_STYLE}
      >
        <span className="mono text-[11px] font-bold">{key}</span>
        {row ? (
          <>
            <span className="mono text-[10.5px] font-semibold" data-stage-state={row.state}>
              {row.state}
            </span>
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              started {row.started_at_utc_ms === null ? "not published" : utcZ(row.started_at_utc_ms)}
            </span>
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              completed {row.completed_at_utc_ms === null ? "not published" : utcZ(row.completed_at_utc_ms)}
            </span>
          </>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what="stage" />
        )}
        <span className="mono ml-auto text-[9px]" style={{ color: "var(--ink-faint)" }}>
          preview — the deep dive owns the full story
        </span>
      </section>

      {/* DQ-14: the HiFi's panels keep their places, each with the reason it is empty. */}
      <div className="grid gap-3.5 md:grid-cols-2" data-stage-shells={stage}>
        {preview.panels.map((title) => (
          <SourceGap
            key={title}
            id={`stage-${stage}-${title.split(" ")[0]}`}
            title={title}
            reason={
              <>
                <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} />{" "}
                — the Evidence Hub publishes this stage's timeline, not its content.{" "}
                {dive.path !== null ? `Screen ${dive.screen} reads it.` : `Screen ${dive.screen} is not built yet (${dive.phase}).`}
              </>
            }
          />
        ))}
      </div>

      {/* The cursor this tab would hand on, shown so the reader can see it is
          carried rather than reset. */}
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-carried-cursor>
        carries {deepDiveHref("", cursor)}
      </span>
    </section>
  );
}

/**
 * A hook whose screen is not built: drawn in the HiFi's button style (primary
 * or outline), refused, and titled with the phase that builds it.
 */
function UnroutedAction({
  label,
  screen,
  phase,
  primary = false,
}: {
  label: string;
  screen: string;
  phase: string;
  primary?: boolean;
}) {
  return (
    <span
      data-action-unrouted={label}
      data-primary={primary || undefined}
      aria-disabled="true"
      title={`Screen ${screen} is not built yet (${phase}), so this action would go nowhere.`}
      className={`mono rounded-[6px] border px-3 py-1 text-[10px] uppercase tracking-[.05em] ${primary ? "font-semibold" : ""}`}
      style={{
        color: primary ? "var(--accent-contrast)" : "var(--accent)",
        borderColor: "var(--accent)",
        background: primary ? "var(--accent)" : "transparent",
        opacity: 0.55,
        cursor: "not-allowed",
      }}
    >
      {label}
    </span>
  );
}

/** The HiFi's two gated hooks under NEXT, disabled with SOON. */
function SoonHook({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3" data-soon-hook={label}>
      <button
        type="button"
        disabled
        aria-disabled="true"
        className="mono rounded-[6px] border px-4 py-2 text-[11px] font-semibold uppercase tracking-[.05em]"
        style={{ borderColor: "var(--viz-legend-inactive)", background: "var(--paper-sunken)", color: "var(--ink-faint)", cursor: "not-allowed" }}
      >
        {label}
      </button>
      <span
        className="mono rounded-[3px] border border-dashed px-[5px] py-px text-[9px] font-semibold"
        style={{ borderColor: "var(--ink-faint)", color: "var(--ink-faint)" }}
      >
        SOON
      </span>
      <span className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {children}
      </span>
    </div>
  );
}

function ClaimTab({ hub }: { hub: EvidenceHub }) {
  const claim = hub.claim;
  const certificate = claim.methodology_certificate;
  const issuedClaim = claim.state === "ISSUED";
  return (
    <section data-screen-label="Stage 5 · Claim" className="flex flex-col gap-3.5">
      <TabHeading
        title="Stage 5 · Claim — what this run is allowed to say"
        subtitle="The claim passport only aggregates. Nothing here is computed on this screen."
      />

      <section className="flex flex-col gap-2 rounded-[8px] border px-3.5 py-3" data-claim-panel={claim.state} style={PANEL_STYLE}>
        <div className="flex flex-wrap items-baseline gap-2">
          <PanelLabel>stage 5 claim</PanelLabel>
          <span className="mono text-[10px] font-semibold" style={{ color: issuedClaim ? "var(--role-holdout)" : "var(--ink-soft)" }} data-claim-state>
            {claim.state}
          </span>
        </div>
        {claim.text !== null ? (
          <blockquote
            className={`border-l-2 pl-2.5 text-[12px] leading-[1.5] ${issuedClaim ? "mono" : "italic"}`}
            data-claim-quote={claim.state}
            style={
              issuedClaim
                ? { borderColor: "var(--role-holdout)", color: "var(--role-holdout)" }
                : { borderColor: "var(--line-strong)", borderLeftStyle: "dashed", color: "var(--ink-soft)" }
            }
          >
            {claim.text}
          </blockquote>
        ) : (
          <Withheld
            availability={
              isAvailable(claim.availability) ? { state: "NOT_PUBLISHED", reason_code: null } : claim.availability
            }
            what="claim"
          />
        )}
        {claim.state === "NOT_ISSUED" ? (
          <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-claim-not-issued-note>
            The server's own sentence, quoted: no release claim was issued for this run, so nothing on this screen may be
            read as one.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            methodology certificate
          </span>
          {certificate.state === "ISSUED" && certificate.grade !== null ? (
            <>
              <span
                className="mono rounded-[3px] border px-2 text-[13px] font-bold"
                data-cert-grade={certificate.grade}
                title={CERT_TOOLTIP}
                style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)", background: "var(--accent-2-soft)" }}
              >
                {certificate.grade}
              </span>
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-cert-issued>
                issued {certificate.issued_at_utc_ms === null ? "not published" : utcZ(certificate.issued_at_utc_ms)}
              </span>
            </>
          ) : certificate.state === "NOT_ISSUED" ? (
            <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-cert-state="NOT_ISSUED" title={certificate.reason_code ?? undefined}>
              NOT_ISSUED
            </span>
          ) : (
            <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: certificate.reason_code }} />
          )}
        </div>
      </section>

      <div className="grid gap-3.5 md:grid-cols-[1.4fr_1fr]">
        <SourceGap
          id="cert-chain"
          title="certification — min of the caps, never issued here"
          reason={`the Hub publishes the certificate the engine issued, not the per-stage caps behind it. The chain is the engine's arithmetic — "${CERT_TOOLTIP}" — and this screen renders a grade rather than recomputing one from caps it cannot see.`}
        />
        <section className="flex flex-col gap-1.5 rounded-[8px] border px-3.5 py-3" data-window-disclosure-panel style={PANEL_STYLE}>
          <PanelLabel>window disclosure — who may read what</PanelLabel>
          <p className="text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {WINDOW_DISCLOSURE}
          </p>
        </section>
      </div>

      <SourceGap
        id="artifact-manifest"
        title="artifact manifest — whole run"
        reason="no artifact state is published on this screen. A manifest row here would describe files the Evidence contract deliberately never opens."
      />

      <section className="flex flex-col gap-1.5 rounded-[8px] border px-3.5 py-3" data-absences style={PANEL_STYLE}>
        <PanelLabel>declared source absences</PanelLabel>
        {Object.keys(hub.source_absences).length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            The Hub declares no absence for this run.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {Object.entries(hub.source_absences).map(([name, availability]) => (
              <li key={name} className="flex flex-wrap items-baseline gap-2" data-absence={name}>
                <span className="mono text-[10px]">{name}</span>
                <Withheld availability={availability} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2.5 rounded-[8px] border p-4" data-claim-next style={PANEL_STYLE}>
        <div className="flex flex-wrap items-center justify-between gap-2.5">
          <PanelLabel>next — report and later gates</PanelLabel>
          <span className="inline-flex flex-wrap gap-2">
            <Link
              to={`/research/quantbt/runs/${encodeURIComponent(hub.run_id)}/report`}
              data-action="generate-report"
              className="mono rounded-[6px] border px-3 py-1 text-[10px] font-semibold uppercase tracking-[.05em]"
              style={{ color: "var(--accent-contrast)", borderColor: "var(--accent)", background: "var(--accent)" }}
            >
              generate run report →
            </Link>
            <UnroutedAction label="release candidate →" screen="11" phase="P21" />
          </span>
        </div>
        <SoonHook label="Send to Approval Gate">
          requires a methodology certificate · currently{" "}
          <span className="mono font-semibold">
            {certificate.state === "ISSUED" && certificate.grade !== null ? certificate.grade : certificate.state}
          </span>
        </SoonHook>
        <SoonHook label="Register for Paper Trading">
          will carry the claim passport and the evidence link; deployment params must equal frozen params or declare a
          refit.
        </SoonHook>
      </section>
    </section>
  );
}

function AtlasTab({ runId, hub }: { runId: string; hub: EvidenceHub }) {
  const identity = hub.core.run_identity;
  /* The Atlas hash carries this run's mode, schedule and route (spec 12 §1),
     so it opens on the cell this run occupies, and the run so it can link back. */
  const params = new URLSearchParams({ tab: "modes" });
  for (const [key, fact] of [
    ["mode", identity?.mode],
    ["schedule", identity?.schedule],
    ["route", identity?.route.id],
  ] as const) {
    if (fact && isAvailable(fact.availability) && fact.value !== null) params.set(key, fact.value);
  }
  params.set("run", runId);
  return (
    <section data-screen-label="Atlas" className="flex flex-col gap-3.5">
      <TabHeading
        title="Atlas — how to read modes and routes"
        subtitle="Reference, not a stage. Every cell deep-links into the stages with the cursor it describes."
      />
      <SourceGap
        id="atlas-preview"
        title="engine atlas preview"
        reason="the mode × route atlas is published by the Research foundation contract, which this screen does not read. Rather than a preview assembled from nothing, the Atlas itself is one click away and is the same source Screen 12 renders."
      >
        <Link
          to={`/research/quantbt/atlas#${params.toString()}`}
          className="mono self-start rounded-[6px] border px-3 py-1 text-[10px] uppercase"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          data-action="open-atlas"
        >
          full atlas →
        </Link>
      </SourceGap>
    </section>
  );
}

/* ------------------------------------------------------------ run states */

/** FE-S04-05: a 404 is its own page with a way back, not an empty hub. */
function RunNotFound({ runId }: { runId: string }) {
  return (
    <main className="mx-auto flex w-full max-w-[1440px] flex-col gap-2 px-7 pb-16 pt-5" data-screen="evidence-flow" data-run={runId} data-run-not-found>
      <nav className="mono text-[10.5px]" aria-label="Research breadcrumbs">
        <Link to="/research/quantbt/runs" style={{ color: "var(--accent)" }}>
          Runs
        </Link>{" "}
        <span aria-hidden="true" style={{ color: "var(--line-strong)" }}>
          /
        </span>{" "}
        <span className="mono">{runId}</span>
      </nav>
      <h1 className="text-[22px] font-light" style={{ fontFamily: "var(--font-display)" }}>
        Run not found in this workspace
      </h1>
      <p className="text-[12px]" style={{ color: "var(--ink-soft)" }}>
        No run with this id exists in your current workspace, so there is no evidence to show. Nothing was inferred.
      </p>
      <Link
        to="/research/quantbt/runs"
        data-action="open-runs"
        className="mono self-start rounded-[6px] border px-3 py-1 text-[10px] uppercase"
        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      >
        Open Run Library →
      </Link>
    </main>
  );
}

/** The notice's one action, in the HiFi outline-button grammar. */
function NoticeLink({ to, action, children }: { to: string; action: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      data-action={action}
      className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase"
      style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
    >
      {children}
    </Link>
  );
}

/**
 * W3b — the Hub as the header reads it on a sealed retained WFO run. The P04
 * hub answers such a run NOT_PUBLISHED / NOT_READY with its own reason
 * (`P13_SOURCE_EVIDENCE_NOT_PUBLISHED`), which describes the hub lane, not the
 * run. The run identity it carries is kept; the lane facts (availability,
 * revision, engine, adapter, readiness) are the retained lane's. Readiness
 * becomes COMPLETE only when the progress read says the mandatory bundle is
 * SEALED and materialized READY.
 */
export function retainedHubView(
  hub: EvidenceHub,
  evidence: CurrentSourceEvidence,
  readiness: "READY" | "NOT_READY" | null,
): EvidenceHub {
  const provenance = evidence.provenance;
  return {
    ...hub,
    availability: evidence.availability as Availability,
    revision: evidence.revision,
    readiness: readiness === "READY" ? "COMPLETE" : hub.readiness,
    core: {
      ...hub.core,
      engine_version: provenance.engine_version ?? hub.core.engine_version,
      /* The P04 contract types its adapter enum narrowly; the retained id is the run's real one. */
      source_adapter_id: (provenance.source_adapter_id ?? hub.core.source_adapter_id) as EvidenceHub["core"]["source_adapter_id"],
      source_transform_digest: provenance.source_transform_digest ?? hub.core.source_transform_digest,
    },
  };
}

/**
 * What the reader is told about a run whose evidence is not sealed, and the
 * one way out. RF-05 CG-P13-12 made this typed: `lifecycle.phase` says whether
 * the run is still on its way (the only case that earns "watch progress"),
 * and `terminal_outcome` how a finished one ended — so a cancelled run is
 * never told to wait. An older responder without the block falls back to the
 * durable status, as in RF-06 wave A.
 */
export function sealNoticeOf(
  runId: string,
  hub: EvidenceHub,
): { key: string; sentence: string; action: ReactNode } | null {
  const progress = `/research/quantbt/runs/${encodeURIComponent(runId)}/progress`;
  const runs = "/research/quantbt/runs";
  const watch = (
    <NoticeLink to={progress} action="watch-progress">
      watch progress →
    </NoticeLink>
  );
  const record = (
    <NoticeLink to={progress} action="open-progress-record">
      open progress record →
    </NoticeLink>
  );
  const library = (
    <NoticeLink to={runs} action="open-runs">
      ← Run Library
    </NoticeLink>
  );
  const notReady =
    "The evidence projection for this run is not ready (readiness NOT_READY). Nothing below is inferred from the run's status.";

  const lifecycle = lifecycleOf(hub);
  if (lifecycle !== null) {
    const word = lifecycle.display_status ?? lifecycle.durable_status ?? "in progress";
    if (lifecycle.phase === "IN_PROGRESS") {
      return {
        key: "IN_PROGRESS",
        sentence: `This run is ${word} and has not sealed its evidence yet. The hub shows what the projection holds; the run's live state lives on its progress screen.`,
        action: watch,
      };
    }
    if (hub.readiness !== "NOT_READY") return null;
    if (lifecycle.phase === "TERMINAL" && lifecycle.terminal_outcome === "CANCELLED") {
      return {
        key: "CANCELLED",
        sentence:
          "This run was cancelled. It stopped before sealing evidence, so no metric, series or claim was produced for it, and none will arrive.",
        action: library,
      };
    }
    if (lifecycle.phase === "TERMINAL" && lifecycle.terminal_outcome === "FAILED") {
      return {
        key: "FAILED",
        sentence: "This run failed before sealing evidence, so none will arrive. Its progress record shows where it stopped.",
        action: record,
      };
    }
    if (lifecycle.phase === "TERMINAL" && lifecycle.terminal_outcome === "COMPLETED") {
      return {
        key: "COMPLETED",
        sentence: `This run completed, but its evidence projection is not published (${reasonTitle(hub.availability)}).`,
        action: null,
      };
    }
    if (lifecycle.phase === "ATTENTION_REQUIRED") {
      return {
        key: "ATTENTION_REQUIRED",
        sentence: `This run needs attention (${word}). It stopped before sealing evidence; its progress record shows where.`,
        action: record,
      };
    }
    if (lifecycle.phase === "LEGACY") {
      return {
        key: "LEGACY",
        sentence: "This is a legacy run recorded as metadata only. It has no sealed evidence to show, and none will arrive.",
        action: library,
      };
    }
    return { key: "NOT_PUBLISHED", sentence: notReady, action: null };
  }

  if (hub.readiness !== "NOT_READY") return null;
  const status = runStatus(hub);
  if (status !== null && LIVE.has(status)) {
    return {
      key: status,
      sentence: `This run is ${status} and has not sealed its evidence yet. The hub shows what the projection holds; the run's live state lives on its progress screen.`,
      action: watch,
    };
  }
  if (status === "CANCELLED") {
    return {
      key: status,
      sentence:
        "This run is CANCELLED. It stopped before sealing evidence, so no metric, series or claim was produced for it, and none will arrive.",
      action: library,
    };
  }
  if (status === "FAILED" || status === "RECOVERY_REQUIRED") {
    return {
      key: status,
      sentence: `This run is ${status}. It ended before sealing evidence; its progress record shows where it stopped.`,
      action: record,
    };
  }
  return { key: "UNKNOWN", sentence: notReady, action: null };
}

function SealNotice({ runId, hub }: { runId: string; hub: EvidenceHub }) {
  const notice = sealNoticeOf(runId, hub);
  if (notice === null) return null;
  const lifecycle = lifecycleOf(hub);
  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-[8px] border px-4 py-2.5"
      data-not-ready={notice.key}
      data-phase={lifecycle?.phase ?? undefined}
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper-sunken)" }}
    >
      <p className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {notice.sentence}
      </p>
      {notice.action}
    </section>
  );
}

/* ---------------------------------------------------------------- screen */

/**
 * The HiFi breadcrumb (`Research / QuantBT Backtest / {run} / {stage}`) lives
 * in the shell's topbar; the screen supplies its tail through the presentation
 * context. Outside the shell (unit tests) there is no topbar to write to.
 */
/**
 * The topbar's real height. Spec 04 §26 pins the strip at 56px "equal to the
 * topbar", but the shell's topbar wraps below ~1100px (65px at 1024, 90px at
 * 660), and a strip pinned at 56 slid under it. Measured, with the token as
 * the fallback where there is no shell (unit tests).
 */
function useTopbarOffset(): string {
  const [height, setHeight] = useState<number | null>(null);
  useEffect(() => {
    const bar = typeof document === "undefined" ? null : document.querySelector<HTMLElement>(".portal-topbar");
    if (!bar || typeof ResizeObserver !== "function") return;
    const measure = () => setHeight(bar.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);
  return height === null ? "var(--topbar-h)" : `${height}px`;
}

function useTopbarCrumb(label: string | null) {
  let setEntityLabel: ((value: string | null) => void) | null = null;
  try {
    setEntityLabel = usePresentation().setEntityLabel;
  } catch {
    setEntityLabel = null;
  }
  useEffect(() => {
    if (!setEntityLabel) return;
    setEntityLabel(label);
    return () => setEntityLabel?.(null);
  }, [label, setEntityLabel]);
}

const IDLE_RETAINED: RetainedSeriesSlot = { state: "idle" };
const NOOP = () => {};
const IDLE_IDENTITY: RunIdentitySlot = { state: "idle" };
const NO_KINDS: ReadonlyMap<RetainedSeriesKind, RetainedSeriesSlot> = new Map();

export interface EvidenceFlowProps {
  runId: string;
  hub: EvidenceHub | null;
  state: ResearchState;
  /** The Hub answered 404: no run with this id in this workspace. */
  notFound?: boolean;
  cursor: EvidenceCursor;
  onStage: (stage: EvidenceStage) => void;
  onFold: (fold: number) => void;
  onResetCursor: () => void;
  series: ReadonlyMap<SeriesKind, SeriesSlot>;
  ensureSeries: (kind: SeriesKind) => void;
  passport: PassportSlot;
  ensurePassport: () => void;
  /** W3: the retained lane's equity relation. Optional for callers without the lane. */
  retainedSeries?: RetainedSeriesSlot;
  ensureRetainedSeries?: () => void;
  /** W3b: the retained lane's derived series, per kind. */
  retainedKinds?: ReadonlyMap<RetainedSeriesKind, RetainedSeriesSlot>;
  ensureRetainedKind?: (kind: RetainedSeriesKind) => void;
  /** W3b: the run's P11 identity (progress + requested spec), read by the route for a retained run. */
  runIdentity?: RunIdentitySlot;
  onReread: () => void;
}

export function EvidenceFlow({
  runId,
  hub,
  state,
  notFound = false,
  cursor,
  onStage,
  onFold,
  onResetCursor,
  series,
  ensureSeries,
  passport,
  ensurePassport,
  retainedSeries = IDLE_RETAINED,
  ensureRetainedSeries = NOOP,
  retainedKinds = NO_KINDS,
  ensureRetainedKind = NOOP,
  runIdentity = IDLE_IDENTITY,
  onReread,
}: EvidenceFlowProps) {
  /* W3: the lane is read as soon as the Hub says the run is not in progress,
     so the claim strip above every tab can show a retained run's claims. */
  const passportSkip = hub ? passportSkipOf(hub) : { key: "NO_HUB", sentence: "" };
  useEffect(() => {
    if (passportSkip === null) ensurePassport();
  }, [passportSkip === null, ensurePassport]); // eslint-disable-line react-hooks/exhaustive-deps
  const retainedClaim = passport.state === "ready" ? (passport.evidence as Partial<CurrentSourceEvidence>).claim ?? null : null;
  /* W3b: a retained answer is the authority for the run's lane facts. */
  const laneEvidence = passport.state === "ready" && isRetainedAnswer(passport.evidence) ? passport.evidence : null;
  /* The route reads the run identity (P11 progress) once the lane answered; the screen only renders it. */
  const laneSeal =
    runIdentity.state === "ready" ? retainedReadiness(runIdentity.identity.progress) : null;
  const view = hub && laneEvidence ? retainedHubView(hub, laneEvidence, laneSeal) : hub;
  const laneSelection = (() => {
    if (!laneEvidence || runIdentity.state !== "ready") return null;
    const folds = runIdentity.identity.progress?.progress?.folds ?? [];
    const picks = folds.flatMap((fold) => (fold.selection && fold.selection.state === "AVAILABLE" ? [fold.selection] : []));
    const head = picks[0];
    if (head === undefined || !picks.every((pick) => pick.scope === "GLOBAL_STUDY" && pick.params_digest === head.params_digest)) return null;
    return { trial: head.trial ?? null, paramsDigest: head.params_digest ?? null };
  })();
  const laneSummary = laneEvidence
    ? `${retainedTiles(laneEvidence).filter((tile) => tile.value !== null).length} of ${TILE_ORDER.length} metrics · ${laneEvidence.series.length} series`
    : null;
  const [datasetOpen, setDatasetOpen] = useState(false);
  const datasetTrigger = useRef<HTMLButtonElement>(null);
  const datasetWasOpen = useRef(false);
  const datasetPanelId = useId();
  const tabRow = useRef<HTMLDivElement>(null);
  const [tabRowHeight, setTabRowHeight] = useState(0);
  const topbar = useTopbarOffset();
  const summaryVisited = useRef(false);
  if (cursor.stage === "summary") summaryVisited.current = true;
  const summaryKept = summaryVisited.current;

  /* A run id is 37 characters; the full one is on the identity line, and at
     full length the crumb wrapped the 56px topbar. */
  const crumbRun = runId.length > 16 ? `${runId.slice(0, 13)}…` : runId;
  useTopbarCrumb(notFound ? null : `${crumbRun} / ${STAGE_CRUMB[cursor.stage]}`);

  /* FE-S04-07: closing the panel, by the chip or by Escape, hands focus back to the chip. */
  useEffect(() => {
    if (datasetOpen) {
      datasetWasOpen.current = true;
    } else if (datasetWasOpen.current) {
      datasetWasOpen.current = false;
      datasetTrigger.current?.focus();
    }
  }, [datasetOpen]);
  const closeDataset = useCallback(() => setDatasetOpen(false), []);

  /*
   * Sticky like the HiFi: the tab card slides up under the topbar until only
   * its cursor bar shows. The HiFi pins the card at `top:0` beneath a 56px
   * topbar, which hides the 48px tab row and clips 8px of the cursor bar; this
   * pins it at (measured topbar − measured tab row), so the cursor bar shows
   * whole at every width the topbar wraps to.
   */
  useEffect(() => {
    const element = tabRow.current;
    if (!element || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => setTabRowHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [notFound]);

  if (notFound) return <RunNotFound runId={runId} />;

  return (
    <div
      className="mx-auto flex w-full max-w-[1440px] flex-col gap-3.5 px-7 pb-16 pt-5"
      data-screen="evidence-flow"
      data-run={runId}
    >
      <RunHeader
        runId={runId}
        hub={view}
        datasetOpen={datasetOpen}
        datasetTrigger={datasetTrigger}
        datasetPanelId={datasetPanelId}
        onToggleDataset={() => setDatasetOpen((open) => !open)}
      />
      {view && datasetOpen ? <DatasetPanel hub={view} id={datasetPanelId} onClose={closeDataset} /> : null}

      <ClaimPassport
        hub={view}
        state={state}
        onJump={onStage}
        retained={retainedClaim}
        laneReadiness={laneEvidence ? (laneSeal ?? "not read") : null}
      />

      {view && !(laneEvidence && laneSeal === "READY") ? <SealNotice runId={runId} hub={view} /> : null}

      {/* Tabs and cursor: one card, sticky (HiFi). */}
      <div
        className="sticky z-[25] rounded-[6px] border"
        data-stage-card
        style={{
          top: `calc(${topbar} - ${tabRowHeight}px)`,
          borderColor: "var(--line)",
          background: "var(--paper-raised)",
          boxShadow: "var(--shadow-e2)",
        }}
      >
        <StageTabs cursor={cursor} hub={view} onStage={onStage} rowRef={tabRow} summary={laneSummary} />
        <CursorBar
          runId={runId}
          cursor={cursor}
          hub={hub}
          folds={hub?.core.fold_navigation}
          onFold={onFold}
          onReset={onResetCursor}
          laneSelection={laneSelection}
        />
      </div>

      <ResearchPanel
        title={STAGE_CRUMB[cursor.stage]}
        variant="plain"
        state={state}
        minBodyHeight={260}
        recovery={
          state.mayRetry ? (
            <button type="button" className="btn-ghost mono text-[10px]" data-action="reread" onClick={onReread}>
              reread hub
            </button>
          ) : undefined
        }
      >
        {hub && cursor.stage !== "summary" ? (
          <div
            role="tabpanel"
            id={`ef-panel-${cursor.stage}`}
            aria-labelledby={`ef-tab-${cursor.stage}`}
            data-panel={cursor.stage}
          >
            {cursor.stage === "claim" ? (
              <ClaimTab hub={hub} />
            ) : cursor.stage === "atlas" ? (
              <AtlasTab runId={runId} hub={hub} />
            ) : (
              <StagePreviewTab stage={cursor.stage} cursor={cursor} hub={hub} runId={runId} />
            )}
          </div>
        ) : null}
        {/*
          * Spec 04 §11: other tabs unmount; Summary keeps its chart instances.
          * Once opened it stays mounted and is only hidden, so coming back to
          * it does not rebuild four charts (FE-S04-12: 107 ms → one repaint).
          */}
        {hub && summaryKept ? (
          <div
            role="tabpanel"
            id="ef-panel-summary"
            aria-labelledby="ef-tab-summary"
            data-panel={cursor.stage === "summary" ? "summary" : undefined}
            data-panel-kept="summary"
            hidden={cursor.stage !== "summary"}
          >
            <SummaryTab
              hub={hub}
              runId={runId}
              cursor={cursor}
              onFold={onFold}
              series={series}
              ensureSeries={ensureSeries}
              passport={passport}
              ensurePassport={ensurePassport}
              retainedSeries={retainedSeries}
              ensureRetainedSeries={ensureRetainedSeries}
              retainedKinds={retainedKinds}
              ensureRetainedKind={ensureRetainedKind}
            />
          </div>
        ) : null}
      </ResearchPanel>
    </div>
  );
}
