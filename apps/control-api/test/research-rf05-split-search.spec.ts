/**
 * RF-05 (Claude share) — P14 Split / P15 Search representation truth.
 *
 * CG-P15-02  the Search validator binds the requested fold (Astra A06).
 * CG-P14-04  `as_of_utc_ms` is the projection/source time, never read time.
 * CG-P13-13  weak/strong If-None-Match comparison and private revalidation.
 * CG-P14-03/05/06, CG-P15-05 additive typed facts.
 */

import { describe, expect, it, vi } from "vitest";

import { P04_DELTA_ADAPTER_CONTRACT_DIGEST, P04_DELTA_FIXED_PARAMETERS } from "../src/research/p04-delta.binding";
import { sha256ResearchJson } from "../src/research/preflight.service";
import { ResearchSearchController } from "../src/research/search.controller";
import { ResearchSearchResponseSchema } from "../src/research/search.contract";
import { ResearchSearchService } from "../src/research/search.service";
import { ResearchSplitController } from "../src/research/split.controller";
import { ResearchSplitResponseSchema } from "../src/research/split.contract";
import { ResearchSplitService } from "../src/research/split.service";
import { p14SplitSourceFixture } from "./research-split.fixture";

const scope = { workspaceId: "rf05-workspace", actorUserId: "rf05-user" };
const PROJECTION_RECEIVED_AT = Date.parse("2026-09-22T10:15:00.000Z");

const datasetBinding = {
  schema_version: "research.dataset-binding.v1",
  snapshot_id: "dss_0123456789abcdef0123456789abcdef",
  snapshot_content_hash: "1".repeat(64),
  market_content_hash: "2".repeat(64),
  source_manifest_digest: "3".repeat(64),
  dataset_id: "binance_spot_1h",
  symbol: "BTCUSDT",
  timeframe: "1h",
  range_start_utc_ms: 1_704_067_200_000,
  range_end_exclusive_utc_ms: 1_705_881_600_000,
  timezone: "UTC",
  calendar_policy: "CONTINUOUS_24_7",
  closed_bar_policy: "CLOSED_BARS_ONLY",
};

function durableRow(readTime: number, overrides: Record<string, unknown> = {}) {
  const original = p14SplitSourceFixture();
  const source = {
    ...original,
    protocol: {
      ...original.protocol,
      selection: { ...original.protocol.selection, parameter_bundle_digest: sha256ResearchJson(P04_DELTA_FIXED_PARAMETERS) },
    },
  };
  return {
    kind: "DURABLE" as const,
    runId: "run_rf05",
    adapterContractDigest: P04_DELTA_ADAPTER_CONTRACT_DIGEST,
    requestedSpecDigest: "4".repeat(64),
    effectiveSpecDigest: "5".repeat(64),
    datasetBindingDigest: sha256ResearchJson(datasetBinding),
    datasetBinding,
    manifestDigest: "b".repeat(64),
    legacyRequest: {
      research: {
        requested_spec: {
          optimization_mode: "mode_1_decay",
          optimization_schedule: "global",
          optimization_config: {},
        },
      },
    },
    progressSnapshot: null,
    jobState: "SUCCEEDED",
    revision: "p14r1_" + "f".repeat(64),
    projection: { schema_version: "research.split-projection.v1", source },
    readiness: "PARTIAL" as const,
    sourceSplitDigest: sha256ResearchJson(source),
    receivedAt: new Date(PROJECTION_RECEIVED_AT),
    sourceAsOfUtcMs: PROJECTION_RECEIVED_AT,
    sourceAsOfBasis: "P14_PROJECTION_RECEIVED_AT" as const,
    // The repository still reports its own transaction clock; the reader
    // must not publish it as the representation's as-of.
    asOfUtcMs: readTime,
    ...overrides,
  };
}

function reply() {
  const value = { header: vi.fn(), code: vi.fn(), send: vi.fn() };
  value.code.mockReturnValue(value);
  value.header.mockReturnValue(value);
  value.send.mockReturnValue(value);
  return value;
}

function request(headers: Record<string, string> = {}) {
  return {
    portalUser: { userId: scope.actorUserId },
    portalWorkspaceId: scope.workspaceId,
    headers,
    raw: { once: vi.fn(), off: vi.fn() },
  };
}

describe("RF-05 CG-P15-02 · Search ETag binds the requested fold", () => {
  it("gives each requested fold its own validator while the content revision stays fold-independent", async () => {
    const repository = { hub: vi.fn().mockImplementation(async () => durableRow(Date.now())) };
    const service = new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never);
    const fold1 = await service.detail(scope, "run_rf05", { fold: 1 });
    const fold3 = await service.detail(scope, "run_rf05", { fold: 3 });
    const none = await service.detail(scope, "run_rf05", {});
    expect(fold1.revision).toBe(fold3.revision);
    expect(fold1.etag).not.toBe(fold3.etag);
    expect(fold1.etag).not.toBe(none.etag);
    expect(new Set([fold1.etag, fold3.etag, none.etag]).size).toBe(3);
    // Same fold, same representation: the validator is stable.
    expect((await service.detail(scope, "run_rf05", { fold: 1 })).etag).toBe(fold1.etag);
  });

  it("answers 200 with fold 3 when If-None-Match carries fold 1's ETag", async () => {
    const repository = { hub: vi.fn().mockImplementation(async () => durableRow(Date.now())) };
    const service = new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never);
    const controller = new ResearchSearchController(service, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const fold1 = await service.detail(scope, "run_rf05", { fold: 1 });

    const response = reply();
    await controller.detail(request({ "if-none-match": fold1.etag! }) as never, response as never, "run_rf05", { fold: "3" });
    expect(response.code).not.toHaveBeenCalledWith(304);
    expect(response.send).toHaveBeenCalledTimes(1);
    const body = response.send.mock.calls[0]![0] as { inspection: { requested_fold: number }; etag: string };
    expect(body.inspection.requested_fold).toBe(3);
    expect(body.etag).not.toBe(fold1.etag);

    const same = reply();
    await controller.detail(request({ "if-none-match": fold1.etag! }) as never, same as never, "run_rf05", { fold: "1" });
    expect(same.code).toHaveBeenCalledWith(304);
  });
});

describe("RF-05 CG-P14-04 · as_of is projection time, stable for one immutable revision", () => {
  it("publishes the projection receipt time for two reads at different wall-clock times", async () => {
    const repository = {
      hub: vi.fn()
        .mockResolvedValueOnce(durableRow(1_790_000_000_000))
        .mockResolvedValueOnce(durableRow(1_790_000_001_500)),
    };
    const service = new ResearchSplitService(repository as never, { FEATURE_RESEARCH_SPLIT: "true" } as never);
    const first = await service.detail(scope, "run_rf05");
    const second = await service.detail(scope, "run_rf05");
    expect(first.as_of_utc_ms).toBe(PROJECTION_RECEIVED_AT);
    expect(second.as_of_utc_ms).toBe(PROJECTION_RECEIVED_AT);
    expect(first.as_of_basis).toBe("P14_PROJECTION_RECEIVED_AT");
    expect(second).toEqual(first);
  });

  it("gives Search the same projection-time as_of", async () => {
    const repository = {
      hub: vi.fn()
        .mockResolvedValueOnce(durableRow(1_790_000_000_000))
        .mockResolvedValueOnce(durableRow(1_790_000_009_000)),
    };
    const service = new ResearchSearchService(repository as never, { FEATURE_RESEARCH_SEARCH: "true" } as never);
    const first = await service.detail(scope, "run_rf05", { fold: 2 });
    const second = await service.detail(scope, "run_rf05", { fold: 2 });
    expect(first.as_of_utc_ms).toBe(PROJECTION_RECEIVED_AT);
    expect(second).toEqual(first);
  });

  it("uses the durable run-state time, not read time, while no projection exists", async () => {
    const stateTime = Date.parse("2026-09-24T08:00:00.000Z");
    const pending = (readTime: number) => durableRow(readTime, {
      projection: null, revision: null, readiness: null, sourceSplitDigest: null, receivedAt: null,
      jobState: "RUNNING", sourceAsOfUtcMs: stateTime, sourceAsOfBasis: "RUN_STATE_UPDATED_AT",
    });
    const repository = { hub: vi.fn().mockResolvedValueOnce(pending(1)).mockResolvedValueOnce(pending(2)) };
    const service = new ResearchSplitService(repository as never, { FEATURE_RESEARCH_SPLIT: "true" } as never);
    const first = await service.detail(scope, "run_rf05");
    const second = await service.detail(scope, "run_rf05");
    expect(first).toMatchObject({ as_of_utc_ms: stateTime, as_of_basis: "RUN_STATE_UPDATED_AT", etag: null });
    expect(second).toEqual(first);
  });
});

describe("RF-05 CG-P14-03/05/06 · three-window truth, bar interval, one absence authority", () => {
  it("types purge/embargo/inner folds as NOT_APPLICABLE and explains the absent holdout bar count", async () => {
    const service = new ResearchSplitService(
      { hub: vi.fn().mockResolvedValue(durableRow(1)) } as never,
      { FEATURE_RESEARCH_SPLIT: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05");
    for (const key of ["purge", "embargo", "inner_folds"] as const) {
      expect(detail.protocol[key]).toMatchObject({
        state: "NOT_APPLICABLE",
        availability: { state: "NOT_APPLICABLE" },
      });
      expect(detail.protocol[key].reason_code).toMatch(/^P14_THREE_WINDOW_PROTOCOL_/);
    }
    // Facts that apply to a three-window run but were not published stay NOT_PUBLISHED.
    expect(detail.protocol.gap_scan.state).toBe("NOT_PUBLISHED");
    expect(detail.protocol.fold_plan.state).toBe("NOT_PUBLISHED");
    const holdout = detail.windows.holdout;
    if (!("data_role" in holdout)) throw new Error("expected holdout window");
    expect(holdout.bars).toBeNull();
    expect(holdout.bars_absence).toMatchObject({
      state: "NOT_PUBLISHED",
      reason_code: "P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE",
    });
  });

  it("publishes the bound timeframe and its bar interval from the digest-verified dataset binding", async () => {
    const service = new ResearchSplitService(
      { hub: vi.fn().mockResolvedValue(durableRow(1)) } as never,
      { FEATURE_RESEARCH_SPLIT: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05");
    expect(detail.dataset).toEqual({
      state: "AVAILABLE",
      dataset_id: "binance_spot_1h",
      symbol: "BTCUSDT",
      timeframe: "1h",
      bar_interval_ms: 3_600_000,
      provenance: "P08_DATASET_BINDING",
      reason_code: null,
      availability: { state: "AVAILABLE", reason_code: null },
    });
  });

  it("refuses a dataset binding whose digest does not match the producer binding", async () => {
    const service = new ResearchSplitService(
      { hub: vi.fn().mockResolvedValue(durableRow(1, { datasetBindingDigest: "9".repeat(64) })) } as never,
      { FEATURE_RESEARCH_SPLIT: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05");
    expect(detail.dataset).toMatchObject({
      state: "NOT_PUBLISHED", timeframe: null, bar_interval_ms: null,
      reason_code: "P14_DATASET_BINDING_DIGEST_MISMATCH",
    });
  });

  it("names field-local facts authoritative and indexes every absence once", async () => {
    const service = new ResearchSplitService(
      { hub: vi.fn().mockResolvedValue(durableRow(1)) } as never,
      { FEATURE_RESEARCH_SPLIT: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05");
    expect(detail.absence_authority).toBe("FIELD_LOCAL");
    const pointers = detail.absence_index.map((entry) => entry.pointer);
    expect(new Set(pointers).size).toBe(pointers.length);
    const keys = detail.absence_index.map((entry) => entry.key);
    expect(new Set(keys).size).toBe(keys.length);
    // Every legacy `source_absences` key is still readable and points at the same fact.
    for (const [key, value] of Object.entries(detail.source_absences)) {
      const entry = detail.absence_index.find((candidate) => candidate.key === key);
      expect(entry, key).toBeDefined();
      const resolved = entry!.pointer.split("/").slice(1).reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)[part], detail,
      );
      expect(resolved, key).toEqual(value);
    }
    expect(ResearchSplitResponseSchema.safeParse(detail).success).toBe(true);
  });
});

describe("RF-05 CG-P15-05 · claim-row facts for a declared-not-executed request", () => {
  it("publishes the OOS column state from P14 and types every mode claim as not applicable", async () => {
    const service = new ResearchSearchService(
      { hub: vi.fn().mockResolvedValue(durableRow(1)) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05", {});
    expect(detail.claim_row).toMatchObject({
      basis: "DECLARED_NOT_EXECUTED",
      validation_claim: { state: "NOT_APPLICABLE", value: null, reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_VALIDATION_CLAIM" },
      chronological_claim: { state: "NOT_APPLICABLE", value: null, reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_CHRONOLOGICAL_CLAIM" },
      oos_used_for_selection: { state: "NOT_ASSERTED", value: null },
      oos_column: {
        state: "REPORT_ONLY",
        source_evaluation_state: "P04_OBSERVED_AFTER_FIXED_PROFILE",
        provenance: "P14_SOURCE_RECEIPT",
        availability: { state: "AVAILABLE", reason_code: null },
      },
      scoring_backend: { state: "NOT_APPLICABLE", declared_value: null, reason_code: "P15_DECLARED_OPTIMIZER_NOT_EXECUTED_NO_SCORING_BACKEND" },
      mode_reference: {
        mode: "mode_1_decay", schedule: "global",
        operation_id: "researchEngineAtlasGetV1", relation: "DECLARED_MODE_RELEASE_METADATA_NOT_RUN_EVIDENCE",
      },
    });
    expect(ResearchSearchResponseSchema.safeParse(detail).success).toBe(true);
  });

  it("carries a declared scoring backend as a declaration, never as an executed fact", async () => {
    const row = durableRow(1);
    (row.legacyRequest.research.requested_spec as Record<string, unknown>).optimization_config = { scoring_backend: "proxy" };
    const service = new ResearchSearchService(
      { hub: vi.fn().mockResolvedValue(row) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05", {});
    expect(detail.claim_row.scoring_backend).toMatchObject({
      state: "NOT_APPLICABLE", declared_value: "proxy", provenance: "RUN_REQUESTED_SPEC",
    });
  });

  it("keeps pending/legacy availability inside every claim-row fact", async () => {
    const pending = durableRow(1, {
      projection: null, revision: null, readiness: null, sourceSplitDigest: null, receivedAt: null, jobState: "RUNNING",
      sourceAsOfBasis: "RUN_STATE_UPDATED_AT",
    });
    const service = new ResearchSearchService(
      { hub: vi.fn().mockResolvedValue(pending) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never,
    );
    const detail = await service.detail(scope, "run_rf05", {});
    expect(detail.claim_row.basis).toBe("NOT_PUBLISHED");
    for (const fact of [
      detail.claim_row.validation_claim, detail.claim_row.chronological_claim,
      detail.claim_row.oos_used_for_selection, detail.claim_row.oos_column, detail.claim_row.scoring_backend,
    ]) expect(fact.availability.state).toBe("PENDING_SOURCE_CALLBACK");
  });
});

describe("RF-05 CG-P13-13 · weak/strong comparison and private revalidation", () => {
  it("Split: a weak (gzip-rewritten) If-None-Match revalidates, and Cache-Control is private, no-cache", async () => {
    const service = new ResearchSplitService(
      { hub: vi.fn().mockResolvedValue(durableRow(1)) } as never,
      { FEATURE_RESEARCH_SPLIT: "true" } as never,
    );
    const controller = new ResearchSplitController(service, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const detail = await service.detail(scope, "run_rf05");
    for (const candidate of [detail.etag!, `W/${detail.etag!}`, `"other", W/${detail.etag!}`, "*"]) {
      const response = reply();
      await controller.detail(request({ "if-none-match": candidate }) as never, response as never, "run_rf05", {});
      expect(response.code, candidate).toHaveBeenCalledWith(304);
      expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
      expect(response.header).toHaveBeenCalledWith("etag", detail.etag);
    }
    const miss = reply();
    await controller.detail(request({ "if-none-match": `W/"p14r1_${"0".repeat(64)}"` }) as never, miss as never, "run_rf05", {});
    expect(miss.code).not.toHaveBeenCalledWith(304);
    expect(miss.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
  });

  it("Split without a validator answers 200 with no ETag and still private, no-cache", async () => {
    const pending = durableRow(1, {
      projection: null, revision: null, readiness: null, sourceSplitDigest: null, receivedAt: null, jobState: "RUNNING",
      sourceAsOfBasis: "RUN_STATE_UPDATED_AT",
    });
    const service = new ResearchSplitService({ hub: vi.fn().mockResolvedValue(pending) } as never, { FEATURE_RESEARCH_SPLIT: "true" } as never);
    const controller = new ResearchSplitController(service, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const response = reply();
    await controller.detail(request({ "if-none-match": "*" }) as never, response as never, "run_rf05", {});
    expect(response.code).not.toHaveBeenCalledWith(304);
    expect(response.header).not.toHaveBeenCalledWith("etag", expect.anything());
    expect(response.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
  });

  it("Search: weak comparison still binds the fold", async () => {
    const service = new ResearchSearchService(
      { hub: vi.fn().mockResolvedValue(durableRow(1)) } as never,
      { FEATURE_RESEARCH_SEARCH: "true" } as never,
    );
    const controller = new ResearchSearchController(service, { isMember: vi.fn().mockResolvedValue(true) } as never);
    const fold2 = await service.detail(scope, "run_rf05", { fold: 2 });
    const hit = reply();
    await controller.detail(request({ "if-none-match": `W/${fold2.etag!}` }) as never, hit as never, "run_rf05", { fold: "2" });
    expect(hit.code).toHaveBeenCalledWith(304);
    expect(hit.header).toHaveBeenCalledWith("cache-control", "private, no-cache");
    const miss = reply();
    await controller.detail(request({ "if-none-match": `W/${fold2.etag!}` }) as never, miss as never, "run_rf05", { fold: "4" });
    expect(miss.code).not.toHaveBeenCalledWith(304);
  });
});

describe("RF-05 · published OpenAPI documents accept every representation the readers emit", () => {
  it("validates Split and Search (projected, pending, legacy) against the generated-client sources", async () => {
    const { openApiValidator } = await import("./research-rf05-openapi");
    const split = openApiValidator("research-split.openapi.json", "SplitDetail");
    const search = openApiValidator("research-search.openapi.json", "SearchDetail");
    const pending = {
      projection: null, revision: null, readiness: null, sourceSplitDigest: null, receivedAt: null, jobState: "RUNNING",
      sourceAsOfBasis: "RUN_STATE_UPDATED_AT",
    };
    const legacy = {
      ...pending, kind: "LEGACY", jobState: null, adapterContractDigest: null, requestedSpecDigest: null,
      effectiveSpecDigest: null, datasetBindingDigest: null, datasetBinding: null, manifestDigest: null, legacyRequest: null,
      sourceAsOfBasis: "LEGACY_READ_MODEL_UPDATED_AT",
    };
    for (const overrides of [{}, pending, legacy, { datasetBindingDigest: "9".repeat(64) }]) {
      const hub = vi.fn().mockResolvedValue(durableRow(1, overrides));
      const splitDetail = await new ResearchSplitService({ hub } as never, { FEATURE_RESEARCH_SPLIT: "true" } as never).detail(scope, "run_rf05");
      split.assert(splitDetail);
      const searchDetail = await new ResearchSearchService({ hub } as never, { FEATURE_RESEARCH_SEARCH: "true" } as never).detail(scope, "run_rf05", { fold: 2 });
      search.assert(searchDetail);
    }
  });
});
