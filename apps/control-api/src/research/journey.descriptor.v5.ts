import { createHash } from "node:crypto";

import {
  RESEARCH_JOURNEY_DESCRIPTOR as previous,
  RESEARCH_JOURNEY_DESCRIPTOR_ID,
  RESEARCH_JOURNEY_SCHEMA_VERSION,
  type ResearchJourneyDescriptorV4,
} from "./journey.descriptor.v4";

export { RESEARCH_JOURNEY_DESCRIPTOR_ID, RESEARCH_JOURNEY_SCHEMA_VERSION };
export const RESEARCH_JOURNEY_DESCRIPTOR_REVISION = 5;
export type ResearchJourneyDescriptorV5 = Omit<ResearchJourneyDescriptorV4, "revision"> & {
  revision: typeof RESEARCH_JOURNEY_DESCRIPTOR_REVISION;
};

// V3/V4 remain immutable. These four older cards now open the same accepted
// product screens as their redesigned counterparts; no route or permission is
// inferred from AVAILABLE. Alpha Version still uses its declared alpha scope,
// and the historical mapping keys remain comparison metadata, not raw URLs.
const canonicalTarget: Readonly<Record<string, string>> = {
  "alpha-imports-shipped": "alpha_import",
  "run-library-shipped": "run_library",
  "new-run-shipped": "new_run",
  "run-progress-shipped": "run_progress",
};
const cardDescription: Readonly<Record<string, string>> = {
  "run-library-shipped": "Run Library: identity, lifecycle, profile and retained evidence",
  "new-run-shipped": "New Run: context, specification, preflight and admitted execution",
  "run-progress-shipped": "Run Progress: source-published status, folds and console",
};
const phaseDescription: Readonly<Record<string, string>> = {
  access_command: "Portal access and command — unchanged",
  alpha_intake: "Quarantine and immutable Alpha versions — fail-closed",
};

export const RESEARCH_JOURNEY_DESCRIPTOR: ResearchJourneyDescriptorV5 = Object.freeze({
  ...previous,
  revision: RESEARCH_JOURNEY_DESCRIPTOR_REVISION,
  phases: previous.phases.map((phase) => ({
    ...phase,
    description: phaseDescription[phase.phase_id] ?? phase.description,
    cards: phase.cards.map((card) => ({
      ...card,
      description: cardDescription[card.card_id] ?? card.description,
      target_key: canonicalTarget[card.card_id] ?? card.target_key,
    })),
  })),
  mapping: previous.mapping.map((row) => ({
    ...row,
    shipped: row.shipped === "— no shipped tab" ? "— no previous tab" : row.shipped,
  })),
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
