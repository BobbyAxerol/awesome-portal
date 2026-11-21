import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { OperationalHealthPublicationRepository,
  type OperationalHealthPublication, type OperationalHealthPublicationBinding } from "../src/operations/operational-health-publication";

/** TEST_ONLY query/source doubles. These exercise failure ownership, not an
 * authenticated Edge publication, PostgreSQL durability or connected ACK. */
const fixture: OperationalHealthPublication = JSON.parse(readFileSync(resolve(__dirname,
  "fixtures/operational-health-publication.synthetic.json"), "utf8"));
const publication = (): OperationalHealthPublication => ({ ...structuredClone(fixture), rows: [] });
const now = Date.parse(fixture.source_as_of) + 1_000;
type Operation = "publish" | "retire";
type FailurePoint = "BEGIN" | "WORK" | "COMMIT";

function harness(options: { operation?: Operation; failure?: FailurePoint; rollbackFailure?: boolean;
  retiredHead?: boolean } = {}) {
  const operation = options.operation ?? "publish";
  const failure = new Error("TEST_ONLY_ORIGINAL_DATABASE_FAILURE");
  const rollbackFailure = new Error("TEST_ONLY_ROLLBACK_FAILURE");
  const events: string[] = [];
  let sourceHeld = false;
  const query = vi.fn(async (sql: string, _parameters?: unknown[]) => {
    const statement = sql.trim(); events.push(statement);
    if ((options.failure === "BEGIN" && statement === "BEGIN") ||
      (options.failure === "COMMIT" && statement === "COMMIT") ||
      (options.failure === "WORK" && statement.startsWith(operation === "publish"
        ? "INSERT INTO execution_operation_health_receipts" : "INSERT INTO execution_operation_health_heads"))) throw failure;
    if (statement === "ROLLBACK" && options.rollbackFailure) throw rollbackFailure;
    if (statement === "COMMIT" && operation === "publish") expect(sourceHeld).toBe(true);
    if (statement.startsWith("SELECT source_epoch")) return { rows: options.retiredHead
      ? [{ retired: true, source_epoch: fixture.source_epoch }] : [] };
    if (statement.startsWith("SELECT payload_digest")) return { rows: [] };
    if (statement.startsWith("SELECT count(*)")) return { rows: [{ count: "0" }] };
    return { rows: [], rowCount: 1 };
  });
  const release = vi.fn((_discard?: boolean) => { events.push("TEST_ONLY:release"); });
  const connect = vi.fn(async () => ({ query, release }));
  const binding: OperationalHealthPublicationBinding = {
    workspaceId: fixture.workspace_id, sourceRef: fixture.source_ref, sourceEpoch: fixture.source_epoch, maximumReceipts: 8,
    withVerifiedSource: vi.fn(async (_input, write) => {
      events.push("TEST_ONLY:source-enter"); sourceHeld = true;
      try { return await write(); }
      finally { sourceHeld = false; events.push("TEST_ONLY:source-exit"); }
    }),
  };
  const repository = new OperationalHealthPublicationRepository({ connect } as unknown as Pool, binding, () => now);
  const invoke = () => operation === "publish" ? repository.publish(publication()) : repository.retire();
  return { repository, invoke, query, release, connect, binding, events, failure, rollbackFailure };
}

describe("operational health publication transaction failure ownership (TEST_ONLY doubles)", () => {
  const cases = (["publish", "retire"] as const).flatMap(operation =>
    (["BEGIN", "WORK", "COMMIT"] as const).flatMap(failure =>
      [false, true].map(rollbackFailure => ({ operation, failure, rollbackFailure }))));

  it.each(cases)("$operation preserves $failure failure when rollbackFailure=$rollbackFailure", async options => {
    const h = harness(options);
    await expect(h.invoke()).rejects.toBe(h.failure);
    expect(h.events.filter(event => event === "BEGIN")).toHaveLength(1);
    expect(h.events.filter(event => event === "ROLLBACK")).toHaveLength(1);
    expect(h.events.filter(event => event === "COMMIT")).toHaveLength(options.failure === "COMMIT" ? 1 : 0);
    expect(h.release).toHaveBeenCalledTimes(1);
    if (options.rollbackFailure) expect(h.release).toHaveBeenCalledWith(true);
    else expect(h.release).toHaveBeenCalledWith();
    // In particular a lost COMMIT response is not success, a retry or an ACK.
    expect(h.query.mock.calls.filter(([sql]) => sql.trim().startsWith(
      options.operation === "publish" ? "INSERT INTO execution_operation_health_receipts"
        : "INSERT INTO execution_operation_health_heads"))).toHaveLength(options.failure === "BEGIN" ? 0 : 1);
    if (options.operation === "publish") expect(h.events.at(-1)).toBe("TEST_ONLY:source-exit");
  });

  it("retains a typed source failure instead of a failed rollback", async () => {
    const h = harness({ retiredHead: true, rollbackFailure: true });
    await expect(h.invoke()).rejects.toMatchObject({ code: "OPERATIONAL_HEALTH_SOURCE_CHANGED" });
    expect(h.release).toHaveBeenCalledWith(true);
    expect(h.events).not.toContain("COMMIT");
    expect(h.query.mock.calls.some(([sql]) => sql.trim().startsWith("INSERT"))).toBe(false);
  });

  it("holds source custody through the successful COMMIT and client release", async () => {
    const h = harness();
    await expect(h.invoke()).resolves.toMatchObject({ state: "COMMITTED", receipt_digest: expect.stringMatching(/^sha256:/) });
    expect(h.events.filter(event => event === "BEGIN")).toHaveLength(1);
    expect(h.events.slice(-3)).toEqual(["COMMIT", "TEST_ONLY:release", "TEST_ONLY:source-exit"]);
    expect(h.events).not.toContain("ROLLBACK");
    expect(h.release).toHaveBeenCalledExactlyOnceWith();
  });

  it("does not reacquire a client or run SQL when source authority refuses", async () => {
    const h = harness(), refusal = new Error("TEST_ONLY_SOURCE_DENIED");
    vi.mocked(h.binding.withVerifiedSource).mockRejectedValueOnce(refusal);
    await expect(h.invoke()).rejects.toBe(refusal);
    expect(h.connect).not.toHaveBeenCalled();
    expect(h.query).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it.each(["publish", "retire"] as const)("%s does not rollback/release a client it never acquired", async operation => {
    const h = harness({ operation }), acquisition = new Error("TEST_ONLY_CONNECT_FAILED");
    h.connect.mockRejectedValueOnce(acquisition);
    await expect(h.invoke()).rejects.toBe(acquisition);
    expect(h.query).not.toHaveBeenCalled();
    expect(h.release).not.toHaveBeenCalled();
  });

  it("retirement commits exactly once without manufacturing publication source custody", async () => {
    const h = harness({ operation: "retire" });
    await expect(h.invoke()).resolves.toBeUndefined();
    expect(h.events.filter(event => event === "COMMIT")).toHaveLength(1);
    expect(h.events).not.toContain("ROLLBACK");
    expect(h.release).toHaveBeenCalledExactlyOnceWith();
    expect(h.binding.withVerifiedSource).not.toHaveBeenCalled();
  });
});
