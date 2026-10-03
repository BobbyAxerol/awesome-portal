import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-replay.openapi.json");
const generatedPath = join(ROOT, "generated", "research-replay.d.ts");

describe("P17 published Research Replay contract", () => {
  it("publishes exactly one bounded same-origin replay reader", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { paths: Record<string, Record<string, unknown>> };
    expect(Object.keys(openApi.paths)).toEqual(["/api/v1/quantbt/runs/{runId}/execute/replay"]);
    expect(Object.keys(openApi.paths["/api/v1/quantbt/runs/{runId}/execute/replay"]!)).toEqual(["get"]);
  });

  it("generates typed opaque seek, retrospective state and source-gap vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchReplayDetailGetV1", "playback_cursor", "RETROSPECTIVE_EQUITY_NOT_EXECUTION_STATE",
      "SOURCE_CHRONOLOGICAL_SAMPLE_ORDINAL_ASC", "child_audit_provenance", "P17_CURRENT_P04_EQUITY_SAMPLE_V1",
      "trades_reported", "orders_published", "OOS_EQUITY_WINDOW",
      "ReplayNavigationIdentity", "ReplayNavigationWindow", "alpha_version_id", "is_window", "oos_window", "holdout_window",
      "research.replay-navigation.v1", "presentation_digest", "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP",
      "IMMUTABLE_REQUEST_ALPHA_BINDING", "HUB_BOUND_ALPHA_IDENTITY", "BOUND_WINDOW_METADATA",
      "DECLARED_IS_WINDOW", "DECLARED_OOS_WINDOW", "DECLARED_HOLDOUT_WINDOW",
      "RETAINED_FOLD_TRAIN_WINDOWS", "RETAINED_FOLD_TEST_WINDOWS",
    ]) expect(generated).toContain(needle);
  });

  it("does not publish a generic relation, source credential, worker custody field or compute/command route", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "relation_name", "source_cursor", "worker_attempt_id", "lease_epoch", "artifact_path", "raw_ohlcv",
      "private_key", "broker", "compute_job", "/commands", "POST /api",
    ]) expect(document).not.toContain(`\"${forbidden}\"`);
    expect(document).toContain("does not publish execution orders");
  });
});
