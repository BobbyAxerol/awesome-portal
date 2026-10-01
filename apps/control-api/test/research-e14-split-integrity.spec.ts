/**
 * E14 · Screen 05 (HiFi audit 5.11, 5.12): the boundary-integrity gap scan
 * and the stitched OOS provenance of the retained split read.
 *
 * Fixtures: the W5b real signal-notional WFO seal (QuantBT 1.1.1, 2 outer
 * folds, one carry_position boundary with gap 0 bars, 336 stitched OOS
 * observations) and the W3 real WFO seal, which predates the W5b replay
 * ledger and must therefore publish two typed absences, never a zero.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { gunzipSync } from "node:zlib";
import { describe, expect, it, vi } from "vitest";

import {
  ResearchCurrentSourceSplitResponseSchema,
  type ResearchCurrentSourceNotApplicableResponse,
  type ResearchCurrentSourceSplitResponse,
} from "../src/research/current-source.contract";
import type { CurrentSourceSealRow, CurrentSourceStoredRow } from "../src/research/current-source.repository";
import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import {
  GAP_SCAN_BASIS,
  SPLIT_INTEGRITY_REASONS,
  STITCH_CHECK_REASONS,
  STITCH_DIGEST_BASIS,
  checkAgainstFoldPlan,
} from "../src/research/current-source-split-integrity";
import { openApiValidator } from "./research-rf05-openapi";

type Kind = "OBSERVATION" | "FOLD" | "TRIAL" | "CANDIDATE" | "SELECTION";
interface Fixture {
  run_id: string;
  table_rows: Record<Kind, number>;
  manifest_digest: string;
  source_transform_digest: string;
  summary: Record<string, any>;
  rows: Record<Kind, CurrentSourceStoredRow[]>;
}

const w5b = JSON.parse(gunzipSync(readFileSync(join(__dirname, "research-w5b-real-replay.fixture.json.gz"))).toString("utf8")) as Fixture;
const w3 = JSON.parse(readFileSync(join(__dirname, "research-w3-real-hmd-seal.fixture.json"), "utf8")) as Fixture;
const scope = { workspaceId: "ws-e14", actorUserId: "usr-e14" };
const config = {
  FEATURE_RESEARCH_CURRENT_SOURCE: "true",
  QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
  QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
  QUERY_CURSOR_TTL_SECONDS: 900,
};
const splitValidator = openApiValidator("research-current-source.openapi.json", "Split");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function serviceFor(fixture: Fixture) {
  const seal: CurrentSourceSealRow = {
    runId: fixture.run_id,
    artifactRevision: 1,
    sourceAdapterId: "rs02.quantbt-signal-notional-wfo.v1",
    profileId: "rs02.delta-signal-notional-wfo.v1",
    manifestDigest: fixture.manifest_digest,
    sourceTransformDigest: fixture.source_transform_digest,
    retainedImportDigest: "f".repeat(64),
    requestedSpecDigest: "1".repeat(64),
    effectiveSpecDigest: "2".repeat(64),
    datasetBindingDigest: "3".repeat(64),
    tableRows: fixture.table_rows,
    totalRows: Object.values(fixture.table_rows).reduce((sum, n) => sum + n, 0),
    summary: fixture.summary,
    retainedAtUtcMs: 1_790_269_236_911,
  };
  const sorted = (kind: Kind) => [...(fixture.rows[kind] ?? [])].sort((a, b) => a.sourceOrdinal - b.sourceOrdinal);
  const repository = {
    sealForRead: vi.fn().mockResolvedValue(seal),
    runState: vi.fn(),
    poolFrozenAt: vi.fn().mockResolvedValue(null),
    rows: vi.fn(async (_s: unknown, _r: string, _v: number, kind: Kind, selection: { limit: number }) => {
      const all = sorted(kind);
      return { rows: all.slice(0, selection.limit), hasMore: all.length > selection.limit, hasPrevious: false, totalRows: all.length };
    }),
    verifyRetainedImport: vi.fn().mockResolvedValue("f".repeat(64)),
  };
  return new ResearchCurrentSourceService(repository as never, config as never);
}

async function split(fixture: Fixture): Promise<ResearchCurrentSourceSplitResponse> {
  const value = (await serviceFor(fixture).split(scope, fixture.run_id)) as
    | ResearchCurrentSourceSplitResponse
    | ResearchCurrentSourceNotApplicableResponse;
  expect(value.schema_version).toBe("research.current-source-split.v1");
  expect(ResearchCurrentSourceSplitResponseSchema.safeParse(value).success).toBe(true);
  splitValidator.assert(value);
  return value as ResearchCurrentSourceSplitResponse;
}

/** A copy of `fixture` whose sealed replay summary is changed by `patch`. */
function withReplay(fixture: Fixture, patch: (replay: Record<string, any>) => void): Fixture {
  const next = clone(fixture);
  patch(next.summary.replay);
  return next;
}

describe("E14 · 5.11 the boundary-integrity gap scan on the retained split", () => {
  it("W5b real seal: QuantBT's one carry_position crossing, measured at 0 bars, over the 1 crossing the retained fold plan has", async () => {
    const body = await split(w5b);
    expect(body.gap_scan.state).toBe("AVAILABLE");
    expect(body.gap_scan.basis).toBe(GAP_SCAN_BASIS);
    expect(body.gap_scan.scope).toBe("OUTER_FOLD_TEST_WINDOW_BOUNDARIES");
    expect(body.gap_scan.boundary_count).toBe(1);
    expect(body.gap_scan.expected_boundary_count).toBe(1);
    expect(body.gap_scan.measured_count).toBe(1);
    expect(body.gap_scan.contiguous_count).toBe(1);
    expect(body.gap_scan.max_gap_bars).toBe(0);
    expect(body.gap_scan.boundaries).toEqual([
      {
        previous_fold_id: "0",
        fold_id: "1",
        boundary_utc_ms: 1_783_465_200_000,
        next_test_start_utc_ms: 1_783_468_800_000,
        gap_bars: 0,
        policy: "carry_position",
      },
    ]);
  });

  it("a crossing QuantBT did not measure is counted apart, never as a zero-bar gap", async () => {
    const body = await split(withReplay(w5b, (replay) => {
      replay.fold_capital.boundary_events[0].gap_bars = null;
    }));
    expect(body.gap_scan.state).toBe("AVAILABLE");
    expect(body.gap_scan.boundary_count).toBe(1);
    expect(body.gap_scan.measured_count).toBe(0);
    expect(body.gap_scan.contiguous_count).toBe(0);
    expect(body.gap_scan.max_gap_bars).toBeNull();
    expect(body.gap_scan.boundaries[0]!.gap_bars).toBeNull();
  });

  it("a real gap is served as the widest measured gap", async () => {
    const body = await split(withReplay(w5b, (replay) => {
      replay.fold_capital.boundary_events[0].gap_bars = 7;
    }));
    expect(body.gap_scan.contiguous_count).toBe(0);
    expect(body.gap_scan.max_gap_bars).toBe(7);
  });

  it("an execution plan with no boundary event is a typed absence, not '0 gaps'", async () => {
    const body = await split(withReplay(w5b, (replay) => {
      replay.fold_capital.boundary_events = [];
    }));
    expect(body.gap_scan).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: SPLIT_INTEGRITY_REASONS.noBoundaryEvents,
      basis: "NOT_PUBLISHED",
      boundary_count: null,
      measured_count: null,
      contiguous_count: null,
      max_gap_bars: null,
      boundaries: [],
      availability: { state: "NOT_PUBLISHED", reason_code: SPLIT_INTEGRITY_REASONS.noBoundaryEvents },
    });
    /* The fold plan's own crossing count still stands: it is not the scan. */
    expect(body.gap_scan.expected_boundary_count).toBe(1);
  });

  it("W3 real seal (no W5b replay ledger): a typed absence naming the seal, on both blocks", async () => {
    const body = await split(w3);
    expect(body.gap_scan.state).toBe("NOT_PUBLISHED");
    expect(body.gap_scan.reason_code).toBe(SPLIT_INTEGRITY_REASONS.sealPredatesReplay);
    expect(body.gap_scan.expected_boundary_count).toBe(1);
    expect(body.stitch.state).toBe("NOT_PUBLISHED");
    expect(body.stitch.reason_code).toBe(SPLIT_INTEGRITY_REASONS.sealPredatesReplay);
    expect(body.stitch.digest).toBeNull();
    expect(body.stitch.boundary_check).toBe("NOT_CHECKABLE");
  });
});

describe("E14 · 5.12 stitched OOS provenance", () => {
  it("W5b real seal: 2 segments over 336 retained observations, verified against the fold boundaries", async () => {
    const body = await split(w5b);
    expect(body.stitch.state).toBe("AVAILABLE");
    expect(body.stitch.basis).toBe(STITCH_DIGEST_BASIS);
    expect(body.stitch.segment_count).toBe(2);
    expect(body.stitch.observation_count).toBe(336);
    expect(body.stitch.boundary_check).toBe("MATCH");
    expect(body.stitch.boundary_check_reason_code).toBeNull();
    expect(body.stitch.digest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the digest is stable for one seal and moves when the stitch plan moves", async () => {
    const first = await split(w5b);
    const again = await split(w5b);
    expect(again.stitch.digest).toBe(first.stitch.digest);
    const shifted = await split(withReplay(w5b, (replay) => {
      replay.fold_segments[1].last_ordinal = 1_054;
      replay.fold_segments[1].bars = 167;
    }));
    expect(shifted.stitch.digest).not.toBe(first.stitch.digest);
  });

  it("the digest also moves when the fold windows the segments claim move, with the segments untouched", async () => {
    const first = await split(w5b);
    const moved = clone(w5b);
    moved.rows.FOLD[1]!.payload.test_end_utc_ms = 1_784_070_000_001;
    const body = await split(moved);
    expect(body.stitch.segment_count).toBe(2);
    expect(body.stitch.digest).not.toBe(first.stitch.digest);
  });

  it("a stitch plan that does not line up is published as MISMATCH with its own code, never repaired", async () => {
    const overlapping = await split(withReplay(w5b, (replay) => {
      replay.fold_segments[1].first_ordinal = 880;
      replay.fold_segments[1].bars = 176;
    }));
    expect(overlapping.stitch.state).toBe("AVAILABLE");
    expect(overlapping.stitch.boundary_check).toBe("MISMATCH");
    expect(overlapping.stitch.boundary_check_reason_code).toBe(STITCH_CHECK_REASONS.overlapping);

    const unknown = await split(withReplay(w5b, (replay) => {
      replay.fold_segments[1].fold_id = "fold_99";
    }));
    expect(unknown.stitch.boundary_check_reason_code).toBe(STITCH_CHECK_REASONS.unknownFold);

    const short = await split(withReplay(w5b, (replay) => {
      replay.fold_segments.pop();
    }));
    expect(short.stitch.segment_count).toBe(1);
    expect(short.stitch.boundary_check_reason_code).toBe(STITCH_CHECK_REASONS.foldCountDiffers);
  });

  it("a ledger that retained no fold segment is a typed absence, not an empty stitch", async () => {
    const body = await split(withReplay(w5b, (replay) => {
      replay.fold_segments = [];
    }));
    expect(body.stitch).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: SPLIT_INTEGRITY_REASONS.noFoldSegments,
      basis: "NOT_PUBLISHED",
      digest: null,
      segment_count: null,
      observation_count: null,
      boundary_check: "NOT_CHECKABLE",
    });
  });

  it("E14 writes (opt-in, E14_WRITE_FIXTURES=1) and validates the canonical retained split fixture Screen 05 loads", async () => {
    const file = resolve(
      process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts"),
      "fixtures",
      "research-current-source.split.valid.json",
    );
    if (process.env.E14_WRITE_FIXTURES === "1") writeFileSync(file, `${JSON.stringify(await split(w5b), null, 2)}\n`);
    const body = JSON.parse(readFileSync(file, "utf8"));
    expect(ResearchCurrentSourceSplitResponseSchema.safeParse(body).success).toBe(true);
    splitValidator.assert(body);
    expect(body.gap_scan.state).toBe("AVAILABLE");
    expect(body.stitch.boundary_check).toBe("MATCH");
  });

  it("checkAgainstFoldPlan names the first failure it meets, in the order it checks", () => {
    const folds = [
      { fold_id: "0", test_start_utc_ms: 1, test_end_utc_ms: 2 },
      { fold_id: "1", test_start_utc_ms: 3, test_end_utc_ms: 4 },
    ];
    const segment = (fold_id: string, first: number, last: number, bars = last - first + 1) =>
      ({ fold_id, first_ordinal: first, last_ordinal: last, bars }) as never;
    expect(checkAgainstFoldPlan([segment("0", 0, 9), segment("1", 10, 19)], folds)).toBeNull();
    expect(checkAgainstFoldPlan([segment("1", 0, 9), segment("0", 10, 19)], folds)).toBe(STITCH_CHECK_REASONS.outOfOrder);
    expect(checkAgainstFoldPlan([segment("0", 0, 9, 8), segment("1", 10, 19)], folds)).toBe(STITCH_CHECK_REASONS.barsDisagree);
    expect(checkAgainstFoldPlan([segment("0", 0, 9)], folds)).toBe(STITCH_CHECK_REASONS.foldCountDiffers);
  });
});
