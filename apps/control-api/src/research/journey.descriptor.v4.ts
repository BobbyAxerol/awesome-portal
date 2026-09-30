import { createHash } from "node:crypto";

import {
  RESEARCH_JOURNEY_DESCRIPTOR as previous,
  RESEARCH_JOURNEY_DESCRIPTOR_ID,
  RESEARCH_JOURNEY_SCHEMA_VERSION,
  type ResearchJourneyCard,
  type ResearchJourneyPhase,
} from "./journey.descriptor.v3";

export { RESEARCH_JOURNEY_DESCRIPTOR_ID, RESEARCH_JOURNEY_SCHEMA_VERSION };
export const RESEARCH_JOURNEY_DESCRIPTOR_REVISION = 4;

export type ResearchJourneyCardV4 = ResearchJourneyCard & { requires_alpha: boolean };
export type ResearchJourneyPhaseV4 = Omit<ResearchJourneyPhase, "cards"> & {
  cards: readonly ResearchJourneyCardV4[];
};
export type ResearchJourneyDescriptorV4 = Omit<typeof previous, "revision" | "phases"> & {
  revision: typeof RESEARCH_JOURNEY_DESCRIPTOR_REVISION;
  phases: readonly ResearchJourneyPhaseV4[];
};

// Revision 3 is immutable; only Alpha Version requires an alpha rather than a run.
export const RESEARCH_JOURNEY_DESCRIPTOR: ResearchJourneyDescriptorV4 = {
  ...previous,
  revision: RESEARCH_JOURNEY_DESCRIPTOR_REVISION,
  phases: previous.phases.map((phase) => ({
    ...phase,
    cards: phase.cards.map((card) => ({
      ...card,
      requires_alpha: card.card_id === "alpha-version",
    })),
  })),
};

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
