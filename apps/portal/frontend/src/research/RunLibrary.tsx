/**
 * Screen 01 · Run Library (P12 composition scope).
 *
 * Spec 01's founding rule: **the library renders evidence, it does not rank.**
 * Every certificate, claim and metric arrives from its own run's Stage 5 with
 * an availability beside it, and the screen shows exactly what was published.
 *
 * Three habits, each with a rule behind it:
 *
 *  - **An unavailable fact keeps its place and states its reason.** A
 *    `NOT_PUBLISHED` metric is not `0`, a `LEGACY_METADATA_ONLY` row is not
 *    current engine evidence, and `rc: null` reserves no chip at all.
 *  - **The server owns comparability.** Two runs compare only when their
 *    `comparison.key` values are present and identical; the refusal copy is
 *    verbatim, and the button refuses rather than producing a side-by-side
 *    that would be a lie.
 *  - **Every card is selectable.** Validity is decided at the compare bar, so
 *    a reader may try a pairing and be told why it does not work (§3.3).
 */

import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";

import {
  COMPARE_PICK_ONE_MORE,
  COMPARE_REFUSAL,
  type Availability,
  type MetricCell,
  type RunLibraryItem,
  type RunLibraryResponse,
  type StageCell,
  isAvailable,
  mayCompare,
  unavailableReason,
} from "./runLibraryClient";
import { lineageHref } from "./LineageDetail";
import { ResearchPanel } from "./ResearchPanel";
import type { LibraryFilters } from "./useRunLibrary";
import type { ResearchState } from "./state";

/* --------------------------------------------------------------- verbatim */

export const SUBTITLE =
  "Every card carries its own evidence — the trail, the claim, the certificate. The library renders them; it ranks nothing.";

export const RULES_FOOTER =
  "A card shows what its own run published: the trail it walked, the claim Stage 5 issued or withheld, and the certificate that claim earned. Nothing here is scored against anything else.";

export const CLAIM_PENDING = "claim pending — engine issues it at Stage 5, never before";

export const LEGACY_NOTE =
  "legacy 1.0.8 metadata — retained for lineage, not current engine evidence.";

const STAGE_KEYS: readonly StageCell["key"][] = ["S1", "S2", "S3", "S4", "S5"];

const STAGE_TONE: Record<StageCell["state"], { border: string; background: string; ink: string }> = {
  done: { border: "var(--accent)", background: "var(--accent-soft)", ink: "var(--accent)" },
  cap: { border: "var(--role-holdout)", background: "var(--paper)", ink: "var(--role-holdout)" },
  blocked: { border: "var(--bad)", background: "var(--bad-bg-soft)", ink: "var(--bad)" },
  run: { border: "var(--good)", background: "var(--paper-raised)", ink: "var(--good)" },
  pend: { border: "var(--line)", background: "var(--paper-raised)", ink: "var(--line-strong)" },
};

const CERT_TONE: Record<string, string> = {
  A: "var(--good)",
  B: "var(--role-holdout)",
  C: "var(--role-holdout)",
  D: "var(--bad)",
};

/* ------------------------------------------------------------------ parts */

/**
 * A fact the server withheld. Never `0`, `—` or a plausible default.
 *
 * Each withheld state gets its own words. They are not synonyms: a row whose
 * alpha binding was never recorded by the 1.0.8 engine is a different fact
 * from one the current engine has not published yet, and a claim waiting on a
 * source callback is a third. `what` names the field, because a header that
 * withholds two facts otherwise reads as the same phrase twice.
 */
const WITHHELD_WORDS: Record<Availability["state"], string> = {
  AVAILABLE: "available",
  NOT_PUBLISHED: "not published",
  LEGACY_METADATA_ONLY: "legacy metadata",
  PENDING_SOURCE_CALLBACK: "pending source",
};

function Withheld({ availability, what }: { availability: Availability; what?: string }) {
  return (
    <span
      className="mono text-[10px] italic leading-[16px]"
      style={{ color: "var(--ink-faint)" }}
      data-withheld={availability.state}
      title={unavailableReason(availability)}
    >
      {what ? `${what} — ` : ""}
      {WITHHELD_WORDS[availability.state]}
    </span>
  );
}

function Chip({
  children,
  tone = "var(--ink-soft)",
  border = "var(--line)",
  dashed,
  ...rest
}: {
  children: React.ReactNode;
  tone?: string;
  border?: string;
  dashed?: boolean;
} & Record<string, unknown>) {
  return (
    <span
      className="mono rounded-[3px] border px-[5px] text-[10px] leading-[16px]"
      style={{
        color: tone,
        borderColor: border,
        borderStyle: dashed ? "dashed" : "solid",
        background: "var(--paper-raised)",
      }}
      {...rest}
    >
      {children}
    </span>
  );
}

function StatusPill({ status }: { status: RunLibraryItem["status"] }) {
  const tone =
    status === "COMPLETED"
      ? "var(--good)"
      : status === "FAILED"
        ? "var(--bad)"
        : status === "RUNNING"
          ? "var(--accent)"
          : "var(--ink-faint)";
  return (
    <span
      className="mono inline-flex items-center gap-[4px] rounded-full border px-[6px] text-[8.5px] font-bold uppercase leading-[15px]"
      data-status={status}
      style={{ color: tone, borderColor: tone }}
    >
      {/* The dot beats only while the run does. Spec 01 §3.4 gives it to
          RUNNING alone, so a still pill is itself a fact. `motion-safe`
          leaves it steady for a reader who asked for no motion. */}
      {status === "RUNNING" ? (
        <span
          data-pulse
          className="motion-safe:animate-pulse inline-block h-[5px] w-[5px] rounded-full"
          style={{ background: tone }}
        />
      ) : null}
      {status}
    </span>
  );
}

/**
 * The evidence trail.
 *
 * Each cell's tooltip is the source's own sentence, and its provenance is
 * explicit: `SOURCE_VERBATIM` may be shown as written, while
 * `DERIVED_FROM_PERSISTED_STATE` is labelled as derived so it cannot be read
 * as a methodology narrative the source never told.
 */
function EvidenceTrail({ stages }: { stages: readonly StageCell[] }) {
  const byKey = new Map(stages.map((stage) => [stage.key, stage]));
  return (
    <div className="flex flex-col gap-1" data-trail>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        evidence trail
      </span>
      <div className="flex gap-1">
        {STAGE_KEYS.map((key) => {
          const stage = byKey.get(key);
          const tone = stage ? STAGE_TONE[stage.state] : STAGE_TONE.pend;
          const provenance = stage?.tooltip_source ?? "NOT_PUBLISHED";
          const title =
            provenance === "SOURCE_VERBATIM" && stage?.tip
              ? stage.tip
              : provenance === "DERIVED_FROM_PERSISTED_STATE" && stage?.tip
                ? `derived from persisted state — ${stage.tip}`
                : "no stage narrative was published";
          return (
            <span
              key={key}
              data-stage-cell={key}
              data-stage-state={stage?.state ?? "pend"}
              data-tooltip-source={provenance}
              title={title}
              className="mono inline-flex h-[18px] w-[26px] items-center justify-center rounded-[3px] border text-[9px]"
              style={{ color: tone.ink, borderColor: tone.border, background: tone.background }}
            >
              {key}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The lazy sparkline.
 *
 * The placeholder is the resting state, not a loading artefact: a series the
 * server has not published never becomes a line, and no artifact or Parquet
 * path is ever fetched to produce one.
 */
function Sparkline({
  item,
  values,
  onVisible,
}: {
  item: RunLibraryItem;
  values: readonly string[] | undefined;
  onVisible: (runId: string, visible: boolean) => void;
}) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      onVisible(item.run_id, true);
      return () => onVisible(item.run_id, false);
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) onVisible(item.run_id, entry.isIntersecting);
      },
      { rootMargin: "80px" },
    );
    observer.observe(node);
    /* Disconnecting also un-marks the card: a scrolled-away RUNNING row must
       drop out of the poll, not keep costing a request. */
    return () => {
      observer.disconnect();
      onVisible(item.run_id, false);
    };
  }, [item.run_id, onVisible]);

  const kind = item.sparkline.kind;
  const label =
    kind === "oos_equity"
      ? "OOS equity"
      : kind === "search_progress"
        ? "search progress"
        : kind === "failed"
          ? "run failed"
          : null;

  const available = isAvailable(item.sparkline.availability) && values && values.length > 0;
  const peak = available ? Math.max(...values.map((v) => Math.abs(Number(v) || 0)), 1) : 1;

  return (
    <div className="flex flex-col gap-1" data-sparkline={item.run_id} ref={box}>
      <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
        {label ?? "series"}
      </span>
      {available ? (
        <span className="flex h-[26px] w-[150px] items-end gap-[1px]" data-sparkline-values={values.length}>
          {values.slice(0, 24).map((value, index) => (
            <span
              key={index}
              className="flex-1 rounded-[1px]"
              style={{
                height: `${Math.max(6, (Math.abs(Number(value) || 0) / peak) * 100)}%`,
                background:
                  index === values.length - 1 ? "var(--role-oos)" : "var(--viz-train)",
              }}
            />
          ))}
        </span>
      ) : (
        /*
         * The placeholder keeps the series' footprint, so a card with no
         * series is the same height as one with a series — but it says which
         * kind of nothing it is rather than being an empty grey box a reader
         * would read as "still loading".
         */
        <span
          className="mono flex h-[26px] w-[150px] items-center justify-center rounded-[2px] text-[9px] italic"
          data-sparkline-placeholder={item.sparkline.availability.state}
          title={unavailableReason(item.sparkline.availability)}
          style={{ background: "var(--paper-sunken)", color: "var(--ink-faint)" }}
        >
          {item.sparkline.availability.state === "AVAILABLE"
            ? "reads when visible"
            : WITHHELD_WORDS[item.sparkline.availability.state]}
        </span>
      )}
    </div>
  );
}

function Stats({ stats }: { stats: readonly MetricCell[] }) {
  return (
    <div className="flex flex-wrap gap-4" data-stats>
      {stats.map((metric) => (
        <span key={metric.key} className="flex flex-col gap-[2px]" data-metric={metric.role}>
          <span className="mono text-[9px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
            {metric.label}
          </span>
          <span
            className="mono text-[13px] font-semibold"
            style={{
              color:
                metric.tone === "BAD"
                  ? "var(--bad)"
                  : metric.tone === "ACCENT"
                    ? "var(--accent)"
                    : "var(--ink)",
            }}
          >
            {/* The value is the server's exact string; a withheld one keeps
                its slot and says so rather than becoming a zero. */}
            {isAvailable(metric.availability) && metric.value !== null ? (
              metric.value
            ) : (
              <Withheld availability={metric.availability} />
            )}
          </span>
        </span>
      ))}
    </div>
  );
}

function RunCard({
  item,
  selected,
  onToggle,
  sparkline,
  onVisible,
}: {
  item: RunLibraryItem;
  selected: boolean;
  onToggle: (runId: string) => void;
  sparkline: readonly string[] | undefined;
  onVisible: (runId: string, visible: boolean) => void;
}) {
  const legacy = item.source_kind === "LEGACY_1_0_8_METADATA";
  const running = item.status === "RUNNING";

  return (
    <article
      data-run={item.run_id}
      data-source-kind={item.source_kind}
      data-row-kind={item.row_kind}
      className="flex flex-col gap-2 rounded-[8px] border px-4 py-3"
      style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
    >
      <header
        className="flex flex-wrap items-baseline gap-2 border-b pb-2"
        style={{ borderColor: "var(--line-soft)" }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.run_id)}
          aria-label={`Select ${item.run_id} for comparison`}
          data-compare-check={item.run_id}
        />
        <span className="mono text-[13px] font-bold">{item.run_id}</span>
        <StatusPill status={item.status} />

        {isAvailable(item.mode.availability) && item.mode.display !== null ? (
          <Chip data-mode={item.mode.key ?? ""}>{item.mode.display}</Chip>
        ) : (
          <Withheld availability={item.mode.availability} what="mode" />
        )}

        {item.binding ? (
          <Chip
            data-binding={item.binding.alpha_version_id}
            title={`${item.binding.alpha_name} · ${item.binding.av} · ${item.binding.digest}`}
          >
            {item.binding.alpha_name} · {item.binding.av}
          </Chip>
        ) : isAvailable(item.binding_availability) ? (
          <Chip data-binding="scratch" tone="var(--role-holdout)" border="var(--role-holdout)" dashed>
            scratch
          </Chip>
        ) : (
          <Withheld availability={item.binding_availability} what="binding" />
        )}

        {isAvailable(item.instrument.availability) && item.instrument.display !== null ? (
          <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-instrument>
            {item.instrument.display}
          </span>
        ) : null}

        {/* `rc` is pinned null by the contract: no chip, and no space kept for
            one. Reserving a slot for a fact that cannot exist is a promise. */}

        {isAvailable(item.certificate.availability) && item.certificate.grade !== null ? (
          <Chip
            data-certificate={item.certificate.grade}
            tone={CERT_TONE[item.certificate.grade]}
            border={CERT_TONE[item.certificate.grade]}
          >
            {item.certificate.grade}
          </Chip>
        ) : null}

        <span className="mono ml-auto text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-created>
          {new Date(item.created_at_utc_ms).toISOString().slice(0, 16).replace("T", " ")}Z
        </span>

        {running ? (
          <Link
            to={`/research/quantbt/runs/${encodeURIComponent(item.run_id)}/progress`}
            className="mono text-[10px] uppercase"
            style={{ color: "var(--accent)" }}
            data-open={item.run_id}
          >
            watch progress →
          </Link>
        ) : (
          /*
           * Spec 01 §2.5 row 10 sends a settled run to Screen 04. That screen
           * has no route yet, so the affordance is shown refused rather than
           * pointed at a URL that would 404 — the reader learns the evidence
           * view exists and is not open yet, which is the true state.
           */
          /* P13 opened Screen 04, so this is a link again. */
          <Link
            to={`/research/quantbt/runs/${encodeURIComponent(item.run_id)}/evidence`}
            className="mono text-[10px] uppercase"
            style={{ color: "var(--accent)" }}
            data-open-evidence={item.run_id}
          >
            open evidence →
          </Link>
        )}
      </header>

      {legacy ? (
        <p className="text-[10.5px]" style={{ color: "var(--role-holdout)" }} data-legacy-note>
          {LEGACY_NOTE}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start gap-5">
        <EvidenceTrail stages={item.stages} />
        <Sparkline item={item} values={sparkline} onVisible={onVisible} />
        <Stats stats={item.stats} />
        <blockquote
          className="mono max-w-[300px] border-l-2 pl-2 text-[9.5px] leading-[1.5]"
          style={{ borderColor: "var(--role-holdout)", color: "var(--role-holdout)" }}
          data-claim={item.run_id}
        >
          {/* Never truncated: a claim that is cut is a claim that is changed. */}
          {isAvailable(item.claim.availability) && item.claim.text !== null ? (
            item.claim.text
          ) : running ? (
            CLAIM_PENDING
          ) : (
            <Withheld availability={item.claim.availability} />
          )}
        </blockquote>
      </div>

      {item.superseded_note !== null ? (
        <p
          className="border-t border-dashed pt-1.5 text-[10px]"
          style={{ borderColor: "var(--line)", color: "var(--ink-faint)", opacity: 0.7 }}
          data-superseded
        >
          <span className="mono mr-1.5 font-bold">superseded</span>
          {item.superseded_note}
        </p>
      ) : null}
    </article>
  );
}

/* --------------------------------------------------------------- compare */

function CompareBar({
  selected,
  items,
  onClear,
}: {
  selected: readonly string[];
  items: readonly RunLibraryItem[];
  onClear: () => void;
}) {
  if (selected.length === 0) return null;
  const [a, b] = selected.map((id) => items.find((item) => item.run_id === id));
  const comparable = mayCompare(a, b);
  const both = selected.length === 2;

  return (
    <div
      className="flex flex-wrap items-center gap-2.5 rounded-[6px] border px-3 py-2"
      data-compare-bar={both ? (comparable ? "ready" : "refused") : "pending"}
      style={{
        borderColor: both ? (comparable ? "var(--accent)" : "var(--bad)") : "var(--line)",
        background: both ? (comparable ? "var(--accent-soft)" : "var(--bad-bg-soft)") : "var(--paper-raised)",
      }}
    >
      <span className="mono text-[10px]">{selected.join(" · ")}</span>
      {!both ? (
        <span className="text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
          {COMPARE_PICK_ONE_MORE}
        </span>
      ) : comparable ? (
        <Link
          to={`/research/quantbt/compare?runs=${selected.join(",")}`}
          className="btn-ghost mono text-[10px]"
          data-action="open-compare"
        >
          open compare →
        </Link>
      ) : (
        <>
          <button
            type="button"
            className="btn-ghost mono text-[10px]"
            data-action="open-compare"
            disabled
            style={{ opacity: 0.4, cursor: "not-allowed" }}
            title={COMPARE_REFUSAL}
          >
            open compare →
          </button>
          <span className="text-[10.5px]" style={{ color: "var(--bad)" }} data-compare-refusal>
            {COMPARE_REFUSAL}
          </span>
        </>
      )}
      <button type="button" className="btn-ghost mono ml-auto text-[10px]" data-action="clear" onClick={onClear}>
        clear
      </button>
    </div>
  );
}

/* ------------------------------------------------------------- grouping */

interface RunGroup {
  key: string;
  title: string;
  sub: string;
  rows: readonly RunLibraryItem[];
  /** The bound alpha, when the group has one: its header links to Screen 10. */
  alphaId?: string;
}

/**
 * Groups the loaded page by alpha binding (spec 01 §2.4).
 *
 * Only the page in hand is grouped, and the header says so: with keyset
 * paging the next page may carry more rows of the same alpha, so a count here
 * is a count of what is loaded, never of the library. Ordering inside a group
 * is the order the server sent, so grouping never becomes a re-rank.
 */
export function groupRuns(items: readonly RunLibraryItem[]): RunGroup[] {
  const groups = new Map<string, RunGroup>();
  for (const item of items) {
    const bound = item.binding;
    const scratch = bound === null && isAvailable(item.binding_availability);
    const key = bound ? `a:${bound.alpha_id}:${bound.av}` : scratch ? "zz:scratch" : "zz:withheld";
    const strategy =
      isAvailable(item.strategy_id.availability) && item.strategy_id.value !== null
        ? item.strategy_id.value
        : null;

    const existing = groups.get(key);
    if (existing) {
      (existing.rows as RunLibraryItem[]).push(item);
      continue;
    }
    groups.set(key, {
      key,
      ...(bound ? { alphaId: bound.alpha_id } : {}),
      title: bound ? `${bound.alpha_name} · ${bound.av}` : scratch ? "scratch" : "binding not published",
      sub: bound
        ? strategy === null
          ? "runs below share one immutable code artifact"
          : `strategy ${strategy} · runs below share one immutable code artifact`
        : scratch
          ? "iterate freely · NOT_PUBLISHABLE"
          : `${item.binding_availability.state.toLowerCase().replace(/_/g, " ")} — these rows name no alpha version, so they share nothing that could be called one`,
      rows: [item],
    });
  }
  /* Scratch and unbound rows sort last: they can never support an approval,
     so they do not belong above the rows that can. */
  return [...groups.values()].sort((left, right) => left.key.localeCompare(right.key));
}

/* ----------------------------------------------------------------- screen */

export interface RunLibraryProps {
  filters: LibraryFilters;
  onFilters: (next: LibraryFilters) => void;
  onToggleSel: (runId: string) => void;
  response: RunLibraryResponse | null;
  items: readonly RunLibraryItem[];
  state: ResearchState;
  sparklines: ReadonlyMap<string, readonly string[]>;
  onVisible: (runId: string, visible: boolean) => void;
  onLoadNext: () => void;
  onLoadPrevious: () => void;
}

export function RunLibrary(props: RunLibraryProps) {
  const {
    filters,
    onFilters,
    onToggleSel,
    response,
    items,
    state,
    sparklines,
    onVisible,
    onLoadNext,
    onLoadPrevious,
  } = props;

  const catalog = response?.filter_catalog;

  function toggleIn<T extends string>(list: readonly T[], value: T): T[] {
    return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
  }

  return (
    <div
      data-screen="run-library"
      className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-3.5 px-4 py-4"
      style={{ background: "var(--paper)", color: "var(--ink)" }}
    >
      <header className="flex flex-wrap items-end justify-between gap-2.5">
        <div className="flex flex-col gap-[3px]">
          <h1
            className="text-[22px] font-light tracking-[-.01em]"
            style={{ fontFamily: "Newsreader, Georgia, serif" }}
          >
            Run Library
          </h1>
          <p
            className="text-[13.5px] italic"
            style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
          >
            {SUBTITLE}
          </p>
        </div>
        <Link
          to="/research/quantbt/runs/new"
          className="mono rounded-[6px] border px-3 py-1 text-[10px] uppercase"
          style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
          data-new-run
        >
          new run →
        </Link>
      </header>

      <div
        className="flex flex-wrap items-center gap-2 rounded-[6px] border px-3.5 py-2"
        style={{ borderColor: "var(--line)", background: "var(--paper-raised)" }}
        data-filter-bar
      >
        <input
          value={filters.q}
          onChange={(event) => onFilters({ ...filters, q: event.target.value })}
          placeholder="filter by run id, alpha, symbol…"
          aria-label="Filter runs"
          className="mono w-[230px] rounded-[5px] border px-2 py-1 text-[11px]"
          style={{ borderColor: "var(--line)", background: "var(--paper)" }}
        />

        <span className="mono text-[10px] uppercase" style={{ color: "var(--ink-faint)" }}>
          status
        </span>
        {(["COMPLETED", "RUNNING", "FAILED"] as const).map((status) => (
          <button
            key={status}
            type="button"
            data-filter-status={status}
            data-selected={filters.status.includes(status)}
            onClick={() => onFilters({ ...filters, status: toggleIn(filters.status, status) })}
            className="mono rounded-full border px-2.5 py-px text-[10px]"
            style={{
              borderColor: filters.status.includes(status) ? "var(--accent)" : "var(--line)",
              background: filters.status.includes(status) ? "var(--accent-soft)" : "var(--paper-raised)",
              color: filters.status.includes(status) ? "var(--accent)" : "var(--ink-soft)",
            }}
          >
            {status.toLowerCase()}
          </button>
        ))}

        {catalog && catalog.modes.length > 0 ? (
          <>
            <span className="mono text-[10px] uppercase" style={{ color: "var(--ink-faint)" }}>
              mode
            </span>
            {catalog.modes.map((mode) => (
              <button
                key={mode.key}
                type="button"
                data-filter-mode={mode.key}
                data-selected={filters.mode.includes(mode.key)}
                onClick={() => onFilters({ ...filters, mode: toggleIn(filters.mode, mode.key) })}
                className="mono rounded-full border px-2.5 py-px text-[10px]"
                style={{
                  borderColor: filters.mode.includes(mode.key) ? "var(--accent)" : "var(--line)",
                  color: filters.mode.includes(mode.key) ? "var(--accent)" : "var(--ink-soft)",
                }}
              >
                {mode.display}
              </button>
            ))}
          </>
        ) : null}

        {catalog && catalog.alphas.length > 0 ? (
          <>
            <span className="mono text-[10px] uppercase" style={{ color: "var(--ink-faint)" }}>
              alpha
            </span>
            {catalog.alphas.map((alpha) => (
              <button
                key={alpha.alpha_id}
                type="button"
                data-filter-alpha={alpha.alpha_id}
                data-selected={filters.alpha.includes(alpha.alpha_id)}
                onClick={() => onFilters({ ...filters, alpha: toggleIn(filters.alpha, alpha.alpha_id) })}
                className="mono rounded-full border px-2.5 py-px text-[10px]"
                style={{
                  borderColor: filters.alpha.includes(alpha.alpha_id) ? "var(--accent)" : "var(--line)",
                  color: filters.alpha.includes(alpha.alpha_id) ? "var(--accent)" : "var(--ink-soft)",
                }}
              >
                {alpha.alpha_name}
              </button>
            ))}
            {catalog.scratch_available ? (
              <button
                type="button"
                data-filter-alpha="scratch"
                data-selected={filters.alpha.includes("scratch")}
                onClick={() => onFilters({ ...filters, alpha: toggleIn(filters.alpha, "scratch") })}
                className="mono rounded-full border px-2.5 py-px text-[10px]"
                style={{
                  borderColor: "var(--role-holdout)",
                  color: "var(--role-holdout)",
                  background: filters.alpha.includes("scratch") ? "var(--paper)" : "var(--paper-raised)",
                }}
              >
                scratch only
              </button>
            ) : null}
          </>
        ) : null}

        <button
          type="button"
          data-filter-group
          data-selected={filters.group}
          onClick={() => onFilters({ ...filters, group: !filters.group })}
          className="mono rounded-[6px] border px-2.5 py-px text-[10px]"
          style={{
            borderColor: filters.group ? "var(--accent)" : "var(--line)",
            color: filters.group ? "var(--accent)" : "var(--ink-soft)",
          }}
        >
          group by alpha
        </button>

        {response ? (
          <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-counter>
            {response.page.filtered_rows} of {response.page.total_rows} runs
          </span>
        ) : null}

        {response ? (
          <span className="mono ml-auto flex items-center gap-2 text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-claim-ledger>
            {/* Spec 01 §2.3 item 10: the ledger is a bar as well as a caption,
                so the shape of the page's claim families is readable without
                doing arithmetic. Each segment is sized by its own count, and
                a family with no rows takes no width rather than a sliver. */}
            <span className="flex h-[10px] w-[86px] overflow-hidden rounded-[2px]" data-ledger-bar>
              {(
                [
                  ["issued", response.claim_ledger.issued, "var(--good)"],
                  ["not-issued", response.claim_ledger.not_issued, "var(--ink-mute)"],
                  ["pending", response.claim_ledger.pending_source, "var(--role-holdout)"],
                  ["failed", response.claim_ledger.failed, "var(--bad)"],
                ] as const
              ).map(([family, count, tone]) => {
                const total =
                  response.claim_ledger.issued +
                  response.claim_ledger.not_issued +
                  response.claim_ledger.pending_source +
                  response.claim_ledger.failed;
                if (count === 0 || total === 0) return null;
                return (
                  <span
                    key={family}
                    data-ledger-segment={family}
                    title={`${count} ${family.replace("-", " ")}`}
                    style={{ background: tone, width: `${(count / total) * 100}%` }}
                  />
                );
              })}
            </span>
            claims · {response.claim_ledger.issued} issued · {response.claim_ledger.not_issued} not
            issued · {response.claim_ledger.pending_source} pending · {response.claim_ledger.failed} failed
          </span>
        ) : null}
      </div>

      <ResearchPanel
        title="runs"
        meta={response ? `as of ${new Date(response.as_of_utc_ms).toISOString()}` : undefined}
        state={state}
        minBodyHeight={180}
      >
        {items.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--ink-soft)" }} data-empty>
            No run matches this filter. The filter bar above is unchanged so the selection can be
            widened.
          </p>
        ) : (
          <div className="flex flex-col gap-2.5" data-runs>
            {(filters.group ? groupRuns(items) : [{ key: "all", title: "", sub: "", rows: items }]).map(
              (group) => (
                <div key={group.key} className="flex flex-col gap-2.5">
                  {filters.group ? (
                    <div
                      className="flex flex-wrap items-baseline gap-2.5 px-[2px] pt-1.5"
                      data-group={group.key}
                    >
                      <span className="mono text-[11px] font-bold">{group.title}</span>
                      <span className="mono text-[9.5px]" style={{ color: "var(--ink-faint)" }}>
                        {group.sub}
                      </span>
                      <span
                        className="mono text-[9.5px]"
                        style={{ color: "var(--ink-faint)" }}
                        data-group-count
                      >
                        {group.rows.length} of this page
                      </span>
                      {group.alphaId ? (
                        <Link
                          className="mono text-[9.5px]"
                          to={lineageHref(group.alphaId)}
                          data-action="open-lineage"
                          data-lineage-alpha={group.alphaId}
                        >
                          lineage →
                        </Link>
                      ) : null}
                      <span
                        className="h-px flex-1 self-center"
                        style={{ background: "var(--line)" }}
                      />
                    </div>
                  ) : null}
                  {group.rows.map((item) => (
                    <RunCard
                      key={item.run_id}
                      item={item}
                      selected={filters.sel.includes(item.run_id)}
                      onToggle={onToggleSel}
                      sparkline={sparklines.get(item.run_id)}
                      onVisible={onVisible}
                    />
                  ))}
                </div>
              ),
            )}
          </div>
        )}
      </ResearchPanel>

      {response?.page.has_previous || response?.page.has_more ? (
        <div className="flex gap-2" data-paging>
          <button
            type="button"
            className="btn-ghost mono text-[10px]"
            data-action="previous"
            onClick={onLoadPrevious}
            disabled={!response?.page.has_previous}
            title={response?.page.has_previous ? undefined : "This is the first page."}
            style={response?.page.has_previous ? undefined : { opacity: 0.4, cursor: "not-allowed" }}
          >
            ← newer
          </button>
          <button
            type="button"
            className="btn-ghost mono text-[10px]"
            data-action="next"
            onClick={onLoadNext}
            disabled={!response?.page.has_more}
            title={response?.page.has_more ? undefined : "This is the last page."}
            style={response?.page.has_more ? undefined : { opacity: 0.4, cursor: "not-allowed" }}
          >
            older →
          </button>
        </div>
      ) : null}

      <CompareBar
        selected={filters.sel}
        items={items}
        onClear={() => onFilters({ ...filters, sel: [] })}
      />

      <footer className="flex flex-col gap-1">
        <span className="mono text-[9.5px] uppercase tracking-[.07em]" style={{ color: "var(--ink-faint)" }}>
          rules of this screen
        </span>
        <p className="text-[11px] leading-[1.5]" style={{ color: "var(--ink-soft)" }} data-rules-footer>
          {RULES_FOOTER}
        </p>
      </footer>
    </div>
  );
}
