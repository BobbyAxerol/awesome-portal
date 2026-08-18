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

/** Inclusive week count of a phase; a one-week phase spans 1, not 0. */
export function phaseWeeks(phase: RoadmapPhase): number {
  return phase.end - phase.start + 1;
}

/** Last week any phase reaches — the width the timeline axis has to cover. */
export function programHorizon(phases: RoadmapPhase[]): number {
  return phases.reduce((max, phase) => Math.max(max, phase.end), 0);
}

export interface PhaseProgress {
  total: number;
  done: number;
}

/**
 * Delivery progress of a phase, counted from real tasks.
 *
 * Returns `null` when no task is assigned to the phase. That is deliberately
 * NOT `{total: 0, done: 0}`: "no tasks planned yet" and "0 of 12 done" are
 * different facts, and rendering the first as 0% would be the "0 from null"
 * the display contract forbids.
 */
export function phaseProgress(
  phaseId: string,
  tasks: readonly { phase: string; status: string }[],
): PhaseProgress | null {
  const inPhase = tasks.filter((task) => task.phase.trim() === phaseId);
  if (!inPhase.length) return null;
  return { total: inPhase.length, done: inPhase.filter((task) => task.status === "Done").length };
}

/**
 * Phases whose spans overlap the given phase.
 *
 * The roadmap's real risk is concurrency, not sequence: P3 starting inside P2
 * is what makes a week expensive. Surfacing it is a read of existing data, not
 * a new planning model.
 */
export function concurrentPhases(phase: RoadmapPhase, phases: RoadmapPhase[]): RoadmapPhase[] {
  return phases.filter(
    (other) => other.id !== phase.id && other.start <= phase.end && phase.start <= other.end,
  );
}

export function replacePhase(phases: RoadmapPhase[], next: RoadmapPhase, previousId = next.id): RoadmapPhase[] {
  const index = phases.findIndex((phase) => phase.id === previousId);
  const updated = index < 0 ? [...phases, next] : phases.map((phase) => (phase.id === previousId ? next : phase));
  return [...updated].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
