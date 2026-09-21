import { describe, expect, it } from "vitest";

import {
  ResearchProgressEventSchema,
  ResearchProgressSnapshotSchema,
  toPublicResearchProgressEvent,
  toPublicResearchProgressSnapshot,
} from "../src/research/progress.contract";
import { ResearchProgressFanout } from "../src/research/progress.fanout";

const event = {
  schema_version: "research.progress-event.v1" as const,
  run_id: "run_p11",
  attempt_id: "ra_p11",
  lease_epoch: 3,
  sequence: 1,
  event_type: "run_started" as const,
  occurred_at_utc_ms: 1_725_000_000_000,
  payload: {},
};

const snapshot = {
  schema_version: "research.progress-snapshot.v1" as const,
  run_id: "run_p11",
  attempt_id: "ra_p11",
  lease_epoch: 3,
  status: "RUNNING" as const,
  created_at_utc_ms: 1_725_000_000_000,
  updated_at_utc_ms: 1_725_000_000_000,
  latest_sequence: 1,
  retention_floor_sequence: 0,
  stages: ["S1", "S2", "S3", "S4", "S5"].map((key) => ({
    key,
    state: key === "S1" ? "RUNNING" : "PENDING",
    started_at_utc_ms: key === "S1" ? 1_725_000_000_000 : null,
    completed_at_utc_ms: null,
  })),
  overall: { pct: 0, elapsed_s: 0, eta_s: null, trials_done: 0, trials_declared: 1, tqdm_line: "queued" },
  budget: { used: "0", cap: null, unit: "core-min" as const, pct: 0 },
  folds: [],
  artifacts: [],
  claim: {
    state: "FORECAST" as const,
    text: "not issued",
    cursor: null,
    methodology_certificate: {
      state: "NOT_PUBLISHED" as const,
      grade: null,
      issued_at_utc_ms: null,
      reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE" as const,
    },
  },
  readiness: { mandatory: "PENDING" as const, optional: "NOT_APPLICABLE" as const },
  failure: null,
  source: { kind: "DURABLE_P10" as const, coverage: "ACTUAL_HOOKS" as const, partial: false },
};

describe("P11 progress contracts", () => {
  it("keeps fence fields server-only in every public projection", () => {
    const parsedEvent = ResearchProgressEventSchema.parse(event);
    const parsedSnapshot = ResearchProgressSnapshotSchema.parse(snapshot);
    const publicEvent = toPublicResearchProgressEvent(parsedEvent);
    const publicSnapshot = toPublicResearchProgressSnapshot(parsedSnapshot);
    expect(publicEvent).not.toHaveProperty("attempt_id");
    expect(publicEvent).not.toHaveProperty("lease_epoch");
    expect(publicSnapshot).not.toHaveProperty("attempt_id");
    expect(publicSnapshot).not.toHaveProperty("lease_epoch");
    expect(publicSnapshot.latest_sequence).toBe(1);
  });

  it("normalizes a pre-amendment source snapshot to typed absence during a rolling deploy", () => {
    const legacy = JSON.parse(JSON.stringify({
      ...snapshot,
      folds: [{
        fold: 1,
        state: "DONE",
        started_at_utc_ms: 1_725_000_000_000,
        completed_at_utc_ms: 1_725_000_000_001,
      }],
      claim: {
        state: "NOT_ISSUED",
        text: "legacy source did not publish a certificate",
        cursor: null,
      },
    }));
    const parsed = ResearchProgressSnapshotSchema.parse(legacy);
    expect(parsed.folds[0].fold_timeline).toEqual({
      state: "NOT_PUBLISHED",
      reason_code: "SOURCE_DID_NOT_PUBLISH_PER_FOLD_SEGMENT_FACTS",
      segments: [],
    });
    expect(parsed.claim.methodology_certificate).toEqual({
      state: "NOT_PUBLISHED",
      grade: null,
      issued_at_utc_ms: null,
      reason_code: "SOURCE_DID_NOT_PUBLISH_METHODOLOGY_CERTIFICATE",
    });
  });

  it("rejects unknown source payloads and a terminal event without exact usage", () => {
    expect(ResearchProgressEventSchema.safeParse({ ...event, payload: { source_path: "/private" } }).success).toBe(false);
    expect(ResearchProgressEventSchema.safeParse({
      ...event,
      event_type: "run_completed",
      payload: {},
    }).success).toBe(false);
    expect(ResearchProgressEventSchema.safeParse({
      ...event,
      event_type: "artifact_sealed",
      payload: {
        name: "research/private.json", size: "1", digest: "a".repeat(64),
        reader_href: "/internal/worker/private.json",
      },
    }).success).toBe(false);
  });

  it("requires source facts for detailed folds and methodology certificates", () => {
    const segment = {
      ...event,
      event_type: "fold_segment_observed" as const,
      payload: {
        fold: 1,
        kind: "search" as const,
        state: "DONE" as const,
        started_at_utc_ms: 1_725_000_000_000,
        completed_at_utc_ms: 1_725_000_000_001,
      },
    };
    expect(ResearchProgressEventSchema.safeParse(segment).success).toBe(true);
    expect(ResearchProgressEventSchema.safeParse({
      ...segment,
      payload: { ...segment.payload, completed_at_utc_ms: null },
    }).success).toBe(false);

    const issued = {
      state: "ISSUED" as const,
      text: "STRICT_OUTER_OOS_AFTER_FROZEN_SELECTION",
      cursor: "cursor_1",
      methodology_certificate: {
        state: "ISSUED" as const,
        grade: "B" as const,
        issued_at_utc_ms: 1_725_000_000_002,
        reason_code: null,
      },
    };
    expect(ResearchProgressEventSchema.safeParse({
      ...event,
      event_type: "run_completed",
      payload: {
        usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: 0, fd_peak: 1 },
        claim: issued,
      },
    }).success).toBe(true);
    expect(ResearchProgressEventSchema.safeParse({
      ...event,
      event_type: "run_completed",
      payload: {
        usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: 0, fd_peak: 1 },
        claim: { ...issued, methodology_certificate: { ...issued.methodology_certificate, grade: null } },
      },
    }).success).toBe(false);
  });

  it("keeps the compact snapshot below the bounded transport/database budget", () => {
    const oversized = {
      ...snapshot,
      artifacts: Array.from({ length: 128 }, (_, index) => ({
        name: `artifact-${index}-${"n".repeat(240)}`,
        state: "SEALED" as const,
        size: "1",
        digest: "a".repeat(64),
        // UTF-8 bytes are what cross the private relay and PostgreSQL, not a
        // JavaScript character count. The public contract must reject this
        // before an oversized snapshot reaches a viewer or database row.
        reader_href: "🧱".repeat(512),
      })),
    };
    expect(ResearchProgressSnapshotSchema.safeParse(oversized).success).toBe(false);
  });

  it("bounds a live run to twenty in-process viewers and releases them", () => {
    const fanout = new ResearchProgressFanout();
    const unsubs = Array.from({ length: 20 }, () => fanout.subscribe("run_p11", () => undefined));
    expect(fanout.diagnostics("run_p11")).toEqual({ active_viewers: 20, maximum_viewers: 20 });
    expect(() => fanout.subscribe("run_p11", () => undefined)).toThrow(/bounded viewer limit/);
    for (const unsubscribe of unsubs) unsubscribe();
    expect(fanout.diagnostics("run_p11")).toEqual({ active_viewers: 0, maximum_viewers: 20 });
  });
});
