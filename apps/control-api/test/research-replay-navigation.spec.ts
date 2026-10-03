import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ResearchEnrichedAnalysisSchema } from "../src/research/enriched-analysis.contract";
import { ResearchReplayResponseSchema } from "../src/research/replay.contract";
import { ResearchCurrentSourceReplayResponseSchema } from "../src/research/current-source.contract";
import { ReplayIdentitySchema, ReplayNavigationSchema, ReplayWindowDisclosureSchema } from "../src/research/replay-navigation.contract";
import { replayBoundIdentity, replayNavigation, replayRequestedIdentity } from "../src/research/replay-navigation";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { wfoRequested } from "./research-w1-wfo.fixture";
import { openApiValidator } from "./research-rf05-openapi";

const root = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const fixture = (name: string) => JSON.parse(readFileSync(resolve(root, "fixtures", name), "utf8"));
const binding = { alpha_id: "alpha_exact", alpha_version_id: "av_exact",
  availability: { state: "AVAILABLE", reason_code: null } };
const identity = replayBoundIdentity(binding);
const folds = [
  { fold_id: "fold_01", train_start_utc_ms: 100, train_end_utc_ms: 200,
    test_start_utc_ms: 201, test_end_utc_ms: 240, fold_facts: { train_bars: 100, test_bars: 40 } },
  { fold_id: "fold_02", train_start_utc_ms: 100, train_end_utc_ms: 240,
    test_start_utc_ms: 241, test_end_utc_ms: 280, fold_facts: { train_bars: 140, test_bars: 40 } },
];

describe("BR-S08-02/03 Replay immutable navigation presentation", () => {
  it("publishes exact admitted IDs only behind the matching immutable requested digest", () => {
    const requested = wfoRequested();
    const exact = replayRequestedIdentity(requested, sha256ResearchJson(requested));
    expect(exact).toMatchObject({ ...requested.alpha_binding, availability: { state: "AVAILABLE" } });
    const foreign = { ...requested, alpha_binding: { alpha_id: "foreign_alpha", alpha_version_id: "foreign_av" } };
    expect(replayRequestedIdentity(foreign, sha256ResearchJson(requested))).toMatchObject({
      alpha_id: null, alpha_version_id: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "REPLAY_ADMITTED_REQUEST_DIGEST_MISMATCH_OR_ABSENT" },
    });
    const scratch = { ...requested, alpha_binding: null, not_publishable: true };
    expect(replayRequestedIdentity(scratch, sha256ResearchJson(scratch)).availability.state).toBe("NOT_APPLICABLE");
    expect(replayBoundIdentity({ ...binding, availability: { state: "NOT_PUBLISHED", reason_code: "P13_ALPHA_BINDING_INCOMPATIBLE" } }).alpha_id).toBeNull();
  });

  it("retains exact WFO fold bounds and overlapping counts, never an invented unique global IS", () => {
    const navigation = replayNavigation(identity, undefined, folds);
    ReplayNavigationSchema.parse(navigation);
    expect(navigation.is_window).toMatchObject({ start_utc_ms: 100, end_utc_ms: 240, bars: 240,
      bounds_semantics: "SOURCE_RETAINED_FOLD_BOUNDS", count_basis: "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP" });
    expect(navigation.is_window.segments.map(row => row.bars)).toEqual([100, 140]);
    expect(navigation.oos_window.segments.map(row => row.start_utc_ms)).toEqual([201, 241]);
    expect(navigation.holdout_window).toMatchObject({ bars: null, start_utc_ms: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "REPLAY_HOLDOUT_NOT_EXPOSED" } });
    const old = replayNavigation(identity, undefined, folds.map(({ fold_facts, ...fold }) => fold));
    expect(old.is_window.bars).toBeNull();
    expect(old.is_window.availability.reason_code).toBe("REPLAY_RETAINED_FOLD_BAR_COUNTS_NOT_PUBLISHED");
    expect(old.is_window.segments).toHaveLength(2);
  });

  it("preserves a single-bar inclusive source fold without converting its last-bar boundary", () => {
    const source = { ...folds[0]!, test_start_utc_ms: 201, test_end_utc_ms: 201,
      fold_facts: { train_bars: 100, test_bars: 1 } };
    const navigation = replayNavigation(identity, undefined, [source]);
    ReplayNavigationSchema.parse(navigation);
    expect(navigation.oos_window).toMatchObject({ start_utc_ms: 201, end_utc_ms: 201, bars: 1,
      availability: { state: "AVAILABLE" }, segments: [{ start_utc_ms: 201, end_utc_ms: 201, bars: 1 }] });
    expect(ReplayWindowDisclosureSchema.safeParse({ ...navigation.oos_window, segments: [],
      bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE", count_basis: "FULL_SOURCE_WINDOW_OBSERVATIONS" }).success).toBe(false);
  });

  it("uses full fixed bar observations, not daily histogram samples, and withholds holdout bars", () => {
    const analysis = ResearchEnrichedAnalysisSchema.parse(fixture("research-enriched-analysis.fixed-is.valid.json"));
    const source = { ...analysis, lane: "FIXED" as const, windows: {
      ...analysis.windows,
      oos: { ...analysis.windows.oos, start_ms: analysis.scope.first_at_utc_ms,
        end_ms: analysis.scope.last_at_utc_ms + 1, source_locator: "P10.immutable_requested_spec.windows.oos",
        bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE" as const },
      holdout: { state: "NOT_PUBLISHED" as const, reason_code: "RETAINED_NO_HOLDOUT_ACCOUNT_PAYLOAD",
        start_ms: analysis.scope.last_at_utc_ms + 1, end_ms: analysis.scope.last_at_utc_ms + 100,
        source_locator: "P10.immutable_requested_spec.windows.holdout", bounds_semantics: "START_INCLUSIVE_END_EXCLUSIVE" as const },
    } };
    const navigation = replayNavigation(identity, source);
    ReplayNavigationSchema.parse(navigation);
    expect(navigation.oos_window.bars).toBe(source.scope.observation_count);
    expect(navigation.oos_window.bars).not.toBe(source.return_distribution.observation_count);
    expect(navigation.is_window.bars).toBe(source.by_window!.is.scope.observation_count);
    expect(navigation.holdout_window).toMatchObject({ start_utc_ms: source.windows.holdout.start_ms,
      bars: null, availability: { state: "NOT_PUBLISHED", reason_code: "REPLAY_HOLDOUT_NOT_EXPOSED" } });
    expect(replayNavigation(identity, { ...source, scope: { ...source.scope, coverage: "SAMPLED_RETAINED_EQUITY" } }).oos_window.bars).toBeNull();
  });

  it("keeps old source fixtures valid and adds the same named contract to both Replay lanes", () => {
    const navigation = replayNavigation(identity, undefined, folds);
    for (const [document, schema, old] of [
      ["research-replay.openapi.json", ResearchReplayResponseSchema, fixture("research-replay.p04-real.first-window.valid.json")],
      ["research-current-source.openapi.json", ResearchCurrentSourceReplayResponseSchema, fixture("research-current-source.replay.fold0.valid.json")],
    ] as const) {
      schema.parse(old);
      const original = JSON.stringify(old);
      const presented = { ...old, ...navigation };
      schema.parse(presented);
      openApiValidator(document, "Replay").assert(presented);
      expect(presented.revision).toBe(old.revision);
      expect(presented.etag).toBe(old.etag);
      expect(JSON.stringify(old)).toBe(original);
    }
  });

  it("binds only additive presentation facts and rejects forged availability/holdout values", () => {
    const first = replayNavigation(identity, undefined, folds);
    const changed = replayNavigation(replayBoundIdentity({ ...binding, alpha_version_id: "av_other" }), undefined, folds);
    expect(changed.presentation_digest).not.toBe(first.presentation_digest);
    expect(first.presentation_digest).toBe(sha256ResearchJson({ presentation_revision: first.presentation_revision,
      identity: first.identity, is_window: first.is_window, oos_window: first.oos_window, holdout_window: first.holdout_window }));
    expect(ReplayWindowDisclosureSchema.safeParse({ ...first.holdout_window, bars: 10,
      count_basis: "FULL_SOURCE_WINDOW_OBSERVATIONS" }).success).toBe(false);
    expect(ReplayWindowDisclosureSchema.safeParse({ ...first.is_window, bars: 140 }).success).toBe(false);
    const old = replayNavigation(replayBoundIdentity(undefined));
    expect(old.is_window).toMatchObject({ bars: null, start_utc_ms: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "REPLAY_SEAL_PREDATES_WINDOW_METADATA" } });
  });

  it("publishes only strict public basis enums and rejects private locators and unknown bases", () => {
    const requested = wfoRequested();
    expect(replayRequestedIdentity(requested, sha256ResearchJson(requested)).basis).toBe("IMMUTABLE_REQUEST_ALPHA_BINDING");
    expect(replayRequestedIdentity(undefined, sha256ResearchJson(requested)).basis).toBe("IMMUTABLE_REQUEST_ALPHA_BINDING");
    expect(identity.basis).toBe("HUB_BOUND_ALPHA_IDENTITY");
    expect(replayBoundIdentity(undefined).basis).toBe("HUB_BOUND_ALPHA_IDENTITY");
    const retained = replayNavigation(identity, undefined, folds);
    expect(retained.is_window.basis).toBe("RETAINED_FOLD_TRAIN_WINDOWS");
    expect(retained.oos_window.basis).toBe("RETAINED_FOLD_TEST_WINDOWS");
    expect(retained.holdout_window.basis).toBe("BOUND_WINDOW_METADATA");
    const analysis = ResearchEnrichedAnalysisSchema.parse(fixture("research-enriched-analysis.fixed-is.valid.json"));
    expect(replayNavigation(identity, analysis).is_window.basis).toBe("DECLARED_IS_WINDOW");
    expect(JSON.stringify(retained)).not.toMatch(/postgres:|redis:|\/internal\/|source_locator/i);
    const badIdentities = [{ ...identity, source_locator: "evidence.core.run_identity.binding" },
      { ...identity, basis: "evidence.core.run_identity.binding" }, { ...identity, basis: "UNKNOWN" }];
    const badWindows = [{ ...retained.is_window, source_locator: "retained.FOLD.train_windows" },
      { ...retained.is_window, basis: "retained.FOLD.train_windows" }, { ...retained.is_window, basis: "UNKNOWN" }];
    for (const value of badIdentities) expect(ReplayIdentitySchema.safeParse(value).success).toBe(false);
    for (const value of badWindows) expect(ReplayWindowDisclosureSchema.safeParse(value).success).toBe(false);
    for (const document of ["research-replay.openapi.json", "research-current-source.openapi.json"]) {
      const identities = openApiValidator(document, "ReplayNavigationIdentity");
      const windows = openApiValidator(document, "ReplayNavigationWindow");
      identities.assert(identity);
      windows.assert(retained.is_window);
      for (const value of badIdentities) expect(identities.check(value)).toBe(false);
      for (const value of badWindows) expect(windows.check(value)).toBe(false);
    }
  });
});
