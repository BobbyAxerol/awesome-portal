import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");
const openApiPath = join(ROOT, "openapi", "research-progress.openapi.json");
const generatedPath = join(ROOT, "generated", "research-progress.d.ts");

describe("P11 published Research Progress contract", () => {
  it("publishes exactly the five same-origin progress operations", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as {
      paths: Record<string, Record<string, unknown>>;
    };
    expect(Object.keys(openApi.paths)).toEqual([
      "/api/v1/research/runs/{runId}/progress",
      "/api/v1/research/runs/{runId}/events",
      "/api/v1/research/runs/{runId}/console",
      "/api/v1/research/runs/{runId}/requested-spec",
      "/api/v1/research/runs/{runId}/cancel",
    ]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/progress"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/events"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/console"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/requested-spec"])).toEqual(["get"]);
    expect(Object.keys(openApi.paths["/api/v1/research/runs/{runId}/cancel"])).toEqual(["post"]);
    // CG-P11-03: every GET documents the reserved access-policy refusal.
    for (const path of ["progress", "events", "console", "requested-spec"]) {
      const get = openApi.paths[`/api/v1/research/runs/{runId}/${path}`].get as { responses: Record<string, unknown> };
      expect(Object.keys(get.responses)).toContain("403");
    }
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
      "ProgressRetainedArtifact", "retained_artifacts",
      "ProgressQueue", "ProgressAttempt", "claimed_at_utc_ms", "started_at_utc_ms", "ended_at_utc_ms",
      // W2 (CG-P11-03/-06/-07/-08/-09)
      "researchRunRequestedSpecGetV1", "RunRequestedSpec", "ProgressRunIdentity", "declared_folds",
      "ProgressDeniedArtifact", "denied_artifacts", "ProgressFoldSelection", "ProgressHandoffCursor",
      "handoff_cursor", "lease_expired_at_utc_ms", "FAIL_CLOSED_NEW_RUN_FROM_REQUESTED_SPEC", "new_run_from",
      "P11_STREAM_READ_OVER_FRAME_BUDGET", "evidence_digest", "split_digest", "best_objective",
    ]) expect(generated).toContain(needle);
    // CG-P11-09: an unmeasured usage field is nullable, never a required zero.
    expect(generated).toMatch(/fd_peak: number \| null;/);
    expect(generated).toMatch(/scratch_bytes: number \| null;/);
    // RF01-B3: the retained-table list is the one place the artifact
    // authority's integrity states reach the browser.
    expect(generated).toContain('state: "PENDING" | "WRITING" | "SEALED" | "ABORTED" | "CORRUPT" | "MISSING";');
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
