import { createHash } from "node:crypto";

/**
 * P09's compact, presentation-neutral Journey source.
 *
 * The database pins the descriptor identity, revision and SHA-256.  This
 * checked-in source remains deliberately free of React/HTML so the server
 * can expose one exact DTO to any same-origin product surface without giving
 * a browser permission to invent routes or lifecycle states.
 */
export const RESEARCH_JOURNEY_DESCRIPTOR_ID = "quantbt_journey";
export const RESEARCH_JOURNEY_SCHEMA_VERSION = "research.journey.v1";
export const RESEARCH_JOURNEY_DESCRIPTOR_REVISION = 1;

export type JourneyTargetKind = "SHIPPED" | "RESEARCH_SCREEN" | "EXECUTION_HANDOFF";

export interface ResearchJourneyCard {
  card_id: string;
  title: string;
  description: string;
  target_kind: JourneyTargetKind;
  target_key: string;
  availability: "AVAILABLE" | "PLANNED" | "DEPENDENCY_REQUIRED";
}

export interface ResearchJourneyPhase {
  phase_id: string;
  ordinal: number;
  title: string;
  description: string;
  cards: readonly ResearchJourneyCard[];
}

export interface ResearchJourneyDescriptor {
  schema_version: typeof RESEARCH_JOURNEY_SCHEMA_VERSION;
  descriptor_id: typeof RESEARCH_JOURNEY_DESCRIPTOR_ID;
  revision: typeof RESEARCH_JOURNEY_DESCRIPTOR_REVISION;
  phases: readonly ResearchJourneyPhase[];
}

const JOURNEY_DESCRIPTOR = {
  schema_version: RESEARCH_JOURNEY_SCHEMA_VERSION,
  descriptor_id: RESEARCH_JOURNEY_DESCRIPTOR_ID,
  revision: RESEARCH_JOURNEY_DESCRIPTOR_REVISION,
  phases: Object.freeze<ResearchJourneyPhase[]>([
    {
      phase_id: "access_command", ordinal: 1, title: "Access & command",
      description: "Start from the existing Portal workspace and command surface.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "portal-access", title: "Portal access", description: "Workspace-scoped Portal session and permissions.", target_kind: "SHIPPED", target_key: "portal_access", availability: "AVAILABLE" },
        { card_id: "command-center", title: "Command Center", description: "Existing operational command and audit entry point.", target_kind: "SHIPPED", target_key: "command_center", availability: "AVAILABLE" },
      ]),
    },
    {
      phase_id: "define", ordinal: 2, title: "Define",
      description: "Bind an immutable AlphaVersion and declare a research run.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "alpha-import", title: "Import Alpha", description: "Parse, gate and register one immutable AlphaVersion.", target_kind: "RESEARCH_SCREEN", target_key: "alpha_import", availability: "AVAILABLE" },
        { card_id: "new-run", title: "New Run", description: "Create a compatible requested specification after P10 admission.", target_kind: "RESEARCH_SCREEN", target_key: "new_run", availability: "PLANNED" },
      ]),
    },
    {
      phase_id: "execute", ordinal: 3, title: "Execute",
      description: "Observe durable run progress without treating a browser as a worker.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "run-progress", title: "Run Progress", description: "Durable run and child-work lifecycle.", target_kind: "RESEARCH_SCREEN", target_key: "run_progress", availability: "PLANNED" },
        { card_id: "research-console", title: "Research Console", description: "Bounded logs and artifact readiness.", target_kind: "RESEARCH_SCREEN", target_key: "research_console", availability: "PLANNED" },
      ]),
    },
    {
      phase_id: "inspect", ordinal: 4, title: "Inspect",
      description: "Inspect trials, folds and replay references through an opaque cursor.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "trial-review", title: "Trial Review", description: "Study-scoped trial and fold inspection.", target_kind: "RESEARCH_SCREEN", target_key: "trial_review", availability: "PLANNED" },
        { card_id: "trade-replay", title: "Trade Replay", description: "Evidence-backed replay when its retained source is available.", target_kind: "RESEARCH_SCREEN", target_key: "trade_replay", availability: "DEPENDENCY_REQUIRED" },
      ]),
    },
    {
      phase_id: "evidence", ordinal: 5, title: "Evidence",
      description: "Review immutable data, effective specification and evidence boundaries.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "preflight", title: "Data Preflight", description: "Immutable requested/effective/data manifest metadata.", target_kind: "RESEARCH_SCREEN", target_key: "preflight", availability: "AVAILABLE" },
        { card_id: "evidence-pack", title: "Evidence Pack", description: "Sealed artifacts and explicit completeness states.", target_kind: "RESEARCH_SCREEN", target_key: "evidence_pack", availability: "PLANNED" },
      ]),
    },
    {
      phase_id: "compare", ordinal: 6, title: "Compare",
      description: "Compare valid, scoped evidence without synthetic history.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "comparison", title: "Compare Runs", description: "Compare selected run evidence and declared differences.", target_kind: "RESEARCH_SCREEN", target_key: "compare_runs", availability: "PLANNED" },
      ]),
    },
    {
      phase_id: "release", ordinal: 7, title: "Release",
      description: "Prepare a release candidate only from admitted evidence.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "release-candidate", title: "Release Candidate", description: "Governed release-candidate preparation and review.", target_kind: "RESEARCH_SCREEN", target_key: "release_candidate", availability: "PLANNED" },
        { card_id: "execution-handoff", title: "Execution Handoff", description: "Explicit handoff into the unchanged Execution governance path.", target_kind: "EXECUTION_HANDOFF", target_key: "execution_governance", availability: "DEPENDENCY_REQUIRED" },
      ]),
    },
    {
      phase_id: "reference", ordinal: 8, title: "Reference",
      description: "Use the manifest-driven Engine Atlas as the source of route and mode facts.",
      cards: Object.freeze<ResearchJourneyCard[]>([
        { card_id: "engine-atlas", title: "Engine Atlas", description: "Current and retained historical QuantBT release capabilities.", target_kind: "RESEARCH_SCREEN", target_key: "engine_atlas", availability: "AVAILABLE" },
      ]),
    },
  ]),
} as const satisfies ResearchJourneyDescriptor;

export const RESEARCH_JOURNEY_DESCRIPTOR: ResearchJourneyDescriptor = Object.freeze(JOURNEY_DESCRIPTOR);

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalize(nested)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export const RESEARCH_JOURNEY_DESCRIPTOR_SHA256 = createHash("sha256")
  .update(canonicalize(RESEARCH_JOURNEY_DESCRIPTOR), "utf8")
  .digest("hex");
