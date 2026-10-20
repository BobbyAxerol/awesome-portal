/** FE-062 pure projection of the Portal's own pending-control history into the
 * exact-resource discovery list. Pure and fixture-driven: PG/HTTP authority
 * behaviour is the same prepareExact path as the status read and is NOT proved
 * here. Synthetic TEST_ONLY facts, not source receipts. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { PENDING_DISCOVERY_MAX_ITEMS, buildPendingRecallDiscovery, pendingControlIntent, pendingControlStatus,
  pendingRecallDiscovery, pendingRecallDiscoveryQuery, publishPendingControlStatus,
  type PendingControlIntent, type PendingControlStatus } from "../src/execution-v2/pending-control.contract";

const fixture = JSON.parse(readFileSync(resolve(__dirname, "../../../packages/contracts/fixtures/execution-pending-control.synthetic.valid.json"), "utf8"));
const base: PendingControlIntent = pendingControlIntent.parse(fixture.intent);
const deployment: PendingControlIntent = pendingControlIntent.parse(fixture.intent_deployment);
const status = (key: string): PendingControlStatus => pendingControlStatus.parse(fixture[key]);
const ecm = (n: number) => `ecm_${n.toString(16).padStart(32, "0")}`;
type Row = { id: string; intent: PendingControlIntent; status: PendingControlStatus };
const intentFor = (recall: string, from = base): PendingControlIntent => pendingControlIntent.parse({ ...from,
  business_payload: { ...from.business_payload, command_id: recall, idempotency_key: `TEST_ONLY:key-${recall}` } });
function row(recall: string, source: PendingControlStatus, n: number, at: number, patch: Partial<PendingControlStatus> = {},
  from = base): Row {
  const intent = intentFor(recall, from);
  return { id: ecm(n), intent, status: pendingControlStatus.parse({ ...source, ...patch, command_id: ecm(n),
    original_recall_id: recall, resource: intent.resource, created_at_ms: at, updated_at_ms: at }) };
}
const target = { resource: base.resource, environment: base.environment };
const build = (rows: Row[]) => buildPendingRecallDiscovery(target, rows, 1_792_300_100_000);

describe("FE-062 pending-recall discovery projection", () => {
  it("lists a WAITING recall with the last known partition and five exact counters; closes terminal outcomes", () => {
    const result = build([row("r-open", status("waiting"), 1, 10), row("r-done", status("applied"), 2, 20),
      row("r-cancelled", status("cancelled"), 3, 30)]);
    expect(result.items.map(item => item.original_recall_id)).toEqual(["r-open"]);
    const [item] = result.items;
    expect(item.state).toBe("WAITING_ENCUMBRANCE");
    expect(item.amounts).toEqual(status("waiting").business.amounts);
    expect(item.versions).toEqual(status("waiting").business.receipt!.versions);
    expect(item.versions!.budget).toBe("9007199254740993"); // int64 string, never a JS number
    expect(item.currency).toBe("USDT");
    expect(item.recipient_account_id).toBeNull();
    expect(item.last_known_command_id).toBe(ecm(1)); expect(item.unresolved_command_id).toBeNull();
    expect(result).toMatchObject({ coverage: "PORTAL_CONTROLLED_RECALLS_ONLY", truncated: false, observed_at_ms: 1_792_300_100_000,
      untracked_recalls: { availability: "NOT_PUBLISHED", reason_code: "RECALL_REMAINDER_SOURCE_READ_NOT_QUALIFIED" } });
    expect(pendingRecallDiscovery.safeParse(result).success).toBe(true);
  });
  it("a later unresolved send keeps the last known receipt and names the unresolved command", () => {
    const result = build([row("r", status("waiting"), 1, 10), row("r", status("unknown"), 2, 20)]);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ state: "WAITING_ENCUMBRANCE", last_known_command_id: ecm(1),
      unresolved_command_id: ecm(2), last_operation: "APPLY_PENDING", updated_at_ms: 20 });
    expect(result.items[0].versions).not.toBeNull(); // accepted receipt is never erased by a newer unknown
  });
  it("an unresolved send alone is UNKNOWN with null (never zero) economics; FAILED_BEFORE_SEND and a terminal-after-unknown are not open", () => {
    const only = build([row("r-unknown", status("unknown"), 1, 10)]).items[0];
    expect(only).toMatchObject({ state: "UNKNOWN", amounts: null, versions: null, latest_receipt_id: null,
      last_known_command_id: null, unresolved_command_id: ecm(1) });
    expect(build([row("r-failed", status("failed_before_send"), 1, 10)]).items).toEqual([]);
    expect(build([row("r", status("unknown"), 1, 10), row("r", status("applied"), 2, 20)]).items).toEqual([]);
    // an older unresolved row before a known WAITING does not count as unresolved
    expect(build([row("r", status("unknown"), 1, 10), row("r", status("waiting"), 2, 20)]).items[0].unresolved_command_id).toBeNull();
  });
  it("orders newest first with a stable tie-break and caps at the finite page with an honest truncated flag", () => {
    const rows = Array.from({ length: PENDING_DISCOVERY_MAX_ITEMS + 2 }, (_, i) => row(`r-${String(i).padStart(3, "0")}`, status("waiting"), i + 1, 100 + i));
    const result = build(rows);
    expect(result.items).toHaveLength(PENDING_DISCOVERY_MAX_ITEMS);
    expect(result.truncated).toBe(true);
    expect(result.items[0].original_recall_id).toBe(`r-${String(PENDING_DISCOVERY_MAX_ITEMS + 1).padStart(3, "0")}`);
    expect(result.items.at(-1)!.original_recall_id).toBe("r-002"); // the two oldest are the ones dropped
    const tie = build([row("b", status("waiting"), 1, 50), row("a", status("waiting"), 2, 50)]);
    expect(tie.items.map(item => item.original_recall_id)).toEqual(["a", "b"]);
    expect(build([]).items).toEqual([]);
  });
  it("one original recall with divergent currency or recipient is corruption: refuse, never pick one", () => {
    const first = row("r", status("waiting"), 1, 10), second = row("r", status("unknown"), 2, 20);
    second.intent = pendingControlIntent.parse({ ...second.intent, business_payload: { ...second.intent.business_payload, currency: "EUR" } });
    expect(() => build([first, second])).toThrowError(expect.objectContaining({ code: "PENDING_CONTROL_RECEIPT_UNVERIFIED", status: 503 }));
    const a = row("d", status("waiting"), 3, 10, {}, deployment), b = row("d", status("unknown"), 4, 20, {}, deployment);
    b.intent = pendingControlIntent.parse({ ...b.intent, business_payload: { ...b.intent.business_payload, recipient_account_id: "TEST_ONLY:other" } });
    expect(() => buildPendingRecallDiscovery({ resource: deployment.resource, environment: deployment.environment }, [a, b], 1))
      .toThrowError(expect.objectContaining({ code: "PENDING_CONTROL_RECEIPT_UNVERIFIED" }));
  });
  it("carries the verified recipient account for a DEPLOYMENT recipient, matching the served status (FE-063)", () => {
    const d = row("dep", status("waiting"), 1, 10, {}, deployment);
    const result = buildPendingRecallDiscovery({ resource: deployment.resource, environment: deployment.environment }, [d], 5);
    expect(result.items[0].recipient_account_id).toBe("TEST_ONLY:account");
    expect(publishPendingControlStatus(d.intent, d.status).recipient_account_id).toBe("TEST_ONLY:account");
    expect(publishPendingControlStatus(base, status("waiting")).recipient_account_id).toBeNull();
    // the served DTO refuses a recipient that contradicts the resource kind
    expect(() => publishPendingControlStatus(base, { ...status("waiting"), resource: deployment.resource })).toThrow();
  });
  it("the query grammar is exact: PORTFOLIO or DEPLOYMENT only, no wildcard/extra keys", () => {
    const ok = { workspace_id: "w", resource_kind: "PORTFOLIO", resource_id: "p", environment: "paper" };
    expect(pendingRecallDiscoveryQuery.safeParse(ok).success).toBe(true);
    for (const bad of [{ ...ok, resource_kind: "ROOT" }, { ...ok, resource_id: "" }, { ...ok, environment: "demo" },
      { ...ok, extra: "1" }, { workspace_id: "w", resource_kind: "PORTFOLIO", resource_id: "p" }, { ...ok, resource_id: "p\n" }])
      expect(pendingRecallDiscoveryQuery.safeParse(bad).success).toBe(false);
  });
});
