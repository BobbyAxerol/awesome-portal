/**
 * Screen 00 · Journey Map (P09 composition scope).
 *
 * A reading map of the whole backtest domain: eight phases, each a row of
 * cards. It is not a working screen — spec 00 §5.1 is explicit that it has
 * hover and focus and nothing else, and this component holds no state.
 *
 * Three rules from the P09 handoff shape it:
 *
 *  - **One shell, never two.** The page is shell-free by construction: it
 *    renders no topbar and no sidebar, so the Portal's own shell is the only
 *    one on screen.
 *  - **`target_key` is presentation data, not a path.** Every key is resolved
 *    through `resolveScreenRoute`, and a key this build cannot serve renders as
 *    unreachable rather than as a guessed URL.
 *  - **A journey deep link inspects; it never dispatches.** `pick` and the rest
 *    of the P02 cursor are shown as the server canonicalised them, with
 *    `pick_effect` printed so the reader can see the limit rather than infer it.
 *
 * A card that cannot be reached is still drawn (spec 00 §8): hiding it would
 * quietly shrink the map of the domain, which is the one thing the map is for.
 */

import { Link } from "react-router-dom";

import type {
  InspectionCursor,
  JourneyCard,
  JourneyDescriptor,
  JourneyPhase,
} from "./foundationClient";
import { ResearchPanel } from "./ResearchPanel";
import { resolveJourneyCardRoute } from "./screenRoutes";
import type { ResearchState } from "./state";
import { CursorNotice } from "./CursorNotice";
import { decodeInspectionCursor, encodeInspectionCursor, type CursorProblem } from "./inspectionCursor";

/** Spec 00 §3.2 — the three card kinds, distinguished visually. */
const TAG_STYLE: Record<
  JourneyCard["target_kind"],
  { border: string; background: string; ink: string; weight: number }
> = {
  SHIPPED: {
    border: "var(--line)",
    background: "var(--paper-raised)",
    ink: "var(--ink-faint)",
    weight: 500,
  },
  RESEARCH_SCREEN: {
    border: "var(--role-holdout)",
    background: "var(--paper)",
    ink: "var(--role-holdout)",
    weight: 700,
  },
  EXECUTION_HANDOFF: {
    border: "var(--ink)",
    background: "var(--paper-sunken)",
    ink: "var(--ink)",
    weight: 700,
  },
};

const TAG_LABEL: Record<JourneyCard["target_kind"], string> = {
  SHIPPED: "shipped",
  RESEARCH_SCREEN: "redesign",
  EXECUTION_HANDOFF: "execution",
};

/**
 * Why a card cannot be opened.
 *
 * The server's availability and this build's routing are different facts and
 * are reported as different words. A screen the descriptor calls `AVAILABLE`
 * that this build does not serve is `NOT ROUTED` — saying `SOON` there would
 * blame the roadmap for a deployment gap, and the reader would stop asking.
 */
export function unreachableReason(card: JourneyCard, route: string | null): string | null {
  if (card.availability === "PLANNED") return "SOON";
  if (card.availability === "DEPENDENCY_REQUIRED") return "BLOCKED";
  if (route === null) return "NOT ROUTED";
  return null;
}

function TagLegend() {
  return (
    <div className="flex flex-wrap items-center gap-2" data-legend>
      {(Object.keys(TAG_LABEL) as JourneyCard["target_kind"][]).map((kind) => {
        const tone = TAG_STYLE[kind];
        return (
          <span
            key={kind}
            data-legend-tag={kind}
            className="mono rounded-[3px] border px-[5px] text-[8.5px] uppercase leading-[15px]"
            style={{
              color: tone.ink,
              borderColor: tone.border,
              background: tone.background,
              fontWeight: tone.weight,
              borderWidth: kind === "RESEARCH_SCREEN" ? 1.5 : 1,
            }}
          >
            {TAG_LABEL[kind]}
          </span>
        );
      })}
    </div>
  );
}

function CardBody({ card, blocked }: { card: JourneyCard; blocked: string | null }) {
  const tone = TAG_STYLE[card.target_kind];
  return (
    <>
      <span className="flex items-start gap-2">
        <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--ink)" }}>
          {card.title}
        </span>
        <span
          className="mono flex-none rounded-[3px] border px-[5px] text-[8.5px] uppercase leading-[15px]"
          style={{ color: tone.ink, borderColor: tone.border, fontWeight: tone.weight }}
        >
          {blocked ?? TAG_LABEL[card.target_kind]}
        </span>
      </span>
      <span className="text-[10.5px] leading-[1.45]" style={{ color: "var(--ink-soft)" }}>
        {card.description}
      </span>
    </>
  );
}

function JourneyCardLink({ card, runId }: { card: JourneyCard; runId: string | null }) {
  const route = resolveJourneyCardRoute(card.target_key, runId);
  const decoded = card.target_fragment ? decodeInspectionCursor(card.target_fragment) : null;
  const fragment = decoded && decoded.problems.length === 0 ? encodeInspectionCursor(decoded.cursor) : "";
  const href = route && fragment ? `${route}#${fragment}` : route;
  const blocked = card.requires_run && !runId && card.availability === "AVAILABLE"
    ? "SELECT RUN" : unreachableReason(card, route);
  const tone = TAG_STYLE[card.target_kind];

  const shared = {
    "data-card": card.card_id,
    "data-card-kind": card.target_kind,
    "data-card-availability": card.availability,
    className: "jm-card flex min-w-[180px] max-w-[300px] flex-1 flex-col gap-1 rounded-[8px] px-3 py-2.5 shadow-[0_1px_2px_rgba(28,37,50,.05)] transition-[filter,border-color] duration-[120ms] hover:brightness-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
    style: {
      border: `${card.target_kind === "RESEARCH_SCREEN" ? 1.5 : 1}px solid ${tone.border}`,
      background: tone.background,
      opacity: blocked ? 0.55 : 1,
      cursor: blocked ? "not-allowed" : "pointer",
    } as const,
  };

  if (blocked || route === null) {
    /* Drawn, never hidden: the map of the domain must stay complete. The
       badge carries the reason, so a greyed card is not a mystery. */
    return (
      <span {...shared} tabIndex={0} role="link" aria-label={`${card.title}: ${blocked ?? "NOT ROUTED"}`} data-card-unreachable={blocked ?? "NOT ROUTED"} aria-disabled="true">
        <CardBody card={card} blocked={blocked ?? "NOT ROUTED"} />
        <span className="mono text-[8.5px] font-bold" style={{ color: "var(--ink-faint)" }}>
          {blocked ?? "NOT ROUTED"}
        </span>
      </span>
    );
  }

  return (
    <Link {...shared} to={href ?? route} data-card-route={href ?? route}>
      <CardBody card={card} blocked={null} />
    </Link>
  );
}

function PhaseRow({ phase, runId }: { phase: JourneyPhase; runId: string | null }) {
  return (
    <section className="flex flex-wrap items-start gap-3.5" data-phase={phase.phase_id}>
      <div className="w-[150px] flex-none pt-1.5">
        <div className="mono text-[11px] font-bold" style={{ color: "var(--accent)" }}>
          P{phase.ordinal}
        </div>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>
          {phase.title}
        </h2>
        <div className="text-[10.5px] leading-[1.45]" style={{ color: "var(--ink-faint)" }}>
          {phase.description}
        </div>
      </div>
      <div
        className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2 border-l-2 py-1.5 pl-3.5"
        style={{ borderColor: "var(--line-soft)" }}
      >
        {phase.cards.map((card, index) => (
          <span key={card.card_id} className="contents">
            <JourneyCardLink card={card} runId={runId} />
            {/* The last card of a phase carries no arrow: the flow ends here. */}
            {index < phase.cards.length - 1 ? (
              /* Hidden once the cards stack: an arrow pointing right while the
                 flow runs downward describes a layout that is not there. */
              <span
                aria-hidden="true"
                data-arrow
                className="self-center text-[12px]"
                style={{ color: "var(--line-strong)" }}
              >
                →
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </section>
  );
}

/**
 * The cursor a deep link carried, exactly as the server canonicalised it.
 *
 * `pick_effect` is printed rather than implied. The rule it states —
 * inspection only, never promotion — is invisible if the screen merely
 * declines to offer a button, and a reader who cannot see the limit will
 * assume the missing control is a bug.
 */
function InspectionStrip({ inspection }: { inspection: InspectionCursor }) {
  const entries = Object.entries(inspection.cursor).filter(([, value]) => value !== undefined);
  return (
    <div className="flex flex-col gap-1.5" data-inspection>
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className="mono rounded-[3px] border px-[5px] text-[9px] font-bold leading-[15px]"
          style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
          data-pick-effect
        >
          {inspection.pick_effect}
        </span>
        <span
          className="mono rounded-[3px] border px-[5px] text-[9px] leading-[15px]"
          style={{ color: "var(--ink-soft)", borderColor: "var(--line-strong)" }}
          data-ambiguity
        >
          {inspection.ambiguity_state}
        </span>
      </div>

      {entries.length > 0 ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1" data-cursor-keys>
          {entries.map(([key, value]) => (
            <span key={key} className="flex items-baseline gap-1.5" data-cursor-key={key}>
              <span
                className="mono text-[9px] uppercase tracking-[.07em]"
                style={{ color: "var(--ink-faint)" }}
              >
                {key}
              </span>
              {/* Opaque by contract: shown, never decoded or shortened. */}
              <span className="mono text-[10.5px]" style={{ color: "var(--ink)" }}>
                {value}
              </span>
            </span>
          ))}
        </div>
      ) : (
        <span className="mono text-[10px]" style={{ color: "var(--ink-faint)" }} data-no-cursor>
          This link carries no inspection cursor.
        </span>
      )}

      <span className="mono break-all text-[9.5px]" style={{ color: "var(--ink-faint)" }} data-canonical-query>
        {inspection.canonical_query === "" ? "(no query)" : inspection.canonical_query}
      </span>
    </div>
  );
}

export interface JourneyMapProps {
  descriptor: JourneyDescriptor | null;
  inspection: InspectionCursor | null;
  state: ResearchState;
  /** RF01-F5: keys the shared codec refused in this link, named rather than dropped. */
  linkProblems?: readonly CursorProblem[];
  /** The run the link scopes to, when it names one — lets the cursor open in Screen 04. */
  runId?: string | null;
  /** Retry only a failed read; never a content or promotion action. */
  onRetry?: () => void;
}

/**
 * The same cursor, handed to Screen 04 through the shared codec: what the
 * server canonicalised here is exactly what the evidence hub reads there.
 */
export function evidenceHrefFor(runId: string, inspection: InspectionCursor): string {
  const hash = encodeInspectionCursor(inspection.cursor as Record<string, string>);
  return `/research/quantbt/runs/${encodeURIComponent(runId)}/evidence${hash ? `#${hash}` : ""}`;
}

export function JourneyMap({ descriptor, inspection, state, linkProblems = [], runId = null, onRetry }: JourneyMapProps) {
  return (
    <div
      data-screen="journey-map"
      className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-3 px-2 pb-8"
    >
      <header className="flex flex-col gap-1.5">
        <h1
          className="text-[22px] font-light tracking-[-.01em]"
          style={{ fontFamily: "Newsreader, Georgia, serif" }}
        >
          QuantBT Backtest — journey map
        </h1>
        <p
          className="text-[13.5px] italic"
          style={{ fontFamily: "Newsreader, Georgia, serif", color: "var(--ink-faint)" }}
        >
          A reading map of the domain: where each screen sits, and what it adds.
        </p>
        <TagLegend />
      </header>

      <ResearchPanel
        title="journey"
        variant="plain"
        recovery={onRetry ? <button type="button" onClick={onRetry} className="btn-ghost self-start">Retry map read</button> : undefined}
        meta={descriptor ? `revision ${descriptor.revision}` : undefined}
        state={state}
        minBodyHeight={160}
      >
        {descriptor ? (
          <div className="flex flex-col gap-3" data-phases>
            {descriptor.phases.map((phase) => (
              <PhaseRow key={phase.phase_id} phase={phase} runId={runId} />
            ))}
            <p className="sr-only" data-descriptor-digest>
              {descriptor.descriptor_id} · {descriptor.content_sha256}
            </p>
          </div>
        ) : null}
      </ResearchPanel>

      {descriptor?.mapping ? (
        <section data-mapping className="mt-1 rounded-[8px] border bg-[var(--paper-raised)] px-4 py-3" style={{ borderColor: "var(--line)" }}>
          <h2 className="text-[13px] font-semibold" style={{ color: "var(--ink)" }}>What the redesign adds</h2>
          <div className="mt-2 grid gap-1.5">
            {descriptor.mapping.map((row, index) => (
              <div key={`${row.shipped_target_key}:${row.mine_target_key}:${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] gap-x-3 border-t py-2 text-[11px] sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,2fr)]" style={{ borderColor: "var(--line-soft)" }}>
                <span className="mono" style={{ color: "var(--ink-faint)" }}>{row.shipped}</span>
                <span aria-hidden="true" style={{ color: "var(--accent)" }}>→</span>
                <span className="font-semibold" style={{ color: "var(--ink)" }}>{row.mine}</span>
                <span className="col-span-3 text-[10.5px] sm:col-span-1" style={{ color: "var(--ink-soft)" }}>{row.adds}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <CursorNotice problems={linkProblems} />
      {inspection && runId ? (
        <Link to={evidenceHrefFor(runId, inspection)} className="self-start text-[11px] font-semibold" style={{ color: "var(--accent)" }} data-open-evidence>
          Open this run in Evidence Flow →
        </Link>
      ) : null}
      <div className="hidden" aria-hidden="true">
      <ResearchPanel title="deep link inspection" state={state} minBodyHeight={56}>
        <CursorNotice problems={linkProblems} />
        {inspection ? <InspectionStrip inspection={inspection} /> : null}
        {inspection && runId ? (
          <Link
            to={evidenceHrefFor(runId, inspection)}
            className="mono self-start text-[10.5px]"
            style={{ color: "var(--accent)" }}
            data-open-evidence
          >
            open this cursor in evidence →
          </Link>
        ) : null}
      </ResearchPanel>
      </div>
    </div>
  );
}
