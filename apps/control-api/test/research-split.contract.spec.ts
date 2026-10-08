import { describe, expect, it } from "vitest";

import { ResearchSplitResponseSchema } from "../src/research/split.contract";
import { ResearchSplitSourceSchema } from "../src/research/progress.contract";
import { p14SplitSourceFixture } from "./research-split.fixture";

describe("P14 split source and reader contracts", () => {
  it("accepts the exact current-P04 three-window receipt and rejects a discontinuous chronology", () => {
    const source = p14SplitSourceFixture();
    expect(ResearchSplitSourceSchema.safeParse(source).success).toBe(true);
    expect(ResearchSplitSourceSchema.safeParse({
      ...source,
      windows: { ...source.windows, outer_oos: { ...source.windows.outer_oos, start_utc_ms: source.windows.outer_oos.start_utc_ms + 1 } },
    }).success).toBe(false);
  });

  it("requires the reader to retain no-unlock / no-result holdout truth", () => {
    const absent = (state: "NOT_PUBLISHED" | "NOT_ASSERTED", reasonCode: string) => ({
      state,
      reason_code: reasonCode,
      availability: { state: "NOT_PUBLISHED", reason_code: reasonCode },
    });
    const response = {
      schema_version: "research.split-detail.v1", read_authority: "PORTAL_PERSISTED_RESEARCH", run_id: "run_p14",
      revision: "p14r1_" + "a".repeat(64), etag: "\"p14r1_" + "a".repeat(64) + "\"",
      availability: { state: "AVAILABLE", reason_code: null }, readiness: "PARTIAL", as_of_utc_ms: 1, as_of_basis: "P14_PROJECTION_RECEIVED_AT",
      dataset: { state: "AVAILABLE", dataset_id: "binance_spot_1h", symbol: "BTCUSDT", timeframe: "1h", bar_interval_ms: 3_600_000, provenance: "P08_DATASET_BINDING", reason_code: null, availability: { state: "AVAILABLE", reason_code: null } },
      provenance: { source_adapter_id: "p04.delta-rsi.v1", engine_version: "1.1.1", input_scope: "P08_OPTIONAL_WARMUP_PLUS_IS_OOS_ONLY", source_transform_digest: "a".repeat(64), requested_spec_digest: "b".repeat(64), effective_spec_digest: "c".repeat(64), dataset_binding_digest: "d".repeat(64), manifest_digest: "e".repeat(64) },
      timeline: p14SplitSourceFixture().timeline,
      protocol: { kind: "THREE_WINDOW_CURRENT", selection: { state: "FIXED_PROFILE_NO_SEARCH", parameter_bundle_digest: "f".repeat(64), strict_outer_oos: absent("NOT_ASSERTED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_STRICT_OUTER_OOS_SELECTION_FACTS") }, fold_plan: absent("NOT_PUBLISHED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_FOLD_PLAN"), inner_folds: absent("NOT_PUBLISHED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_INNER_FOLDS"), purge: absent("NOT_PUBLISHED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_PURGE"), embargo: absent("NOT_PUBLISHED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_EMBARGO"), theta_per_fold: absent("NOT_PUBLISHED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_THETA_PER_FOLD"), gap_scan: absent("NOT_PUBLISHED", "P04_FIXED_PROFILE_DOES_NOT_PUBLISH_GAP_SCAN") },
      windows: {
        warmup: { state: "NOT_APPLICABLE", bars: 0, reason_code: "P08_WARMUP_NOT_REQUESTED", availability: { state: "NOT_APPLICABLE", reason_code: "P08_WARMUP_NOT_REQUESTED" } },
        is: { ...p14SplitSourceFixture().windows.is, availability: { state: "AVAILABLE", reason_code: null } },
        outer_oos: { ...p14SplitSourceFixture().windows.outer_oos, availability: { state: "AVAILABLE", reason_code: null } },
        holdout: { ...p14SplitSourceFixture().windows.holdout, physical_io: { state: "NOT_ATTESTED", reason_code: "P10_ROW_GROUP_PHYSICAL_IO_BOUNDARY_NOT_PUBLISHED" }, source_seal: absent("NOT_PUBLISHED", "P04_SOURCE_DID_NOT_PUBLISH_HOLDOUT_SEAL"), unlock: absent("NOT_PUBLISHED", "DR01_HOLDOUT_UNLOCK_AUTHORITY_NOT_PUBLISHED"), bars_absence: absent("NOT_PUBLISHED", "P10_HOLDOUT_BARS_NOT_COUNTED_OUTSIDE_CHILD_TAPE"), availability: { state: "AVAILABLE", reason_code: null } },
      },
      actions: { holdout_unlock: { state: "NOT_PUBLISHED", href: null, availability: { state: "NOT_PUBLISHED", reason_code: "DR01_HOLDOUT_UNLOCK_AUTHORITY_NOT_PUBLISHED" } } },
      absence_authority: "FIELD_LOCAL",
      absence_index: [{ key: "purge", pointer: "/protocol/purge", state: "NOT_PUBLISHED" }],
      source_absences: {},
    };
    expect(ResearchSplitResponseSchema.safeParse(response).success).toBe(true);
    // Native IS optimizer receipts are not re-labelled as fixed/no-search.
    const native={...response,protocol:{...response.protocol,selection:{...response.protocol.selection,
      state:'NATIVE_OPTIMIZATION_SEALED_SEPARATELY'}}};
    expect(ResearchSplitResponseSchema.safeParse(native).success).toBe(true);
    expect(ResearchSplitResponseSchema.safeParse({
      ...response,
      windows: { ...response.windows, holdout: { ...response.windows.holdout, result_exposure_state: "EXPOSED" } },
    }).success).toBe(false);
    // RF-05: a representation must say where its as-of came from and why a holdout bar count is absent.
    const { as_of_basis: _basis, ...withoutBasis } = response;
    expect(ResearchSplitResponseSchema.safeParse(withoutBasis).success).toBe(false);
    const { bars_absence: _bars, ...holdoutWithoutReason } = response.windows.holdout;
    expect(ResearchSplitResponseSchema.safeParse({
      ...response, windows: { ...response.windows, holdout: holdoutWithoutReason },
    }).success).toBe(false);
  });
});
