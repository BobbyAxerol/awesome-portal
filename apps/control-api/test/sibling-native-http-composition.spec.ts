import "reflect-metadata";
import { Injectable, Module, type ExecutionContext } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify";
import type { ServerResponse } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SiblingSourceDarkController } from "../src/execution-v2/sibling-source-dark.controller";
import { SiblingNativeDelivery, type SiblingNativePlan } from "../src/execution-v2/sibling-native-delivery";
import { SiblingPageCursorCodec } from "../src/execution-v2/sibling-page-cursor";
import type { CurrentViewSelection } from "../src/execution-v2/current-view-authority";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";
import { WorkspacesRepository } from "../src/repos/workspaces";
import { SessionGuard } from "../src/facade/session.guard";
import { HttpErrorFilter } from "../src/http-error.filter";

// Real Nest/Fastify route and delivery class, but a synthetic native fence and
// qualifier: this cannot qualify any source or prove real Edge egress.
@Module({}) class Cell {}
const digest = `sha256:${"a".repeat(64)}`;
const selection = { resource_ref: "resource", binding: { environment: "paper", profileId: "paper" },
  read_requirement: { action: "account.read", resource: { kind: "ACCOUNT", id: "account" },
    dataset: { dataset_id: "test", source_revision: "1", window: null } }, fields: ["state"],
  detail_fields: ["filled_quantity", "reconciliation_run_id", "obligation_id"] } as unknown as CurrentViewSelection;
const codec = new SiblingPageCursorCodec("key", { key: "x".repeat(40) }, 1000, () => 100);

describe("sibling HTTP + native composition with synthetic custody", () => {
  let app: NestFastifyApplication, revoked = false, member = true, oldGuards: unknown;
  const qualifier = { prepare: async (scope: SiblingNativePlan["scope"], pageSize?: number): Promise<SiblingNativePlan> => {
    const order = scope.kind === "order-detail", recon = scope.kind === "reconciliation";
    return { scope, selections: [selection], fieldProofs: order ? { filled_quantity: { selection: 0, field: "filled_quantity", detail: true } } :
      recon ? { runs: { selection: 0, field: "reconciliation_run_id", detail: true } } : { items: { selection: 0, field: "obligation_id", detail: true } },
      ...(order ? {} : { page: { codec, binding: { workspace_id: scope.workspaceId, principal_id: scope.principalId,
        session_id: scope.sessionId, session_generation: scope.sessionGeneration, environment: "paper" as const,
        kind: scope.kind as "reconciliation" | "obligations", target_type: scope.targetType, target_id: scope.targetId,
        app_policy_revision: "a", field_policy_revision: "f", source_set_digest: digest, snapshot_id: "snapshot",
        query_digest: digest, page_size: pageSize! } } }),
      read: async read => { await read({ authority: selection, resource: "resource", query: { limit: 1, max_bytes: 1000 } });
        return { scope, complete: true, snapshot_id: "snapshot", next_source: null,
        body: { schema_version: `portal.execution.${scope.kind}.v1`, workspace_id: scope.workspaceId,
          record_authority: "PORTAL_PROJECTION", read_at_ms: 1, ...(order ? { order_id: scope.targetId, filled_quantity: "2" } :
            { subject: { type: scope.targetType, id: scope.targetId }, ...(recon ? { runs: [] } : { items: [] }) }) } }; } };
  }, revalidate: async () => {}, revalidateBeforeDispatch: () => {
    if (revoked) throw new ExecutionReadScopeError("EXECUTION_READ_ACCESS_CHANGED", 409);
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
    oldGuards = Reflect.getMetadata("__guards__", SiblingSourceDarkController);
    Reflect.defineMetadata("__guards__", [Guard], SiblingSourceDarkController);
    app = await NestFactory.create<NestFastifyApplication>({ module: Cell, controllers: [SiblingSourceDarkController], providers: [Guard,
      { provide: WorkspacesRepository, useValue: { canReadExecution: async (ws: string) => member && ws === "ws" } },
      { provide: SiblingNativeDelivery, useValue: new SiblingNativeDelivery(native as never, qualifier) }] },
      new FastifyAdapter(), { logger: false, abortOnError: false });
    app.useGlobalFilters(new HttpErrorFilter()); await app.init(); await app.getHttpAdapter().getInstance().ready();
  });
  afterAll(async () => { await app.close(); Reflect.defineMetadata("__guards__", oldGuards ?? [SessionGuard], SiblingSourceDarkController); });
  it.each([
    ["/api/v1/execution/orders/o1/detail", { order_id: "o1", filled_quantity: "2" }],
    ["/api/v1/execution/reconciliation?subject_type=ACCOUNT&subject_id=a1", { subject: { type: "ACCOUNT", id: "a1" }, runs: [], next_cursor: null }],
    ["/api/v1/execution/obligations?subject_type=ACCOUNT&subject_id=a1", { subject: { type: "ACCOUNT", id: "a1" }, items: [], next_cursor: null }],
  ])("returns %s only under the synthetic held fence", async (url, expected) => {
    const response = await app.inject({ method: "GET", url }); expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toMatchObject(expected);
  });
  it("does not send source bytes when revoked before physical dispatch", async () => {
    revoked = true;
    const response = await app.inject({ method: "GET", url: "/api/v1/execution/orders/o1/detail" });
    expect(response.statusCode).toBe(409); expect(response.body).not.toContain("filled_quantity"); revoked = false;
  });
  it("does not admit another workspace", async () => {
    member = false;
    const response = await app.inject({ method: "GET", url: "/api/v1/execution/orders/o1/detail" });
    expect(response.statusCode).toBe(404); member = true;
  });
});
