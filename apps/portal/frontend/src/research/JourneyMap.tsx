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
import { shortId } from "./researchFormat";
import { journeyCardScope, needsAlphaToOpen, needsRunToOpen, opensWithRunId, pickRunHref, resolveJourneyCardRoute } from "./screenRoutes";
import type { ResearchState } from "./state";
import { CursorNotice } from "./CursorNotice";
import { hubHref, libraryHref } from "./runLinks";
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
    ink: "var(--warn)",
    weight: 700,
  },
  EXECUTION_HANDOFF: {
    border: "var(--ink)",
    background: "var(--paper-sunken)",
    ink: "var(--ink)",
    weight: 700,
  },
};

/** F2b: what each card kind means, as the tooltip of its tag (spec 00 §3.2). */
const TAG_TITLE: Record<JourneyCard["target_kind"], string> = {
  SHIPPED: "Existing portal screen, unchanged",
  RESEARCH_SCREEN: "Redesigned Research screen",
  EXECUTION_HANDOFF: "Hands off to the Execution loop",
};

/* Fewer words: the border and the legend carry the kind; only the hand-off to Execution (and a blocked reason) is a printed tag. The kind's sentence rides in the tooltip. */
const TAG_LABEL: Record<JourneyCard["target_kind"], string | null> = {
  SHIPPED: null,
  RESEARCH_SCREEN: null,
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

/* The legacy screens are redirected to the redesigned ones, so "shipped hi-fi" no longer names a screen the reader can open: one swatch remains. */
const LEGEND: readonly { kind: "RESEARCH_SCREEN"; label: string }[] = [{ kind: "RESEARCH_SCREEN", label: "redesigned" }];

function TagLegend() {
  return (
    <div className="mono flex flex-none items-center gap-3.5 text-[10px]" style={{ color: "var(--ink-soft)" }} data-legend>
      {LEGEND.map(({ kind, label }) => {
        const tone = TAG_STYLE[kind];
        return (
          <span key={kind} data-legend-tag={kind} title={TAG_TITLE[kind]} className="inline-flex items-center gap-[5px]">
            <span
              aria-hidden="true"
              className="inline-block h-2.5 w-2.5 rounded-[2px]"
              style={{
                border: `${kind === "RESEARCH_SCREEN" ? 1.5 : 1}px solid ${tone.border}`,
                background: kind === "RESEARCH_SCREEN" ? "var(--paper)" : "var(--paper-raised)",
              }}
            />
            {label}
          </span>
        );
      })}
    </div>
  );
}

const CARD_CLASS =
  "jm-card flex min-w-0 min-[721px]:min-w-[180px] max-w-[300px] flex-1 flex-col gap-1 rounded-[8px] px-3 py-2.5 shadow-[0_1px_2px_rgba(28,37,50,.05)] transition-[filter,border-color] duration-[120ms] hover:brightness-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]";

/** D2: the badge on a card that opens the Run Library to choose its run. */
export const PICK_RUN_BADGE = "PICK A RUN";
/** CG-S00-AV-01: the badge on a card whose served scope is an Alpha, not a run. */
export const PICK_ALPHA_BADGE = "PICK AN ALPHA";

function CardBody({ card, blocked }: { card: JourneyCard; blocked: string | null }) {
  const tone = TAG_STYLE[card.target_kind];
  return (
    <>
      <span className="flex items-start gap-2">
        <span className="flex-1 text-[12px] font-semibold" style={{ color: "var(--ink)" }}>
          {card.title}
        </span>
        {(blocked ?? TAG_LABEL[card.target_kind]) ? (
          <span
            className="mono flex-none rounded-[3px] border px-[5px] text-[8.5px] uppercase leading-[15px]"
            style={{ color: tone.ink, borderColor: tone.border, fontWeight: tone.weight }}
          >
            {blocked ?? TAG_LABEL[card.target_kind]}
          </span>
        ) : null}
      </span>
    </>
  );
}

/** The card's served description and kind, as its tooltip (the card face carries the title only). */
function cardTitle(card: JourneyCard): string {
  /* Served copy that still calls a redirected screen "shipped" is not repeated. */
  const description = /\bshipped\b/i.test(card.description) ? null : card.description;
  return [description, TAG_TITLE[card.target_kind]].filter(Boolean).join(" · ");
}

function JourneyCardLink({ card, runId }: { card: JourneyCard; runId: string | null }) {
  const route = resolveJourneyCardRoute(card.target_key, runId);
  const decoded = card.target_fragment ? decodeInspectionCursor(card.target_fragment) : null;
  const fragment = decoded && decoded.problems.length === 0 ? encodeInspectionCursor(decoded.cursor) : "";
  /* F2b: the Atlas opened from a run's map remembers that run, so its crumb returns to the run's Evidence Flow. */
  const atlasRun = card.target_key === "engine_atlas" && runId && !fragment ? `#tab=modes&run=${encodeURIComponent(runId)}` : "";
  const href = route && fragment ? `${route}#${fragment}` : route ? `${route}${atlasRun}` : route;
  /*
   * D2 (audit 00-4): a card that needs a run is not a dead end. Before, 14
   * cards greyed to "SELECT RUN" with nowhere to select one, so the map
   * pointed at nothing past the hub. Now the card opens the Run Library
   * carrying its own target, and the Library opens this screen for the run
   * the reader picks. We do not guess "the latest run" — the reader chooses.
   */
  /*
   * CG-S00-AV-01 / 2_wiring S00: which context a card needs is the server's
   * word (`requires_run` / `requires_alpha`), not something this build derives
   * from its own route table. A card with a declared scope opens directly only
   * when the context in hand already is that scope (a run id on a per-run
   * screen); otherwise it opens the picker the scope calls for.
   */
  const scope = journeyCardScope(card);
  const opensDirectly = scope === "NONE" || (scope === "RUN" && runId !== null && opensWithRunId(card.target_key));
  const picksContext = card.availability === "AVAILABLE" && !opensDirectly && needsRunToOpen(card.target_key);
  const picksRun = picksContext && scope === "RUN";
  const picksAlpha = picksContext && scope === "ALPHA";
  const blocked = picksContext ? null : unreachableReason(card, route);
  const tone = TAG_STYLE[card.target_kind];

  if (picksContext) {
    return (
      <Link
        data-card={card.card_id}
        data-card-kind={card.target_kind}
        data-card-availability={card.availability}
        data-card-picks-run={picksRun ? card.target_key : undefined}
        data-card-picks-alpha={picksAlpha ? card.target_key : undefined}
        title={cardTitle(card)}
        className={CARD_CLASS}
        style={{
          border: `${card.target_kind === "RESEARCH_SCREEN" ? 1.5 : 1}px solid ${tone.border}`,
          background: tone.background,
          cursor: "pointer",
        }}
        to={pickRunHref(card.target_key, scope)}
        data-card-route={pickRunHref(card.target_key, scope)}
      >
        <CardBody card={card} blocked={null} />
        <span className="mono text-[8.5px] font-bold" style={{ color: "var(--accent)" }}>
          {picksAlpha ? "pick an alpha →" : "pick a run →"}
        </span>
      </Link>
    );
  }

  const shared = {
    "data-card": card.card_id,
    "data-card-kind": card.target_kind,
    "data-card-availability": card.availability,
    title: cardTitle(card),
    className: CARD_CLASS,
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
      </span>
    );
  }

  return (
    <Link {...shared} to={href ?? route} data-card-route={href ?? route}>
      <CardBody card={card} blocked={null} />
    </Link>
  );
}

/**
 * QA UX-16: Attempt Lineage, Engine Atlas and Compare are references reached from the
 * flow, not steps of it, so no arrow runs into or out of them.
 */
const OFF_SEQUENCE_KEYS: readonly string[] = ["attempt_lineage", "engine_atlas", "compare_runs"];
export function isOffSequence(card: Pick<JourneyCard, "target_key">): boolean {
  return OFF_SEQUENCE_KEYS.includes(card.target_key);
}

function PhaseRow({ phase, runId }: { phase: JourneyPhase; runId: string | null }) {
  return (
    <section className="flex flex-wrap items-start gap-3.5" data-phase={phase.phase_id}>
      <div className="w-[150px] flex-none pt-1.5">
        <div className="mono text-[11px] font-bold" style={{ color: "var(--accent)" }}>
          P{phase.ordinal}
        </div>
        <h2 className="text-[13px] font-semibold" style={{ color: "var(--ink)", fontFamily: "var(--font-body)" }} data-phase-title title={phase.description}>
          {phase.title}
        </h2>
      </div>
      <div
        className="flex min-w-0 flex-1 flex-wrap items-stretch gap-2 border-l-2 py-1.5 pl-3.5"
        style={{ borderColor: "var(--line-soft)" }}
      >
        {phase.cards.map((card, index) => (
          /* The arrow leads the card it points at, in the same non-wrapping group: when the
             row wraps it starts the next line instead of dangling at the right edge. */
          <span key={card.card_id} className="flex min-w-0 max-w-[320px] flex-1 items-stretch gap-2 max-[720px]:basis-full min-[721px]:min-w-[200px]" data-card-group>
            {index > 0 && !isOffSequence(card) && !isOffSequence(phase.cards[index - 1]) ? (
              <span aria-hidden="true" data-arrow className="self-center text-[12px]" style={{ color: "var(--line-strong)" }}>
                →
              </span>
            ) : null}
            <JourneyCardLink card={card} runId={runId} />
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

/**
 * F3 00-8…10: where a mapping column opens. Same resolution as the cards: the run in
 * hand opens the screen directly, otherwise a run-scoped key opens the Run Library as
 * the picker; a key this build cannot serve is drawn as plain text, never as a guess.
 */
export function mappingHref(targetKey: string, runId: string | null): { href: string; picks: boolean } | null {
  const direct = resolveJourneyCardRoute(targetKey, runId);
  if (direct) return { href: direct, picks: false };
  if (needsRunToOpen(targetKey)) return { href: pickRunHref(targetKey, needsAlphaToOpen(targetKey) ? "ALPHA" : "RUN"), picks: true };
  return null;
}

/** QA UX-7: a mapping row whose shipped side the descriptor words as "no shipped tab" links nothing there. */
export const NO_SHIPPED_TAB = /^\s*[—–-]\s*no shipped tab\b/i;

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
  return `${hubHref(runId)}${hash ? `#${hash}` : ""}`;
}

export function JourneyMap({ descriptor, inspection, state, linkProblems = [], runId = null, onRetry }: JourneyMapProps) {
  return (
    <div
      data-screen="journey-map"
      className="mx-auto flex w-full min-w-0 max-w-[1280px] flex-col gap-3 pb-8"
    >
      <header className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-1.5 text-[12px]" aria-label="Breadcrumb" role="group" data-breadcrumb>
          <Link to={libraryHref()} style={{ color: "var(--accent)" }} data-crumb-library>
            Run Library
          </Link>
          <span style={{ color: "var(--ink-faint)" }}>/</span>
          {runId ? (
            <>
              <Link
                to={hubHref(runId)}
                className="mono"
                style={{ color: "var(--accent)" }}
                data-crumb-evidence
                title={`Evidence Flow of ${runId}`}
              >
                {shortId(runId)}
              </Link>
              <span style={{ color: "var(--ink-faint)" }}>/</span>
            </>
          ) : null}
          <span style={{ color: "var(--ink)" }} aria-current="page">Journey Map</span>
        </div>
        <div
          className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b pb-2.5"
          style={{ borderColor: "var(--line)" }}
          data-journey-head
        >
          <div className="flex min-w-0 flex-col gap-[3px]">
            <h1
              className="text-[27px] font-normal leading-[1.2] tracking-[-.01em]"
              style={{ fontFamily: "Newsreader, Georgia, serif" }}
              data-descriptor-revision={descriptor?.revision}
            >
              Journey Map
            </h1>
          </div>
          <TagLegend />
        </div>
        {/* `ResearchPanel` prints `meta` only in its framed variant, and this screen is
            plain, so the descriptor revision never reached the reader: the map said which
            screens exist without saying which published answer it was reading. */}
      </header>

      <ResearchPanel
        title="journey"
        variant="plain"
        recovery={onRetry ? <button type="button" onClick={onRetry} className="btn-ghost self-start">Retry map read</button> : undefined}
        state={state}
        minBodyHeight={160}
      >
        {descriptor ? (
          <div className="flex flex-col gap-3" data-phases>
            {descriptor.phases.map((phase) => (
              <PhaseRow key={phase.phase_id} phase={phase} runId={runId} />
            ))}
            <p className="sr-only" aria-hidden="true" data-descriptor-digest>
              {descriptor.descriptor_id} · {descriptor.content_sha256}
            </p>
          </div>
        ) : null}
      </ResearchPanel>

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
