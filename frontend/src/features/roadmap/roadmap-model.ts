import { ROADMAP_PHASES_SEED, type SeedPhase } from "@/content/seed";

export const PHASE_TONES = ["blue", "teal", "purple", "indigo", "orange", "red", "cyan"] as const;
export type PhaseTone = (typeof PHASE_TONES)[number];

export interface RoadmapPhase {
  id: string;
  name: string;
  start: number;
  end: number;
  owner: string;
  tone: PhaseTone;
  outcome: string;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function boundedWeek(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(24, Math.round(numeric)));
}

function isTone(value: string): value is PhaseTone {
  return (PHASE_TONES as readonly string[]).includes(value);
}

/** Normalizes legacy/API records while retaining the Phase-1 storage shape. */
export function normalisePhase(value: Record<string, unknown>, fallbackId = "P0"): RoadmapPhase {
  const start = boundedWeek(value.start, 1);
  const end = Math.max(start, boundedWeek(value.end, start));
  const tone = stringValue(value.tone, "blue");
  return {
    id: stringValue(value.id, fallbackId),
    name: stringValue(value.name, "Unnamed phase"),
    start,
    end,
    owner: stringValue(value.owner),
    tone: isTone(tone) ? tone : "blue",
    outcome: stringValue(value.outcome),
  };
}

export function normalisePhases(items: Record<string, unknown>[]): RoadmapPhase[] {
  return items.map((item, index) => normalisePhase(item, `P${index}`)).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}

export function cloneRoadmapSeeds(seed: SeedPhase[] = ROADMAP_PHASES_SEED): RoadmapPhase[] {
  return normalisePhases(seed.map((phase) => ({ ...phase })));
}

export function nextPhaseId(phases: RoadmapPhase[]): string {
  const largest = phases.reduce((max, phase) => {
    const match = /^P(\d+)$/.exec(phase.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, -1);
  return `P${largest + 1}`;
}

export function phaseDraft(phases: RoadmapPhase[]): RoadmapPhase {
  return {
    id: nextPhaseId(phases),
    name: "New phase",
    start: 1,
    end: 2,
    owner: "",
    tone: "blue",
    outcome: "",
  };
}

export function replacePhase(phases: RoadmapPhase[], next: RoadmapPhase, previousId = next.id): RoadmapPhase[] {
  const index = phases.findIndex((phase) => phase.id === previousId);
  const updated = index < 0 ? [...phases, next] : phases.map((phase) => (phase.id === previousId ? next : phase));
  return [...updated].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
