/**
 * The canonical `research.enriched-analysis.v1` fixtures Codex published (`packages/contracts/fixtures/`).
 * Tests load these, never a hand-built block. The proposed fixture of the earlier UI-first pass is a
 * historical document only (`evidence/P21/enrich-analysis/`).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { EnrichedAnalysis } from "./enrichedAnalysis";

const DIR = join(process.cwd(), "..", "..", "..", "packages", "contracts", "fixtures");
const load = (name: string): unknown => JSON.parse(readFileSync(join(DIR, `research-enriched-analysis.${name}.valid.json`), "utf8"));

/** WFO, full retained OOS, 60 observations, three months (first and last partial), ten of eleven episodes. */
export const healthy = (): EnrichedAnalysis => load("healthy") as EnrichedAnalysis;
/** WFO with no benchmark: an empty benchmark curve and typed benchmark facts. */
export const noBenchmark = (): EnrichedAnalysis => load("no-benchmark") as EnrichedAnalysis;
/** FIXED profile: `SAMPLED_RETAINED_EQUITY`, one partial month, histogram NOT_PUBLISHED. */
export const partialMonth = (): EnrichedAnalysis => load("partial-month") as EnrichedAnalysis;
/** Absence guard only: not a complete Evidence / Report response. */
export const oldSealAbsent = () => load("old-seal-absent") as { schema_version: string; state: string; reason_code: string; enriched_analysis: null };
/** FIXED fresh run: optional `by_window.is` (IS return / Sharpe / max DD) next to the OOS-only facts. */
export const fixedIs = (): EnrichedAnalysis => load("fixed-is") as EnrichedAnalysis;
