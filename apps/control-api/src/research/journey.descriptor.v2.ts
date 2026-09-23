import { createHash } from "node:crypto";

export const RESEARCH_JOURNEY_DESCRIPTOR_ID = "quantbt_journey";
export const RESEARCH_JOURNEY_SCHEMA_VERSION = "research.journey.v1";
export const RESEARCH_JOURNEY_DESCRIPTOR_REVISION = 2;

export type JourneyTargetKind = "SHIPPED" | "RESEARCH_SCREEN" | "EXECUTION_HANDOFF";
export type JourneyAvailability = "AVAILABLE" | "PLANNED" | "DEPENDENCY_REQUIRED";
export interface ResearchJourneyCard {
  card_id: string;
  title: string;
  description: string;
  target_kind: JourneyTargetKind;
  target_key: string;
  availability: JourneyAvailability;
  requires_run: boolean;
  target_fragment: string | null;
}
export interface ResearchJourneyPhase {
  phase_id: string;
  ordinal: number;
  title: string;
  description: string;
  cards: readonly ResearchJourneyCard[];
}
export interface ResearchJourneyMappingRow {
  shipped: string;
  shipped_target_key: string;
  mine: string;
  mine_target_key: string;
  adds: string;
}
export interface ResearchJourneyDescriptor {
  schema_version: typeof RESEARCH_JOURNEY_SCHEMA_VERSION;
  descriptor_id: typeof RESEARCH_JOURNEY_DESCRIPTOR_ID;
  revision: typeof RESEARCH_JOURNEY_DESCRIPTOR_REVISION;
  phases: readonly ResearchJourneyPhase[];
  mapping: readonly ResearchJourneyMappingRow[];
}

type CardInput = readonly [string, string, string, JourneyTargetKind, string, JourneyAvailability, boolean, string?];
function card([card_id, title, description, target_kind, target_key, availability, requires_run, target_fragment]: CardInput): ResearchJourneyCard {
  return { card_id, title, description, target_kind, target_key, availability, requires_run, target_fragment: target_fragment ?? null };
}
type PhaseInput = readonly [string, string, string, readonly CardInput[]];
function phase([phase_id, title, description, cards]: PhaseInput, index: number): ResearchJourneyPhase {
  return { phase_id, ordinal: index + 1, title, description, cards: cards.map(card) };
}
const S = "SHIPPED" as const;
const R = "RESEARCH_SCREEN" as const;
const E = "EXECUTION_HANDOFF" as const;
const A = "AVAILABLE" as const;
const P = "PLANNED" as const;
const D = "DEPENDENCY_REQUIRED" as const;

// Card copy and ordering follow QuantBT 00 Journey Map.dc.html, release v1.1.
// HiFi contains 28 cards (3+3+2+2+2+9+3+4), despite the older audit saying 27.
// Availability is the actual mounted-product state, not the historical HiFi href.
const phases: readonly PhaseInput[] = [
  ["access_command", "Access & command", "shipped shell — unchanged", [
    ["login", "01 · Login", "Cloudflare Zero Trust → portal credential → session", S, "portal_access", A, false],
    ["command-center", "02 · Command Center", "registry truth, priority items, module KPIs", S, "command_center", A, false],
    ["portal-map", "03 · Portal Map", "lifecycle 01→09, persona × status filters", S, "portal_map", A, false],
  ]],
  ["alpha_intake", "Alpha intake", "shipped — quarantine is fail-closed", [
    ["alpha-imports-shipped", "12 · Alpha imports", "quarantine inbox · digest verification · contract states", S, "alpha_imports_legacy", A, false],
    ["alpha-import", "Alpha Import — standardize av_", "single .py contract, 7 fail-closed gates, DRAFT→ACTIVE registry — feeds New Run Context", R, "alpha_import", A, false],
    ["alpha-version", "13 · Alpha version", "lifecycle DRAFT→LIVE · artifact identity · read-only", S, "alpha_version_legacy", A, false],
  ]],
  ["pick_run", "Pick a run", "redesign adds the evidence trail to every card", [
    ["run-library-shipped", "04 · Run Library", "shipped table: id, status, protocol, strategy", S, "run_library_legacy", A, false],
    ["run-library", "Run Library — evidence cards", "S1–S5 trail chips, cert + claim on the face, compare guarded by ComparisonContractKey", R, "run_library", A, false],
  ]],
  ["configure", "Configure — New Run, preflight first", "same frozen payload; the redesign adds the claim forecast", [
    ["new-run-shipped", "05 · New Run", "shipped 6-step form: strategy, data, windows, params, optimization, review", S, "new_run_legacy", A, false],
    ["new-run", "New Run — context · route · preflight", "binds alpha · av_ (or scratch = NOT_PUBLISHABLE), 14-route grid with per-route params, sweep/pin per param, fold-plan preview, claim forecast before compute", R, "new_run", A, false],
  ]],
  ["run", "Run it", "redesign adds the forecast claim bar + handoff into evidence", [
    ["run-progress-shipped", "06 · Run Progress", "stage pipeline, fold 1/20 timeline, per-trial console", S, "run_progress_legacy", A, true],
    ["run-progress", "Run Progress — claims pending", "same console + Gantt, plus the claim passport in forecast state — it flips to issued and hands its cursor to Evidence Flow the moment the run completes", R, "run_progress", A, true],
  ]],
  ["evidence", "Read the evidence", "the redesigned run view — one hub, one cursor, five stages", [
    ["evidence-hub", "Evidence Flow hub", "claim bar + evidence cursor over 7 stages: Summary · Split · Search · Freeze · Execute · Claim · Atlas", R, "evidence_hub", A, true],
    ["split", "S1 · Split", "fold anatomy, purge/embargo, holdout seal", R, "split", A, true],
    ["search", "S2 · Search & Selection", "search cinema, freeze line, J₁…J₅ in real math, best ≠ selected", R, "search_selection", A, true],
    ["freeze", "S3 · Freeze", "two-axis timeline, digest chain, what-if → new attempt", R, "freeze", A, true],
    ["execute-replay", "S4 · Execute Replay", "candle replay, trade tape, event ledger, MAE×MFE", R, "execute_replay", P, true],
    ["claim", "S5 · Claim (in hub)", "cert = min of caps, manifest states, window disclosure — lives inside the hub", R, "evidence_hub", A, true, "stage=claim"],
    ["attempt-lineage", "Attempt Lineage", "version ledger per av_, 52-attempt scale (probes collapsed), promotion pick", R, "attempt_lineage", P, true],
    ["engine-atlas", "Engine Atlas", "modes × routes × claims — the support matrix as a reference", R, "engine_atlas", A, false],
    ["compare", "Compare", "within one alpha: methodology trajectory, guarded by ComparisonContractKey", R, "compare_runs", P, true],
  ]],
  ["promote", "Promote", "compose rc_ → publish → Execution side approves", [
    ["release-candidate", "Release Candidate & Publish", "lineage rail alpha→av_→run→params→rc_, the 12-item R1 evidence pack, publish → approval-inbox mirror", R, "release_candidate", P, true],
    ["run-report", "Run Report — one sheet", "printable evidence artifact: claim passport, cert chain, per-fold verdict, digests — attach it to the approval", R, "run_report", P, true],
    ["paper-soon", "Paper Trading — SOON", "deployment params must equal the frozen digest, or declare a refit", S, "paper_trading", D, false],
  ]],
  ["execution", "Execution side", "reads the published record — nothing here is a research screen", [
    ["approval-inbox", "Approval Inbox", "reads the rc_ read-model · SLA · assignee pool", E, "approval_inbox", D, false],
    ["gate-r1", "Gate R1 · research evidence", "6 outcomes · conditions & waivers · expiry", E, "gate_r1", D, false],
    ["gate-r2", "Gate R2 · deployment fit", "venue, account, capital — belongs to dc_, not rc_", E, "gate_r2", D, false],
    ["execution-stages", "Paper / Sandbox / Canary / Live", "deployment params must equal the frozen digest", E, "execution_stages", D, false],
  ]],
];

export const RESEARCH_JOURNEY_DESCRIPTOR: ResearchJourneyDescriptor = Object.freeze({
  schema_version: RESEARCH_JOURNEY_SCHEMA_VERSION,
  descriptor_id: RESEARCH_JOURNEY_DESCRIPTOR_ID,
  revision: RESEARCH_JOURNEY_DESCRIPTOR_REVISION,
  phases: phases.map(phase),
  mapping: [
    { shipped: "07 · OVERVIEW", shipped_target_key: "run_overview_legacy", mine: "Evidence Flow · Summary", mine_target_key: "evidence_hub", adds: "adds window disclosure (IS/OOS/holdout), rolling Sharpe & beta, monthly heat, behavior tiles" },
    { shipped: "08 · OPTIMIZATION", shipped_target_key: "run_optimization_legacy", mine: "S2 · Search & Selection", mine_target_key: "search_selection", adds: "adds search cinema, freeze line, per-mode formulas J₁…J₅, θ* journey, 4-state OOS column" },
    { shipped: "09 · PARAMETERS", shipped_target_key: "run_parameters_legacy", mine: "S3 · Freeze", mine_target_key: "freeze", adds: "adds ordering verdict (wall clock vs data time), digest drift check, what-if as sibling attempt" },
    { shipped: "10 · EXECUTION", shipped_target_key: "run_execution_legacy", mine: "S4 · Execute Replay", mine_target_key: "execute_replay", adds: "adds event-level replay transport, causal chain per fill, route-honest not_applicable" },
    { shipped: "11 · AUDIT", shipped_target_key: "run_audit_legacy", mine: "hub S5 + Release Candidate", mine_target_key: "release_candidate", adds: "adds cert chain (min of caps), 7-state artifact manifest, report gate, promotion hooks" },
    { shipped: "— no shipped tab", shipped_target_key: "run_optimization_legacy", mine: "S1 · Split + Engine Atlas", mine_target_key: "split", adds: "fold anatomy, nested inner folds, holdout seal — and the modes × routes reference" },
  ],
});

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canonicalize).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, nested]) => JSON.stringify(key) + ":" + canonicalize(nested)).join(",") + "}";
  }
  return JSON.stringify(value);
}
export const RESEARCH_JOURNEY_DESCRIPTOR_SHA256 = createHash("sha256")
  .update(canonicalize(RESEARCH_JOURNEY_DESCRIPTOR), "utf8").digest("hex");
