import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-progress.openapi.json");
const generatedPath = join(ROOT, "generated", "research-progress.d.ts");

describe("P11 published Research Progress contract", () => {
  it("publishes exactly the four same-origin progress operations", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/research/runs/{runId}/progress",
      "/api/v1/research/runs/{runId}/events",
      "/api/v1/research/runs/{runId}/console",
      "/api/v1/research/runs/{runId}/cancel",
    ]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/progress"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/events"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/console"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/cancel"])).toEqual(["post"]);
  });

  it("generates the compact-read, console, cancellation and discriminated event vocabulary", () => {
    const generated = readFileSync(generatedPath, "utf8");
    for (const needle of [
      "researchProgressGetV1", "researchProgressStreamV1", "researchProgressConsoleGetV1",
      "researchProgressCancelV1", "ProgressRead", "ProgressSnapshot", "ProgressEvent",
      "ProgressStreamEvent", "ProgressHeartbeat", "ProgressTerminalFrame", "ConsolePage",
      "ProgressTrialPayload", "ProgressFoldSegmentPayload", "ProgressFoldSegmentObservedEvent",
      "ProgressMethodologyCertificate", "ProgressArtifactSealedPayload", "ProgressRunCompletedEvent",
      "P12_OWNED_NO_P11_RETRY_ROUTE", "PENDING_SOURCE_CALLBACK",
      "PENDING_RECONCILIATION", "research.progress.snapshot",
    ]) expect(generated).toContain(needle);
    // Screen 03 can narrow by event_type and read its declared payload without
    // hand-parsing an unknown source dictionary.  Keep this assertion against
    // generated output: a future OpenAPI simplification must not silently turn
    // the typed union back into `{ [key: string]: unknown }`.
    expect(generated).toContain('event_type: "trial_completed";');
    expect(generated).toContain('event_type: "fold_segment_observed";');
    expect(generated).toContain('event_type: "artifact_sealed";');
    expect(generated).not.toContain("ProgressEventPayload");
  });

  it("does not publish private worker, source, broker or terminal-control inputs", () => {
    const document = readFileSync(openApiPath, "utf8");
    for (const forbidden of [
      "attempt_id", "lease_epoch", "worker_attempt_id", "x-portal-principal", "internal/research",
      "source_path", "NATS_URL", "broker_url", "artifact_store_path", "retry/CLI",
    ]) expect(document).not.toContain(forbidden);
    expect(document).toContain("same-origin");
    expect(document).toContain("at most 500");
    expect(document).toContain("reconnect_required");
  });
});
