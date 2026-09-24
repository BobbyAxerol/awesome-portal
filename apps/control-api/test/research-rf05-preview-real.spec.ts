/**
 * RF-05 real-data receipt (no preview rebuild): the exact P14 hub rows the
 * Research preview (:8095, QuantBT 1.1.1, historical BTCUSDT 1h) returned for
 * its real runs are replayed through the unchanged repository mapping into
 * the RF-05 Split / Search / current-source readers.
 *
 * `live_before` in the fixture is what the deployed pre-RF-05 build served
 * for the same runs, so each assertion also names the defect it closes.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { ResearchCurrentSourceService } from "../src/research/current-source.service";
import { P04_DELTA_ADAPTER_CONTRACT_DIGEST } from "../src/research/p04-delta.binding";
import { ResearchSearchService } from "../src/research/search.service";
import { ResearchSplitRepository } from "../src/research/split.repository";
import { ResearchSplitService } from "../src/research/split.service";
import { openApiValidator } from "./research-rf05-openapi";

type HubFixture = { kind: "durable" | "legacy"; row: Record<string, unknown> };
const fixture = JSON.parse(readFileSync(join(__dirname, "research-rf05-preview.fixture.json"), "utf8")) as {
  workspace_id: string;
  hub_rows: Record<string, HubFixture>;
  live_before: Record<string, Record<string, unknown>>;
};
const scope = { workspaceId: fixture.workspace_id, actorUserId: "usr_preview" };
const COMPLETED = "rrun_34a6beaa911baacd8509c66bb85adf74";
const CANCELLED = "rrun_5abb59f2ab9e02ccff1dad3f00df692b";
const LEGACY = "527d2b993c834729";

/** A pg Pool double that answers the hub SQL with the rows the preview returned. */
function previewRepository(readClockMs: number) {
  const client = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      if (/workspace_members/.test(sql)) return { rows: [{}], rowCount: 1 };
      if (/transaction_timestamp/.test(sql)) return { rows: [{ as_of_utc_ms: String(readClockMs) }], rowCount: 1 };
      const runId = params[1] as string;
      const entry = fixture.hub_rows[runId];
      if (/FROM research.run_producers producer/.test(sql)) {
        return entry?.kind === "durable" ? { rows: [entry.row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      if (/FROM public.run_read_models/.test(sql)) {
        return entry?.kind === "legacy" ? { rows: [entry.row], rowCount: 1 } : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return new ResearchSplitRepository({ connect: async () => client } as never);
}

const splitAt = (clock: number) => new ResearchSplitService(previewRepository(clock), { FEATURE_RESEARCH_SPLIT: "true" } as never);
const searchAt = (clock: number) => new ResearchSearchService(previewRepository(clock), { FEATURE_RESEARCH_SEARCH: "true" } as never);

describe("RF-05 real preview rows (QuantBT 1.1.1, BTCUSDT 1h)", () => {
  it("Split: projection-time as-of, verified 1h bar interval, three-window NOT_APPLICABLE, one absence authority", async () => {
    const before = fixture.live_before[`before-split-${COMPLETED}`]!;
    const first = await splitAt(1_790_244_490_316).detail(scope, COMPLETED);
    const second = await splitAt(1_790_244_491_356).detail(scope, COMPLETED);
    // CG-P14-04: the deployed build published its read clock (changes per GET).
    expect(before.as_of_utc_ms).not.toBe(first.as_of_utc_ms);
    expect(first.as_of_utc_ms).toBe(fixture.hub_rows[COMPLETED]!.row.projection_received_at_utc_ms);
    expect(second).toEqual(first);
    // The content revision is untouched; the validator names the representation.
    expect(first.revision).toBe(before.revision);
    expect(first.etag).not.toBe(before.etag);
    // CG-P14-05: the real P08 binding verifies against the producer digest.
    expect(first.dataset).toMatchObject({ state: "AVAILABLE", symbol: "BTCUSDT", timeframe: "1h", bar_interval_ms: 3_600_000 });
    // CG-P14-03
    expect(first.protocol.purge.state).toBe("NOT_APPLICABLE");
    expect(first.protocol.embargo.state).toBe("NOT_APPLICABLE");
    expect(first.protocol.inner_folds.state).toBe("NOT_APPLICABLE");
    expect(first.windows.holdout).toMatchObject({ bars: null, bars_absence: { reason_code: "P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE" } });
    // Every chronology fact is byte-identical to what was served before.
    expect(first.timeline).toEqual(before.timeline);
    expect(first.windows.is).toEqual((before.windows as Record<string, unknown>).is);
    expect(first.windows.outer_oos).toEqual((before.windows as Record<string, unknown>).outer_oos);
    openApiValidator("research-split.openapi.json", "SplitDetail").assert(first);
    writeReceipt(`split-${COMPLETED}`, first);
  });

  it("Split: cancelled and legacy runs carry a durable as-of and typed dataset state", async () => {
    const cancelled = await splitAt(1).detail(scope, CANCELLED);
    expect(cancelled).toMatchObject({
      as_of_basis: "RUN_STATE_UPDATED_AT",
      as_of_utc_ms: fixture.hub_rows[CANCELLED]!.row.state_updated_at_utc_ms,
      etag: null,
      dataset: { state: "AVAILABLE", timeframe: "1h" },
    });
    const legacy = await splitAt(1).detail(scope, LEGACY);
    expect(legacy).toMatchObject({
      as_of_basis: "LEGACY_READ_MODEL_UPDATED_AT",
      as_of_utc_ms: fixture.hub_rows[LEGACY]!.row.updated_at_utc_ms,
      dataset: { state: "LEGACY_METADATA_ONLY", timeframe: null },
    });
    for (const detail of [cancelled, legacy]) openApiValidator("research-split.openapi.json", "SplitDetail").assert(detail);
    writeReceipt(`split-${CANCELLED}`, cancelled);
    writeReceipt(`split-${LEGACY}`, legacy);
  });

  it("Search: fold-bound validator and the declared-not-executed claim row", async () => {
    const before = fixture.live_before[`before-search-f1-${COMPLETED}`]!;
    const fold1 = await searchAt(1).detail(scope, COMPLETED, { fold: 1 });
    const fold3 = await searchAt(2).detail(scope, COMPLETED, { fold: 3 });
    expect(fold1.revision).toBe(before.revision);
    expect(fold1.revision).toBe(fold3.revision);
    expect(fold1.etag).not.toBe(fold3.etag);
    expect(fold1.claim_row).toMatchObject({
      basis: "DECLARED_NOT_EXECUTED",
      validation_claim: { state: "NOT_APPLICABLE" },
      chronological_claim: { state: "NOT_APPLICABLE" },
      oos_used_for_selection: { state: "NOT_ASSERTED" },
      oos_column: { state: "REPORT_ONLY", source_evaluation_state: "P04_OBSERVED_AFTER_FIXED_PROFILE" },
      scoring_backend: { state: "NOT_APPLICABLE", declared_value: null },
      mode_reference: { mode: "mode_1_decay", schedule: "global" },
    });
    openApiValidator("research-search.openapi.json", "SearchDetail").assert(fold1);
    writeReceipt(`search-f1-${COMPLETED}`, fold1);
    writeReceipt(`search-f3-${COMPLETED}`, fold3);
  });

  it("current-source: the real P04 runs are NOT_APPLICABLE (200); the legacy row stays a typed 409", async () => {
    expect(fixture.hub_rows[COMPLETED]!.row.adapter_contract_digest).toBe(P04_DELTA_ADAPTER_CONTRACT_DIGEST);
    expect(fixture.live_before[`before-cs-split-${COMPLETED}`]!.error).toMatchObject({ code: "RESEARCH_CURRENT_SOURCE_CONFLICT" });
    // The binding is the preview's own run_producers value, as runState joins it.
    const binding = (runId: string) => (fixture.hub_rows[runId]!.row.adapter_contract_digest as string | undefined) ?? null;
    // Migration 062 backfills every pre-W1 producer as the P04 fixed profile.
    const statuses: Record<string, { sourceKind: string; effectiveStatus: string; adapterContractDigest: string | null; executionProfileId: string | null }> = {
      [COMPLETED]: { sourceKind: "RESEARCH_DURABLE", effectiveStatus: "COMPLETED", adapterContractDigest: binding(COMPLETED), executionProfileId: "p04.fixed-qualification.v1" },
      [CANCELLED]: { sourceKind: "RESEARCH_DURABLE", effectiveStatus: "CANCELLED", adapterContractDigest: binding(CANCELLED), executionProfileId: "p04.fixed-qualification.v1" },
      [LEGACY]: { sourceKind: "LEGACY_1_0_8_METADATA", effectiveStatus: "QUEUED", adapterContractDigest: null, executionProfileId: null },
    };
    const service = new ResearchCurrentSourceService({
      sealForRead: vi.fn().mockResolvedValue(null),
      runState: vi.fn(async (_scope: unknown, runId: string) => statuses[runId] ?? null),
    } as never, {
      FEATURE_RESEARCH_CURRENT_SOURCE: "true",
      QUERY_CURSOR_ACTIVE_KEY_ID: "query-k1",
      QUERY_CURSOR_KEYS_JSON: '{"query-k1":"current-source-test-key-is-at-least-32-bytes"}',
      QUERY_CURSOR_TTL_SECONDS: 900,
    } as never);
    for (const runId of [COMPLETED, CANCELLED]) {
      const answer = await service.split(scope, runId);
      expect(answer).toMatchObject({ schema_version: "research.current-source-not-applicable.v1", lane: { run_profile: "P04_FIXED_QUALIFICATION" } });
      openApiValidator("research-current-source.openapi.json", "LaneNotApplicable").assert(answer);
      writeReceipt(`current-source-split-${runId}`, answer);
    }
    await expect(service.split(scope, LEGACY)).rejects.toMatchObject({ status: 409, details: { lane_state: "NOT_RETAINED_LEGACY" } });
  });
});

/** Optional: RF05_RECEIPT_DIR=<dir> writes each produced response for the hand-off receipt. */
function writeReceipt(name: string, value: unknown) {
  const directory = process.env.RF05_RECEIPT_DIR;
  if (directory) writeFileSync(join(directory, `${name}.json`), `${JSON.stringify(value, null, 1)}\n`);
}
