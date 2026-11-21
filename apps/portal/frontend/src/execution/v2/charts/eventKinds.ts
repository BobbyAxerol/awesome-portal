import type { EventKind } from "./types";

export const EVENT_KINDS: readonly EventKind[] = ["stage", "decision", "incident", "recall", "flow"];

export interface EventKindSpec {
  readonly label: string;
  /** A different shape per kind, so colour is never the only cue. */
  readonly glyph: string;
}

export const EVENT_KIND_TABLE: Readonly<Record<EventKind, EventKindSpec>> = {
  stage: { label: "Stage", glyph: "→" },
  decision: { label: "Decision", glyph: "◈" },
  incident: { label: "Incident", glyph: "▲" },
  recall: { label: "Recall", glyph: "↩" },
  flow: { label: "Flow", glyph: "+" },
};
