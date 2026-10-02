import { describe, expect, it } from "vitest";

import {
  ResearchEvidenceCandleOverviewSchema,
  ResearchProgressEventSchema,
  ResearchProgressIngressSchema,
  ResearchProgressSnapshotSchema,
  toPublicResearchProgressEvent,
  toPublicResearchProgressSnapshot,
} from "../src/research/progress.contract";
import { ResearchProgressFanout } from "../src/research/progress.fanout";
import { ResearchProgressService } from "../src/research/progress.service";
import { VN_OBSERVED_FIXED_PROFILE_ID } from "../src/research/vn-observed-fixed.profile";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { p13EvidenceSourceFixture } from "./research-evidence.fixture";
import { p14SplitSourceFixture } from "./research-split.fixture";

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
  it("accepts VN fixed terminal split on its exact profile and never rebrands a legacy fixed source", () => {
    const split = { ...p14SplitSourceFixture(), windows: { ...p14SplitSourceFixture().windows,
      outer_oos: { ...p14SplitSourceFixture().windows.outer_oos, evaluation_state: "VN_OBSERVED_AFTER_FIXED_PROFILE" as const } } };
    const evidence = p13EvidenceSourceFixture();
    const terminal = ResearchProgressIngressSchema.parse({
      schema_version: "research.progress-ingress.v1", workspace_id: "workspace_p11",
      run_id: event.run_id, job_id: "job_p11", worker_attempt_id: event.attempt_id, lease_epoch: event.lease_epoch,
      event: { ...event, event_type: "run_completed", payload: {
        usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: 0, fd_peak: 1 },
        evidence_digest: sha256ResearchJson(evidence), split_digest: sha256ResearchJson(split) } },
      snapshot: { ...snapshot, status: "COMPLETED", readiness: { mandatory: "SEALED", optional: "NOT_APPLICABLE" } },
      evidence, split,
    });
    const service = new ResearchProgressService({} as never, {} as never, {} as never, {} as never,
      {} as never, {} as never, {} as never, {} as never) as unknown as {
      assertProfileBoundIngress: (scope: { executionProfileId: string }, input: typeof terminal) => void;
    };
    expect(() => service.assertProfileBoundIngress({ executionProfileId: VN_OBSERVED_FIXED_PROFILE_ID }, terminal)).not.toThrow();
    expect(() => service.assertProfileBoundIngress({ executionProfileId: "p04.fixed-qualification.v1" }, terminal))
      .toThrow("Research split evaluation does not match");
    const legacy = { ...terminal, split: p14SplitSourceFixture() };
    expect(() => service.assertProfileBoundIngress({ executionProfileId: VN_OBSERVED_FIXED_PROFILE_ID }, legacy))
      .toThrow("Research split evaluation does not match");
    expect(() => service.assertProfileBoundIngress({ executionProfileId: "p04.fixed-qualification.v1" }, legacy)).not.toThrow();
  });
  it("preserves repeated local trial IDs with native study identity and inner objective scope", () => {
    const trial={...event,event_type:"trial_completed",payload:{study:"PER_FOLD_STUDY",study_id:"fold_1",source_trial_id:"0",trial:4,objective:"0.3"}};
    expect(ResearchProgressEventSchema.safeParse(trial).success).toBe(true);
    expect(ResearchProgressEventSchema.safeParse({...trial,payload:{...trial.payload,study_id:undefined}}).success).toBe(false);
    const value=ResearchProgressSnapshotSchema.parse({...snapshot,folds:[{
      fold:2,state:"DONE",started_at_utc_ms:snapshot.created_at_utc_ms,completed_at_utc_ms:snapshot.created_at_utc_ms+1,
      selection:{state:"AVAILABLE",scope:"PER_FOLD_STUDY",trial:1,source_trial_id:"0",study_id:"fold_1",
        objective:"0.25",params_digest:"a".repeat(64),reason_code:null},
    }]});
    const publicValue=toPublicResearchProgressSnapshot(value,"p10.delta-signal-notional-causal-inner.v1");
    expect(publicValue.folds[0]!.selection).toMatchObject({scope:"PER_FOLD_STUDY",source_trial_id:"0",study_id:"fold_1",objective_kind:"INNER_VALIDATION_DECAY_J"});
  });
  it("accepts imported fixed selection on the durable event and snapshot without inventing an objective", () => {
    const selection = { scope: "IMPORTED_FIXED_PROFILE", trial: 1, objective: null, params_digest: "a".repeat(64) };
    const completed = { ...event, event_type: "fold_completed", payload: { fold: 1, selection } };
    expect(ResearchProgressEventSchema.safeParse(completed).success).toBe(true);
    expect(ResearchProgressEventSchema.safeParse({
      ...completed, payload: { ...completed.payload, selection: { ...selection, objective: "0.2" } },
    }).success).toBe(false);
    const sourceSnapshot = { ...snapshot, folds: [{
      fold: 1, state: "DONE", started_at_utc_ms: snapshot.created_at_utc_ms,
      completed_at_utc_ms: snapshot.created_at_utc_ms + 1,
      selection: { state: "AVAILABLE", ...selection, reason_code: null },
    }] };
    expect(ResearchProgressSnapshotSchema.safeParse(sourceSnapshot).success).toBe(true);
    expect(ResearchProgressSnapshotSchema.safeParse({ ...sourceSnapshot, folds: [{
      ...sourceSnapshot.folds[0], selection: { ...sourceSnapshot.folds[0].selection, objective: "0.2" },
    }] }).success).toBe(false);
  });

  it("accepts only a bounded contiguous E16 market overview", () => {
    const overview = {
      source_bar_count: 3,
      emitted_bucket_count: 2,
      bucket_bars: 2,
      sampling: "OHLC_BUCKET_V1" as const,
      envelope: {
        max_high: "103",
        max_high_at_utc_ms: 1_725_000_060_000,
        min_low: "98",
        min_low_at_utc_ms: 1_725_000_000_000,
      },
      values: [
        {
          first_ordinal: 0, last_ordinal: 1,
          open_utc_ms: 1_725_000_000_000, close_utc_ms: 1_725_000_060_000,
          open: "100", high: "103", low: "98", close: "102", volume: "25", transitions: 1,
        },
        {
          first_ordinal: 2, last_ordinal: 2,
          open_utc_ms: 1_725_000_120_000, close_utc_ms: 1_725_000_120_000,
          open: "102", high: "102", low: "101", close: "101", volume: null, transitions: 0,
        },
      ],
    };
    expect(ResearchEvidenceCandleOverviewSchema.safeParse(overview).success).toBe(true);
    expect(ResearchEvidenceCandleOverviewSchema.safeParse({
      ...overview,
      emitted_bucket_count: 3,
    }).success).toBe(false);
    expect(ResearchEvidenceCandleOverviewSchema.safeParse({
      ...overview,
      values: [overview.values[0], { ...overview.values[1], first_ordinal: 3 }],
    }).success).toBe(false);
    expect(ResearchEvidenceCandleOverviewSchema.safeParse({
      ...overview,
      source_bar_count: 4,
    }).success).toBe(false);
    expect(ResearchEvidenceCandleOverviewSchema.safeParse({
      ...overview,
      values: [
        overview.values[0],
        { ...overview.values[1], open_utc_ms: overview.values[0].close_utc_ms },
      ],
    }).success).toBe(false);
    expect(ResearchEvidenceCandleOverviewSchema.safeParse({
      ...overview,
      values: Array.from({ length: 13 }, (_, index) => ({
        ...overview.values[0],
        first_ordinal: index,
        last_ordinal: index,
      })),
      emitted_bucket_count: 13,
    }).success).toBe(false);
  });

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

  it("rejects terminal sidecars that bind different source transforms before either can persist", () => {
    const evidence = p13EvidenceSourceFixture();
    const split = p14SplitSourceFixture();
    const completed = {
      ...snapshot,
      status: "COMPLETED" as const,
      readiness: { mandatory: "SEALED" as const, optional: "NOT_APPLICABLE" as const },
    };
    const ingress = {
      schema_version: "research.progress-ingress.v1" as const,
      workspace_id: "workspace_p11",
      run_id: event.run_id,
      job_id: "job_p11",
      worker_attempt_id: event.attempt_id,
      lease_epoch: event.lease_epoch,
      event: {
        ...event,
        event_type: "run_completed" as const,
        payload: {
          usage: { peak_rss_bytes: 1, cpu_seconds: 1, scratch_bytes: 0, fd_peak: 1 },
          evidence_digest: sha256ResearchJson(evidence),
          split_digest: sha256ResearchJson(split),
        },
      },
      snapshot: completed,
      evidence,
      split,
    };
    expect(ResearchProgressIngressSchema.safeParse(ingress).success).toBe(true);
    const mismatchedSplit = { ...split, source: { ...split.source, source_transform_digest: "b".repeat(64) } };
    expect(ResearchProgressIngressSchema.safeParse({
      ...ingress,
      event: { ...ingress.event, payload: { ...ingress.event.payload, split_digest: sha256ResearchJson(mismatchedSplit) } },
      split: mismatchedSplit,
    }).success).toBe(false);
  });
});
