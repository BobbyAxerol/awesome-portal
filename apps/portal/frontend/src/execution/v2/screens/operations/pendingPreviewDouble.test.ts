/**
 * DEBT-048 item 9 · the fixture-lab double behind the Operations preview (`e2e/bffDoublePendingPreview.ts`), read through the REAL
 * strict readers and request builder, so the browser cell is scripted with bodies the page can actually read.
 */
import { describe, expect, it } from "vitest";

import { LAB_DEPLOYMENT_ID, PENDING_PREVIEW_PATH, answerPendingControlPreview, labDiscovery } from "../../../../../e2e/bffDoublePendingPreview";
import { readPendingControlPreviewV1, readPendingControlProblemV1, previewAnswers } from "../../readers/pendingControlPreview";
import { readPendingRecallDiscoveryV1 } from "../../readers/pendingRecallDiscovery";
import { buildPendingControlIntent, type PendingControlIntentWire } from "./pendingControlIntent";

const ASK = new URLSearchParams({ workspace_id: "ws_TEST_ONLY_operational", resource_kind: "DEPLOYMENT", resource_id: LAB_DEPLOYMENT_ID, environment: "paper" });

function served() {
  const answer = labDiscovery(ASK)!;
  const read = readPendingRecallDiscoveryV1(answer.body);
  if (read === null || read.kind !== "pending_recall_discovery") throw new Error("the lab discovery does not read");
  return read.discovery;
}

function intent(reason: string, over: Partial<{ workspaceId: string; policy: string; operation: "APPLY_PENDING" | "CANCEL_REMAINING" }> = {}): PendingControlIntentWire {
  const discovery = served();
  const built = buildPendingControlIntent({
    target: {
      workspaceId: over.workspaceId ?? "ws_TEST_ONLY_operational", resource: { kind: "DEPLOYMENT", id: LAB_DEPLOYMENT_ID }, environment: "paper",
      recall: discovery.items[0]!, policyRevision: over.policy ?? "TEST_ONLY:portal-policy",
    },
    operation: over.operation ?? "APPLY_PENDING", reason, idempotencyKey: "pending_control:lab-0001",
  });
  if (!built.ok) throw new Error(built.reason);
  return built.intent;
}

describe("lab discovery", () => {
  it("reads: the PAPER deployment row holds one WAITING and one UNKNOWN recall, naming the resource asked", () => {
    const discovery = served();
    expect(discovery.items.map((item) => item.state)).toEqual(["WAITING_ENCUMBRANCE", "UNKNOWN"]);
    expect(discovery.items.every((item) => item.recipientAccountId !== null)).toBe(true);
    expect(discovery.policyRevision).toEqual({ availability: "PUBLISHED", value: "TEST_ONLY:portal-policy" });
  });

  it("answers no other question (the governance double keeps those)", () => {
    for (const change of [["resource_id", "dep_TEST_ONLY_btc"], ["environment", "live"], ["resource_kind", "PORTFOLIO"]] as const) {
      const search = new URLSearchParams(ASK);
      search.set(change[0], change[1]);
      expect(labDiscovery(search), change.join("=")).toBeNull();
    }
  });
});

describe("lab preview", () => {
  const ask = (body: unknown, method = "POST", path = PENDING_PREVIEW_PATH) => answerPendingControlPreview(method, path, body);

  it("is a POST to the preview path and nothing else", () => {
    expect(ask(intent("Release"), "GET")).toBeNull();
    expect(ask(intent("Release"), "POST", "/api/v1/execution/pending-recalls/apply")).toBeNull();
    expect(ask(intent("Release"), "POST", "/api/v1/execution/pending-recalls/submit")).toBeNull();
  });

  it("allows an apply and a cancel preview that read, answer the recall asked, and say nothing was applied or reserved", () => {
    for (const operation of ["APPLY_PENDING", "CANCEL_REMAINING"] as const) {
      const wire = intent("Release the remainder", { operation });
      const answer = ask(wire)!;
      expect(answer.status).toBe(200);
      const read = readPendingControlPreviewV1(answer.body, "USDT");
      if (read === null || read.kind !== "pending_control_preview") throw new Error("does not read");
      expect(read.preview.allowed).toBe(true);
      expect(read.preview.businessApplied).toBe(false);
      expect(read.preview.reserved).toBe(false);
      expect(previewAnswers(read.preview, { operation, originalRecallId: wire.business_payload.command_id })).toBe(true);
    }
  });

  it("an unqualified source is a typed 'not allowed', never an allowed preview", () => {
    const answer = ask(intent("UNQUALIFIED source"))!;
    const read = readPendingControlPreviewV1(answer.body, "USDT");
    if (read === null || read.kind !== "pending_control_preview") throw new Error("does not read");
    expect(read.preview).toMatchObject({ allowed: false, reasonCode: "PENDING_CONTROL_NOT_QUALIFIED" });
  });

  it.each<[string, PendingControlIntentWire, number, string]>([
    ["a workspace that is not a lab workspace", intent("Release", { workspaceId: "ws_main" }), 403, "ACCESS_DENIED"],
    ["a policy revision that is not the reviewed one", intent("Release", { policy: "TEST_ONLY:other-policy" }), 409, "POLICY_REVISION_CONFLICT"],
    ["a refused actor", intent("REFUSE this"), 403, "CURRENT_ACTOR_AUTHORITY_REQUIRED"],
  ])("%s is a typed refusal the page can read", (_name, wire, status, code) => {
    const answer = ask(wire)!;
    expect(answer.status).toBe(status);
    expect(readPendingControlProblemV1(answer.body)?.code).toBe(code);
  });

  it("a body that is not an intent is refused as invalid input", () => {
    expect(ask(null)!.status).toBe(400);
    expect(ask({ business_payload: null })!.status).toBe(400);
  });
});
