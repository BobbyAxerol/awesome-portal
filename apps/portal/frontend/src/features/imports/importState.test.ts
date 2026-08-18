/**
 * Alpha import state tests (U14).
 *
 * The failure mode this guards is a screen that lets a quarantined alpha read
 * as approved. Quarantine is fail-closed: a clean digest earns a place in the
 * queue, nothing more.
 */
import { describe, expect, it } from "vitest";

import type { AlphaImportRecord } from "../../portal/contracts";
import {
  IMPORT_STATES,
  importCounts,
  importStatePresentation,
  isRunnable,
  newestFirst,
} from "./importState";

function record(overrides: Partial<AlphaImportRecord> = {}): AlphaImportRecord {
  return {
    alpha_id: "delta-rsi-polynomial",
    version: "1.0.0",
    import_id: "imp-1",
    state: "QUARANTINED",
    digest_ok: true,
    received_at: "2026-08-17T10:00:00+00:00",
    reason: null,
    ...overrides,
  };
}

describe("state presentation", () => {
  it("covers every state the contract declares", () => {
    // A declared state we do not render would be a blank row the day the
    // backend starts writing it.
    const declared: AlphaImportRecord["state"][] = [
      "PENDING_DIGEST",
      "DIGEST_MISMATCH",
      "INVALID_MANIFEST",
      "ALREADY_REGISTERED",
      "QUARANTINED",
    ];
    expect(new Set(IMPORT_STATES)).toEqual(new Set(declared));
    for (const state of declared) {
      const presentation = importStatePresentation(state);
      expect(presentation.label, state).toBeTruthy();
      expect(presentation.meaning.length, state).toBeGreaterThan(30);
    }
  });

  it("gives each state a distinct label", () => {
    const labels = IMPORT_STATES.map((state) => importStatePresentation(state).label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never presents a quarantined import as good", () => {
    // `degraded`, not `available`: the digest matched, the alpha still cannot run.
    expect(importStatePresentation("QUARANTINED").tone).toBe("degraded");
    expect(importStatePresentation("QUARANTINED").meaning).toMatch(/cannot run until/);
  });

  it("marks a rejection as denied, not merely unavailable", () => {
    expect(importStatePresentation("DIGEST_MISMATCH").tone).toBe("denied");
  });

  it("records which states the service actually persists", () => {
    // Only these two are written; the rest are rejection responses, so the
    // screen must not promise they will appear in the inbox.
    expect(importStatePresentation("QUARANTINED").persisted).toBe(true);
    expect(importStatePresentation("DIGEST_MISMATCH").persisted).toBe(true);
    for (const state of ["INVALID_MANIFEST", "ALREADY_REGISTERED", "PENDING_DIGEST"] as const) {
      expect(importStatePresentation(state).persisted, state).toBe(false);
    }
  });

  it("describes an unknown state without inventing a meaning", () => {
    const presentation = importStatePresentation("SOMETHING_NEW" as AlphaImportRecord["state"]);
    expect(presentation.label).toBe("SOMETHING_NEW");
    expect(presentation.meaning).toMatch(/no meaning is inferred/);
  });
});

describe("runnability", () => {
  it("is never true for any import state", () => {
    expect(isRunnable()).toBe(false);
  });
});

describe("counts and ordering", () => {
  it("counts by state without inventing zero buckets", () => {
    const counts = importCounts([record(), record({ import_id: "imp-2", state: "DIGEST_MISMATCH", digest_ok: false })]);
    expect(counts.total).toBe(2);
    expect(counts.byState.QUARANTINED).toBe(1);
    expect(counts.byState.DIGEST_MISMATCH).toBe(1);
    expect(counts.byState.PENDING_DIGEST).toBeUndefined();
  });

  it("reports an empty inbox as zero total", () => {
    expect(importCounts([])).toEqual({ total: 0, byState: {} });
  });

  it("orders newest first regardless of response order", () => {
    const ordered = newestFirst([
      record({ import_id: "old", received_at: "2026-08-01T00:00:00+00:00" }),
      record({ import_id: "new", received_at: "2026-08-17T00:00:00+00:00" }),
    ]);
    expect(ordered.map((item) => item.import_id)).toEqual(["new", "old"]);
  });

  it("does not mutate the caller's array", () => {
    const input = [record({ import_id: "a", received_at: "2026-08-01T00:00:00+00:00" }), record({ import_id: "b" })];
    newestFirst(input);
    expect(input.map((item) => item.import_id)).toEqual(["a", "b"]);
  });
});
