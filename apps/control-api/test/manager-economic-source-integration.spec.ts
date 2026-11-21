/** TEST_ONLY composition evidence. Real reducers/readers/stores, explicit
 * synthetic authority/mappings and SQL-call trace, NOT producer acceptance,
 * installed permission, PostgreSQL durability or a financial runtime receipt. */
import { describe, expect, it, vi } from "vitest";
import { managerDatasetResponse, managerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { ManagerModelDocument } from "../src/execution-v2/manager-model.contract";
import type { ManagerModelHead } from "../src/execution-v2/manager-model.store";
import { persistManagerProjection } from "../src/execution-v2/manager-model.store";
import { deriveSeriesObservations } from "../src/execution-v2/manager-series-observation";
import { ManagerSeriesStore } from "../src/execution-v2/manager-series.store";
import { commitManagerProjectionThenAcknowledge } from "../src/execution-v2/realtime-commit";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { financialIntegrationFixture, financialSqlTrace, financialTestMetric, financialTestRows,
  sharedFinancialTestFactory } from "./helpers/manager-economic-source-integration";

const headOf = (doc: ManagerModelDocument, digest: string): ManagerModelHead => ({ revision: doc.revision,
  source_epoch: doc.source_epoch, source_sequence: doc.source_sequence, projection_generation: doc.projection_generation,
  payload_digest: digest, catalogue_digest: doc.catalogue_digest });
const scopeOf = (doc: ManagerModelDocument) => ({ workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id });

describe("TEST_ONLY financial shared-builder/dataset/series composition", () => {
  it("uses one proposal reduction for dataset and series and emits a schema-valid scoped Manager dataset", async () => {
    const f = await financialIntegrationFixture(), factory = sharedFinancialTestFactory(), rows = financialTestRows();
    expect(factory.dataset).toBe(factory.series);
    expect(factory.dataset(rows)).toEqual(factory.series([...rows].reverse()));
    expect(factory.dataset(rows)).toMatchObject({ state: "COMPLETE", value: "900016.3", status: "PROPOSAL_NOT_A_PRODUCER_MAPPING" });
    expect(managerModelDocument.safeParse(f.doc).success).toBe(true);
    const response = f.dataset();
    expect(managerDatasetResponse.safeParse(response).success).toBe(true);
    expect(response.items.map(row => row.metrics.net_pnl?.value).sort()).toEqual(["10.1", "5.2", "900001"].sort());
    expect(response.groups[0].economic_partitions[0].metrics.net_pnl.value).toBe("900016.3");
    expect(f.doc.qualification).toBe("TEST_ONLY");
    expect(f.doc.facts.every(fact => fact.metric.source_confidence === "PROVISIONAL")).toBe(true);
  });

  it("filters shared-account peer economic facts before rows and totals, using actual minted read scope", async () => {
    const f = await financialIntegrationFixture({ full: false }), response = f.dataset(), json = JSON.stringify(response);
    expect(response.items).toHaveLength(2);
    expect(response.groups[0].economic_partitions[0].metrics.net_pnl.value).toBe("15.3");
    expect(json).not.toContain("900001");
    expect(json).not.toContain("TEST_ONLY:member-1");
    expect(json).not.toContain("TEST_ONLY:mapped-peer");
  });

  it("does not disclose a financial metric excluded by the actual field policy", async () => {
    const f = await financialIntegrationFixture({ full: false, fields: BUSINESS_READ_FIELDS.filter(field => field !== "net_pnl") });
    const response = f.dataset();
    expect(response.items.every(row => !("net_pnl" in row.metrics))).toBe(true);
    expect(response.groups.every(group => group.economic_partitions.every(partition => !("net_pnl" in partition.metrics)))).toBe(true);
    expect(response.capital_statements.every(partition => !("net_pnl" in partition.metrics))).toBe(true);
    expect(JSON.stringify(response)).not.toContain("900001");
  });

  it("refuses a fresh read authorization after current actor revocation rather than treating existing facts as authority", async () => {
    const f = await financialIntegrationFixture();
    f.authority.context.actor_current = false;
    await expect(f.authority.scopes.authorize(f.authority.principal, { environment: "paper", profileId: f.doc.profile_id },
      { action: "business.read_all", dataset: { dataset_id: f.doc.family_id, source_revision: f.doc.revision,
        projection_generation: f.doc.projection_generation, catalogue_revision: f.doc.catalogue_digest, window: null } })).rejects.toThrow();
  });

  it.each([
    ["missing source", () => financialTestRows().slice(0, 2), "ECONOMIC_SOURCE_MISSING"],
    ["missing valuation", () => financialTestRows().map((row, i) => i === 1 ? { ...row, valuation: null } : row), "ECONOMIC_VALUATION_MISSING"],
    ["missing ownership", () => financialTestRows().map((row, i) => i === 1 ? { ...row, ownership: null } : row), "ECONOMIC_OWNERSHIP_MISSING"],
    ["missing costs", () => financialTestRows().map((row, i) => i === 1 ? { ...row,
      cost_layers: { included: [], missing: ["TEST_ONLY:fees"] } } : row), "ECONOMIC_COST_LAYERS_MISSING"],
  ] as const)("maps %s to an existing null/PARTIAL DTO, never zero or a known subtotal", async (_name, rows, reason) => {
    const reduced = sharedFinancialTestFactory().dataset(rows());
    expect(reduced).toMatchObject({ state: "PARTIAL", value: null });
    expect(reduced.reason_codes).toContain(reason);
    expect(financialTestMetric(reduced)).toMatchObject({ availability: "PARTIAL", value: null, reason_code: reason });
    const f = await financialIntegrationFixture();
    expect(() => f.document(rows())).toThrow("TEST_ONLY_UNPROVEN_NUMERIC_MAPPING_REFUSED");
  });

  it("collapses an identical trusted-source replay once before Manager facts, regardless of Portal fact ID", async () => {
    const f = await financialIntegrationFixture(), rows = financialTestRows();
    const replayed = [...rows, { ...structuredClone(rows[0]), portal_fact_id: "TEST_ONLY:resent-fact" }];
    expect(sharedFinancialTestFactory().dataset(replayed)).toMatchObject({ state: "COMPLETE", value: "900016.3", collapsed_duplicate_count: 1 });
    const document = f.document(replayed), response = f.dataset(document);
    expect(document.facts).toHaveLength(3);
    expect(response.groups[0].economic_partitions[0].metrics.net_pnl.value).toBe("900016.3");
    expect(f.prepare(document).digest).toBe(f.prepare().digest);
    expect(f.prepare(f.document([...replayed].reverse())).digest).toBe(f.prepare().digest);
  });

  it.each(["conflicting identity", "overlapping leaves"] as const)("refuses %s before financial projection", async mode => {
    const f = await financialIntegrationFixture(), rows = financialTestRows();
    const bad = mode === "conflicting identity" ? [...rows, { ...rows[0], amount: "999" }] :
      rows.map((row, i) => i === 1 ? { ...row, leaves: [...rows[0].leaves] } : row);
    const reduced = sharedFinancialTestFactory().series(bad);
    expect(reduced).toMatchObject({ state: "REFUSED", value: null });
    expect(reduced.reason_codes).toContain(mode === "conflicting identity" ? "REPORT_SOURCE_CONFLICT" : "REPORT_SOURCE_OVERLAP");
    expect(() => f.document(bad)).toThrow("TEST_ONLY_UNPROVEN_NUMERIC_MAPPING_REFUSED");
  });

  it("keeps TEST_ONLY input out of actual series observations; shared proposal numbers are not source qualification", async () => {
    const f = await financialIntegrationFixture(), series = deriveSeriesObservations(f.doc);
    expect(series.marker.qualification).toBe("TEST_ONLY");
    expect(series.observations).toEqual([]);
    expect(series.absences).toContainEqual({ reason_code: "SOURCE_NOT_QUALIFIED", metric: null, count: 1 });
  });

  it("checks existing pure numeric series/dataset compatibility on an explicitly synthetic qualified-SHAPE fixture only", async () => {
    const f = await financialIntegrationFixture();
    // Exercises a pure parser/projection branch, not an accepted producer or a
    // leased write. This clone is never persisted or passed to the preparer.
    const shapeOnly = { ...structuredClone(f.doc), qualification: "SOURCE_VERIFIED" as const };
    const series = deriveSeriesObservations(shapeOnly);
    const total = series.observations.find(row => row.subject_type === "manager_book" && row.metric === "NET_PNL");
    expect(total).toMatchObject({ value: "900016.3", reason_code: null, source_confidence: "PROVISIONAL" });
    expect(total?.value).toBe(f.dataset().groups[0].economic_partitions[0].metrics.net_pnl.value);
    expect(f.doc.qualification).toBe("TEST_ONLY");
  });
});

describe("actual projection/series APIs with TEST_ONLY SQL-call trace (not PostgreSQL evidence)", () => {
  it("writes revision and head before COMMIT; releases the client before ACK", async () => {
    const f = await financialIntegrationFixture(), prepared = f.prepare(), trace = financialSqlTrace();
    const ack = vi.fn(async (receipt: { revision: string; digest: string }) => {
      expect(trace.statements.at(-1)?.sql).toBe("COMMIT");
      expect(trace.release).toHaveBeenCalledOnce();
      expect(receipt).toEqual({ revision: f.doc.revision, digest: prepared.digest });
    });
    expect(await commitManagerProjectionThenAcknowledge(trace.pool, prepared, ack)).toMatchObject({ state: "APPLIED_IN_TRANSACTION", acknowledged: true });
    const sql = trace.statements.map(statement => statement.sql);
    expect(sql[0]).toBe("BEGIN");
    expect(sql.findIndex(statement => statement.includes("INSERT INTO execution_manager_model_revisions")))
      .toBeLessThan(sql.findIndex(statement => statement.includes("INSERT INTO execution_manager_model_heads")));
    expect(ack).toHaveBeenCalledOnce();
  });

  it.each([/INSERT INTO execution_manager_model_heads/, /^COMMIT$/])("does not ACK a failed write or uncertain COMMIT (%s)", async fail_sql => {
    const f = await financialIntegrationFixture(), trace = financialSqlTrace({ fail_sql }), ack = vi.fn();
    await expect(commitManagerProjectionThenAcknowledge(trace.pool, f.prepare(), ack)).rejects.toThrow("TEST_ONLY_SQL_FAILURE");
    expect(trace.statements.at(-1)?.sql).toBe("ROLLBACK");
    expect(trace.release).toHaveBeenCalledOnce();
    expect(ack).not.toHaveBeenCalled();
  });

  it("lost ACK retries the exact committed current revision without a second write", async () => {
    const f = await financialIntegrationFixture(), prepared = f.prepare(), first = financialSqlTrace();
    await expect(commitManagerProjectionThenAcknowledge(first.pool, prepared, async () => { throw Error("TEST_ONLY_ACK_LOST"); }))
      .rejects.toThrow("TEST_ONLY_ACK_LOST");
    expect(first.statements.at(-1)?.sql).toBe("COMMIT");
    expect(first.statements.some(statement => statement.sql === "ROLLBACK")).toBe(false);
    const retry = financialSqlTrace({ head: headOf(f.doc, prepared.digest), old_digest: prepared.digest }), ack = vi.fn(async () => {});
    expect(await commitManagerProjectionThenAcknowledge(retry.pool, prepared, ack)).toMatchObject({ state: "DUPLICATE_CURRENT", acknowledged: true });
    expect(retry.statements.some(statement => statement.sql.includes("INSERT INTO execution_manager_model_"))).toBe(false);
    expect(ack).toHaveBeenCalledWith({ revision: f.doc.revision, digest: prepared.digest });
  });

  it("refuses a skipped source checkpoint and never acknowledges it", async () => {
    const f = await financialIntegrationFixture(), first = f.prepare(), successor = { ...f.doc, revision: "TEST_ONLY:financial-r3",
      supersedes_revision: f.doc.revision, source_sequence: "3" }, trace = financialSqlTrace({ head: headOf(f.doc, first.digest) }), ack = vi.fn();
    await expect(commitManagerProjectionThenAcknowledge(trace.pool, f.prepare(successor), ack)).rejects.toThrow("MANAGER_CHECKPOINT_GAP");
    expect(trace.statements.at(-1)?.sql).toBe("ROLLBACK");
    expect(trace.statements.some(statement => statement.sql.includes("INSERT INTO"))).toBe(false);
    expect(ack).not.toHaveBeenCalled();
  });

  it("does not rewrite a changed immutable revision or resurrect an older committed revision", async () => {
    const f = await financialIntegrationFixture(), p = f.prepare();
    const changed = financialSqlTrace({ head: headOf(f.doc, p.digest), old_digest: "sha256:" + "f".repeat(64) });
    await expect(persistManagerProjection(changed.client, p)).rejects.toThrow("MANAGER_REVISION_CONFLICT");
    const old = financialSqlTrace({ head: { ...headOf(f.doc, p.digest), revision: "TEST_ONLY:newer" }, old_digest: p.digest });
    await expect(persistManagerProjection(old.client, p)).rejects.toThrow("MANAGER_HISTORICAL_REVISION_NOT_CURRENT");
    expect([...changed.statements, ...old.statements].some(statement => statement.sql.includes("INSERT INTO"))).toBe(false);
  });

  it("records the real TEST_ONLY series absence/checkpoint once and treats the same digest as duplicate", async () => {
    const f = await financialIntegrationFixture(), derived = deriveSeriesObservations(f.doc), trace = financialSqlTrace();
    const store = new ManagerSeriesStore(trace.pool), scope = scopeOf(f.doc);
    expect(await store.recordLive(trace.client, scope, derived)).toBe("RECORDED");
    expect(trace.statements.some(statement => statement.sql.includes("INSERT INTO execution_manager_series_observations"))).toBe(false);
    const checkpoint = trace.statements.find(statement => statement.sql.includes("INSERT INTO execution_manager_series_checkpoints"))!;
    expect(JSON.parse(checkpoint.values[5] as string)).toEqual(derived.absences);
    expect(checkpoint.values.slice(0, 3)).toEqual([f.doc.workspace_id, "paper", f.doc.profile_id]);
    const retry = financialSqlTrace({ series_digest: derived.observation_digest });
    expect(await store.recordLive(retry.client, scope, derived)).toBe("DUPLICATE");
    expect(retry.statements.some(statement => statement.sql.includes("INSERT INTO"))).toBe(false);
  });

  it("records a typed conflicting series disposition without reopening repair or overwriting immutable observations", async () => {
    const f = await financialIntegrationFixture(), trace = financialSqlTrace({ series_digest: "sha256:" + "e".repeat(64) });
    const result = await new ManagerSeriesStore(trace.pool).recordLive(trace.client, scopeOf(f.doc), deriveSeriesObservations(f.doc));
    expect(result).toBe("DIGEST_MISMATCH");
    const writes = trace.statements.filter(statement => statement.sql.includes("INSERT INTO"));
    expect(writes).toHaveLength(1);
    expect(writes[0].sql).toContain("execution_manager_series_checkpoints");
    expect(writes[0].values.slice(3)).toEqual(["SERIES_DIGEST_MISMATCH", f.doc.revision, false]);
  });

  it("reopens a failed live revision for bounded repair without resetting its historical keyset cursor", async () => {
    const f = await financialIntegrationFixture(), trace = financialSqlTrace(), store = new ManagerSeriesStore(trace.pool);
    await store.recordFailure(trace.client, scopeOf(f.doc), f.doc.revision, "TEST_ONLY_WRITER_REFUSED");
    expect(trace.statements).toHaveLength(1);
    expect(trace.statements[0].sql).toContain("THEN 'IN_PROGRESS'");
    expect(trace.statements[0].sql).not.toContain("backfill_cursor_created_at=");
    expect(trace.statements[0].values.slice(3)).toEqual(["TEST_ONLY_WRITER_REFUSED", f.doc.revision, true]);
  });
});
