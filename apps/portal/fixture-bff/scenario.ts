/**
 * Fixture scenario selector (WP-P, FIXTURE_LAB only). NOT a product flag, NOT acceptance evidence.
 *
 * The DEFAULT review scenario is `positive`: a complete, linked, positive synthetic world on every screen
 * (quality COMPLETE / FRESH / VERIFIED / AVAILABLE, no degraded environment, no per-panel warning copy).
 * Errors, partial, stale, denied, empty, missing and exact-zero are SEPARATE, selectable scenarios.
 *
 * Scope: only the fixture BFF reads this. A real response with an absent source still renders typed
 * absence in the product; nothing here is shipped to the browser bundle (src/execution/productBoundary.test.ts).
 *
 * The selection is in-memory and per process (the doubles are module singletons too): `POST /__fixture/scenario`
 * switches it, a reset puts back the configured scenario (`FIXTURE_SCENARIO`, default positive). No persistence.
 */
export const FIXTURE_SCENARIOS = ["positive", "partial", "stale", "denied", "empty", "missing", "zero", "dense"] as const;
export type FixtureScenario = typeof FIXTURE_SCENARIOS[number];
export const DEFAULT_SCENARIO: FixtureScenario = "positive";

export const isFixtureScenario = (value: unknown): value is FixtureScenario =>
  typeof value === "string" && (FIXTURE_SCENARIOS as readonly string[]).includes(value);

/** One line per scenario for the harness page and the register (what it stands for, not how it is built). */
export const SCENARIO_DESCRIPTIONS: Readonly<Record<FixtureScenario, string>> = Object.freeze({
  positive: "Complete, linked, positive world: every contract-supported panel populated, quality COMPLETE/FRESH, Paper, Sandbox and Live all included.",
  partial: "Partial coverage: Paper degraded in the All lens, panels say what is partial, one source window is short.",
  stale: "Stale data: freshness STALE on the manager reads, the Paper environment lags, the command center and blotter say stale.",
  denied: "Permission denial: administration, blotter and users reads answer 403; the manager reads keep answering.",
  empty: "Empty books: no rows, no orders, no approvals; true empty, not an error.",
  missing: "Source-dark: Sandbox NOT_CONFIGURED in the All lens, the command center feed unavailable, typed absence where a source is unpublished (the former default).",
  zero: "Exact zero: every money and ratio figure is an exact 0 (true zero, never an absence).",
  dense: "Dense: very long names, very large numbers; layout stress.",
});

let configured: FixtureScenario = DEFAULT_SCENARIO;
let current: FixtureScenario = DEFAULT_SCENARIO;

export const getScenario = (): FixtureScenario => current;
export const configuredScenario = (): FixtureScenario => configured;

/** Sets the process default (called once by `createFixtureServer`) and selects it. */
export function configureScenario(scenario: FixtureScenario): void {
  configured = scenario;
  current = scenario;
}

export function setScenario(scenario: FixtureScenario): void {
  current = scenario;
}

/** Deterministic reset: back to the configured scenario. */
export function resetScenario(): FixtureScenario {
  current = configured;
  return current;
}

/* ── traits: what each scenario means for the producers ─────────────────── */

export interface Quality { completeness: string; freshness: string; reasons: string[] }
export interface ScenarioTraits {
  /** The former default: deliberate typed absences, true zeros and "variety on purpose" (provisional, insufficient, adverse) rows. */
  legacy: boolean;
  /** A series carries a missing midpoint and the SOURCE_GAP reason. */
  seriesGap: boolean;
  /** Body-level quality of the manager dataset reads and of the series port. */
  dataset: Quality;
  series: Quality;
  /** `source_confidence` of the figures the producers stamp. */
  confidence: "VERIFIED" | "PROVISIONAL";
  /** The Paper environment of the All lens. */
  paper: Quality;
  /** The Sandbox environment of the All lens is a typed absence (NOT_CONFIGURED). */
  sandboxDark: boolean;
}

const OK: Quality = { completeness: "COMPLETE", freshness: "FRESH", reasons: [] };
const POSITIVE: ScenarioTraits = { legacy: false, seriesGap: false, dataset: OK, series: OK, confidence: "VERIFIED", paper: OK, sandboxDark: false };
const LEGACY_DATASET: Quality = { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", "RUNTIME_SCORE_POLICY_AND_SOURCE_NOT_QUALIFIED"] };
const LEGACY_SERIES: Quality = { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SYNTHETIC", "SOURCE_GAP"] };
const LAG: Quality = { completeness: "COMPLETE", freshness: "STALE", reasons: ["FIXTURE_LAB_SIMULATED_SOURCE_LAG"] };

export const SCENARIO_TRAITS: Readonly<Record<FixtureScenario, ScenarioTraits>> = Object.freeze({
  positive: POSITIVE,
  zero: POSITIVE,
  dense: POSITIVE,
  denied: POSITIVE,
  empty: POSITIVE,
  partial: { legacy: true, seriesGap: true, dataset: { completeness: "PARTIAL", freshness: "FRESH", reasons: ["SOURCE_COVERAGE_PARTIAL"] }, series: LEGACY_SERIES,
    confidence: "PROVISIONAL", paper: { completeness: "PARTIAL", freshness: "FRESH", reasons: ["FIXTURE_LAB_SIMULATED_PARTIAL_COVERAGE"] }, sandboxDark: false },
  stale: { legacy: false, seriesGap: false, dataset: LAG, series: LAG, confidence: "PROVISIONAL", paper: LAG, sandboxDark: false },
  missing: { legacy: true, seriesGap: true, dataset: LEGACY_DATASET, series: LEGACY_SERIES, confidence: "PROVISIONAL",
    paper: { completeness: "PARTIAL", freshness: "STALE", reasons: ["FIXTURE_LAB_SIMULATED_SOURCE_LAG"] }, sandboxDark: true },
});

export const traits = (): ScenarioTraits => SCENARIO_TRAITS[current];
/** True for the scenarios that keep the former default's deliberate absences, zeros and variety (`partial`, `missing`). */
export const legacy = (): boolean => SCENARIO_TRAITS[current].legacy;
