/**
 * Research Loop — Engine Atlas data source (P04 FE/consumer scope).
 *
 * P04 published a read-only `GET /api/v1/research/quantbt/atlas` returning
 * `research-engine-atlas.v1`. This module derives what S12 needs to display
 * from that document and nothing else: no fetching, no mutation, no engine
 * call. P09 owns the screen composition and browser acceptance.
 *
 * Types come from the generated OpenAPI client, not from hand-written field
 * names, so a contract change surfaces as a type error here rather than as a
 * silently empty card.
 *
 * Four rules from the P04 handoff are easy to lose and are asserted by tests:
 *
 *  - `axes` is four independent facts. A route can be `ENGINE_SUPPORTED` and
 *    still blocked by `INTEGRATION_GAP`; presenting that as an engine failure
 *    blames the wrong component and hides the real owner of the gap.
 *  - `P04_BASELINE_ONLY` is an admission fact, never an authorization to
 *    submit. Nothing in this module returns a "can run" flag.
 *  - a route's backend label comes from the route descriptor. The release
 *    carrying a native package does not make a route's backend native.
 *  - an unverified or unknown installed version is a safe state, not a claim.
 */

/*
 * Typed from the contract the browser actually reads.
 *
 * P04 published this document through the Portal API and P09 republished it
 * through the Research foundation BFF, which is now the only route a browser
 * uses. Two generated descriptions of one document is one too many: the screen
 * followed P04's while the client returned P09's, so a checked narrowing had
 * to sit between them (`CG-P09-01`). Pointing this module at the foundation
 * contract removes that layer entirely — there is one type, and it is the one
 * the response satisfies.
 *
 * What P09 leaves wider than P04 is the schedule vocabulary: `valid_schedules`
 * and `default_schedule` are plain strings here. Screen 12 renders both as
 * text, so nothing is lost on this surface; a consumer that needs to *branch*
 * on a schedule should ask for the enum rather than re-narrow it locally.
 */
import type { components } from "@portal/contracts-research-foundation";

export type AtlasDocument = components["schemas"]["Atlas"];
export type AtlasRoute = components["schemas"]["AtlasRoute"];
export type AtlasAxes = components["schemas"]["CapabilityAxes"];
export type AtlasMode = components["schemas"]["AtlasMode"];
export type CurrentRelease = components["schemas"]["AtlasRelease"];
export type HistoricalRelease = components["schemas"]["HistoricalRelease"];
/** RF02-B1: per mode × schedule engine facts, each with a source locator. */
export type AtlasModeFacts = components["schemas"]["AtlasModeFacts"];
export type AtlasScheduleFact = components["schemas"]["AtlasScheduleFact"];
export type AtlasObjectiveFact = components["schemas"]["AtlasObjectiveFact"];
export type AtlasReadsFact = components["schemas"]["AtlasReadsFact"];
export type AtlasNotPublishedFact = components["schemas"]["AtlasNotPublishedFact"];
export type AtlasSourceLocator = components["schemas"]["AtlasSourceLocator"];
/** RF02-B2: the walk-forward values New Run may offer. */
export type AtlasWalkForwardOptions = components["schemas"]["AtlasWalkForwardOptions"];

/** Every schedule the engine names, in its order. A mode admits a subset. */
export const ENGINE_SCHEDULES = ["global", "per_fold_decay", "per_fold_causal"] as const;

export function isPublished<T extends { state: string }>(fact: T | AtlasNotPublishedFact): fact is T {
  return fact.state === "PUBLISHED";
}

/** Which axis holds a route back. Order matters: the first blocker is reported. */
export type BlockingAxis = "engine" | "integration" | "evidence" | "admission";

export interface RouteDisplay {
  routeId: string;
  family: string;
  /** Declared by the route itself. Never inferred from the release. */
  backendLabel: string;
  /** True only when all four axes are clear. Display fact, not permission. */
  admitted: boolean;
  /** The first axis that is not clear, or null when all four are. */
  blockedBy: BlockingAxis | null;
  /** The server's own words. Never composed locally. */
  reason: string;
  /** Every axis, so a card can show all four rather than one verdict. */
  axes: AtlasAxes;
  isDefaultForNewRuns: boolean;
}

const AXIS_CLEAR: {
  [K in BlockingAxis]: (axes: AtlasAxes) => boolean;
} = {
  engine: (a) => a.engine === "ENGINE_SUPPORTED",
  integration: (a) => a.integration === "ADAPTER_AVAILABLE",
  evidence: (a) => a.evidence === "EVIDENCE_MAPPED" || a.evidence === "NOT_APPLICABLE",
  admission: (a) => a.admission === "P04_BASELINE_ONLY",
};

const AXIS_ORDER: readonly BlockingAxis[] = ["engine", "integration", "evidence", "admission"];

/** The first axis that is not clear. Reporting one keeps the card's copy honest. */
export function firstBlockingAxis(axes: AtlasAxes): BlockingAxis | null {
  return AXIS_ORDER.find((axis) => !AXIS_CLEAR[axis](axes)) ?? null;
}

export function routeDisplay(route: AtlasRoute): RouteDisplay {
  const blockedBy = firstBlockingAxis(route.axes);
  return {
    routeId: route.route_id,
    family: route.family,
    backendLabel: route.backend,
    admitted: blockedBy === null,
    blockedBy,
    reason: route.reason,
    axes: route.axes,
    isDefaultForNewRuns: route.default_for_new_runs,
  };
}

/** Every route, in document order. All 14 are rendered; none is filtered out. */
export function allRouteDisplays(doc: AtlasDocument): RouteDisplay[] {
  return doc.routes.map(routeDisplay);
}

/* -------------------------------------------------------------------------
 * Release identity
 * ---------------------------------------------------------------------- */

export interface ReleaseLabel {
  /** What to print. Never a guessed version string. */
  text: string;
  /** True when the server verified the installed distribution. */
  verified: boolean;
  /** True when the installed version is absent or unverified. */
  isSafeState: boolean;
  detail: string | null;
}

/**
 * An unverified or missing installed version must read as an unknown, not as
 * the expected version — printing `expected` while `installed` is null asserts
 * something the server explicitly declined to assert.
 */
export function currentReleaseLabel(release: CurrentRelease): ReleaseLabel {
  const installed = release.installed_version ?? null;
  if (!release.verified || installed === null) {
    return {
      text: `${release.package} — installed version not verified`,
      verified: false,
      isSafeState: true,
      detail: release.detail ?? null,
    };
  }
  return {
    text: `${release.package} ${installed}`,
    verified: true,
    isSafeState: false,
    detail: release.detail ?? null,
  };
}

/**
 * Historical releases are retained identities. They are never a second
 * selectable runtime, so this returns labels only — no id a caller could
 * submit and no notion of "active".
 */
export function historicalReleaseLabels(doc: AtlasDocument): readonly string[] {
  return doc.historical_releases.map((r) => `${r.package} ${r.version} — retained history`);
}

/**
 * The release may carry a native package. That is a property of the
 * distribution, not of any route: a route's backend is whatever its own
 * descriptor says. Badging every route "native" because a wheel ships
 * compiled code is the exact mislabel P04 calls out.
 */
export function releaseHasNativeDependency(release: CurrentRelease): boolean {
  return Boolean(release.native_package);
}

/* -------------------------------------------------------------------------
 * Modes and schedules
 * ---------------------------------------------------------------------- */

export type ScheduleId = AtlasMode["default_schedule"];

export function isScheduleValid(mode: AtlasMode, schedule: ScheduleId): boolean {
  return mode.valid_schedules.includes(schedule);
}

export interface ScheduleChoice {
  schedule: ScheduleId;
  valid: boolean;
  isDefault: boolean;
}

/**
 * Every schedule the document knows about, each marked valid or not for this
 * mode. An invalid combination stays visible with its state rather than being
 * removed, so the panel keeps its shape instead of collapsing.
 */
export function scheduleChoices(doc: AtlasDocument, mode: AtlasMode): ScheduleChoice[] {
  const all = new Set<ScheduleId>();
  for (const m of doc.modes) {
    all.add(m.default_schedule);
    for (const s of m.valid_schedules) all.add(s);
  }
  return [...all].map((schedule) => ({
    schedule,
    valid: isScheduleValid(mode, schedule),
    isDefault: mode.default_schedule === schedule,
  }));
}

/* -------------------------------------------------------------------------
 * Report levels
 * ---------------------------------------------------------------------- */

/**
 * A route's `report_levels` may contain values such as `R1`. That is an engine
 * report level and has nothing to do with a governance R1 approval gate. The
 * two are separate vocabularies that happen to share a spelling, and conflating
 * them would let a reference screen imply an approval state it cannot know.
 */
export function engineReportLevels(route: AtlasRoute): readonly string[] {
  return route.report_levels;
}

/** Always false: the Atlas document carries no governance state whatsoever. */
export function describesApprovalState(): false {
  return false;
}

/* -------------------------------------------------------------------------
 * Evidence contract
 * ---------------------------------------------------------------------- */

/**
 * P04 declares the future evidence envelope while its writer is inactive. The
 * screen may describe the shape; it must not render it as a persisted artifact
 * or a completed run.
 */
export type EvidenceWriterState = AtlasDocument["evidence_contract"]["writer_state"];

/**
 * The contract pins `writer_state` to the single literal `P05_OWNED_NOT_ACTIVE`,
 * so in P04 there is no value that could mean "active" and no runtime check
 * that could pass. This returns the fact rather than performing a comparison
 * against a string the type forbids — such a check always succeeds and reads
 * like a guard while guarding nothing.
 *
 * When P05 widens the union, this function starts failing to compile, which is
 * the intended signal: the screen must then be told how to render a written
 * artifact instead of a described shape.
 */
export function evidenceIsDescriptiveOnly(doc: AtlasDocument): boolean {
  const state: EvidenceWriterState = doc.evidence_contract.writer_state;
  return state === "P05_OWNED_NOT_ACTIVE";
}

/**
 * The declared future field list, for describing the shape without rendering
 * data. The contract enumerates these exactly; they are not free-form strings.
 */
export function evidenceRequiredFields(
  doc: AtlasDocument,
): readonly AtlasDocument["evidence_contract"]["required_fields"][number][] {
  return doc.evidence_contract.required_fields;
}
