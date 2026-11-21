import type { ServerResponse } from "node:http";
import { OperationalReadError } from "../operations/current-operational-read";
import { accessDigest } from "./access-digest";
import type { CurrentViewSelection } from "./current-view-authority";
import type { CurrentViewCoreComposition } from "./current-view-composition";
import type { SelectedCurrentViewEdgeRead } from "./current-view-edge-client";
import { ExecutionReadScopeError, type ReadScopePrincipal } from "./read-scope";
import { SiblingSourceSeam, type SiblingKind, type SiblingScope, type SiblingSourceResult } from "./sibling-source-seam";
import { SiblingPagedSource } from "./sibling-paged-source";
import type { SiblingPageBinding, SiblingPageCursorCodec } from "./sibling-page-cursor";

type Read = (selection: SelectedCurrentViewEdgeRead) => Promise<{ status: 200; body: Buffer }>;
type Family = Extract<SiblingKind, "order-detail" | "reconciliation" | "obligations">;
type FieldProof = Readonly<{ selection: number; field: string; detail: boolean }>;
/** Private server adapter. It is not a wire format and must never be assembled
 * from query parameters or an unverified Edge response. The independent
 * qualifier must verify source/snapshot, relation and each field before this
 * port can be installed. In particular an order ID is not an account grant. */
export interface SiblingNativePlan {
  readonly scope: SiblingScope;
  readonly selections: readonly CurrentViewSelection[];
  readonly fieldProofs: Readonly<Record<string, FieldProof>>;
  readonly page?: Readonly<{ binding: SiblingPageBinding; codec: SiblingPageCursorCodec }>;
  read(read: Read, page?: Readonly<{ snapshot_id: string; position: string | null; page_size: number }> ):
    Promise<SiblingSourceResult & { snapshot_id?: string; next_source?: string | null }>;
}
export interface SiblingNativeQualifier {
  prepare(scope: SiblingScope, pageSize?: number): Promise<SiblingNativePlan>;
  revalidate(plan: SiblingNativePlan): Promise<void>;
  /** Must be synchronous: called inside the native final-dispatch fence. */
  revalidateBeforeDispatch(plan: SiblingNativePlan): unknown;
}
const unavailable = (): never => { throw new ExecutionReadScopeError("EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", 503); };
const envelope = new Set(["schema_version", "workspace_id", "record_authority", "read_at_ms", "order_id", "subject.type", "subject.id"]);
// Fixed Core vocabulary, not assertions made by a provider. A source
// qualifier still has to prove the semantic mapping; the adapter cannot turn
// an unrelated granted field (e.g. `state`) into permission to reveal fees.
const policy: Record<Family, Readonly<Record<string, readonly [string, boolean]>>> = {
  "order-detail": {
    deployment_id: ["deployment_id", false], filled_quantity: ["filled_quantity", true],
    average_fill_price: ["average_fill_price", true], fee: ["commission", true],
    "fee.value": ["commission", true], "fee.currency": ["commission_currency", true],
    fee_absence: ["order_fee_absence", true], ack_latency_ms: ["order_ack_latency_ms", true],
    intent: ["order_intent_id", true], "intent.intent_id": ["order_intent_id", true],
    "intent.idempotency_scope": ["order_idempotency_scope", true],
  },
  reconciliation: {
    runs: ["reconciliation_run_id", true], "runs[].run_id": ["reconciliation_run_id", true],
    "runs[].state": ["state", false], "runs[].started_at_ms": ["reconciliation_started_at_ms", true],
    "runs[].finished_at_ms": ["reconciliation_finished_at_ms", true], "runs[].breaks_open": ["reconciliation_breaks_open", true],
    breaks: ["reconciliation_break_id", true], "breaks[].break_id": ["reconciliation_break_id", true],
    "breaks[].run_id": ["reconciliation_run_id", true], "breaks[].state": ["state", false],
    "breaks[].kind": ["reconciliation_break_kind", true], "breaks[].resolution_revision": ["reconciliation_resolution_revision", true],
    "breaks[].detected_at_ms": ["reconciliation_detected_at_ms", true],
  },
  obligations: {
    items: ["obligation_id", true], "items[].obligation_id": ["obligation_id", true],
    "items[].kind": ["obligation_kind", true], "items[].state": ["state", false],
    "items[].recovery_id": ["obligation_recovery_id", true], "items[].order_id": ["order_id", false],
    "items[].operation_id": ["obligation_operation_id", true], "items[].opened_at_ms": ["obligation_opened_at_ms", true],
  },
};

function leafPaths(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.length ? value.flatMap(item => leafPaths(item, `${path}[]`)) : [path];
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length ? entries.flatMap(([key, item]) => leafPaths(item, path ? `${path}.${key}` : key)) : [path];
  }
  return [path];
}

/** Native custody composition, deliberately not registered in AppModule.
 * No source becomes available merely by constructing/importing this class.
 * Only a separately qualified, server-configured adapter may be installed. */
export class SiblingNativeDelivery {
  constructor(private readonly core: Pick<CurrentViewCoreComposition, "deliverNative" | "hasNativeCurrentRelations">,
    private readonly qualifier: SiblingNativeQualifier, private readonly maxBytes = 262_144) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1024 || maxBytes > 1_048_576) throw Error("SIBLING_NATIVE_BOUNDS_INVALID");
  }
  hasNativeCurrentRelations(): boolean { return this.core.hasNativeCurrentRelations(); }

  async deliver(principal: ReadScopePrincipal, family: Family, targetType: string, targetId: string,
    response: ServerResponse, beforeDispatch: () => void, page?: Readonly<{ cursor: string | null; pageSize: number }>): Promise<void> {
    if (!this.hasNativeCurrentRelations()) return unavailable();
    const actor = structuredClone(principal);
    const scope: SiblingScope = Object.freeze({ workspaceId: actor.workspaceId, principalId: actor.user.userId,
      sessionId: actor.session.sessionId, sessionGeneration: actor.session.sessionVersion, environment: "paper",
      kind: family, targetType, targetId });
    if (family === "order-detail" && page || page && (!Number.isSafeInteger(page.pageSize) || page.pageSize < 1 || page.pageSize > 200 ||
      page.cursor !== null && (typeof page.cursor !== "string" || page.cursor.length > 4096)))
      throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const plan = await this.qualifier.prepare(scope, page?.pageSize);
    if (!plan || accessDigest(plan.scope) !== accessDigest(scope) || !Array.isArray(plan.selections) ||
      plan.selections.length < 1 || plan.selections.length > 4 || plan.selections.some(s => s.binding.environment !== "paper")) return unavailable();
    const selections = structuredClone(plan.selections), proofs = structuredClone(plan.fieldProofs);
    if (page && (!plan.page || plan.page.binding.page_size !== page.pageSize) || !page && plan.page) return unavailable();
    const pageCodec = plan.page?.codec, sourceRead = plan.read;
    if (typeof sourceRead !== "function") return unavailable();
    const signature = () => ({ scope: plan.scope, selections: plan.selections, fieldProofs: plan.fieldProofs, binding: plan.page?.binding ?? null });
    const planDigest = accessDigest(signature());
    const unchanged = () => {
      if (accessDigest(signature()) !== planDigest || plan.page?.codec !== pageCodec || plan.read !== sourceRead) unavailable();
    };
    const check = async () => { unchanged(); await this.qualifier.revalidate(plan); unchanged(); };
    await check();
    await this.core.deliverNative(actor, selections, response, async read => {
      await check();
      const observed = new Set<string>();
      const trackedRead: Read = async input => {
        const captured = structuredClone(input);
        const result = await read(captured);
        observed.add(accessDigest(captured.authority));
        return result;
      };
      let body: unknown;
      let next: string | null | undefined;
      try {
        const authority = { check: async () => { await check(); return true; } };
        if (page && plan.page) {
          const paged = new SiblingPagedSource(authority, { read: async (_scope, input) => {
            const result = await sourceRead.call(plan, trackedRead, input);
            if (typeof result.snapshot_id !== "string" || result.next_source === undefined) return unavailable();
            return { ...result, snapshot_id: result.snapshot_id, next_source: result.next_source };
          } }, plan.page.codec);
          const result = await paged.read(scope, plan.page.binding, page.cursor);
          body = result.body; next = result.next_cursor;
        } else body = await new SiblingSourceSeam(authority, { read: async () => sourceRead.call(plan, trackedRead) }).read(scope);
      }
      catch (error) {
        if (error instanceof OperationalReadError) {
          if (error.code === "SIBLING_ACCESS_DENIED") throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
          if (error.code === "SIBLING_CURSOR_INVALID_OR_EXPIRED") throw new ExecutionReadScopeError("EXECUTION_READ_CURSOR_INVALID", 400);
          if (error.code === "SIBLING_INPUT_INVALID") throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
          return unavailable();
        }
        throw error;
      }
      // A field proof names a selected authority, but is not evidence that
      // its source was actually read under this custody. The qualifier still
      // owns the source semantics; this fence prevents a detached body from
      // being laundered through an otherwise valid selection.
      if (!selections.some(selection => observed.has(accessDigest(selection)))) unavailable();
      for (const path of new Set(leafPaths(body))) {
        if (envelope.has(path)) continue;
        const proof = proofs[path], expected = policy[family][path], selection = proof && selections[proof.selection];
        if (!selection || !Number.isSafeInteger(proof.selection) || typeof proof.field !== "string" || typeof proof.detail !== "boolean" ||
          !expected || proof.field !== expected[0] || proof.detail !== expected[1] || !observed.has(accessDigest(selection)) ||
          !(proof.detail ? selection.detail_fields : selection.fields)?.includes(proof.field)) unavailable();
      }
      const bytes = Buffer.from(JSON.stringify(next === undefined ? body : { ...(body as object), next_cursor: next }));
      if (bytes.length > this.maxBytes) unavailable();
      return bytes;
    }, { validateAfterEnter: check, validateBeforeDispatch: () => {
      unchanged();
      const result = this.qualifier.revalidateBeforeDispatch(plan);
      if (result !== undefined) {
        if (result && typeof (result as { then?: unknown }).then === "function") void Promise.resolve(result).catch(() => undefined);
        unavailable();
      }
      unchanged(); beforeDispatch();
    } });
  }
}
