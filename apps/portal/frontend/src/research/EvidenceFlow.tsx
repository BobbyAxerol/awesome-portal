/**
 * Screen 04 — Evidence Flow hub (P13 + RS-02).
 *
 * One hub, one cursor, seven tabs. The composition is the hi-fi's; what fills
 * it is only what the two generated contracts publish, and every panel the
 * source does not answer keeps its frame and says which kind of silence it is.
 *
 * The screen renders no derived number. Values arrive as exact decimal strings
 * and are printed as strings; charts plot them, and a plotted point is never
 * offered as the value of anything — the tile beside it is. Nothing here
 * recomputes a certificate from stage caps, a return from an equity curve or a
 * month from a day.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { EChart } from "../charts/EChart";
import { baseOption, paletteNow, roleColorsNow } from "../charts/theme";
import { vizTokensFor } from "../styles/tokens";
import { ResearchPanel } from "./ResearchPanel";
import {
  SERIES_POINT_CAP,
  WITHHELD_WORDS,
  isAvailable,
  unavailableReason,
  type Availability,
  type CurrentSourceEvidence,
  type DistributionBucket,
  type CorrectedDistributionBucket,
  type EquityPoint,
  type EvidenceHub,
  type EvidenceSeries,
  type FoldNavigation,
  type Metric,
  type MonthlyReturnPoint,
  type RollingReturnPoint,
  type SeriesKind,
} from "./evidenceClient";
import {
  EVIDENCE_STAGES,
  deepDiveHref,
  type EvidenceCursor,
  type EvidenceStage,
} from "./evidenceCursor";
import type { PassportSlot, SeriesSlot } from "./useEvidence";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

/** Spec 04 §9 — the sentences that must not be paraphrased. */
export const CERT_TOOLTIP = "min of stage caps — S1 holdout seal binds";
export const WINDOW_DISCLOSURE =
  "headline = OOS only — IS and holdout never enter the headline row.";
export const DRAWER_FOOTER =
  "identity pinned at submit — the run read exactly this snapshot; Data Catalog module is SOON.";
export const COPY_LINK_IDLE = "copy evidence link";
export const COPY_LINK_DONE = "✓ evidence link copied";

/** Why a chart may be smaller than the run that produced it. */
export const SAMPLING_NOTE =
  "a chart is a bounded view of the source series; sampling changes the picture, never a metric above it.";

const STAGE_LABEL: Record<EvidenceStage, string> = {
  summary: "Summary",
  split: "S1 · Split",
  search: "S2 · Search",
  freeze: "S3 · Freeze",
  execute: "S4 · Execute",
  claim: "S5 · Claim",
  atlas: "Atlas",
};

/**
 * Where each stage tab's deep dive lives, and whether that screen exists yet.
 *
 * P14, P15 and P16 opened three of these, so they are links now. A panel that
 * still said "no published route" for a screen that exists would be exactly
 * the stale absence the re-read rule was written for.
 */
const DEEP_DIVE: Partial<Record<EvidenceStage, { screen: string; path: string | null }>> = {
  split: { screen: "05 Split", path: "split" },
  search: { screen: "06 Search", path: "search" },
  freeze: { screen: "07 Freeze", path: "freeze" },
  execute: { screen: "08 Execute", path: null },
};

/**
 * A fill for an area under a line, from the line's own colour.
 *
 * `#rrggbb` plus an alpha pair: the token stays the single source of the hue,
 * and the fill cannot drift away from the stroke it belongs to.
 */
function withSoftAlpha(color: string): string {
  return /^#[0-9a-f]{6}$/i.test(color) ? `${color}22` : color;
}

/*
 * Two apparatus the shared theme gives every chart and this screen turns off.
 *
 * The legend names one series the panel heading already names, and it landed
 * on top of the first y-axis label. The zoom slider offers a deep read that
 * spec 04 §7 puts on Screen 08 — offering it here would promise an
 * interaction this data, already bounded and sampled, cannot honour.
 */
function noChartApparatus() {
  return { legend: { show: false }, dataZoom: [] as never[] };
}

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

/** A panel the source does not fill, kept at full size with its reason. */
function SourceGap({
  title,
  reason,
  children,
  id,
}: {
  title: string;
  reason: string;
  children?: React.ReactNode;
  id: string;
}) {
  return (
    <section
      className="flex flex-col gap-1.5 rounded-[8px] border px-4 py-3"
      data-gap={id}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {title}
      </h3>
      <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
        {reason}
      </p>
      {children}
    </section>
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

/**
 * One fact in the run header.
 *
 * Every field of `run_identity` carries its own availability, so each is
 * rendered or withheld on its own terms — a run whose requested spec could not
 * be parsed still shows its status and its binding. `NOT_APPLICABLE` is not a
 * gap: a seed that was deliberately not selected is a real answer, and it says
 * so rather than printing nothing or a zero.
 */
function HeaderFact({
  label,
  value,
  availability,
  mono = true,
}: {
  label: string;
  value: string | null;
  availability: Availability;
  mono?: boolean;
}) {
  return (
    <span className="flex items-baseline gap-1" data-header-fact={label}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {label}
      </span>
      {isAvailable(availability) && value !== null ? (
        <span className={mono ? "mono text-[10px]" : "text-[10px]"} data-header-value={label}>
          {value}
        </span>
      ) : (
        <Withheld availability={availability} />
      )}
    </span>
  );
}

/* ------------------------------------------------------------ claim strip */

/**
 * The claim strip.
 *
 * The hi-fi shows eight engine strings. P13 publishes the Stage-5 claim, its
 * methodology certificate and a warning register; the other chips are facts no
 * contract on this screen carries, so the strip states that rather than
 * printing a plausible sentence. A certificate chip appears only for a typed
 * `ISSUED` grade: a claim string never earns one.
 */
function ClaimStrip({
  hub,
  onJump,
}: {
  hub: EvidenceHub;
  onJump: (stage: EvidenceStage) => void;
}) {
  const certificate = hub.claim.methodology_certificate;
  const issued = certificate.state === "ISSUED" && certificate.grade !== null;

  return (
    <div
      className="sticky top-0 z-20 flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-b px-4 py-[7px]"
      data-claim-strip={hub.claim.state}
      style={{ borderColor: "var(--role-holdout)", background: "var(--paper-sunken)" }}
    >
      <span className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        claim
      </span>

      {hub.claim.state === "ISSUED" && hub.claim.text !== null ? (
        <button
          type="button"
          className="mono text-left text-[10px]"
          style={{ color: "var(--ink)" }}
          data-claim-text
          aria-label="Stage 5 claim — jump to source"
          onClick={() => onJump("claim")}
        >
          {hub.claim.text}
        </button>
      ) : hub.claim.state === "FORECAST" && hub.claim.text !== null ? (
        <span className="mono text-[10px] italic" data-claim-forecast style={{ color: "var(--role-holdout)" }}>
          {hub.claim.text} — forecast, not the issued claim
        </span>
      ) : (
        <Withheld availability={hub.claim.availability} what="claim" />
      )}

      <span style={{ color: "var(--line-strong)" }}>·</span>

      {issued ? (
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
      ) : (
        <Withheld
          availability={{
            state: certificate.state === "NOT_ISSUED" ? "NOT_APPLICABLE" : "NOT_PUBLISHED",
            reason_code: certificate.reason_code,
          }}
          what="certificate"
        />
      )}

      <span style={{ color: "var(--line-strong)" }}>·</span>

      <Chip data-registry={hub.metric_registry_version}>{hub.metric_registry_version}</Chip>
      <Chip data-readiness={hub.readiness}>readiness {hub.readiness.toLowerCase()}</Chip>
    </div>
  );
}

/* ------------------------------------------------------------- run header */

function RunHeader({
  hub,
  cursor,
  onOpenDrawer,
}: {
  hub: EvidenceHub;
  cursor: EvidenceCursor;
  onOpenDrawer: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const { core } = hub;
  const identity = core.run_identity;

  const copyLink = useCallback(() => {
    const href = `${window.location.origin}${window.location.pathname}${deepDiveHref("", cursor)}`;
    void navigator.clipboard?.writeText(href).catch(() => undefined);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }, [cursor]);

  return (
    <header
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-run-header={hub.run_id}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2.5">
        <span className="mono text-[15px] font-bold" data-run-id>
          {hub.run_id}
        </span>

        {/*
          * `run_identity` is additive and optional while the responder rolls
          * out. An older responder that does not send it leaves the header
          * thinner — the shell stays, and nothing is invented to fill it.
          */}
        {identity ? (
          <>
            {isAvailable(identity.status.availability) && identity.status.value !== null ? (
              <Chip data-run-status={identity.status.value} tone="var(--accent)" border="var(--accent)">
                {identity.status.value.toLowerCase()}
              </Chip>
            ) : (
              <Withheld availability={identity.status.availability} what="status" />
            )}

            {isAvailable(identity.binding.availability) && identity.binding.alpha_name !== null ? (
              <Chip
                data-binding={identity.binding.alpha_version_id ?? ""}
                title={`${identity.binding.alpha_id ?? ""} · ${identity.binding.alpha_version_id ?? ""}`}
              >
                {identity.binding.alpha_name}
                {identity.binding.alpha_version_id ? ` · ${identity.binding.alpha_version_id}` : ""}
              </Chip>
            ) : (
              <Withheld availability={identity.binding.availability} what="binding" />
            )}
          </>
        ) : null}

        {core.engine_version !== null ? (
          <Chip data-engine={core.engine_version}>quantbt-engine {core.engine_version}</Chip>
        ) : (
          <Withheld availability={hub.availability} what="engine" />
        )}

        {core.source_adapter_id !== null ? (
          <Chip data-adapter={core.source_adapter_id}>{core.source_adapter_id}</Chip>
        ) : null}

        {core.data.symbol !== null && core.data.timeframe !== null ? (
          <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-instrument>
            {core.data.symbol} · {core.data.timeframe}
          </span>
        ) : null}

        <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-as-of>
          as of {new Date(hub.as_of_utc_ms).toISOString()}
        </span>
      </div>

      {identity ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5" data-run-identity>
          <HeaderFact
            label="created"
            value={
              identity.created_at_utc_ms.value === null
                ? null
                : new Date(identity.created_at_utc_ms.value).toISOString()
            }
            availability={identity.created_at_utc_ms.availability}
          />
          <HeaderFact label="mode" value={identity.mode.value} availability={identity.mode.availability} />
          <HeaderFact
            label="schedule"
            value={identity.schedule.value}
            availability={identity.schedule.availability}
          />
          <HeaderFact label="route" value={identity.route.id.value} availability={identity.route.id.availability} />
          {/*
            * A selected route id is not a route contract. The contract is
            * published as absent, and printing the id under that label would
            * upgrade a choice into an assertion about what the route enforces.
            */}
          <HeaderFact
            label="route contract"
            value={identity.route.contract.value}
            availability={identity.route.contract.availability}
          />
          <HeaderFact
            label="config digest"
            value={identity.config_digest.value}
            availability={identity.config_digest.availability}
          />
          {/*
            * `seed` null with NOT_APPLICABLE is a real selected null — the run
            * asked for no fixed seed — not a fact the source failed to send.
            */}
          <HeaderFact
            label="seed"
            value={identity.seed.value === null ? null : String(identity.seed.value)}
            availability={identity.seed.availability}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {core.input_scope !== null ? (
          <Chip data-input-scope={core.input_scope}>{core.input_scope.toLowerCase()}</Chip>
        ) : null}

        <button
          type="button"
          data-action="dataset-drawer"
          onClick={onOpenDrawer}
          className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
          style={{ color: "var(--accent)", borderColor: "var(--accent)", background: "var(--paper-raised)" }}
        >
          {core.data.dataset_id ?? "dataset"} ▾
        </button>

        {/*
          * The revision is the run's identity on this screen, so it is shown.
          * It is never parsed, and nothing the browser sends carries it.
          */}
        {hub.revision !== null ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-revision>
            revision {hub.revision}
          </span>
        ) : (
          <Withheld availability={hub.availability} what="revision" />
        )}

        <span className="ml-auto flex flex-wrap items-center gap-2">
          {/*
            * Screens 09 and 11 have no route yet. An action that would go
            * nowhere is shown refused with the reason, never as a live button
            * a reader can be disappointed by.
            */}
          {(["generate report → 09", "release candidate → 11"] as const).map((label) => (
            <span
              key={label}
              data-action-unrouted={label}
              title="that screen has no published route yet, so this action would go nowhere."
              className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase"
              style={{
                color: "var(--ink-faint)",
                borderColor: "var(--line)",
                opacity: 0.55,
                cursor: "not-allowed",
              }}
            >
              {label}
            </span>
          ))}
          <button
            type="button"
            data-action="copy-link"
            onClick={copyLink}
            className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          >
            {copied ? COPY_LINK_DONE : COPY_LINK_IDLE}
          </button>
        </span>
      </div>
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
      hub.core.data.oos_observation_count === null ? null : String(hub.core.data.oos_observation_count),
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
          <h2 id={titleId} className="mono text-[12px] font-bold">
            dataset identity
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
              <dd className="mono text-[10.5px]">
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

/* --------------------------------------------------------------- tab bar */

function StageTabs({
  cursor,
  hub,
  onStage,
}: {
  cursor: EvidenceCursor;
  hub: EvidenceHub;
  onStage: (stage: EvidenceStage) => void;
}) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const subFor = (stage: EvidenceStage): string => {
    if (stage === "summary") return `${hub.metrics.length} metrics · ${hub.series.length} series`;
    if (stage === "claim") {
      const grade = hub.claim.methodology_certificate.grade;
      return grade === null ? "no certificate" : `cert ${grade}`;
    }
    if (stage === "atlas") return "modes × routes";
    const key = { split: "S1", search: "S2", freeze: "S3", execute: "S4" }[stage];
    const found = hub.stages.find((row) => row.key === key);
    return found ? found.state.toLowerCase() : "not published";
  };

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
    <div role="tablist" aria-label="Evidence stages" className="flex flex-wrap gap-1" onKeyDown={onKeyDown}>
      {EVIDENCE_STAGES.map((stage) => {
        const selected = cursor.stage === stage;
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
            className="flex flex-col gap-px rounded-[6px] border px-3 py-[5px] text-left"
            style={{
              borderColor: selected ? "var(--accent)" : "var(--line)",
              background: selected ? "var(--accent-soft)" : "var(--paper-raised)",
            }}
          >
            <span className="mono text-[10.5px] font-semibold" style={{ color: selected ? "var(--accent)" : "var(--ink)" }}>
              {STAGE_LABEL[stage]}
            </span>
            <span className="text-[9px]" style={{ color: "var(--ink-faint)" }}>
              {subFor(stage)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------ cursor bar */

function CursorBar({
  cursor,
  folds,
  onFold,
  onReset,
}: {
  cursor: EvidenceCursor;
  folds: FoldNavigation | undefined;
  onFold: (fold: number) => void;
  onReset: () => void;
}) {
  /*
   * The step buttons are bound to the folds P11 actually observed, and to
   * nothing else. This is a published observed set, not the source's complete
   * fold plan: the label says "observed" so the selector cannot be read as a
   * promise about folds nobody has seen. With no published set the controls
   * are disabled and carry the server's reason, rather than letting a reader
   * walk to fold 40 of a five-fold run while the screen looks like it agreed.
   */
  const published = folds !== undefined && isAvailable(folds.availability) ? folds.observed_folds : [];
  const index = published.indexOf(cursor.fold);
  const atFirst = published.length === 0 || index <= 0;
  const atLast = published.length === 0 || index === published.length - 1 || index === -1;
  const step = (delta: number) => {
    if (index === -1) return;
    const next = published[index + delta];
    if (next !== undefined) onFold(next);
  };

  return (
    <div
      className="flex flex-wrap items-center gap-2.5 rounded-[6px] border px-3 py-1.5"
      data-cursor-bar
      style={{ borderColor: "var(--line-soft)", background: "var(--paper-sunken)" }}
    >
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        evidence cursor
      </span>

      <span className="mono text-[10.5px]" data-cursor-fold>
        fold {cursor.fold}
      </span>
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-fold-bound>
        {published.length > 0 ? (
          <>
            of {published.length} observed
            {index === -1 ? " — this fold is not in the observed set" : ""}
          </>
        ) : (
          <>
            of{" "}
            <Withheld
              availability={folds?.availability ?? { state: "NOT_PUBLISHED", reason_code: null }}
              what="observed folds"
            />
          </>
        )}
      </span>

      {/* The published members, so a reader can reach one without stepping. */}
      {published.length > 1 ? (
        <select
          className="mono rounded-[4px] border px-1 text-[10px]"
          style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
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
        aria-label="previous fold"
        data-action="fold-previous"
        disabled={atFirst}
        title={
          published.length === 0
            ? unavailableReason(folds?.availability ?? { state: "NOT_PUBLISHED", reason_code: null })
            : atFirst
              ? "this is the first observed fold"
              : "previous observed fold"
        }
        onClick={() => step(-1)}
        className="mono text-[11px]"
        style={{ opacity: atFirst ? 0.35 : 1, cursor: atFirst ? "not-allowed" : "pointer" }}
      >
        ‹
      </button>
      <button
        type="button"
        aria-label="next fold"
        data-action="fold-next"
        disabled={atLast}
        title={
          published.length === 0
            ? unavailableReason(folds?.availability ?? { state: "NOT_PUBLISHED", reason_code: null })
            : atLast
              ? "this is the last observed fold"
              : "next observed fold"
        }
        onClick={() => step(1)}
        className="mono text-[11px]"
        style={{ opacity: atLast ? 0.35 : 1, cursor: atLast ? "not-allowed" : "pointer" }}
      >
        ›
      </button>

      <span className="mono text-[10.5px]" data-cursor-trial>
        trial{" "}
        {cursor.trial !== null ? (
          `#${cursor.trial}`
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_TRIAL_CURSOR" }} />
        )}
      </span>

      <span className="mono text-[10.5px]" data-cursor-params>
        params{" "}
        {cursor.params !== null ? (
          cursor.params
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: "P13_PUBLISHES_NO_PARAMS_DIGEST" }} />
        )}
      </span>

      <button
        type="button"
        data-action="reset-cursor"
        onClick={onReset}
        className="mono ml-auto rounded-[6px] border px-2.5 py-px text-[10px]"
        style={{ color: "var(--accent)", borderColor: "var(--line)" }}
      >
        reset to θ*
      </button>
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

function MetricTile({ metric }: { metric: Metric }) {
  const shown = isAvailable(metric.availability) && metric.value !== null;
  return (
    <div
      className="flex min-w-[150px] flex-1 flex-col gap-1 rounded-[8px] border px-3.5 py-2.5"
      data-metric={metric.key}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {metric.label}
      </span>
      {shown ? (
        /* The server's string, printed. No `Number()` stands between the
           engine's value and the reader's eye. */
        <span className="mono text-[17px] font-semibold" data-metric-value={metric.key}>
          {metric.value}
        </span>
      ) : (
        <Withheld availability={metric.availability} />
      )}
      <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-metric-scope={metric.scope}>
        {metric.scope.toLowerCase().replace(/_/g, " ")} · {metric.unit.toLowerCase()} ·{" "}
        {metric.origin.toLowerCase().replace(/_/g, " ")}
      </span>
    </div>
  );
}

/* ----------------------------------------------------------------- charts */

/** The frame every lazy series panel keeps, whatever the answer turns out to be. */
function SeriesPanel({
  kind,
  title,
  link,
  slot,
  onNeeded,
  children,
}: {
  kind: SeriesKind;
  title: string;
  link: EvidenceHub["series"][number] | undefined;
  slot: SeriesSlot | undefined;
  onNeeded: (kind: SeriesKind) => void;
  children: (series: EvidenceSeries) => React.ReactNode;
}) {
  /* The read starts when the panel is on screen and its link says the series
     exists — not on mount, and never for a series the Hub declared absent. */
  const available = link !== undefined && isAvailable(link.availability);
  useEffect(() => {
    if (available) onNeeded(kind);
  }, [available, kind, onNeeded]);

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-series-panel={kind}
      data-series-state={slot?.state ?? (available ? "idle" : "absent")}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="text-[12px]" style={{ color: "var(--ink)" }}>
          {title}
        </h3>
        {slot?.state === "ready" ? (
          <span className="mono text-[9px]" style={{ color: "var(--ink-faint)" }} data-sampling={slot.series.source_sample.sampling ?? "NOT_PUBLISHED"}>
            {slot.series.source_sample.emitted_point_count} of{" "}
            {slot.series.source_sample.source_observation_count ?? "?"} points ·{" "}
            {(slot.series.source_sample.sampling ?? "sampling not published").toLowerCase()}
          </span>
        ) : null}
      </div>

      {!available && link !== undefined ? (
        <Withheld availability={link.availability} what={kind.toLowerCase().replace(/_/g, " ")} />
      ) : slot?.state === "ready" ? (
        children(slot.series)
      ) : slot?.state === "refused" ? (
        <p className="text-[11px]" style={{ color: "var(--bad)" }} data-series-refusal>
          {slot.refusal.message}
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
    </section>
  );
}

/**
 * Equity, and beneath it the drawdown that is the same points restated.
 *
 * Two charts rather than one two-grid option, which is also how the hi-fi
 * draws them. The first attempt passed an array of axes through the shared
 * `baseOption`, whose merge expects one axis object; ECharts was handed an
 * object with numeric keys and drew nothing at all — a 268px hole the unit
 * lane could not see, because jsdom never initialises a chart.
 *
 * Both panes read one response. The drawdown is not a second measurement and
 * does not cost a second request.
 */
function EquityChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as EquityPoint[];
  const labels = useMemo(
    () => points.map((point) => new Date(point.at_utc_ms).toISOString().slice(0, 10)),
    [points],
  );

  /*
   * Colours come from the chart theme, never from ECharts' defaults: its
   * palette put a blue equity line and a highlighter-green drawdown on a paper
   * surface the first time this was drawn.
   */
  const equityOption = useMemo(() => {
    const role = roleColorsNow();
    return baseOption({
      ...noChartApparatus(),
      grid: { left: 64, right: 20, top: 16, bottom: 30 },
      xAxis: { type: "category", data: labels, axisLabel: { fontSize: 9 } },
      yAxis: { type: "value", scale: true, axisLabel: { fontSize: 9 } },
      tooltip: {
        trigger: "axis",
        /* The tooltip prints the exact string the server sent, not the number
           ECharts plotted with. */
        formatter: (params: unknown) => {
          const rows = params as { dataIndex: number }[];
          const point = points[rows[0]?.dataIndex ?? 0];
          return point ? `${new Date(point.at_utc_ms).toISOString()}<br/>equity ${point.equity}` : "";
        },
      },
      series: [
        {
          type: "line",
          name: "OOS equity",
          showSymbol: false,
          data: points.map((point) => Number(point.equity)),
          lineStyle: { width: 1.4, color: role.oos },
          itemStyle: { color: role.oos },
        },
      ],
    });
  }, [labels, points]);

  const drawdownOption = useMemo(() => {
    /* The same role colour as the line above it. `--bad` is the surface's word
       for a refusal; a drawdown is not one, and painting it red would make an
       ordinary trough read as a failure. */
    const tone = roleColorsNow().oos;
    return baseOption({
      ...noChartApparatus(),
      grid: { left: 64, right: 20, top: 12, bottom: 28 },
      xAxis: { type: "category", data: labels, axisLabel: { fontSize: 9 } },
      yAxis: { type: "value", axisLabel: { fontSize: 9 } },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const rows = params as { dataIndex: number }[];
          const point = points[rows[0]?.dataIndex ?? 0];
          return point
            ? `${new Date(point.at_utc_ms).toISOString()}<br/>drawdown ${point.drawdown_fraction}`
            : "";
        },
      },
      series: [
        {
          type: "line",
          name: "drawdown",
          showSymbol: false,
          areaStyle: { color: withSoftAlpha(tone) },
          data: points.map((point) => Number(point.drawdown_fraction)),
          lineStyle: { width: 1, color: tone },
          itemStyle: { color: tone },
        },
      ],
    });
  }, [labels, points]);

  return (
    <div className="flex flex-col gap-2" data-chart="equity">
      <EChart option={equityOption} height={210} />
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        underwater — drawdown restated from the same points
      </span>
      <EChart option={drawdownOption} height={130} />
      {/*
        * The chart is a picture; the table under it is the evidence. A screen
        * reader and a reader who wants the exact number both get the server's
        * own strings.
        */}
      <table className="sr-only" data-chart-table="equity">
        <caption>OOS equity and drawdown, exact values</caption>
        <tbody>
          {points.map((point) => (
            <tr key={point.at_utc_ms}>
              <th scope="row">{new Date(point.at_utc_ms).toISOString()}</th>
              <td>{point.equity}</td>
              <td>{point.drawdown_fraction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MonthlyHeat({ series }: { series: EvidenceSeries }) {
  const points = series.values as MonthlyReturnPoint[];
  return (
    <div className="flex flex-wrap gap-1" data-chart="monthly">
      {points.map((point) => {
        const value = Number(point.return_fraction);
        const positive = value >= 0;
        const month = new Date(point.month_start_utc_ms).toISOString().slice(0, 7);
        return (
          <div
            key={point.month_start_utc_ms}
            className="flex min-w-[58px] flex-col items-center gap-px rounded-[3px] border px-1.5 py-1"
            data-month={month}
            title={`${month} · ${point.return_fraction}`}
            style={{
              borderColor: "var(--line)",
              background: positive ? "var(--viz-train)" : "var(--bad-bg-soft)",
            }}
          >
            <span className="mono text-[10px] font-semibold" data-month-value>
              {point.return_fraction}
            </span>
            <span className="mono text-[8.5px]" style={{ color: "var(--ink-soft)" }}>
              {month}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RollingChart({ series }: { series: EvidenceSeries }) {
  const points = series.values as RollingReturnPoint[];
  const option = useMemo(() => {
    const { accent } = paletteNow();
    return baseOption({
      ...noChartApparatus(),
      grid: { left: 58, right: 18, top: 16, bottom: 30 },
      xAxis: {
        type: "category",
        data: points.map((p) => new Date(p.at_utc_ms).toISOString().slice(0, 10)),
        axisLabel: { fontSize: 9 },
      },
      yAxis: { type: "value", scale: true, axisLabel: { fontSize: 9 } },
      tooltip: {
        trigger: "axis",
        formatter: (params: unknown) => {
          const rows = params as { dataIndex: number }[];
          const point = points[rows[0]?.dataIndex ?? 0];
          return point ? `${new Date(point.at_utc_ms).toISOString()}<br/>${point.return_fraction}` : "";
        },
      },
      series: [
        {
          type: "line",
          showSymbol: false,
          data: points.map((p) => Number(p.return_fraction)),
          lineStyle: { width: 1.2, color: accent },
          itemStyle: { color: accent },
        },
      ],
    });
  }, [points]);
  return (
    <div data-chart="rolling">
      <EChart option={option} height={170} />
      <table className="sr-only" data-chart-table="rolling">
        <tbody>
          {points.map((point) => (
            <tr key={point.at_utc_ms}>
              <th scope="row">{new Date(point.at_utc_ms).toISOString()}</th>
              <td>{point.return_fraction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DistributionChart({ series }: { series: EvidenceSeries }) {
  const buckets = series.values as (DistributionBucket | CorrectedDistributionBucket)[];
  /* Two bucket shapes exist in the contract; the corrected one states whether
     its upper edge is inclusive. The label says which, rather than guessing. */
  const label = (bucket: DistributionBucket | CorrectedDistributionBucket): string => {
    const upper = "upper_exclusive" in bucket ? bucket.upper_exclusive : bucket.upper;
    const closing = "upper_inclusive" in bucket && bucket.upper_inclusive === "true" ? "]" : ")";
    return `[${bucket.lower_inclusive}, ${upper}${closing}`;
  };
  const option = useMemo(
    () =>
      baseOption({
        ...noChartApparatus(),
        grid: { left: 50, right: 18, top: 16, bottom: 46 },
        xAxis: { type: "category", data: buckets.map(label), axisLabel: { fontSize: 8, rotate: 40 } },
        yAxis: { type: "value", axisLabel: { fontSize: 9 } },
        tooltip: { trigger: "item" },
        series: [
          {
            type: "bar",
            data: buckets.map((b) => Number(b.count)),
            itemStyle: { color: vizTokensFor().train },
          },
        ],
      }),
    [buckets],
  );
  return (
    <div data-chart="distribution">
      <EChart option={option} height={180} />
      <table className="sr-only" data-chart-table="distribution">
        <tbody>
          {buckets.map((bucket) => (
            <tr key={label(bucket)}>
              <th scope="row">{label(bucket)}</th>
              <td>{bucket.count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* -------------------------------------------------------- retained passport */

function PassportPanel({ slot, onNeeded }: { slot: PassportSlot; onNeeded: () => void }) {
  useEffect(() => {
    onNeeded();
  }, [onNeeded]);

  return (
    <section
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      data-passport={slot.state}
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        retained source passport
      </h3>

      {slot.state === "ready" ? (
        <RetainedPassport evidence={slot.evidence} />
      ) : slot.state === "refused" ? (
        <div className="flex flex-col gap-1" data-passport-refusal>
          <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
            {slot.refusal.message}
          </p>
          <p className="text-[10.5px] leading-[1.5]" style={{ color: "var(--ink-faint)" }}>
            The retained-source lane admits one Advanced-WFO profile and does not admit any other,
            rather than answering with something else.
          </p>
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
  const rows: [string, string][] = [
    ["initial equity", passport.initial_equity],
    ["final equity", passport.final_equity],
    ["net return", passport.net_return_fraction],
    ["max drawdown", passport.max_drawdown_fraction],
    ["retained positions", String(passport.retained_position_count)],
    ["observations", String(passport.artifact_table_rows.observations)],
    ["folds", String(passport.artifact_table_rows.folds)],
    ["trials", String(passport.artifact_table_rows.trials)],
    ["candidates", String(passport.artifact_table_rows.candidates)],
  ];
  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Chip data-profile={provenance.profile_id}>{provenance.profile_id}</Chip>
        <Chip data-source-adapter={provenance.source_adapter_id}>{provenance.source_adapter_id}</Chip>
        <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
          retained {new Date(provenance.retained_at_utc_ms).toISOString()}
        </span>
      </div>
      <dl className="flex flex-wrap gap-x-5 gap-y-1.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex flex-col" data-passport-row={label}>
            <dt className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
              {label}
            </dt>
            <dd className="mono text-[12px] font-semibold">{value}</dd>
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

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-window-disclosure>
        {WINDOW_DISCLOSURE}
      </p>

      <div className="flex flex-wrap gap-2.5" data-metrics>
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
        title="Equity — stitched OOS, with its own drawdown beneath"
        link={linkFor("EQUITY_OOS")}
        slot={series.get("EQUITY_OOS")}
        onNeeded={ensureSeries}
      >
        {(loaded) => <EquityChart series={loaded} />}
      </SeriesPanel>

      <div className="flex flex-col gap-3 lg:flex-row">
        <div className="flex-1">
          <SeriesPanel
            kind="ROLLING_RETURNS_20"
            title="Rolling 20 returns"
            link={linkFor("ROLLING_RETURNS_20")}
            slot={series.get("ROLLING_RETURNS_20")}
            onNeeded={ensureSeries}
          >
            {(loaded) => <RollingChart series={loaded} />}
          </SeriesPanel>
        </div>
        <div className="flex-1">
          <SeriesPanel
            kind="RETURN_DISTRIBUTION"
            title="Return distribution"
            link={linkFor("RETURN_DISTRIBUTION")}
            slot={series.get("RETURN_DISTRIBUTION")}
            onNeeded={ensureSeries}
          >
            {(loaded) => <DistributionChart series={loaded} />}
          </SeriesPanel>
        </div>
      </div>

      <SeriesPanel
        kind="MONTHLY_RETURNS"
        title="Monthly returns"
        link={linkFor("MONTHLY_RETURNS")}
        slot={series.get("MONTHLY_RETURNS")}
        onNeeded={ensureSeries}
      >
        {(loaded) => <MonthlyHeat series={loaded} />}
      </SeriesPanel>

      <p className="text-[10.5px]" style={{ color: "var(--ink-faint)" }} data-sampling-note>
        {SAMPLING_NOTE} Every series is capped at {SERIES_POINT_CAP} points by the contract.
      </p>

      <PassportPanel slot={passport} onNeeded={ensurePassport} />

      <SourceGap
        id="per-fold-verdict"
        title="per-fold verdict — which fold carries the run, which fold drags it"
        reason="the Evidence contract publishes run-final metrics and four named series; it publishes no per-fold metric, verdict or threshold rule. A verdict drawn here would be this screen's opinion, not the engine's."
      />

      <SourceGap
        id="behavior-tiles"
        title="behaviour — win rate · payoff · avg hold · turnover · exposure · beta"
        reason="no behaviour analytic is published for this run. These tiles stay empty rather than being computed from the equity series, which would make the chart the source of a number the engine never issued."
      />
    </div>
  );
}

function StagePreviewTab({
  stage,
  cursor,
  hub,
  runId,
}: {
  stage: EvidenceStage;
  cursor: EvidenceCursor;
  hub: EvidenceHub;
  runId: string;
}) {
  const dive = DEEP_DIVE[stage];
  const key = { split: "S1", search: "S2", freeze: "S3", execute: "S4" }[stage as "split" | "search" | "freeze" | "execute"];
  const row = hub.stages.find((entry) => entry.key === key);

  return (
    <div className="flex flex-col gap-3">
      <section
        className="flex flex-wrap items-baseline gap-3 rounded-[8px] border px-4 py-3"
        data-stage-row={key}
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      >
        <span className="mono text-[11px] font-bold">{key}</span>
        {row ? (
          <>
            <Chip data-stage-state={row.state}>{row.state.toLowerCase()}</Chip>
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              started{" "}
              {row.started_at_utc_ms === null ? "not published" : new Date(row.started_at_utc_ms).toISOString()}
            </span>
            <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }}>
              completed{" "}
              {row.completed_at_utc_ms === null
                ? "not published"
                : new Date(row.completed_at_utc_ms).toISOString()}
            </span>
          </>
        ) : (
          <Withheld availability={{ state: "NOT_PUBLISHED", reason_code: null }} what="stage" />
        )}
      </section>

      <SourceGap
        id={`stage-summary-${stage}`}
        title={`${STAGE_LABEL[stage]} — summary panels`}
        reason={`the Evidence contract publishes this stage's timeline, not its content. Fold boundaries, the search surface, the digest chain and the route contract are each a separate named read this screen does not perform.`}
      />

      {dive && dive.path !== null ? (
        <Link
          to={deepDiveHref(`/research/quantbt/runs/${encodeURIComponent(runId)}/${dive.path}`, cursor)}
          data-deep-dive={stage}
          className="mono self-start rounded-[6px] border px-3 py-1 text-[10px] uppercase"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
        >
          open deep dive → {dive.screen}
        </Link>
      ) : dive ? (
        <span
          data-deep-dive={stage}
          title={`Screen ${dive.screen} has no published route yet, so this link would go nowhere.`}
          className="mono self-start rounded-[6px] border px-3 py-1 text-[10px] uppercase"
          style={{ color: "var(--ink-faint)", borderColor: "var(--line)", opacity: 0.55, cursor: "not-allowed" }}
        >
          open deep dive → {dive.screen}
        </span>
      ) : null}

      {/* The cursor this tab would hand on, shown so the reader can see it is
          carried rather than reset. */}
      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-carried-cursor>
        would carry {deepDiveHref("", cursor)}
      </span>
    </div>
  );
}

function ClaimTab({ hub }: { hub: EvidenceHub }) {
  const certificate = hub.claim.methodology_certificate;
  return (
    <div className="flex flex-col gap-3">
      <section
        className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
        data-claim-panel={hub.claim.state}
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      >
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          stage 5 claim
        </h3>
        {hub.claim.text !== null ? (
          <blockquote
            className="mono border-l-2 pl-2.5 text-[11px]"
            data-claim-quote={hub.claim.state}
            style={{ borderColor: "var(--role-holdout)", color: "var(--role-holdout)" }}
          >
            {hub.claim.text}
          </blockquote>
        ) : (
          <Withheld availability={hub.claim.availability} what="claim" />
        )}

        <div className="flex flex-wrap items-center gap-2">
          <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            methodology certificate
          </span>
          {certificate.state === "ISSUED" && certificate.grade !== null ? (
            <>
              <Chip data-cert-grade={certificate.grade} tone="var(--role-holdout)" border="var(--role-holdout)">
                {certificate.grade}
              </Chip>
              <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-cert-issued>
                issued{" "}
                {certificate.issued_at_utc_ms === null
                  ? "not published"
                  : new Date(certificate.issued_at_utc_ms).toISOString()}
              </span>
            </>
          ) : (
            <Withheld
              availability={{
                state: certificate.state === "NOT_ISSUED" ? "NOT_APPLICABLE" : "NOT_PUBLISHED",
                reason_code: certificate.reason_code,
              }}
            />
          )}
        </div>
      </section>

      <SourceGap
        id="cert-chain"
        title="certificate chain — the cap each stage set"
        reason={`the Hub publishes the certificate the engine issued, not the per-stage caps behind it. The chain is the engine's arithmetic — "${CERT_TOOLTIP}" — and this screen renders a grade rather than recomputing one from caps it cannot see.`}
      />

      <SourceGap
        id="artifact-manifest"
        title="artifact manifest"
        reason="no artifact state is published on this screen. A manifest row here would describe files the Evidence contract deliberately never opens."
      />

      <section
        className="flex flex-col gap-1.5 rounded-[8px] border px-4 py-3"
        data-absences
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
      >
        <h3 className="mono text-[10px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          declared source absences
        </h3>
        {Object.keys(hub.source_absences).length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            The Hub declares no absence for this run.
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {Object.entries(hub.source_absences).map(([name, availability]) => (
              <li key={name} className="flex flex-wrap items-baseline gap-2" data-absence={name}>
                <span className="mono text-[10px]">{name.replace(/_/g, " ")}</span>
                <Withheld availability={availability} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function AtlasTab() {
  return (
    <div className="flex flex-col gap-3">
      <SourceGap
        id="atlas-preview"
        title="engine atlas preview"
        reason="the mode × route atlas is published by the Research foundation contract, which this screen does not read. Rather than a preview assembled from nothing, the Atlas itself is one click away and is the same source Screen 12 renders."
      >
        <Link
          to="/research/quantbt/atlas"
          className="mono self-start rounded-[6px] border px-3 py-1 text-[10px] uppercase"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          data-action="open-atlas"
        >
          full atlas →
        </Link>
      </SourceGap>
    </div>
  );
}

/* ---------------------------------------------------------------- screen */

export interface EvidenceFlowProps {
  runId: string;
  hub: EvidenceHub | null;
  state: ResearchState;
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

  return (
    <div className="flex flex-col gap-3" data-screen="evidence-flow" data-run={runId}>
      {hub ? <ClaimStrip hub={hub} onJump={onStage} /> : null}

      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-light" style={{ fontFamily: "var(--font-display)" }}>
          Evidence flow
        </h1>
        <p className="text-[13.5px] italic" style={{ color: "var(--ink-mute)" }}>
          One run, one cursor. Every tab answers from the same sealed projection — nothing here is
          recomputed, and nothing absent is filled in.
        </p>
      </div>

      {hub ? <RunHeader hub={hub} cursor={cursor} onOpenDrawer={() => setDrawer(true)} /> : null}
      {hub && drawer ? <DatasetDrawer hub={hub} onClose={() => setDrawer(false)} /> : null}

      {hub && hub.readiness === "NOT_READY" ? (
        <section
          className="flex flex-wrap items-center gap-3 rounded-[8px] border px-4 py-3"
          data-not-ready
          style={{ borderColor: "var(--role-holdout)", background: "var(--paper-sunken)" }}
        >
          <p className="text-[11px]" style={{ color: "var(--ink-soft)" }}>
            This run has not sealed its evidence yet. The hub shows what the projection holds; the run's
            live state lives on its progress screen.
          </p>
          <Link
            to={`/research/quantbt/runs/${encodeURIComponent(runId)}/progress`}
            className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase"
            style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
            data-action="watch-progress"
          >
            watch progress →
          </Link>
        </section>
      ) : null}

      {hub ? <StageTabs cursor={cursor} hub={hub} onStage={onStage} /> : null}
      <CursorBar
        cursor={cursor}
        folds={hub?.core.fold_navigation}
        onFold={onFold}
        onReset={onResetCursor}
      />

      <ResearchPanel
        title={STAGE_LABEL[cursor.stage]}
        meta={hub?.revision ? `revision ${hub.revision}` : undefined}
        state={state}
        minBodyHeight={260}
        actions={
          state.mayRetry && state.state !== "available" ? (
            <button
              type="button"
              className="btn-ghost mono text-[10px]"
              data-action="reread"
              onClick={onReread}
            >
              reread hub
            </button>
          ) : undefined
        }
      >
        {hub ? (
          <div
            role="tabpanel"
            id={`ef-panel-${cursor.stage}`}
            aria-labelledby={`ef-tab-${cursor.stage}`}
            data-panel={cursor.stage}
          >
            {cursor.stage === "summary" ? (
              <SummaryTab
                hub={hub}
                series={series}
                ensureSeries={ensureSeries}
                passport={passport}
                ensurePassport={ensurePassport}
              />
            ) : cursor.stage === "claim" ? (
              <ClaimTab hub={hub} />
            ) : cursor.stage === "atlas" ? (
              <AtlasTab />
            ) : (
              <StagePreviewTab stage={cursor.stage} cursor={cursor} hub={hub} runId={runId} />
            )}
          </div>
        ) : null}
      </ResearchPanel>
    </div>
  );
}
