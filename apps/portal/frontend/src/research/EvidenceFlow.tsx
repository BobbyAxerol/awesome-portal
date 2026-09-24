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
  type CurrentSourceEvidence,
  type EvidenceHub,
  type EvidenceRefusal,
  type EvidenceSeries,
  type FoldNavigation,
  type Metric,
  type MonthlyReturnPoint,
  type SeriesKind,
} from "./evidenceClient";
import {
  EVIDENCE_STAGES,
  deepDiveHref,
  type EvidenceCursor,
  type EvidenceStage,
} from "./evidenceCursor";
import { refusalDetail } from "./researchRefusal";
import { formatMetric, formatUtc, shortDigest } from "./researchFormat";
import type { PassportSlot, SeriesSlot } from "./useEvidence";
import type { ResearchState } from "./state";

/* The chart chunk. Three entry points, one module, fetched once. */
const EquityChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.EquityChart })));
const RollingChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.RollingChart })));
const DistributionChart = lazy(() => import("./EvidenceCharts").then((m) => ({ default: m.DistributionChart })));

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
  execute: { screen: "08 Execute", path: null, phase: "P17" },
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
      title={unavailableReason(availability as Availability)}
    >
      {what ? `${what} — ` : ""}
      {WITHHELD_WORDS[availability.state]}
    </span>
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
    <section className="flex flex-col gap-1.5 rounded-[8px] border px-3.5 py-3" data-gap={id} style={PANEL_STYLE}>
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
      className="mono whitespace-nowrap rounded-full border px-2 text-[11px] leading-[18px]"
      style={{ color: tone, borderColor: border, background }}
      {...rest}
    >
      {children}
    </span>
  );
}

/** Tone of a durable run status. The word itself is rendered exactly. */
function statusTone(status: string): { tone: string; background: string } {
  if (status === "READY") return { tone: "var(--good)", background: "var(--good-bg)" };
  if (status === "FAILED" || status === "RECOVERY_REQUIRED") return { tone: "var(--bad)", background: "var(--bad-bg)" };
  if (status === "CANCELLED") return { tone: "var(--ink-soft)", background: "var(--paper-sunken)" };
  return { tone: "var(--accent)", background: "var(--accent-soft)" };
}

/**
 * One secondary fact of the run header.
 *
 * Every field of `run_identity` carries its own availability, so each is
 * rendered or withheld on its own terms. `NOT_APPLICABLE` is not a gap: a seed
 * that was deliberately not selected is a real answer.
 */
function HeaderFact({
  label,
  value,
  availability,
  title,
}: {
  label: string;
  value: string | null;
  availability: Availability;
  title?: string;
}) {
  return (
    <span className="flex items-baseline gap-1" data-header-fact={label}>
      <span className="text-[9.5px] uppercase tracking-[.06em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      {isAvailable(availability) && value !== null ? (
        <span className="mono text-[10.5px]" style={{ color: "var(--ink)" }} data-header-value={label} title={title}>
          {value}
        </span>
      ) : (
        <Withheld availability={availability} />
      )}
    </span>
  );
}

/**
 * The status a hub declares for its run, or null when it does not.
 * `run_identity` is optional during a rolling deployment.
 */
function runStatus(hub: EvidenceHub | null): string | null {
  const status = hub?.core.run_identity?.status;
  return status && isAvailable(status.availability) ? status.value : null;
}

/* ------------------------------------------------------------ claim strip */

/**
 * The spec's claim fields the Hub does not carry. They keep a chip each
 * (spec 04 §22: "chip `{key} —` grey — do not hide the chip"), so a reader sees
 * which fact is absent rather than a shorter strip that looks complete.
 */
const UNPUBLISHED_CLAIM_FIELDS = [
  "validation_claim",
  "chronological_claim",
  "oos_used_for_selection",
  "holdout_state",
  "causality_claim",
] as const;

function Dot() {
  return (
    <span aria-hidden="true" className="text-[9px]" style={{ color: "var(--viz-legend-inactive)" }}>
      ·
    </span>
  );
}

function AbsentClaimField({ name }: { name: string }) {
  return (
    <span
      className="mono text-[10px]"
      style={{ color: "var(--ink-faint)" }}
      data-claim-field={name}
      data-withheld="NOT_PUBLISHED"
      title={`${name} — not published by the Evidence Hub for this run`}
    >
      {name} <b className="font-semibold">—</b>
    </span>
  );
}

/**
 * The claim strip — sticky under the topbar (spec 04 §2.1, §26).
 *
 * The claim is rendered by its own state, never by its availability:
 * `NOT_ISSUED` with the server's sentence is an answer ("no claim was issued"),
 * not an available claim (FE-S04-01). A certificate chip appears only for a
 * typed `ISSUED` grade: a claim string never earns one.
 */
function ClaimStrip({
  hub,
  state,
  onJump,
  stripRef,
  top,
}: {
  hub: EvidenceHub | null;
  state: ResearchState;
  onJump: (stage: EvidenceStage) => void;
  stripRef: React.Ref<HTMLDivElement>;
  /** Where the topbar ends; the strip sticks right there. */
  top: string;
}) {
  const claim = hub?.claim ?? null;
  const certificate = claim?.methodology_certificate ?? null;
  const issued = certificate?.state === "ISSUED" && certificate.grade !== null;
  const contract = hub?.core.run_identity?.route.contract ?? null;

  return (
    <div
      ref={stripRef}
      className="z-20 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b px-4 py-[7px] md:sticky"
      data-claim-strip={claim?.state ?? state.state}
      style={{
        top,
        borderColor: "var(--role-holdout)",
        /* The HiFi's warm strip paper has no token of its own; `--paper` is the
           nearest (3/255 off), opaque so content scrolls under it cleanly.
           The gold rule beneath is what sets the strip apart (spec 04 §2.1). */
        background: "var(--paper)",
      }}
    >
      {claim === null ? (
        <span className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-claim-pending>
          claim — {state.state === "loading" ? "reading…" : "not read"}
        </span>
      ) : claim.state === "ISSUED" && claim.text !== null ? (
        <button
          type="button"
          className="mono text-left text-[10px]"
          style={{ color: "var(--ink-soft)" }}
          data-claim-text
          aria-label="Stage 5 claim — jump to source"
          onClick={() => onJump("claim")}
        >
          claim <b className="font-semibold" style={{ color: "var(--ink)" }}>{claim.text}</b>
        </button>
      ) : claim.state === "NOT_ISSUED" ? (
        <button
          type="button"
          className="mono text-left text-[10px]"
          style={{ color: "var(--ink-soft)" }}
          data-claim-not-issued
          aria-label="claim not issued — jump to source"
          title={claim.text ?? undefined}
          onClick={() => onJump("claim")}
        >
          claim <b className="font-semibold" style={{ color: "var(--ink)" }}>NOT_ISSUED</b>
          {claim.text !== null ? (
            <span className="italic" data-claim-sentence>
              {" "}
              — {claim.text}
            </span>
          ) : null}
        </button>
      ) : claim.state === "FORECAST" && claim.text !== null ? (
        <span className="mono text-[10px] italic" data-claim-forecast style={{ color: "var(--role-holdout)" }}>
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
          what="claim"
        />
      )}

      <Dot />
      {UNPUBLISHED_CLAIM_FIELDS.map((name) => (
        <span key={name} className="contents">
          <AbsentClaimField name={name} />
          <Dot />
        </span>
      ))}

      {contract !== null && isAvailable(contract.availability) && contract.value !== null ? (
        <button
          type="button"
          className="mono text-[10px]"
          style={{ color: "var(--ink-soft)" }}
          data-claim-field="execution_contract"
          onClick={() => onJump("execute")}
          aria-label={`execution_contract ${contract.value} — jump to source`}
        >
          execution_contract <b className="font-semibold" style={{ color: "var(--ink)" }}>{contract.value}</b>
        </button>
      ) : (
        <span data-claim-field="execution_contract">
          <Withheld
            availability={contract?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }}
            what="execution_contract"
          />
        </span>
      )}
      <Dot />

      {issued && certificate ? (
        <button
          type="button"
          data-certificate={certificate.grade}
          title={CERT_TOOLTIP}
          aria-label={`certificate ${certificate.grade} — jump to source`}
          onClick={() => onJump("claim")}
          className="mono rounded-[3px] border-[1.5px] px-[7px] text-[10px] font-bold leading-[16px]"
          style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
        >
          cert {certificate.grade}
        </button>
      ) : certificate?.state === "NOT_ISSUED" ? (
        <span
          className="mono text-[10px]"
          style={{ color: "var(--ink-soft)" }}
          data-certificate-state="NOT_ISSUED"
          title={certificate.reason_code ?? undefined}
        >
          certification <b className="font-semibold">NOT_ISSUED</b>
        </span>
      ) : (
        <span data-certificate-state="NOT_PUBLISHED">
          <Withheld
            availability={{ state: "NOT_PUBLISHED", reason_code: certificate?.reason_code ?? null }}
            what="certification"
          />
        </span>
      )}

      {hub ? (
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-registry={hub.metric_registry_version}>
            {hub.metric_registry_version}
          </span>
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-readiness={hub.readiness}>
            readiness <b className="font-semibold" style={{ color: "var(--ink-soft)" }}>{hub.readiness}</b>
          </span>
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------- run header */

/**
 * The HiFi identity line: `run {id}` · status · binding · dataset · route, and
 * the engine on the right; beneath it the secondary facts of `run_identity`.
 * Strings are printed exactly as the Hub sends them (FE-S04-11).
 */
function RunHeader({
  runId,
  hub,
  onOpenDrawer,
  drawerOpen,
  drawerTrigger,
}: {
  runId: string;
  hub: EvidenceHub | null;
  onOpenDrawer: () => void;
  drawerOpen: boolean;
  drawerTrigger: React.Ref<HTMLButtonElement>;
}) {
  const core = hub?.core ?? null;
  const identity = core?.run_identity;

  return (
    <header
      className="flex flex-col gap-1.5 rounded-[3px] border px-3 py-1.5"
      data-run-header={runId}
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
    >
      <div className="mono flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--ink-faint)" }}>
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
        {identity ? (
          <>
            {isAvailable(identity.status.availability) && identity.status.value !== null ? (
              <span
                className="rounded-full px-2 text-[11px] font-semibold leading-[18px]"
                style={statusTone(identity.status.value)}
                data-run-status={identity.status.value}
              >
                {identity.status.value}
              </span>
            ) : (
              <Withheld availability={identity.status.availability} what="status" />
            )}

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
            ref={drawerTrigger}
            type="button"
            data-action="dataset-drawer"
            aria-haspopup="dialog"
            aria-expanded={drawerOpen}
            onClick={onOpenDrawer}
            title="dataset identity — digests pinned at submit"
            className="mono whitespace-nowrap rounded-full border px-2 text-[11px] leading-[18px]"
            style={{
              color: drawerOpen ? "var(--accent)" : "var(--ink-soft)",
              borderColor: drawerOpen ? "var(--accent)" : "var(--line)",
              background: drawerOpen ? "var(--accent-soft)" : "var(--paper-raised)",
            }}
          >
            <span data-instrument>
              {core.data.symbol ?? "symbol —"} · {core.data.timeframe ?? "timeframe —"}
            </span>{" "}
            · {core.data.dataset_id ?? "dataset"} {drawerOpen ? "▴" : "▾"}
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
                · created {formatUtc(identity.created_at_utc_ms.value)}
              </span>
            ) : null}
          </span>
        ) : null}
      </div>

      {hub && core ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1" data-run-identity={identity ? "" : undefined}>
          {identity ? (
            <>
              {/*
                * A selected route id is not a route contract. The contract is
                * published as absent, and printing the id under that label would
                * upgrade a choice into an assertion about what the route enforces.
                */}
              <HeaderFact label="route" value={identity.route.id.value} availability={identity.route.id.availability} />
              <HeaderFact
                label="route contract"
                value={identity.route.contract.value}
                availability={identity.route.contract.availability}
              />
              <HeaderFact
                label="config digest"
                value={shortDigest(identity.config_digest.value, 12)}
                title={identity.config_digest.value ?? undefined}
                availability={identity.config_digest.availability}
              />
              {/* `seed` null with NOT_APPLICABLE is a real selected null. */}
              <HeaderFact
                label="seed"
                value={identity.seed.value === null ? null : String(identity.seed.value)}
                availability={identity.seed.availability}
              />
            </>
          ) : null}
          {core.input_scope !== null ? (
            <span className="mono text-[10px]" style={{ color: "var(--ink-soft)" }} data-input-scope={core.input_scope}>
              {core.input_scope}
            </span>
          ) : null}
          {/*
            * The revision is the run's identity on this screen, so it is shown
            * (shortened, full in the title). It is never parsed, and nothing the
            * browser sends carries it.
            */}
          {hub.revision !== null ? (
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-revision title={hub.revision}>
              revision {hub.revision.slice(0, 18)}…
            </span>
          ) : (
            <Withheld availability={hub.availability} what="revision" />
          )}
          <span className="mono ml-auto text-[10px]" style={{ color: "var(--ink-faint)" }} data-as-of title={new Date(hub.as_of_utc_ms).toISOString()}>
            as of {formatUtc(hub.as_of_utc_ms)}
          </span>
        </div>
      ) : null}
    </header>
  );
}

/* --------------------------------------------------------- dataset drawer */

function DatasetDrawer({ hub, onClose }: { hub: EvidenceHub; onClose: () => void }) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  /* Escape closes, and focus is trapped while it is open: spec 04 §2.3. */
  useEffect(() => {
    const first = panel.current?.querySelector<HTMLElement>("button");
    first?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      if (event.key !== "Tab" || panel.current === null) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("button, [href], [tabindex]")];
      if (focusable.length === 0) return;
      const edge = event.shiftKey ? focusable[0] : focusable[focusable.length - 1];
      if (document.activeElement === edge) {
        event.preventDefault();
        (event.shiftKey ? focusable[focusable.length - 1] : focusable[0]).focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rows: [string, string | null][] = [
    ["dataset", hub.core.data.dataset_id],
    ["symbol", hub.core.data.symbol],
    ["timeframe", hub.core.data.timeframe],
    [
      "OOS observations",
      hub.core.data.oos_observation_count === null ? null : formatMetric(hub.core.data.oos_observation_count, "count"),
    ],
    ["dataset binding digest", hub.core.dataset_binding_digest],
    ["manifest digest", hub.core.manifest_digest],
    ["requested spec digest", hub.core.requested_spec_digest],
    ["effective spec digest", hub.core.effective_spec_digest],
    ["source transform digest", hub.core.source_transform_digest],
  ];

  return (
    <div className="fixed inset-0 z-40" data-drawer-backdrop onClick={onClose}>
      <div className="absolute inset-0" style={{ background: "var(--scrim)" }} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-drawer="dataset"
        onClick={(event) => event.stopPropagation()}
        className="absolute right-0 top-0 flex h-full w-full max-w-[420px] flex-col gap-3 overflow-y-auto px-5 py-4"
        style={{ background: "var(--paper-raised)", boxShadow: "var(--shadow-raised)" }}
      >
        <div className="flex items-baseline gap-2">
          <h2
            id={titleId}
            className="text-[10px] font-semibold uppercase tracking-[.07em]"
            style={{ color: "var(--accent)", fontFamily: "var(--font-body)" }}
          >
            dataset identity — {hub.core.data.dataset_id ?? "dataset"}
          </h2>
          <button
            type="button"
            className="mono ml-auto text-[12px]"
            data-action="close-drawer"
            aria-label="Close dataset drawer"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <dl className="flex flex-col gap-1.5">
          {rows.map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-baseline gap-2" data-drawer-row={label}>
              <dt className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
                {label}
              </dt>
              <dd className="mono break-all text-[10.5px]">
                {value !== null ? (
                  <span data-drawer-value>{value}</span>
                ) : (
                  <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} />
                )}
              </dd>
            </div>
          ))}
        </dl>

        {/*
          * The hi-fi's coverage bar and gap scan read a dataset manifest this
          * screen does not receive. The drawer keeps its shape and says so
          * rather than drawing a coverage bar out of nothing.
          */}
        <SourceGap
          id="dataset-coverage"
          title="coverage · gap scan · vendor"
          reason="the Evidence contract publishes the dataset's identity and digests, not its coverage bar, gap scan or vendor. They are read from a dataset manifest no operation on this screen exposes."
        />

        <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-drawer-footer>
          {DRAWER_FOOTER}
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------ tabs + cursor, one card */

function tabSub(stage: EvidenceStage, cursor: EvidenceCursor, hub: EvidenceHub | null): string {
  if (hub === null) return "—";
  if (stage === "summary") {
    const shown = hub.metrics.filter((metric) => isAvailable(metric.availability)).length;
    return `${shown} of ${hub.metrics.length} metrics · ${hub.series.length} series`;
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
}: {
  cursor: EvidenceCursor;
  hub: EvidenceHub | null;
  onStage: (stage: EvidenceStage) => void;
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
    <div className="flex items-stretch overflow-x-auto" data-stage-tabs>
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
                {tabSub(stage, cursor, hub)}
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
      className="mono inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2 text-[11px] leading-[18px]"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)", color: "var(--ink-soft)" }}
      {...rest}
    >
      {children}
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
}: {
  runId: string;
  cursor: EvidenceCursor;
  hub: EvidenceHub | null;
  folds: FoldNavigation | undefined;
  onFold: (fold: number) => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  /*
   * The step buttons are bound to the folds P11 actually observed, and to
   * nothing else. This is a published observed set, not the source's complete
   * fold plan: the label says "observed" so the selector cannot be read as a
   * promise about folds nobody has seen.
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

  const copyLink = useCallback(() => {
    const href = `${window.location.origin}${window.location.pathname}${deepDiveHref("", cursor)}`;
    void navigator.clipboard?.writeText(href).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [cursor]);

  const schedule = hub?.core.run_identity?.schedule;
  const base = `/research/quantbt/runs/${encodeURIComponent(runId)}`;

  return (
    <div
      className="flex flex-wrap items-center gap-1.5 border-t px-3.5 py-[7px]"
      data-cursor-bar
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)", borderRadius: "0 0 6px 6px" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        evidence cursor
      </span>

      <CursorPill data-cursor-fold-pill>
        <span data-cursor-fold>fold {cursor.fold}</span>
        <button
          type="button"
          aria-label="previous fold"
          data-action="fold-previous"
          disabled={atFirst}
          title={published.length === 0 ? reason : atFirst ? "this is the first observed fold" : "previous observed fold"}
          onClick={() => step(-1)}
          className="px-0.5"
          style={{ color: atFirst ? "var(--viz-legend-inactive)" : "var(--ink-soft)", cursor: atFirst ? "not-allowed" : "pointer" }}
        >
          ‹
        </button>
        {/* The published members, so a reader can reach one without stepping. */}
        {published.length > 1 ? (
          <select
            className="mono bg-transparent text-[11px]"
            style={{ color: "var(--ink)" }}
            data-fold-select
            aria-label="observed fold"
            value={index === -1 ? "" : String(cursor.fold)}
            onChange={(event) => onFold(Number(event.target.value))}
          >
            {index === -1 ? <option value="">—</option> : null}
            {published.map((fold) => (
              <option key={fold} value={String(fold)}>
                fold {fold}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          aria-label="next fold"
          data-action="fold-next"
          disabled={atLast}
          title={published.length === 0 ? reason : atLast ? "this is the last observed fold" : "next observed fold"}
          onClick={() => step(1)}
          className="px-0.5"
          style={{ color: atLast ? "var(--viz-legend-inactive)" : "var(--ink-soft)", cursor: atLast ? "not-allowed" : "pointer" }}
        >
          ›
        </button>
        <span className="text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fold-bound>
          {published.length > 0 ? (
            <>
              of {count} observed
              {index === -1 ? " — this fold is not in the observed set" : ""}
            </>
          ) : (
            <>
              of <Withheld availability={folds?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }} what="observed folds" />
            </>
          )}
        </span>
      </CursorPill>

      <CursorPill data-cursor-trial>
        trial{" "}
        {cursor.trial !== null ? (
          <span style={{ color: "var(--ink)" }}>#{cursor.trial}</span>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_TRIAL_CURSOR" }} />
        )}
      </CursorPill>

      <CursorPill data-cursor-params>
        params{" "}
        {cursor.params !== null ? (
          <span style={{ color: "var(--ink)" }}>{cursor.params}</span>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_PARAMS_DIGEST" }} />
        )}
      </CursorPill>

      {schedule && isAvailable(schedule.availability) && schedule.value !== null ? (
        <CursorPill data-cursor-schedule>
          schedule <span style={{ color: "var(--ink)" }}>{schedule.value}</span>
        </CursorPill>
      ) : null}

      <span className="ml-1 text-[10px]" style={{ color: "var(--ink-faint)" }} data-deep-dives>
        deep dives:{" "}
        <Link to={deepDiveHref(`${base}/split`, cursor)} style={{ color: "var(--accent)" }}>
          S1 split
        </Link>{" "}
        ·{" "}
        <Link to={deepDiveHref(`${base}/search`, cursor)} style={{ color: "var(--accent)" }}>
          S2 search
        </Link>{" "}
        ·{" "}
        <Link to={deepDiveHref(`${base}/freeze`, cursor)} style={{ color: "var(--accent)" }}>
          S3 freeze
        </Link>{" "}
        ·{" "}
        <span title="Screen 08 is not built yet (P17), so this link would go nowhere." style={{ opacity: 0.6 }}>
          S4 replay
        </span>{" "}
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
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
        >
          {copied ? COPY_LINK_DONE : COPY_LINK_IDLE}
        </button>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- metrics */

const METRIC_ORDER: Metric["key"][] = [
  "FINAL_EQUITY",
  "NET_RETURN_FRACTION",
  "MAX_DRAWDOWN_FRACTION",
  "TRADE_COUNT",
  "BARS_PROCESSED",
  "INITIAL_EQUITY",
  "BENCHMARK_RETURN_FRACTION",
  "FUNDING_TOTAL",
];

/** The tone of a signed fraction, read from the sign of the server's string. */
function signTone(metric: Metric): string {
  if (metric.unit !== "FRACTION" || metric.value === null) return "var(--ink)";
  if (metric.key === "MAX_DRAWDOWN_FRACTION") return "var(--bad)";
  return metric.value.trim().startsWith("-") ? "var(--bad)" : "var(--good)";
}

/**
 * One metric tile (FE-S04-02, DQ-08). The rounded value is for reading; the
 * exact server string is the tile's title, its data attribute, and what the
 * clipboard receives when the value is copied.
 */
function MetricTile({ metric }: { metric: Metric }) {
  const shown = isAvailable(metric.availability) && metric.value !== null;
  const display = shown ? formatMetric(metric.value, metric.unit.toLowerCase()) : null;
  return (
    <div
      className="flex min-w-0 flex-col gap-[3px] rounded-[6px] border px-3 py-2"
      data-metric={metric.key}
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-raised)" }}
    >
      <span className="text-[10px] font-medium uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {metric.label}
      </span>
      {shown && metric.value !== null ? (
        <span
          className="mono text-[22px] font-semibold leading-[28px]"
          style={{ color: signTone(metric) }}
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
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-metric-scope={metric.scope}>
        {metric.scope} · {metric.unit} · {metric.origin}
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

/** The frame every lazy series panel keeps, whatever the answer turns out to be. */
function SeriesPanel({
  kind,
  title,
  footnote,
  link,
  slot,
  onNeeded,
  emptyReason,
  children,
}: {
  kind: SeriesKind;
  title: string;
  footnote?: ReactNode;
  link: EvidenceHub["series"][number] | undefined;
  slot: SeriesSlot | undefined;
  onNeeded: (kind: SeriesKind) => void;
  /** What an answered series with no points means, in this panel's words. */
  emptyReason: string;
  children: (series: EvidenceSeries) => ReactNode;
}) {
  /* The read starts when the panel is on screen and its link says the series
     exists — not on mount, and never for a series the Hub declared absent. */
  const available = link !== undefined && isAvailable(link.availability);
  useEffect(() => {
    if (available) onNeeded(kind);
  }, [available, kind, onNeeded]);

  const ready = slot?.state === "ready" ? slot.series : null;
  const empty = ready !== null && ready.values.length === 0;

  return (
    <figure
      className="m-0 flex min-w-0 flex-col gap-2 rounded-[8px] border p-4"
      data-series-panel={kind}
      data-series-state={empty ? "empty" : (slot?.state ?? (available ? "idle" : "absent"))}
      style={PANEL_STYLE}
    >
      <figcaption className="flex flex-wrap items-baseline gap-2">
        <span className="text-[15px]" style={{ fontFamily: "var(--font-display)", color: "var(--ink)" }}>
          {title}
        </span>
        {ready ? (
          <span
            className="mono ml-auto text-[9.5px]"
            style={{ color: "var(--ink-faint)" }}
            data-sampling={ready.source_sample.sampling ?? "NOT_PUBLISHED"}
          >
            {formatMetric(ready.source_sample.emitted_point_count, "count")} points from{" "}
            {ready.source_sample.source_observation_count === null
              ? "an unpublished number of"
              : formatMetric(ready.source_sample.source_observation_count, "count")}{" "}
            source observations · {ready.source_sample.sampling ?? "sampling not published"}
          </span>
        ) : null}
      </figcaption>

      {!available && link !== undefined ? (
        <Withheld availability={link.availability} what={kind} />
      ) : link === undefined ? (
        <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what={kind} />
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
        <p className="text-[11px]" style={{ color: "var(--role-holdout)" }} data-series-mismatch>
          this chart answered at a different projection revision than the summary above it, so it was
          discarded rather than drawn beside numbers it does not belong to.
        </p>
      ) : (
        <p className="mono text-[10px] italic" style={{ color: "var(--ink-faint)" }} data-series-loading>
          reading…
        </p>
      )}
      {footnote ? (
        <div className="text-[12px] leading-[1.4]" style={{ color: "var(--ink-faint)" }}>
          {footnote}
        </div>
      ) : null}
    </figure>
  );
}

function MonthlyHeat({ series }: { series: EvidenceSeries }) {
  const points = series.values as MonthlyReturnPoint[];
  return (
    <div className="flex items-end gap-[3px]" data-chart="monthly">
      {points.map((point) => {
        const negative = point.return_fraction.trim().startsWith("-");
        const month = new Date(point.month_start_utc_ms).toISOString().slice(0, 7);
        const shown = formatMetric(point.return_fraction, "fraction");
        return (
          <span
            key={point.month_start_utc_ms}
            className="flex min-w-0 flex-1 flex-col gap-0.5"
            data-month={month}
            title={`${month} · ${point.return_fraction}`}
          >
            <span
              className="block h-[26px] rounded-[3px]"
              style={{ background: negative ? "var(--bad-bg)" : "var(--good-bg)" }}
            />
            <span
              className="mono text-center text-[8.5px]"
              style={{ color: negative ? "var(--bad)" : "var(--good)" }}
              data-month-value
            >
              {shown ?? point.return_fraction}
            </span>
            <span className="mono text-center text-[8px]" style={{ color: "var(--ink-faint)" }}>
              {month}
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
 * (FE-S04-09). The retention lane answers one refusal code for every case
 * (`CG-P13-09`), so the cause is read from the run's own status first and
 * then from the lane's state word in the server's sentence — never from a
 * profile the run was not checked against.
 */
function passportCause(refusal: EvidenceRefusal | null, status: string | null): { key: string; sentence: string } | null {
  if (status !== null && ENDED_UNSEALED.has(status)) {
    return {
      key: "NOT_RETAINABLE",
      sentence: `not retainable — this run is ${status} and never sealed an output, so there is nothing to retain.`,
    };
  }
  const detail = refusal?.detail ?? "";
  if (/PENDING_RETENTION/.test(detail)) {
    return {
      key: "PENDING_RETENTION",
      sentence:
        "pending retention — the run's QuantBT output has not been sealed into retained storage yet. The passport appears once retention completes; nothing here is read from the live output instead.",
    };
  }
  if (/NOT_RETAINED_LEGACY|legacy/i.test(detail)) {
    return { key: "NOT_RETAINED_LEGACY", sentence: "not retained — this run predates retained storage." };
  }
  if (refusal?.code === "RESEARCH_CURRENT_SOURCE_CONFLICT") {
    return {
      key: "NOT_RETAINED",
      sentence: "not retained yet — no sealed retained artifact exists for this run. Nothing here is read from the live output instead.",
    };
  }
  return null;
}

function PassportPanel({
  slot,
  onNeeded,
  status,
  sealed,
}: {
  slot: PassportSlot;
  onNeeded: () => void;
  status: string | null;
  /** False when the hub says the run has no sealed evidence — the read cannot apply. */
  sealed: boolean;
}) {
  /* FE-X-12: skip the read whose lane cannot apply. */
  useEffect(() => {
    if (sealed) onNeeded();
  }, [onNeeded, sealed]);

  const skipped = !sealed ? passportCause(null, status) ?? {
    key: "NOT_SEALED",
    sentence: "not read — the hub has no sealed evidence for this run, so there is no retained output to ask for.",
  } : null;
  const refusal = slot.state === "refused" ? slot.refusal : null;
  const cause = skipped ?? (refusal ? passportCause(refusal, status) : null);

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-3.5 py-3"
      data-passport={skipped ? "skipped" : slot.state}
      style={PANEL_STYLE}
    >
      <PanelLabel>retained source passport</PanelLabel>

      {skipped ? (
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-passport-cause={skipped.key}>
          {skipped.sentence}
        </p>
      ) : slot.state === "ready" ? (
        <RetainedPassport evidence={slot.evidence} />
      ) : refusal ? (
        <div className="flex flex-col gap-1" data-passport-refusal>
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
          retained {formatUtc(provenance.retained_at_utc_ms)}
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

/** The HiFi window switcher. The Hub publishes the OOS window only; the rest keep their place with the reason. */
function WindowSwitcher() {
  const windows = [
    { label: "IS", on: false },
    { label: "OOS", on: true },
    { label: "Holdout Live", on: false },
    { label: "Compare", on: false },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2.5" data-window-switcher>
      <span className="inline-flex overflow-hidden rounded-[6px] border" style={{ borderColor: "var(--line)" }}>
        {windows.map((entry) => (
          <span
            key={entry.label}
            aria-disabled={!entry.on}
            aria-current={entry.on ? "true" : undefined}
            title={entry.on ? "the window every metric and series on this tab describes" : "the Evidence Hub publishes the OOS window only"}
            className="mono border-r px-3 py-1 text-[11px] last:border-r-0"
            style={{
              borderColor: "var(--line)",
              background: entry.on ? "var(--accent-soft)" : "var(--paper-raised)",
              color: entry.on ? "var(--accent)" : "var(--ink-faint)",
              opacity: entry.on ? 1 : 0.6,
            }}
          >
            {entry.label}
          </span>
        ))}
      </span>
      <span
        className="mono border-l-2 pl-1.5 text-[10px]"
        style={{ color: "var(--role-holdout)", borderColor: "var(--role-holdout)" }}
        data-window-disclosure
      >
        {WINDOW_DISCLOSURE}
      </span>
    </div>
  );
}

function SummaryTab({
  hub,
  series,
  ensureSeries,
  passport,
  ensurePassport,
}: {
  hub: EvidenceHub;
  series: ReadonlyMap<SeriesKind, SeriesSlot>;
  ensureSeries: (kind: SeriesKind) => void;
  passport: PassportSlot;
  ensurePassport: () => void;
}) {
  const linkFor = (kind: SeriesKind) => hub.series.find((entry) => entry.kind === kind);
  const ordered = METRIC_ORDER.map((key) => hub.metrics.find((metric) => metric.key === key)).filter(
    (metric): metric is Metric => metric !== undefined,
  );
  const status = runStatus(hub);
  const sealed = hub.readiness !== "NOT_READY" && !(status !== null && (ENDED_UNSEALED.has(status) || LIVE.has(status)));
  const perFold = hub.source_absences.per_fold_metrics;

  return (
    <section data-screen-label="Summary" className="flex flex-col gap-3.5">
      <WindowSwitcher />

      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }} data-metrics>
        {ordered.map((metric) => (
          <MetricTile key={metric.key} metric={metric} />
        ))}
      </div>

      {hub.warnings.length > 0 ? (
        <ul className="flex flex-col gap-1" data-warnings>
          {hub.warnings.map((warning) => (
            <li
              key={warning.definition_id}
              data-warning={warning.definition_id}
              data-warning-state={warning.state}
              title={warning.reason_code ?? undefined}
              className="text-[11px]"
              style={{ color: warning.state === "ACTIVE" ? "var(--role-holdout)" : "var(--ink-faint)" }}
            >
              {warning.copy}
            </li>
          ))}
        </ul>
      ) : null}

      <SeriesPanel
        kind="EQUITY_OOS"
        title="Equity — stitched OOS account"
        link={linkFor("EQUITY_OOS")}
        slot={series.get("EQUITY_OOS")}
        onNeeded={ensureSeries}
        emptyReason="the source published this series with no points, so no curve is drawn."
        footnote={
          <span data-fold-boundaries>
            Fold boundaries are not marked: the Hub publishes which folds were observed, not where each one starts.
          </span>
        }
      >
        {(loaded) => (
          <ChartFrame height={380}>
            <EquityChart series={loaded} />
          </ChartFrame>
        )}
      </SeriesPanel>

      <SourceGap
        id="per-fold-verdict"
        title="per-fold verdict — which fold carries the run, which fold drags it"
        reason={
          <>
            {perFold ? <Withheld availability={perFold} what="per-fold metrics" /> : null}{" "}
            The Evidence contract publishes run-final metrics and four named series; it publishes no per-fold metric,
            verdict or threshold rule. A verdict drawn here would be this screen's opinion, not the engine's.
          </>
        }
      />

      <div className="flex flex-wrap gap-3.5">
        <div className="min-w-0 flex-[1.4] basis-[420px]">
          <SeriesPanel
            kind="ROLLING_RETURNS_20"
            title="Strategy behavior — rolling 20-observation return"
            link={linkFor("ROLLING_RETURNS_20")}
            slot={series.get("ROLLING_RETURNS_20")}
            onNeeded={ensureSeries}
            emptyReason="the source published no rolling window for this run, so no line is drawn."
          >
            {(loaded) => (
              <ChartFrame height={230}>
                <RollingChart series={loaded} />
              </ChartFrame>
            )}
          </SeriesPanel>
        </div>
        <div className="min-w-0 flex-1 basis-[320px]">
          <SeriesPanel
            kind="RETURN_DISTRIBUTION"
            title="Return distribution — stitched OOS"
            link={linkFor("RETURN_DISTRIBUTION")}
            slot={series.get("RETURN_DISTRIBUTION")}
            onNeeded={ensureSeries}
            emptyReason="the source published no histogram bucket for this run, so no bar is drawn."
          >
            {(loaded) => (
              <ChartFrame height={230}>
                <DistributionChart series={loaded} />
              </ChartFrame>
            )}
          </SeriesPanel>
        </div>
      </div>

      <div className="flex flex-wrap gap-3.5">
        <div className="min-w-0 flex-[1.3] basis-[420px]">
          <SeriesPanel
            kind="MONTHLY_RETURNS"
            title="Monthly returns — stitched OOS"
            link={linkFor("MONTHLY_RETURNS")}
            slot={series.get("MONTHLY_RETURNS")}
            onNeeded={ensureSeries}
            emptyReason="no calendar month was published for this run — the source emitted 0 monthly values, so no cell is drawn. A month is never reduced from the equity series here."
          >
            {(loaded) => <MonthlyHeat series={loaded} />}
          </SeriesPanel>
        </div>
        <div className="min-w-0 flex-1 basis-[300px]">
          <SourceGap
            id="behavior-tiles"
            title="behavior — engine-published, UI renders"
            reason="no behaviour analytic (win rate, payoff, average hold, turnover, exposure, beta) is published for this run. These tiles stay empty rather than being computed from the equity series, which would make the chart the source of a number the engine never issued."
          />
        </div>
      </div>

      <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
        {SAMPLING_NOTE} Every series is capped at {SERIES_POINT_CAP} points by the contract.
      </p>

      <PassportPanel slot={passport} onNeeded={ensurePassport} status={status} sealed={sealed} />
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
              started {row.started_at_utc_ms === null ? "not published" : formatUtc(row.started_at_utc_ms)}
            </span>
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              completed {row.completed_at_utc_ms === null ? "not published" : formatUtc(row.completed_at_utc_ms)}
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

function UnroutedAction({ label, screen, phase }: { label: string; screen: string; phase: string }) {
  return (
    <span
      data-action-unrouted={label}
      aria-disabled="true"
      title={`Screen ${screen} is not built yet (${phase}), so this action would go nowhere.`}
      className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase tracking-[.05em]"
      style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.55, cursor: "not-allowed" }}
    >
      {label}
    </span>
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
                issued {certificate.issued_at_utc_ms === null ? "not published" : formatUtc(certificate.issued_at_utc_ms)}
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

      <section className="flex flex-wrap items-center justify-between gap-2.5 rounded-[8px] border px-4 py-3" data-claim-next style={PANEL_STYLE}>
        <PanelLabel>next — hooks only, gates designed in a later round</PanelLabel>
        <span className="flex flex-wrap gap-2">
          <UnroutedAction label="generate run report →" screen="09" phase="P18" />
          <UnroutedAction label="release candidate →" screen="11" phase="P21" />
        </span>
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
    <main className="flex flex-col gap-2 px-1 py-4" data-screen="evidence-flow" data-run={runId} data-run-not-found>
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

/**
 * The run is not sealed. What that means depends on its durable status
 * (`run_identity.status`), so the sentence and the way out do too: a live run
 * is sent to its progress screen, a cancelled one is not told to watch it.
 */
function SealNotice({ runId, status }: { runId: string; status: string | null }) {
  const progress = `/research/quantbt/runs/${encodeURIComponent(runId)}/progress`;
  let sentence: string;
  let action: ReactNode = null;
  if (status !== null && LIVE.has(status)) {
    sentence = `This run is ${status} and has not sealed its evidence yet. The hub shows what the projection holds; the run's live state lives on its progress screen.`;
    action = (
      <Link to={progress} data-action="watch-progress" className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
        watch progress →
      </Link>
    );
  } else if (status === "CANCELLED") {
    sentence =
      "This run is CANCELLED. It stopped before sealing evidence, so no metric, series or claim was produced for it, and none will arrive.";
    action = (
      <Link to="/research/quantbt/runs" data-action="open-runs" className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
        ← Run Library
      </Link>
    );
  } else if (status === "FAILED" || status === "RECOVERY_REQUIRED") {
    sentence = `This run is ${status}. It ended before sealing evidence; its progress record shows where it stopped.`;
    action = (
      <Link to={progress} data-action="open-progress-record" className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase" style={{ color: "var(--accent)", borderColor: "var(--accent)" }}>
        open progress record →
      </Link>
    );
  } else {
    sentence =
      "The evidence projection for this run is not ready (readiness NOT_READY). Nothing below is inferred from the run's status.";
  }
  return (
    <section
      className="flex flex-wrap items-center gap-3 rounded-[8px] border px-4 py-2.5"
      data-not-ready={status ?? "UNKNOWN"}
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper-sunken)" }}
    >
      <p className="text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {sentence}
      </p>
      {action}
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
  onReread,
}: EvidenceFlowProps) {
  const [drawer, setDrawer] = useState(false);
  const drawerTrigger = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);
  const strip = useRef<HTMLDivElement>(null);
  const [stripHeight, setStripHeight] = useState(0);
  const topbar = useTopbarOffset();
  const summaryVisited = useRef(false);
  if (cursor.stage === "summary") summaryVisited.current = true;
  const summaryKept = summaryVisited.current;

  /* A run id is 37 characters; the full one is on the identity line, and at
     full length the crumb wrapped the 56px topbar the strip is pinned under. */
  const crumbRun = runId.length > 16 ? `${runId.slice(0, 13)}…` : runId;
  useTopbarCrumb(notFound ? null : `${crumbRun} / ${STAGE_CRUMB[cursor.stage]}`);

  /* FE-S04-07: closing the drawer, by any route, hands focus back to the chip. */
  useEffect(() => {
    if (drawer) {
      drawerWasOpen.current = true;
    } else if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      drawerTrigger.current?.focus();
    }
  }, [drawer]);
  const closeDrawer = useCallback(() => setDrawer(false), []);

  /* The tab card sticks right under the strip, whose height changes as it wraps. */
  useEffect(() => {
    const element = strip.current;
    if (!element || typeof ResizeObserver !== "function") return;
    const observer = new ResizeObserver(() => setStripHeight(element.getBoundingClientRect().height));
    observer.observe(element);
    return () => observer.disconnect();
  }, [notFound]);

  if (notFound) return <RunNotFound runId={runId} />;

  const status = runStatus(hub);

  return (
    <div className="flex flex-col gap-3.5" data-screen="evidence-flow" data-run={runId}>
      <RunHeader
        runId={runId}
        hub={hub}
        drawerOpen={drawer}
        drawerTrigger={drawerTrigger}
        onOpenDrawer={() => setDrawer(true)}
      />
      {hub && drawer ? <DatasetDrawer hub={hub} onClose={closeDrawer} /> : null}

      <ClaimStrip hub={hub} state={state} onJump={onStage} stripRef={strip} top={topbar} />

      {hub && hub.readiness === "NOT_READY" ? <SealNotice runId={runId} status={status} /> : null}

      {/* Tabs and cursor: one card, sticky under the strip from md up (HiFi).
          Below md neither sticks: topbar + strip + card would hold a third of
          a phone screen. */}
      <div
        className="z-[19] rounded-[6px] border md:sticky"
        data-stage-card
        style={{
          top: `calc(${topbar} + ${stripHeight}px)`,
          borderColor: "var(--line)",
          background: "var(--paper-raised)",
          boxShadow: "var(--shadow)",
        }}
      >
        <StageTabs cursor={cursor} hub={hub} onStage={onStage} />
        <CursorBar
          runId={runId}
          cursor={cursor}
          hub={hub}
          folds={hub?.core.fold_navigation}
          onFold={onFold}
          onReset={onResetCursor}
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
              series={series}
              ensureSeries={ensureSeries}
              passport={passport}
              ensurePassport={ensurePassport}
            />
          </div>
        ) : null}
      </ResearchPanel>
    </div>
  );
}
