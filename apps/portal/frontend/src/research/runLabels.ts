/**
 * D1 — the short run label (`R-WFO-118`), shared by every screen.
 *
 * The hi-fi names a run `R-WFO-118` in the page breadcrumb, the Screen-09
 * title, the Screen-10/11/13 cards and the shell topbar; the wire identity is
 * a 37-character `rrun_<32 hex>` that breaks all of them. The server derives
 * the label (`display_label`) — the browser must never number runs itself,
 * because two readers with different pages would then print different numbers
 * for the same run.
 *
 * This module is the one place the browser remembers what the server said.
 * It is a module-level registry rather than a React context on purpose:
 *
 *  - `ShortId` renders deep inside a dozen screens that must not be edited to
 *    thread a prop or a provider through;
 *  - unit tests mount those screens with no shell around them, and a context
 *    they cannot see would make the label untestable exactly where it matters.
 *
 * Nothing is inferred here. A label is remembered only when a read published
 * one, `null` is remembered as "the server says this run has no label", and an
 * id nobody has published for is simply unknown — the caller then prints the
 * short id, which is honest, where an invented number would not be.
 */

import { useSyncExternalStore } from "react";

import { shortId } from "./researchFormat";

/** runId -> the server's label, or `null` when the server published none. */
const labels = new Map<string, string | null>();
const listeners = new Set<() => void>();

function announce(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The shape every read that carries a run identity already has. */
export interface RunLabelBearer {
  run_id?: string | null;
  display_label?: string | null;
}

/**
 * Remember one run's label.
 *
 * Writing the same value again is a no-op, so a poll that re-reads the same
 * run every few seconds does not re-render every id on the page.
 */
export function rememberRunLabel(
  runId: string | null | undefined,
  label: string | null | undefined,
): void {
  if (typeof runId !== "string" || runId.length === 0) return;
  const value = typeof label === "string" && label.length > 0 ? label : null;
  if (labels.has(runId) && labels.get(runId) === value) return;
  labels.set(runId, value);
  announce();
}

/** Remember every labelled run in a list read, in one notification. */
export function rememberRunLabels(rows: readonly RunLabelBearer[] | null | undefined): void {
  if (!rows) return;
  let changed = false;
  for (const row of rows) {
    const runId = row?.run_id;
    if (typeof runId !== "string" || runId.length === 0) continue;
    const label = typeof row.display_label === "string" && row.display_label.length > 0
      ? row.display_label
      : null;
    if (labels.has(runId) && labels.get(runId) === label) continue;
    labels.set(runId, label);
    changed = true;
  }
  if (changed) announce();
}

/**
 * The label known for an id, or `null`.
 *
 * `null` covers both "no read has published this id yet" and "the server said
 * this run has no label": the caller's answer is the same in both cases — show
 * the short id — and collapsing them keeps callers from inventing a third.
 */
export function runLabelFor(id: string | null | undefined): string | null {
  if (typeof id !== "string") return null;
  return labels.get(id) ?? null;
}

/** Whether any read has told the registry about this id: a label, or that the run has none. */
export function runLabelKnown(id: string | null | undefined): boolean {
  return typeof id === "string" && labels.has(id);
}

/**
 * How a screen that prints an id as plain text (not through `ShortId`) should
 * write a RUN id: the server's label when a read has published one, else the
 * short id every screen already used.
 *
 * It is a plain read, not a subscription, so it belongs at a print site that
 * re-renders when the read that fed the registry lands — which is every screen
 * that takes the label from its own read. The registry is keyed by run id, so
 * an attempt id, a digest or an alpha version passed through here comes back
 * exactly as `shortId` wrote it (asserted in `runLabels.test.tsx`).
 */
export function runLabelOrShortId(id: string | null | undefined): string | null {
  return runLabelFor(id) ?? shortId(id);
}

/** Test seam: the registry outlives a render, so a test must be able to clear it. */
export function forgetRunLabels(): void {
  if (labels.size === 0) return;
  labels.clear();
  announce();
}

/** Subscribe a component to one id's label. */
export function useRunLabel(id: string | null | undefined): string | null {
  return useSyncExternalStore(
    subscribe,
    () => runLabelFor(id),
    () => null,
  );
}
