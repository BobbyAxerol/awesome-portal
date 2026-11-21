import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { RestoreCheckpointAuthority, restoreCheckpointEventHash, type RestoreCheckpointPin,
  type RestoreCheckpointWrite } from "../src/execution-v2/restore-checkpoint-authority";

const checkpoint = "11111111-1111-4111-8111-111111111111";
const first = "22222222-2222-4222-8222-222222222222";
const second = "33333333-3333-4333-8333-333333333333";
const digest = "a".repeat(64);
const pin: RestoreCheckpointPin = { checkpoint_id: checkpoint, source_system_identifier: "1234", authority_system_identifier: "5678" };
const write: RestoreCheckpointWrite = { operation_id: first, expected_generation: "0", source_revision: "1", inventory_digest: digest };

/** SQL control-flow fake only; not evidence for isolation, durability or a PG
 * system identifier. Those require the separate two-cluster integration test. */
function fake(sourceId = "1234", authorityId = "5678", catalogLockHeld = true) {
  let head = { source_system_identifier: "1234", authority_system_identifier: "5678", generation: "0",
    source_revision: "0", event_hash: "0".repeat(64), event_count: "0" };
  const events = new Map<string, Record<string, string>>();
  let pending: Record<string, string> | undefined;
  let pendingHead: typeof head | undefined;
  const pool = (id: string) => ({ options: { connectionTimeoutMillis: 2000, query_timeout: 6000 }, connect: async () => {
    let catalogLockRequested = false;
    return ({
    release: () => {},
    query: async (sql: string, values: string[] = []) => {
      if (sql.includes("pg_control_system")) return { rows: [{ system_identifier: id }] };
      if (sql === "SELECT portal_restore_authority.lock_guard_catalog_for_write()") {
        catalogLockRequested = true; return { rows: [] };
      }
      if (sql.includes("pg_catalog.pg_locks")) {
        if (!catalogLockRequested) throw new Error("TEST_CATALOG_LOCK_NOT_REQUESTED");
        return { rows: [{ held: catalogLockHeld }] };
      }
      if (sql.startsWith("LOCK TABLE")) return { rows: [] };
      if (sql.includes("pg_catalog.pg_trigger")) return { rows: [{ guarded:true }] };
      if (sql.startsWith("BEGIN") || sql.startsWith("SET LOCAL")) return { rows: [] };
      if (sql === "ROLLBACK") { pending = undefined; pendingHead = undefined; return { rows: [] }; }
      if (sql === "COMMIT") {
        if (pending && pendingHead) { events.set(pending.operation_id, pending); head = pendingHead; }
        pending = undefined; pendingHead = undefined; return { rows: [] };
      }
      if (sql.includes("FROM portal_restore_authority.checkpoints")) return { rows: [{ ...head }] };
      if (sql.includes("FROM portal_restore_authority.events")) return { rows: Array.from(events.values())
        .sort((a, b) => Number(BigInt(a.generation) - BigInt(b.generation))) };
      if (sql.includes("INSERT INTO portal_restore_authority.events")) {
        if (!catalogLockRequested || !catalogLockHeld) throw new Error("TEST_CATALOG_LOCK_NOT_HELD");
        pending = { operation_id: values[1], expected_generation: values[2], generation: values[3], source_revision: values[4],
          inventory_digest: values[5], predecessor_hash: values[6], event_hash: values[7], capture_kind: values[8] }; return { rows: [] };
      }
      if (sql.includes("UPDATE portal_restore_authority.checkpoints")) {
        pendingHead = { ...head, generation: values[1], source_revision: values[2], event_hash: values[3],
          event_count: (BigInt(head.event_count) + 1n).toString() }; return { rows: [], rowCount: 1 };
      }
      throw new Error(`Unexpected SQL: ${sql}`);
    },
  }); } }) as unknown as Pool;
  return { source: pool(sourceId), authority: pool(authorityId), events, getHead: () => ({ ...head }) };
}

describe("restore checkpoint authority, SQL-flow fake", () => {
  it("refuses to append when the catalog guard lock was not held", async () => {
    const cell = fake("1234", "5678", false);
    const store = new RestoreCheckpointAuthority(cell.source, cell.authority, pin, 3);
    await expect(store.append(write)).rejects.toThrow("V2_CHECKPOINT_JOURNAL_UNSAFE");
    expect(cell.events.size).toBe(0);
    expect(cell.getHead().generation).toBe("0");
  });
  it("captures the validated operation before awaiting either database", async () => {
    const cell = fake(), store = new RestoreCheckpointAuthority(cell.source, cell.authority, pin, 3);
    const caller = { ...write };
    const inflight = store.append(caller);
    caller.operation_id = second;
    caller.source_revision = "2";
    caller.inventory_digest = "b".repeat(64);
    await expect(inflight).resolves.toMatchObject({ generation: "1", replayed: false });
    expect(cell.events.get(first)).toMatchObject({ operation_id: first, source_revision: "1", inventory_digest: digest });
    expect(cell.events.has(second)).toBe(false);
    await expect(store.append(write)).resolves.toMatchObject({ generation: "1", replayed: true });
  });
  it("records an observation, retries exactly the same operation, and never grants cutover", async () => {
    const cell = fake(), store = new RestoreCheckpointAuthority(cell.source, cell.authority, pin, 3);
    const recorded = await store.append(write);
    expect(recorded).toMatchObject({ state: "STORED_NOT_CUTOVER", generation: "1", replayed: false,
      storage: "DISTINCT_PG_CLUSTERS_ONLY", capture_kind:"CALLER_CLAIM" });
    expect(await store.append(write)).toMatchObject({ ...recorded, replayed: true });
    expect(cell.events.size).toBe(1);
    await expect(store.append({ ...write, inventory_digest: "b".repeat(64) })).rejects.toThrow("V2_CHECKPOINT_OPERATION_CONFLICT");
    await expect(store.append({ ...write, operation_id: second })).rejects.toThrow("V2_CHECKPOINT_GENERATION_CONFLICT");
  });
  it("cannot turn a caller digest into a locked-source capture by adding fields or shadowing a helper",async()=>{
    const cell=fake(),store=new RestoreCheckpointAuthority(cell.source,cell.authority,pin,3);
    Object.assign(store,{appendWithVerifiedSource:()=>{throw new Error("TEST_SHADOW_CALLED");}});
    const receipt=await store.append({...write,capture_kind:"LOCKED_SOURCE_CAPTURE"} as RestoreCheckpointWrite);
    expect(receipt.capture_kind).toBe("CALLER_CLAIM");
    expect(cell.events.get(first)?.capture_kind).toBe("CALLER_CLAIM");
    cell.events.get(first)!.capture_kind="LOCKED_SOURCE_CAPTURE";
    await expect(store.append(write)).rejects.toThrow("V2_CHECKPOINT_HISTORY_INVALID");
  });
  it("rejects revision regression, capacity exhaustion and mismatched cluster pins", async () => {
    const cell = fake(), store = new RestoreCheckpointAuthority(cell.source, cell.authority, pin, 2);
    await store.append(write);
    await expect(store.append({ ...write, operation_id: second, expected_generation: "1", source_revision: "0" }))
      .rejects.toThrow("V2_CHECKPOINT_REVISION_REGRESSION");
    await store.append({ ...write, operation_id: second, expected_generation: "1", source_revision: "1" });
    await expect(store.append({ ...write, operation_id: "44444444-4444-4444-8444-444444444444", expected_generation: "2" }))
      .rejects.toThrow("V2_CHECKPOINT_CAPACITY_EXHAUSTED");
    const wrong = fake("9999");
    await expect(new RestoreCheckpointAuthority(wrong.source, wrong.authority, pin, 3).append(write))
      .rejects.toThrow("V2_CHECKPOINT_SOURCE_ID_MISMATCH");
    const wrongAuthority = fake("1234", "9999");
    await expect(new RestoreCheckpointAuthority(wrongAuthority.source, wrongAuthority.authority, pin, 3).append(write))
      .rejects.toThrow("V2_CHECKPOINT_AUTHORITY_ID_MISMATCH");
    expect(() => new RestoreCheckpointAuthority(cell.source, cell.source, pin, 3)).toThrow("V2_CHECKPOINT_INVALID");
  });
  it("uses exact decimal generations and rejects malformed or substituted checkpoint facts", () => {
    const result = restoreCheckpointEventHash(checkpoint, write, "1", "0".repeat(64));
    expect(result).toMatch(/^[a-f0-9]{64}$/);
    expect(result).not.toBe(restoreCheckpointEventHash(checkpoint,write,"1","0".repeat(64),"LOCKED_SOURCE_CAPTURE"));
    expect(result).not.toBe(restoreCheckpointEventHash(checkpoint, { ...write, inventory_digest: "b".repeat(64) }, "1", "0".repeat(64)));
    for (const invalid of ["01", "-1", "9223372036854775808"]) {
      expect(() => restoreCheckpointEventHash(checkpoint, { ...write, expected_generation: invalid }, "1", "0".repeat(64)))
        .toThrow("V2_CHECKPOINT_INVALID");
    }
    expect(() => restoreCheckpointEventHash(checkpoint, write, "2", "0".repeat(64))).toThrow("V2_CHECKPOINT_INVALID");
  });
  it("rejects a corrupted earlier event even if the tail and head were not changed", async () => {
    const cell = fake(), store = new RestoreCheckpointAuthority(cell.source, cell.authority, pin, 3);
    await store.append(write);
    await store.append({ ...write, operation_id: second, expected_generation: "1" });
    cell.events.get(first)!.inventory_digest = "b".repeat(64);
    await expect(store.append(write)).rejects.toThrow("V2_CHECKPOINT_HISTORY_INVALID");
    await expect(store.append({ ...write, operation_id: "44444444-4444-4444-8444-444444444444", expected_generation: "2" }))
      .rejects.toThrow("V2_CHECKPOINT_HISTORY_INVALID");
  });
});
