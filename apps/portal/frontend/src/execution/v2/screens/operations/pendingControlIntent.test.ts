/**
 * RV-10 · the pending-control preview REQUEST, built from the served recall (FE-062 discovery) and nothing typed.
 *
 * Bodies: the canonical discovery fixtures (`execution-pending-control-currency.synthetic`) read through the strict reader, and the
 * request is checked against the published `PendingControlIntent` schema. Lane: FIXTURE_LAB.
 */
import { describe, expect, it } from "vitest";

import { PENDING_VERSION_KEYS } from "../../readers/commandCurrency";
import { readPendingRecallDiscoveryV1, type DiscoveredRecall } from "../../readers/pendingRecallDiscovery";
import { loadCanonical } from "../../testkit/loadCanonical";
import { validateAgainst } from "../../testkit/schema";
import {
  POLICY_REVISION_GAP, RECALL_UNKNOWN_GAP, WORKSPACE_GAP, buildPendingControlIntent, intentFingerprint, newPendingKey, previewGate, reasonBlock,
  type PendingControlTarget,
} from "./pendingControlIntent";

type Draft = any;
const FIXTURE = loadCanonical<Record<string, Draft>>("execution-pending-control-currency.synthetic");
const OA = "../openapi/execution-pending-control.openapi.json";
const intentViolations = (value: unknown) => validateAgainst(OA, "/components/schemas/PendingControlIntent", value);

function recallsOf(body: unknown): readonly DiscoveredRecall[] {
  const read = readPendingRecallDiscoveryV1(body);
  if (read === null || read.kind !== "pending_recall_discovery") throw new Error("fixture does not read");
  return read.discovery.items;
}
const [WAITING, UNKNOWN] = recallsOf(FIXTURE.discovery_open) as [DiscoveredRecall, DiscoveredRecall];
const [ON_DEPLOYMENT] = recallsOf(FIXTURE.discovery_deployment) as [DiscoveredRecall];
const KEY = "pending_control:0123456789abcdef";

const portfolio = (over: Partial<PendingControlTarget> = {}): PendingControlTarget => ({
  workspaceId: "ws_TEST_ONLY", resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" }, environment: "paper", recall: WAITING, policyRevision: "TEST_ONLY:portal-policy", ...over,
});
const deployment = (): PendingControlTarget => ({
  workspaceId: "ws_TEST_ONLY", resource: { kind: "DEPLOYMENT", id: "TEST_ONLY:deployment" }, environment: "paper", recall: ON_DEPLOYMENT, policyRevision: "TEST_ONLY:portal-policy",
});

describe("expected_versions are the served counters, never typed", () => {
  it("copies the five counters of the recall's last receipt as exact strings (above 2^53 too)", () => {
    const built = buildPendingControlIntent({ target: portfolio(), operation: "APPLY_PENDING", reason: "Release the remainder", idempotencyKey: KEY });
    if (!built.ok) throw new Error(built.reason);
    const served = (WAITING as { versions: Record<string, string> }).versions;
    expect(built.intent.business_payload.expected_versions).toEqual({ budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" });
    for (const key of PENDING_VERSION_KEYS) {
      expect(typeof built.intent.business_payload.expected_versions[key]).toBe("string");
      expect(built.intent.business_payload.expected_versions[key]).toBe(served[key]);
    }
  });

  it("the builder has no input for them: a copy of the served object, not the served object", () => {
    const built = buildPendingControlIntent({ target: portfolio(), operation: "APPLY_PENDING", reason: "Release the remainder", idempotencyKey: KEY });
    if (!built.ok) throw new Error(built.reason);
    expect(built.intent.business_payload.expected_versions).not.toBe((WAITING as { versions: unknown }).versions);
  });

  it("a recall with an unknown outcome has no counters, so no request is built (zero is not a counter)", () => {
    expect(UNKNOWN.state).toBe("UNKNOWN");
    const built = buildPendingControlIntent({ target: portfolio({ recall: UNKNOWN }), operation: "APPLY_PENDING", reason: "Release the remainder", idempotencyKey: KEY });
    expect(built).toMatchObject({ ok: false, code: RECALL_UNKNOWN_GAP });
  });
});

describe("the request is the published intent", () => {
  it("PORTFOLIO: schema-valid, exact members, recipient PORTFOLIO and no account", () => {
    const built = buildPendingControlIntent({ target: portfolio(), operation: "APPLY_PENDING", reason: "  Release the remainder  ", idempotencyKey: KEY });
    if (!built.ok) throw new Error(built.reason);
    expect(intentViolations(built.intent)).toEqual([]);
    expect(built.intent).toEqual({
      schema_version: "portal.execution.pending-recall-intent.v1",
      workspace_id: "ws_TEST_ONLY",
      resource: { kind: "PORTFOLIO", id: "TEST_ONLY:portfolio" },
      environment: "paper",
      expected_policy_revision: "TEST_ONLY:portal-policy",
      business_payload: {
        schema_version: "pma.operator-control.v1", operation: "APPLY_PENDING", idempotency_key: KEY, currency: "USDT", reason: "Release the remainder",
        command_id: "TEST_ONLY:original-recall",
        expected_versions: { budget: "9007199254740993", source: "11", parent: "12", book: "13", command: "14" },
        recipient_kind: "PORTFOLIO",
      },
    });
  });

  it("DEPLOYMENT: the owning account is the served one and the deployment is the resource", () => {
    const built = buildPendingControlIntent({ target: deployment(), operation: "CANCEL_REMAINING", reason: "Stop the recall", idempotencyKey: KEY });
    if (!built.ok) throw new Error(built.reason);
    expect(intentViolations(built.intent)).toEqual([]);
    expect(built.intent.business_payload).toMatchObject({
      operation: "CANCEL_REMAINING", recipient_kind: "DEPLOYMENT_ACCOUNT", recipient_account_id: "TEST_ONLY:account", recipient_deployment_id: "TEST_ONLY:deployment",
    });
  });

  it("the idempotency key is carried in the body exactly as given", () => {
    const built = buildPendingControlIntent({ target: portfolio(), operation: "APPLY_PENDING", reason: "r", idempotencyKey: KEY });
    expect(built.ok && built.intent.business_payload.idempotency_key).toBe(KEY);
    expect(buildPendingControlIntent({ target: portfolio(), operation: "APPLY_PENDING", reason: "r", idempotencyKey: "short" })).toMatchObject({ ok: false, code: "IDEMPOTENCY_KEY_INVALID" });
  });

  it("newPendingKey is a key the server accepts, and a fresh one each time", () => {
    const a = newPendingKey();
    expect(a).toMatch(/^[A-Za-z0-9._:-]{8,128}$/);
    expect(newPendingKey()).not.toBe(a);
  });
});

describe("the gate: one reason, the first that applies", () => {
  it("no workspace", () => {
    expect(previewGate(portfolio({ workspaceId: null }))).toMatchObject({ open: false, code: WORKSPACE_GAP });
    expect(previewGate(portfolio({ workspaceId: "" }))).toMatchObject({ open: false, code: WORKSPACE_GAP });
  });
  it("an unknown outcome", () => {
    expect(previewGate(portfolio({ recall: UNKNOWN }))).toMatchObject({ open: false, code: RECALL_UNKNOWN_GAP });
  });
  it("no served policy revision: the typed gap, never a made-up value", () => {
    expect(previewGate(portfolio({ policyRevision: null }))).toMatchObject({ open: false, code: POLICY_REVISION_GAP });
    expect(buildPendingControlIntent({ target: portfolio({ policyRevision: null }), operation: "APPLY_PENDING", reason: "r", idempotencyKey: KEY }))
      .toMatchObject({ ok: false, code: POLICY_REVISION_GAP });
  });
  it("open otherwise", () => {
    expect(previewGate(portfolio())).toEqual({ open: true });
  });
});

describe("the reason", () => {
  it.each<[string, string | null]>([
    ["", "A reason is required."],
    ["   ", "A reason is required."],
    ["ok", null],
    ["x".repeat(512), null],
    ["x".repeat(513), "The reason must be plain text of at most 512 characters."],
    ["bad\u0007text", "The text has a control or direction character. Remove it."],
    ["bad‮text", "The text has a control or direction character. Remove it."],
  ])("%j -> %j", (text, expected) => {
    expect(reasonBlock(text)).toBe(expected);
  });
});

describe("the fingerprint ties a reference to an intent", () => {
  const make = (over: { reason?: string; operation?: "APPLY_PENDING" | "CANCEL_REMAINING"; key?: string; target?: PendingControlTarget }) => {
    const built = buildPendingControlIntent({ target: over.target ?? portfolio(), operation: over.operation ?? "APPLY_PENDING", reason: over.reason ?? "same reason", idempotencyKey: over.key ?? KEY });
    if (!built.ok) throw new Error(built.reason);
    return intentFingerprint(built.intent);
  };
  it("the key is not part of it; the operation, reason, policy and versions are", () => {
    expect(make({ key: "pending_control:aaaaaaaaaaaa" })).toBe(make({ key: "pending_control:bbbbbbbbbbbb" }));
    expect(make({ reason: "other reason" })).not.toBe(make({}));
    expect(make({ operation: "CANCEL_REMAINING" })).not.toBe(make({}));
    expect(make({ target: portfolio({ policyRevision: "TEST_ONLY:next" }) })).not.toBe(make({}));
    const moved = { ...WAITING, versions: { ...(WAITING as { versions: object }).versions, source: "12" } } as DiscoveredRecall;
    expect(make({ target: portfolio({ recall: moved }) })).not.toBe(make({}));
  });
});
