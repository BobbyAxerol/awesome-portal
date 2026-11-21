/**
 * Test doubles for the Sandbox screen: port fakes and the published bodies, for tests only.
 *
 * Bodies come from the canonical fixtures Codex publishes (`packages/contracts/fixtures`), read from
 * disk by the testkit and run through the REAL dispatch (`readSandboxByVersion`), so a screen test
 * sees exactly what the HTTP client would hand it. Nothing here is imported by product code.
 */
import { vi } from "vitest";

import type { ExecutionApi, Result } from "../../../api/ports";
import type { ReviewCapture, ReviewCaptureCapabilities, SandboxNoteInput } from "../../../api/reviewCapture";
import { forgetExecutionRuntime } from "../../../useExecutionRuntime";
import { readSandboxByVersion, type SandboxVersionRead } from "../../readers/dispatch";
import { loadCanonical } from "../../testkit/loadCanonical";
import type { Draft } from "../../testkit/matrix";

export const V1_FIXTURE = "execution-sandbox-certification.unavailable";
export const V2_FIXTURE = "execution-positive-parent.synthetic";

/** The published V1 body (every step UNAVAILABLE, no findings), a fresh copy. */
export const v1Body = (): Draft => loadCanonical(V1_FIXTURE);
/** One of the published V2 following-parent bodies: `sandbox`, `sandbox_absent`, `sandbox_draft`. */
export const v2Body = (key: "sandbox" | "sandbox_absent" | "sandbox_draft" = "sandbox"): Draft => (loadCanonical(V2_FIXTURE) as Draft)[key];

/** What the port answers for a body: the real dispatch. */
export const readOf = (body: unknown): SandboxVersionRead => readSandboxByVersion(body);
export const okRead = (body: unknown): Result<SandboxVersionRead> => ({ ok: true, value: readOf(body) });

/** A V1 body with the steps, findings, timeline and plans a certification in flight carries (still schema-valid). */
export function v1Rich(): Draft {
  const body = v1Body();
  const states = ["PASS", "PASS", "PASS", "FAIL", "PASS", "UNAVAILABLE", "UNAVAILABLE"];
  body.steps.forEach((step: Draft, index: number) => {
    step.evaluation_state = states[index];
    step.strip_state = index < 3 ? "DONE" : index === 3 ? "CURRENT" : "PENDING";
    step.summary = states[index] === "PASS" ? `Step ${index + 1} evidence accepted.` : states[index] === "FAIL" ? "2 findings are still open." : "Cleanup evidence has not arrived yet.";
    step.source_verification_state = states[index] === "PASS" ? "VERIFIED" : "UNAVAILABLE";
    step.evidence_hash = states[index] === "PASS" ? `sha256:${"c".repeat(64)}` : null;
    step.evidence_schema_version = states[index] === "PASS" ? "sandbox-evidence.v1" : null;
    step.as_of = states[index] === "PASS" ? `2026-10-16T17:5${index}:00.000Z` : null;
    step.expires_at = states[index] === "PASS" ? "2026-10-23T17:50:00.000Z" : null;
    step.blocker_code = states[index] === "PASS" ? null : `SANDBOX_STEP_${step.step_key}_${states[index]}`;
  });
  body.progress = {
    passed_count: 4,
    total_count: 7,
    eligible: false,
    evidence_set_hash: `sha256:${"d".repeat(64)}`,
    blocker_codes: ["SANDBOX_STEP_RECONCILIATION_FAIL", "SANDBOX_STEP_CLEANUP_UNAVAILABLE", "SANDBOX_STEP_EXIT_REVIEW_UNAVAILABLE"],
  };
  body.findings = {
    total_count: 2,
    returned_count: 2,
    truncated: false,
    rows: [
      { finding_id: "fnd_TEST_ONLY_1", severity: "WARNING", source_authority: "DERIVED", finding_code: "FEE_DIFF", summary: "Fee total differs between the two sources", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-10-17T12:02:00.000Z" },
      { finding_id: "fnd_TEST_ONLY_2", severity: "INFO", source_authority: "DERIVED", finding_code: "FILL_LATE", summary: "Fill 3 arrived 4 s late", blocking: false, evidence_hash: null, as_of: null, resolved_at: null, created_at: "2026-10-17T11:15:00.000Z" },
    ],
  };
  body.timeline = {
    total_count: 2,
    returned_count: 2,
    truncated: false,
    rows: [
      { event_id: "evt_TEST_ONLY_2", actor_user_id: "usr_TEST_ONLY_a", action: "SUBMIT", workflow_version_before: 1, workflow_version_after: 2, created_at: "2026-10-17T12:02:00.000Z" },
      { event_id: "evt_TEST_ONLY_1", actor_user_id: "usr_TEST_ONLY_a", action: "CREATE", workflow_version_before: 0, workflow_version_after: 1, created_at: "2026-10-16T17:55:00.000Z" },
    ],
  };
  body.promotion_plans = [
    { plan_id: "plan_TEST_ONLY_1", target_stage: "CANARY", evidence_set_hash: `sha256:${"e".repeat(64)}`, status: "BLOCKED", blocker_codes: ["SANDBOX_NOT_ELIGIBLE"], source_side_effect_requested: false, created_at: "2026-10-17T12:10:00.000Z" },
  ];
  return body;
}

export interface FakeApi extends ExecutionApi {
  read: ReturnType<typeof vi.fn>;
  capabilities: ReturnType<typeof vi.fn>;
  capture: ReturnType<typeof vi.fn>;
}

export const capabilitiesBody = (state: "AVAILABLE" | "UNAVAILABLE" = "AVAILABLE", reason = "ADMIN_REQUIRED"): ReviewCaptureCapabilities => {
  const row = (id: string, path: string): Draft => ({ id, state: "AVAILABLE", path: `/api/v1/execution/governance/${path}`, inputs: "summary" });
  return {
    schema_version: "governance.review-capture-capabilities.v1",
    authority: "PORTAL",
    source_side_effect_requested: false,
    actions: [
      row("R2_CREATE", "r2/capture"),
      row("PAPER_EXIT_CREATE", "paper-exit/create"),
      state === "AVAILABLE" ? row("SANDBOX_NOTE", "sandbox/capture-note") : { id: "SANDBOX_NOTE", state: "UNAVAILABLE", reason_code: reason },
      { id: "R2_EXECUTION_GRANT", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED" },
      { id: "PAPER_EXIT_PROMOTE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED" },
      { id: "SANDBOX_CERTIFY_SOURCE", state: "UNAVAILABLE", reason_code: "SOURCE_OWNED" },
    ],
  } as ReviewCaptureCapabilities;
};

export const captureBody = (over: Partial<ReviewCapture> = {}, input?: Pick<SandboxNoteInput, "workspace_id" | "certification_id">): ReviewCapture =>
  ({
    schema_version: "governance.review-capture.v1",
    authority: "PORTAL",
    workspace_id: input?.workspace_id ?? "ws_TEST_ONLY_parent",
    action: "SANDBOX_NOTE",
    replayed: false,
    source_side_effect_requested: false,
    aggregate_id: input?.certification_id ?? "cert_TEST_ONLY_parent",
    workflow_version: 4,
    source_verdict: "NOT_ASSERTED",
    certification_id: input?.certification_id ?? "cert_TEST_ONLY_parent",
    deployment_id: "dep_TEST_ONLY_parent",
    read_path: "/api/v1/execution/deployments/dep_TEST_ONLY_parent/certification",
    decision_reason_code: "ACCEPTED_SANDBOX_STEP_EVIDENCE_UNAVAILABLE",
    ...over,
  }) as ReviewCapture;

export interface FakeOptions {
  /** What the certification read answers (each call, or one per call when a list). */
  read?: Result<SandboxVersionRead> | readonly Result<SandboxVersionRead>[];
  capabilities?: Result<ReviewCaptureCapabilities>;
  capture?: (input: SandboxNoteInput) => Promise<Result<ReviewCapture>>;
  manifestWorkspace?: string | null;
}

/** A port fake: only the four methods this screen calls, as spies. Anything else throws, so a stray call is loud. */
export function fakeApi(options: FakeOptions = {}): FakeApi {
  forgetExecutionRuntime();
  const answers = Array.isArray(options.read) ? [...options.read] : [options.read ?? okRead(v2Body())];
  const read = vi.fn(async () => (answers.length > 1 ? answers.shift()! : answers[0]!));
  const capabilities = vi.fn(async () => options.capabilities ?? ({ ok: true, value: capabilitiesBody() } as Result<ReviewCaptureCapabilities>));
  const capture = vi.fn(options.capture ?? (async (input: SandboxNoteInput) => ({ ok: true, value: captureBody({}, input) }) as Result<ReviewCapture>));
  const api = {
    getSandboxCertificationVersioned: read,
    getReviewCaptureCapabilities: capabilities,
    captureSandboxNote: capture,
    getRuntimeManifest: async () =>
      options.manifestWorkspace === null || options.manifestWorkspace === undefined
        ? ({ ok: false, status: "unavailable", reason: "no manifest in this test" } as Result<never>)
        : ({ ok: true, value: { workspaceId: options.manifestWorkspace, readAtMs: 0, bounds: { maximumPageRows: 100, maximumResponseBytes: 1048576, maximumCursorBytes: 4096 }, semantics: {}, externalGates: [], profileQualification: [], profileQualificationDigest: null } } as unknown as Result<never>),
    read,
    capabilities,
    capture,
  };
  return api as unknown as FakeApi;
}
