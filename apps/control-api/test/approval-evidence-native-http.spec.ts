import "reflect-metadata";
import { Injectable, Module, type ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { ServerResponse } from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ApprovalEvidenceController } from "../src/approval-evidence/approval-evidence.controller";
import { ApprovalEvidenceNativeDelivery, type ApprovalEvidenceNativePlan } from "../src/approval-evidence/approval-evidence-native-delivery";
import { ApprovalEvidenceReads } from "../src/approval-evidence/approval-evidence.service";
import type { ApprovalVisibility } from "../src/approval-evidence/approval-evidence.authority";
import type { CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";
import { WorkspacesRepository } from "../src/repos/workspaces";

// Synthetic source/qualifier/native fence: exercises Core composition, not a
// qualified Edge source, real field policy, real grant or connected acceptance.
@Module({}) class Cell {}
const selection = { resource_ref: "resource", binding: { environment: "paper", profileId: "paper" },
  read_requirement: { action: "account.read", resource: { kind: "ACCOUNT", id: "account" },
    dataset: { dataset_id: "test", source_revision: "1", window: null } }, fields: ["state", "submitted_count"] } as unknown as CurrentViewSelection;
const policy = { receipt_preview: {
  "receipt_preview.what_changes": { field: "state", detail: false },
  "receipt_preview.counts_as.met_after": { field: "submitted_count", detail: false },
  "receipt_preview.counts_as.required": { field: "submitted_count", detail: false },
} } as const;
const route = "/api/v1/execution/governance/approvals/approval-1/evidence";

describe("Approval Evidence native HTTP composition", () => {
  let app: NestFastifyApplication, oldGuards: unknown, member: boolean, visible: boolean, revokeAtDispatch: boolean;
  let tamper: boolean, badProof: boolean, foreignScope: boolean, asyncDispatch: boolean, malformed: boolean, denySection: boolean;
  let foreignSource: boolean, revokeDuringRead: boolean, omitProof: boolean, historySection: "prior_economic_history" | "evidence_diff" | null;
  let skipSource: boolean, prepares: number;
  const visibility: ApprovalVisibility = { visible: async () => visible };
  const qualifier = { prepare: async (scope: ApprovalEvidenceNativePlan["scope"]): Promise<ApprovalEvidenceNativePlan> => {
    prepares++;
    const plan: ApprovalEvidenceNativePlan = { scope: foreignScope ? { ...scope, workspaceId: "other" } : scope,
      selections: [selection], sections: historySection ? [historySection] : denySection ? ["obligations_after_approval"] : ["receipt_preview"],
      fieldProofs: {
        "receipt_preview.what_changes": { selection: 0, field: badProof ? "submitted_count" : "state", detail: false },
        "receipt_preview.counts_as.met_after": { selection: 0, field: "submitted_count", detail: false },
        ...(!omitProof ? { "receipt_preview.counts_as.required": { selection: 0, field: "submitted_count", detail: false } } : {}),
      },
      read: async read => {
        if (!skipSource) await read({ authority: selection, resource: "test", query: { limit: 1, max_bytes: 1000 } });
        if (tamper) (plan.sections as string[]).push("obligations_after_approval");
        if (revokeDuringRead) visible = false;
        return { identity: { workspaceId: foreignSource ? "other" : scope.workspaceId, approvalId: scope.approvalId },
          sections: { receipt_preview: { what_changes: "synthetic evidence", counts_as: { met_after: malformed ? -1 : 1, required: 2 } } } };
      } };
    return plan;
  }, revalidate: async () => {}, revalidateBeforeDispatch: () => {
    if (revokeAtDispatch) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
    if (asyncDispatch) return Promise.resolve();
  } };
  const native = { hasNativeCurrentRelations: () => true,
    deliverNative: async (_actor: unknown, _selections: unknown, response: ServerResponse,
      build: (read: never) => Promise<Buffer>, validation: { validateAfterEnter: () => Promise<void>; validateBeforeDispatch: () => void }) => {
      await validation.validateAfterEnter(); const bytes = await build((async () => ({ status: 200, body: Buffer.from("{}") })) as never);
      validation.validateBeforeDispatch(); response.writeHead(200, { "content-type": "application/json", "cache-control": "private, no-store" }); response.end(bytes);
    } };
  @Injectable() class Guard { canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest(); req.portalUser = { userId: "user" };
    req.portalSession = { sessionId: "session", sessionVersion: 1 }; req.portalWorkspaceId = "ws"; return true;
  } }
  beforeAll(async () => {
    oldGuards = Reflect.getMetadata("__guards__", ApprovalEvidenceController);
    Reflect.defineMetadata("__guards__", [Guard], ApprovalEvidenceController);
    const dark = new ApprovalEvidenceReads({ read: async input => ({ identity: input, sections: {} }) }, visibility);
    app = await NestFactory.create<NestFastifyApplication>({ module: Cell, controllers: [ApprovalEvidenceController], providers: [Guard,
      { provide: WorkspacesRepository, useValue: { isMember: async (ws: string) => member && ws === "ws" } },
      { provide: ApprovalEvidenceReads, useValue: dark },
      { provide: ApprovalEvidenceNativeDelivery, useValue: new ApprovalEvidenceNativeDelivery(native as never, qualifier, visibility, policy) }] },
      new FastifyAdapter(), { logger: false, abortOnError: false });
    app.useGlobalFilters(new HttpErrorFilter()); await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  beforeEach(() => { member = visible = true; revokeAtDispatch = tamper = badProof = foreignScope = asyncDispatch = malformed = denySection = false;
    foreignSource = revokeDuringRead = omitProof = skipSource = false; historySection = null; prepares = 0; });
  afterAll(async () => { await app.close(); Reflect.defineMetadata("__guards__", oldGuards ?? [SessionGuard], ApprovalEvidenceController); });
  const get = (url = route) => app.inject({ method: "GET", url });
  it("delivers a policy-authorized section only within synthetic native custody", async () => {
    const response = await get(); expect(response.statusCode, response.body).toBe(200);
    expect(response.json().receipt_preview).toEqual({ what_changes: "synthetic evidence", counts_as: { met_after: 1, required: 2 } });
    expect(response.headers["cache-control"]).toBe("private, no-store");
  });
  it("withholds a section with no independent section grant", async () => {
    denySection = true; const response = await get(); expect(response.statusCode).toBe(200);
    expect(response.json().receipt_preview).toBeNull(); expect(response.body).not.toContain("synthetic evidence");
  });
  it("refuses a field proof that does not match the server-owned policy", async () => {
    badProof = true; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("refuses a section when even one output leaf has no field proof", async () => {
    omitProof = true; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("fails closed when no server-owned output policy has been installed", async () => {
    const delivery = new ApprovalEvidenceNativeDelivery(native as never, qualifier, visibility, {});
    const principal = { user: { userId: "user" }, session: { sessionId: "session", sessionVersion: 1 },
      workspaceId: "ws", viewerWorkspaceId: "ws" } as never;
    await expect(delivery.deliver(principal, "approval-1", {}, {} as ServerResponse, () => {}))
      .rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE" });
  });
  it.each(["prior_economic_history", "evidence_diff"] as const)("never upgrades CURRENT into HISTORY for %s", async section => {
    historySection = section; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("refuses positive sections that did not consume their selected source", async () => {
    skipSource = true; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("refuses foreign workspace and qualifier scope before delivering bytes", async () => {
    member = false; expect((await get(`${route}?workspace_id=other`)).statusCode).toBe(404);
    member = true; foreignScope = true; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("does not disclose a revoked approval or field at physical dispatch", async () => {
    visible = false; expect((await get()).statusCode).toBe(404);
    expect(prepares).toBe(0);
    visible = true; revokeAtDispatch = true; const response = await get(); expect(response.statusCode).toBe(409);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("refuses a different source identity and rechecks approval visibility after source read", async () => {
    foreignSource = true; expect((await get()).statusCode).toBe(503);
    foreignSource = false; revokeDuringRead = true; const response = await get(); expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("rejects plan mutation and asynchronous final validation", async () => {
    tamper = true; expect((await get()).statusCode).toBe(503);
    tamper = false; asyncDispatch = true; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
  it("refuses malformed authorized evidence without exposing its content", async () => {
    malformed = true; const response = await get(); expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("synthetic evidence");
  });
});
