import { describe, expect, it, vi } from "vitest";

import { ResearchLineageService } from "../src/research/lineage.service";
import { libraryItem } from "./research-lineage.builders";
import { p14SplitSourceFixture } from "./research-split.fixture";
import { DELTA_CAUSAL_INNER_PROFILE } from "../src/research/delta-causal-inner.profile";

const scope = { workspaceId: "ws-p19", actorUserId: "usr-p19" };
const digest = (character: string) => character.repeat(64);

function requested(version = "av-p19-1", seed = 7, schedule = "global") {
  return {
    schema_version: "research.requested-spec.v1",
    alpha_binding: { alpha_id: "alpha-p19", alpha_version_id: version },
    not_publishable: false,
    strategy_id: "delta-rsi",
    execution_route: "signal_notional",
    route_params: {},
    data: { dataset_id: "hmd", symbol: "BTCUSDT", timeframe: "1h" },
    protocol: "three_window_decay",
    windows: {
      is: { start: "2024-01-01", end_exclusive: "2024-02-01" },
      oos: { start: "2024-02-01", end_exclusive: "2024-03-01" },
      holdout: { start: "2024-03-01", end_exclusive: "2024-04-01" },
    },
    optimization_mode: "grid",
    optimization_schedule: schedule,
    parameter_space_overrides: [{ name: "rsi_low", kind: "sweep", low: 20, high: 35 }],
    optuna_trials: 10,
    early_stopping: null,
    random_seed: seed,
    optimization_config: {},
    client: { engine_release_id: "quantbt-1.1.1", config_digest: digest("a") },
  };
}

function effective(seed = 7, schedule = "global") {
  return {
    schema_version: "research.effective-spec.v1",
    engine: { engine_release_id: "quantbt-1.1.1", execution_route: "signal_notional" },
    data_binding: { snapshot_content_hash: digest("b"), market_content_hash: digest("c") },
    topology: { topology_digest: digest("d") },
    optimization: { mode: "grid", schedule, trial_count: 10, early_stopping: null, random_seed: seed },
  };
}

function attempt(overrides: Record<string, unknown> = {}) {
  return {
    attempt_id: "att-p19-root",
    parent_attempt_id: null,
    parent_alpha_id: null,
    alpha_version_id: "av-p19-1",
    alpha_version_label: "av_0_9_1",
    state: "READY",
    intent_kind: "NEW",
    reason: null,
    space_signature: digest("e"),
    created_at: new Date("2026-09-22T00:00:00.000Z"),
    updated_at: new Date("2026-09-22T00:01:00.000Z"),
    primary_run_id: "run-p19-root",
    primary_run_state: "READY",
    effective_spec_digest: digest("f"),
    engine_release_id: "quantbt-1.1.1",
    dataset_binding_digest: digest("b"),
    requested_spec: requested(),
    effective_spec: effective(),
    technical_retry_count: 2,
    exposure_count: 1,
    exposure_roles: ["OUTER_OOS"],
    latest_source_as_of: new Date("2026-09-22T00:02:00.000Z"),
    ...overrides,
  };
}

function snapshot(overrides: Record<string, unknown> = {}) {
  const root = attempt();
  return {
    alpha: { alpha_id: "alpha-p19", name: "P19 Alpha", active_version_id: "av-p19-1", active_version_state: "ACTIVE" },
    versions: [{
      alpha_version_id: "av-p19-1", code_digest: digest("1"), entrypoint: "strategy:main",
      declared_contract: { version: "0.9.1" }, lifecycle_state: "ACTIVE",
      registered_at: new Date("2026-09-21T00:00:00.000Z"),
      promotion_attempt_id: null, promotion_run_id: null, promotion_source_contract_rev: null,
      promotion_source_digest: null, promotion_source_as_of: null,
    }],
    attempts: [root],
    childRuns: [{
      attempt_id: root.attempt_id, run_id: "run-p19-audit", run_kind: "AUDIT",
      relationship_kind: "AUDIT_OF_SELECTION", parent_run_id: root.primary_run_id,
      state: "READY", created_at: new Date("2026-09-22T00:03:00.000Z"),
    }],
    counts: {
      total_attempts: 1, draft_attempts: 0, submitted_attempts: 1, failed_attempts: 0,
      abandoned_attempts: 0, child_runs: 1, technical_retries: 2,
    },
    hasMore: false,
    asOfUtcMs: 1_790_035_200_000,
    ...overrides,
  };
}

function subject(value = snapshot(), config = { FEATURE_RESEARCH_LINEAGE: "true", FEATURE_RESEARCH_RUN_LIBRARY: "true" }) {
  const repository = { read: vi.fn().mockResolvedValue(value) };
  return { service: new ResearchLineageService(repository as never, config as never), repository };
}

describe("P19 Attempt Lineage persisted truth", () => {
  it("causal lineage requires sealed outer-fold basis and publishes its distinct source/scope", async () => {
    const retained = { run_id: "run-p19-root", artifact_revision: 1,
      profile_id: DELTA_CAUSAL_INNER_PROFILE.current_source.profile_id,
      validation_claim: "strict_nested_fold_local_retraining", source_attested: true,
      metrics: { mean_oos_sharpe: "1.25", mean_decay: "0.5", basis: "OUTER_FOLD_SELECTED_OOS_MEAN" } };
    const response = await subject(snapshot({ retainedMetrics: [retained] })).service.read(scope, "alpha-p19", { limit: 128 });
    expect(response.attempts[0]!.run_facts.oos_sharpe).toMatchObject({
      value: "1.25", source: "RS02_RETAINED_OUTER_FOLD_SELECTIONS", scope: "OUTER_FOLD_SELECTED_OOS_MEAN",
      definition_id: "research.current-source.v1.outer-fold-selected-oos-sharpe-mean", availability: { state: "AVAILABLE" },
    });
    expect(response.attempts[0]!.run_facts.decay).toMatchObject({
      value: "0.5", definition_id: "research.current-source.v1.outer-fold-mean-inner-is-mean-minus-outer-oos",
    });
    expect(response.attempts[0]!.run_facts.claim.family).toBe("STRICT_OUTER_OOS");
    for (const altered of [
      { ...retained, source_attested: false },
      { ...retained, metrics: { mean_oos_sharpe: "99", mean_decay: "98" } },
      { ...retained, metrics: { ...retained.metrics, mean_oos_sharpe: null, mean_decay: null } },
    ]) {
      const refused = await subject(snapshot({ retainedMetrics: [altered] })).service.read(scope, "alpha-p19", { limit: 128 });
      expect(refused.attempts[0]!.run_facts.oos_sharpe).toMatchObject({ value: null, availability: { state: "NOT_PUBLISHED" } });
      expect(refused.attempts[0]!.run_facts.decay.value).toBeNull();
    }
    const item = libraryItem("run-p19-root");
    item.stats = item.stats.map(cell => cell.role === "OOS_SHARPE" || cell.role === "DECAY"
      ? { ...cell, value: null, availability: { state: "NOT_PUBLISHED", reason_code: "CAUSAL_DEPLOYMENT_INNER_METRICS_NOT_OUTER_OOS" } }
      : cell);
    const repository = { read: vi.fn().mockResolvedValue(snapshot({
      libraryRows: [{ run_id: "run-p19-root" }], retainedMetrics: [retained],
    })) };
    const runLibrary = { mapRow: vi.fn().mockReturnValue(item) };
    const service = new ResearchLineageService(repository as never,
      { FEATURE_RESEARCH_LINEAGE: "true", FEATURE_RESEARCH_RUN_LIBRARY: "true" } as never, runLibrary as never);
    const withLibrary = await service.read(scope, "alpha-p19", { limit: 128 });
    expect(runLibrary.mapRow).toHaveBeenCalledOnce();
    expect(withLibrary.attempts[0]!.run_facts.oos_sharpe).toMatchObject({
      value: "1.25", source: "RS02_RETAINED_OUTER_FOLD_SELECTIONS", scope: "OUTER_FOLD_SELECTED_OOS_MEAN",
    });
  });
  it("CG-FG-S10-03 derives family only from a sealed WFO claim or the persisted P04 protocol", async () => {
    const retained = { run_id: "run-p19-root", artifact_revision: 1, metrics: null,
      profile_id: "rs02.delta-signal-notional-wfo.v1", validation_claim: "walk_forward_oos", source_attested: true };
    const wfo = await subject(snapshot({ retainedMetrics: [retained] })).service.read(scope, "alpha-p19", { limit: 128 });
    expect(wfo.attempts[0]?.run_facts.claim).toMatchObject({
      family: "WALK_FORWARD_OOS_COMPATIBILITY", family_origin: "SOURCE_ATTESTED",
      family_availability: { state: "AVAILABLE" },
    });
    const unsealed = await subject(snapshot({ retainedMetrics: [{ ...retained, source_attested: false }] }))
      .service.read(scope, "alpha-p19", { limit: 128 });
    expect(unsealed.attempts[0]?.run_facts.claim).toMatchObject({
      family: "NOT_PUBLISHED", family_availability: { state: "NOT_PUBLISHED" },
    });
    const p04 = await subject(snapshot({ claimSplits: [{
      run_id: "run-p19-root",
      projection: { schema_version: "research.split-projection.v1", source: p14SplitSourceFixture() },
    }] })).service.read(scope, "alpha-p19", { limit: 128 });
    expect(p04.attempts[0]?.run_facts.claim).toMatchObject({
      family: "WALK_FORWARD_OOS_COMPATIBILITY", family_origin: "PORTAL_DERIVED_FROM_SOURCE_PROTOCOL",
      family_availability: { state: "AVAILABLE" },
    });
  });

  it("P19-T01/T05/T09/T10 keeps one research node despite technical retries and retains child/exposure facts", async () => {
    const { service, repository } = subject();
    const response = await service.read(scope, "alpha-p19", { limit: 128 });
    expect(repository.read).toHaveBeenCalledWith(scope, "alpha-p19", 128);
    expect(response.counts).toMatchObject({ total_attempts: 1, returned_attempts: 1, technical_retries: 2, child_runs: 1 });
    expect(response.attempts).toHaveLength(1);
    expect(response.attempts[0]).toMatchObject({
      attempt_id: "att-p19-root", parent_state: "ROOT",
      primary_run: { technical_retry_count: 2 },
      child_runs: [{ relationship_kind: "AUDIT_OF_SELECTION" }],
      child_runs_coverage: { state: "COMPLETE", reason_code: null },
      exposure: { state: "RECORDED", roles: ["OUTER_OOS"] },
    });
  });

  it("P19-T02/T03/T12 emits only server-normalized material diffs and makes a version change disclosure-only", async () => {
    const root = attempt();
    const child = attempt({
      attempt_id: "att-p19-child", parent_attempt_id: "att-p19-root", parent_alpha_id: "alpha-p19",
      alpha_version_id: "av-p19-2", alpha_version_label: "av_0_9_2", intent_kind: "UPGRADE_ENGINE_EXPERIMENT",
      requested_spec: requested("av-p19-2", 11, "per_fold_causal"), effective_spec: effective(11, "per_fold_causal"),
      created_at: new Date("2026-09-22T00:04:00.000Z"), updated_at: new Date("2026-09-22T00:05:00.000Z"),
    });
    const value = snapshot({
      versions: [
        { alpha_version_id: "av-p19-1", code_digest: digest("1"), entrypoint: "strategy:main", declared_contract: { version: "0.9.1" }, lifecycle_state: "SUPERSEDED", registered_at: new Date("2026-09-21T00:00:00Z"), promotion_attempt_id: null, promotion_run_id: null, promotion_source_contract_rev: null, promotion_source_digest: null, promotion_source_as_of: null },
        { alpha_version_id: "av-p19-2", code_digest: digest("2"), entrypoint: "strategy:main", declared_contract: { version: "0.9.2" }, lifecycle_state: "ACTIVE", registered_at: new Date("2026-09-22T00:00:00Z"), promotion_attempt_id: null, promotion_run_id: null, promotion_source_contract_rev: null, promotion_source_digest: null, promotion_source_as_of: null },
      ],
      attempts: [root, child],
      counts: { total_attempts: 2, draft_attempts: 0, submitted_attempts: 2, failed_attempts: 0, abandoned_attempts: 0, child_runs: 1, technical_retries: 4 },
    });
    const response = await subject(value).service.read(scope, "alpha-p19", { limit: 128 });
    const node = response.attempts[1]!;
    expect(node.semantic_diff).toMatchObject({ state: "AVAILABLE", gates_reset: true });
    expect(node.semantic_diff.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: "alpha_version", kind: "ALPHA_VERSION" }),
      expect.objectContaining({ path: "random_seed", before: "7", after: "11" }),
      expect.objectContaining({ path: "optimization_schedule", before: "global", after: "per_fold_causal" }),
    ]));
  });

  it("P19-T07/T11 never chooses a lifecycle or metric heuristic when source has no promotion pick", async () => {
    const response = await subject().service.read(scope, "alpha-p19", { limit: 128 });
    expect(response.alpha.versions[0]?.promotion_pick).toEqual(expect.objectContaining({
      state: "NOT_PUBLISHED", attempt_id: null,
      availability: { state: "NOT_PUBLISHED", reason_code: "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK" },
    }));
    expect(response.source_absences.promotion_pick).toEqual({ state: "NOT_PUBLISHED", reason_code: "P19_SOURCE_DID_NOT_PUBLISH_PROMOTION_PICK" });
  });

  it("P19-T11 returns only an exact source-attested pick when the immutable fact exists", async () => {
    const response = await subject(snapshot({ versions: [{
      alpha_version_id: "av-p19-1", code_digest: digest("1"), entrypoint: "strategy:main",
      declared_contract: { version: "0.9.1" }, lifecycle_state: "ACTIVE",
      registered_at: new Date("2026-09-21T00:00:00.000Z"),
      promotion_attempt_id: "att-p19-root", promotion_run_id: "run-p19-root",
      promotion_source_contract_rev: "dr03.v1", promotion_source_digest: digest("9"),
      promotion_source_as_of: new Date("2026-09-22T00:06:00.000Z"),
      promotion_receipt_count: 1, promotion_selected_trial_id: "trial-p19", promotion_selected_params_digest: digest("8"),
    }] })).service.read(scope, "alpha-p19", { limit: 128 });
    expect(response.alpha.versions[0]?.promotion_pick).toEqual({
      state: "PUBLISHED", attempt_id: "att-p19-root", run_id: "run-p19-root",
      source_contract_rev: "dr03.v1", source_digest: digest("9"),
      source_as_of_utc_ms: 1_790_035_560_000,
      availability: { state: "AVAILABLE", reason_code: null },
      selected_trial_id: "trial-p19", selected_trial_availability: { state: "AVAILABLE", reason_code: null },
      selected_params_digest: digest("8"), selected_params_availability: { state: "AVAILABLE", reason_code: null },
      fold: null, fold_availability: { state: "NOT_PUBLISHED", reason_code: "P19_P22_SELECTED_FOLD_NOT_PUBLISHED" },
      approval_href: null, approval_availability: { state: "NOT_PUBLISHED", reason_code: "P19_P22_APPROVAL_BINDING_NOT_AVAILABLE" },
      // W6b DR-03 / CG-P19-04 additive facts.
      source_authority: { owner: "P22_RELEASE_CANDIDATE_APPROVAL", state: "CONNECTED" },
      release_candidate: null,
      release_candidate_availability: { state: "NOT_PUBLISHED", reason_code: "P19_RUN_LIBRARY_READER_NOT_WIRED" },
    });
    expect(response.source_absences.promotion_pick).toEqual({ state: "AVAILABLE", reason_code: null });
  });

  it("P19-T04/T06/T13 fails closed for cross-Alpha parent corruption and retains an explicit bounded-page boundary", async () => {
    const corrupt = attempt({ parent_attempt_id: "att-other", parent_alpha_id: "alpha-other" });
    await expect(subject(snapshot({ attempts: [corrupt] })).service.read(scope, "alpha-p19", { limit: 128 }))
      .rejects.toMatchObject({ code: "RESEARCH_LINEAGE_UNAVAILABLE", status: 503 });

    const bounded = await subject(snapshot({ hasMore: true, counts: { total_attempts: 129, draft_attempts: 0, submitted_attempts: 129, failed_attempts: 0, abandoned_attempts: 0, child_runs: 1, technical_retries: 2 } })).service.read(scope, "alpha-p19", { limit: 1 });
    expect(bounded.coverage).toEqual(expect.objectContaining({ state: "PARTIAL", reason_code: "P19_BOUNDED_GRAPH_LIMIT_REACHED" }));
  });

  it("P19-T04 fails closed for a persisted parent cycle before any browser graph can be formed", async () => {
    const root = attempt({ attempt_id: "att-p19-root", parent_attempt_id: "att-p19-child", parent_alpha_id: "alpha-p19" });
    const child = attempt({
      attempt_id: "att-p19-child", parent_attempt_id: "att-p19-root", parent_alpha_id: "alpha-p19",
      created_at: new Date("2026-09-22T00:04:00.000Z"), updated_at: new Date("2026-09-22T00:05:00.000Z"),
    });
    await expect(subject(snapshot({ attempts: [root, child], counts: {
      total_attempts: 2, draft_attempts: 0, submitted_attempts: 2, failed_attempts: 0,
      abandoned_attempts: 0, child_runs: 1, technical_retries: 2,
    } })).service.read(scope, "alpha-p19", { limit: 128 }))
      .rejects.toMatchObject({ code: "RESEARCH_LINEAGE_UNAVAILABLE", status: 503 });
  });

  it("P19-T10 bounds dense child relationships and discloses the omission instead of returning an unbounded graph", async () => {
    const root = attempt();
    const children = Array.from({ length: 33 }, (_, index) => ({
      attempt_id: root.attempt_id,
      run_id: `run-p19-audit-${index}`,
      run_kind: "AUDIT",
      relationship_kind: "AUDIT_OF_SELECTION",
      parent_run_id: root.primary_run_id,
      state: "READY",
      created_at: new Date(`2026-09-22T00:${String(index).padStart(2, "0")}:00.000Z`),
    }));
    const response = await subject(snapshot({ childRuns: children, counts: {
      total_attempts: 1, draft_attempts: 0, submitted_attempts: 1, failed_attempts: 0,
      abandoned_attempts: 0, child_runs: 33, technical_retries: 2,
    } })).service.read(scope, "alpha-p19", { limit: 128 });
    expect(response.attempts[0]?.child_runs).toHaveLength(32);
    expect(response.attempts[0]?.child_runs_coverage).toEqual({
      state: "PARTIAL", reason_code: "P19_CHILD_RUNS_BOUNDED_PER_ATTEMPT",
    });
  });

  it("fails closed while Screen 10 or its retained Library dependency is dark", async () => {
    await expect(subject(snapshot(), { FEATURE_RESEARCH_LINEAGE: "false", FEATURE_RESEARCH_RUN_LIBRARY: "true" }).service.read(scope, "alpha-p19", { limit: 128 }))
      .rejects.toMatchObject({ code: "RESEARCH_LINEAGE_UNAVAILABLE", status: 503 });
    await expect(subject(snapshot(), { FEATURE_RESEARCH_LINEAGE: "true", FEATURE_RESEARCH_RUN_LIBRARY: "false" }).service.read(scope, "alpha-p19", { limit: 128 }))
      .rejects.toMatchObject({ code: "RESEARCH_LINEAGE_UNAVAILABLE", status: 503 });
  });

  it("D1 (10-3): the attempt's primary run carries the Library's own label, or null", async () => {
    /* The hi-fi writes `R-WFO-114` beside the attempt. The label comes from
       the Run Library row this service already joins for `rc`, so Screen 10
       and Screen 01 cannot name the same run two different ways. */
    const primaryRunId = snapshot().attempts[0]!.primary_run_id;
    const repository = { read: vi.fn().mockResolvedValue(snapshot({ libraryRows: [{ run_id: primaryRunId }] })) };
    const config = { FEATURE_RESEARCH_LINEAGE: "true", FEATURE_RESEARCH_RUN_LIBRARY: "true" };
    const runLibrary = {
      mapRow: vi.fn((row: { run_id: string }) => ({ ...libraryItem(row.run_id), display_label: "R-WFO-114" })),
    };
    const withLibrary = new ResearchLineageService(repository as never, config as never, runLibrary as never);
    const labelled = await withLibrary.read(scope, "alpha-p19", { limit: 128 });
    expect(labelled.attempts[0]?.primary_run.display_label).toBe("R-WFO-114");

    /* With no Library reader wired the label is null, exactly as `rc` is —
       the screen then prints the short id rather than a guessed number. */
    const bare = await subject().service.read(scope, "alpha-p19", { limit: 128 });
    expect(bare.attempts[0]?.primary_run.display_label).toBeNull();
  });
});
