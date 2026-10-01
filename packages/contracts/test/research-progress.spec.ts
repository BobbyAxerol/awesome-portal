import { readFileSync } from "node:fs";
import { join } from "node:path";

import Ajv2020 from "ajv/dist/2020";
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
      "P11_STREAM_READ_OVER_FRAME_BUDGET", "evidence_digest", "split_digest", "best_objective", "rate_trials_per_s",
      // E10: where a FAILED run stopped and why.
      "ProgressFailedAt", "ProgressTerminalReason", "failed_at", "terminal_reason",
      "SOURCE_RUNNING_STAGE", "FIRST_UNFINISHED_STAGE",
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

  it("CG-FG-S03-01: validates a bounded planned-fold identity and rejects an invented range", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { components: { schemas: Record<string, unknown> } };
    const rewrite = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === "object") return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key, key === "$ref" && typeof item === "string"
            ? item.replace("#/components/schemas/", "#/$defs/") : rewrite(item),
        ]),
      );
      return value;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema({ $id: "research-progress", $defs: rewrite(openApi.components.schemas) });
    const validate = ajv.getSchema("research-progress#/$defs/ProgressRunIdentity")!;
    const fixture = JSON.parse(readFileSync(
      join(ROOT, "fixtures", "research-progress.planned-folds.valid.json"), "utf8",
    )) as Record<string, unknown>;
    expect(validate(fixture), JSON.stringify(validate.errors)).toBe(true);
    const invalid = structuredClone(fixture) as { planned_folds: { folds: Array<{ test_end_utc_ms: number }> } };
    invalid.planned_folds.folds[0]!.test_end_utc_ms = -1;
    expect(validate(invalid)).toBe(false);
  });

  it("E10: the canonical failed-at fixture validates against the published read contract", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { components: { schemas: Record<string, unknown> } };
    const rewrite = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          key === "$ref" && typeof item === "string" ? item.replace("#/components/schemas/", "#/$defs/") : rewrite(item),
        ]));
      }
      return value;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema({ $id: "research-progress", $defs: rewrite(openApi.components.schemas) });
    const failedAt = ajv.getSchema("research-progress#/$defs/ProgressFailedAt")!;
    const terminalReason = ajv.getSchema("research-progress#/$defs/ProgressTerminalReason")!;
    const fixture = JSON.parse(readFileSync(join(ROOT, "fixtures", "research-progress.failed-at.valid.json"), "utf8")) as {
      current: { failed_at: unknown; terminal_reason: unknown };
    };
    expect(failedAt(fixture.current.failed_at), JSON.stringify(failedAt.errors)).toBe(true);
    expect(terminalReason(fixture.current.terminal_reason), JSON.stringify(terminalReason.errors)).toBe(true);
    // A stage outside the five contract stages, or an unknown origin, is refused.
    expect(failedAt({ stage: "S6", fold: null, basis: "SOURCE_RUNNING_STAGE" })).toBe(false);
    expect(terminalReason({ code: "X", message: "y", origin: "BROWSER" })).toBe(false);
  });

  it("LW-05: publishes a typed WFO source trial id distinct from the progress ordinal", () => {
    const openApi = JSON.parse(readFileSync(openApiPath, "utf8")) as { components: { schemas: Record<string, unknown> } };
    const rewrite = (value: unknown): unknown => {
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === "object") {
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [
          key,
          key === "$ref" && typeof item === "string" ? item.replace("#/components/schemas/", "#/$defs/") : rewrite(item),
        ]));
      }
      return value;
    };
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    ajv.addSchema({ $id: "research-progress", $defs: rewrite(openApi.components.schemas) });
    const selection = ajv.getSchema("research-progress#/$defs/ProgressFoldSelection")!;
    const fixture = JSON.parse(readFileSync(
      join(ROOT, "fixtures", "research-progress.wfo-selection.valid.json"), "utf8",
    )) as Record<string, unknown>;
    expect(selection(fixture), JSON.stringify(selection.errors)).toBe(true);
    expect(selection({ ...fixture, source_trial_id: 393 })).toBe(false);
    expect(selection({ ...fixture, objective_kind: "IS_MEAN_SHARPE" })).toBe(false);
    expect(readFileSync(generatedPath, "utf8")).toContain("source_trial_id?: string");
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
