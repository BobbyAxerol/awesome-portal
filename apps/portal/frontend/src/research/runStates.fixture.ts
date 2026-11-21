/**
 * W1 §4.1 — typed state builders for the run-status faces.
 *
 * DERIVED test data, not captures: each factory reads a canonical repo-root
 * fixture (readFileSync, never a static JSON import) and overrides ONLY the
 * status fields, so no screen text is hand-built here.
 *
 *   libraryRow(status, …)  <- e2e/research-foundation/run-library.json (item 0)
 *   hubFor(phase)          <- w3bRealWfo.fixture.json `hub_evidence`
 *   progressFor(status)    <- e2e/research-foundation/progress-read.json
 *   compose(sealed|unsealed) <- packages/contracts/fixtures/research-release-candidate.wfo-retained.valid.json
 *   report404()            <- the F-04 404 body (same for unknown / not yours / not sealed)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { PortalApiError } from "../lib/api";
import type { EvidenceHub } from "./evidenceClient";
import type { ProgressRead } from "./progressClient";
import type { RcCompose } from "./releaseCandidateClient";
import type { RunLibraryItem, RunLibraryResponse } from "./runLibraryClient";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const read = <T>(path: string): T => JSON.parse(readFileSync(join(ROOT, path), "utf8")) as T;

const LIBRARY = read<RunLibraryResponse>("apps/portal/frontend/e2e/research-foundation/run-library.json");
const WFO = read<{ hub_evidence: EvidenceHub }>("apps/portal/frontend/src/research/w3bRealWfo.fixture.json");
const PROGRESS = read<ProgressRead>("apps/portal/frontend/e2e/research-foundation/progress-read.json");
const COMPOSE = read<RcCompose>("packages/contracts/fixtures/research-release-candidate.wfo-retained.valid.json");

export type RunStatusWireFixture = RunLibraryItem["status"];

/** A Run Library row with the status (and optionally seal / source kind) overridden. */
export function libraryRow(
  status: RunStatusWireFixture,
  o: { runId?: string; sealed?: boolean; sourceKind?: RunLibraryItem["source_kind"] } = {},
): RunLibraryItem {
  const base = LIBRARY.items[0];
  return {
    ...base,
    ...(o.runId ? { run_id: o.runId } : {}),
    status,
    source_kind: o.sourceKind ?? base.source_kind,
    rc: o.sealed ? ({ ...(base.rc ?? {}), kind: "LOCAL_SEAL" } as RunLibraryItem["rc"]) : base.rc,
  };
}

/** What `runLibraryApi.list({ids})` answers: one row, or an empty page for a run the workspace does not list. */
export function libraryPage(rows: readonly RunLibraryItem[]): RunLibraryResponse {
  return { ...LIBRARY, items: [...rows] } as RunLibraryResponse;
}

export type HubPhase = "queued" | "running" | "completed" | "failed" | "cancelled";

/**
 * The canonical hub with `lifecycle` and `stages[]` overridden. For `failed`
 * and `cancelled` the S4 row keeps `RUNNING` and S5 is `PENDING` — what the
 * server leaves in a terminal run's last snapshot (B1).
 */
export function hubFor(phase: HubPhase): EvidenceHub {
  const hub = structuredClone(WFO.hub_evidence);
  const stage = (key: string, state: "DONE" | "RUNNING" | "PENDING") => ({
    key,
    state,
    started_at_utc_ms: null,
    completed_at_utc_ms: null,
  });
  const lifecycle = (durable: string, display: string, ph: string, outcome: string | null) =>
    ({ ...hub.lifecycle, durable_status: durable, display_status: display, phase: ph, terminal_outcome: outcome }) as EvidenceHub["lifecycle"];
  const withStages = (stages: ReturnType<typeof stage>[]) => ({ ...hub, stages }) as EvidenceHub;
  switch (phase) {
    case "completed":
      return hub;
    case "queued":
      return {
        ...withStages(["S1", "S2", "S3", "S4", "S5"].map((k) => stage(k, "PENDING"))),
        lifecycle: lifecycle("QUEUED", "QUEUED", "IN_PROGRESS", null),
      } as EvidenceHub;
    case "running":
      return {
        ...withStages([stage("S1", "DONE"), stage("S2", "DONE"), stage("S3", "DONE"), stage("S4", "RUNNING"), stage("S5", "PENDING")]),
        lifecycle: lifecycle("RUNNING", "RUNNING", "IN_PROGRESS", null),
      } as EvidenceHub;
    case "failed":
      return {
        ...withStages([stage("S1", "DONE"), stage("S2", "DONE"), stage("S3", "DONE"), stage("S4", "RUNNING"), stage("S5", "PENDING")]),
        lifecycle: lifecycle("FAILED", "FAILED", "TERMINAL", "FAILED"),
      } as EvidenceHub;
    case "cancelled":
      return {
        ...withStages([stage("S1", "DONE"), stage("S2", "DONE"), stage("S3", "DONE"), stage("S4", "RUNNING"), stage("S5", "PENDING")]),
        lifecycle: lifecycle("CANCELLED", "CANCELLED", "TERMINAL", "CANCELLED"),
      } as EvidenceHub;
  }
}

/** The canonical progress read with `current.effective_status` (and its job state) overridden. */
export function progressFor(
  status: "QUEUED" | "RUNNING" | "FINISHING" | "COMPLETED" | "FAILED" | "CANCELLED",
  o: { failedStage?: string | null } = {},
): ProgressRead {
  const read = structuredClone(PROGRESS);
  const current = read.current as unknown as Record<string, unknown>;
  current.effective_status = status;
  current.job_state = status;
  current.failed_at =
    status === "FAILED" && o.failedStage ? { stage: o.failedStage, fold: null, basis: "SOURCE_RUNNING_STAGE" } : null;
  return read;
}

/** The compose read with the local seal state overridden (the one field the S11 faces read). */
export function compose(seal: "sealed" | "unsealed"): RcCompose {
  const c = structuredClone(COMPOSE);
  if (seal === "unsealed") return c;
  return {
    ...c,
    local_seal: {
      ...c.local_seal,
      state: "SEALED_LOCAL",
      release_candidate_id: "rc_00000000000000000000000000000000",
    },
  } as RcCompose;
}

/** The F-04 404: identical for unknown / not yours / not sealed. */
export function report404(): PortalApiError {
  return new PortalApiError("Not found", 404, "RESEARCH_REPORT_NOT_FOUND", null);
}
