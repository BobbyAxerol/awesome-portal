/** SOURCE/TEST_ONLY ownership regression, not a database or runtime receipt. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const repo = resolve(__dirname, "../../..");
const read = (path: string) => readFileSync(resolve(repo, path), "utf8");
describe("C7 producer follow-through: actual derived governance view ownership", () => {
  it("classifies migration133's decision inbox as derived without inventing another retention/writer", () => {
    const ledger = JSON.parse(read("upgrade/upgrade_frontend_plan_hifi/hifi_execution_loop/r2_ledger/persistence-ownership.v1.json"));
    const rows = ledger.tables.filter((row: { table: string }) => row.table === "governance_approval_decision_inbox");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ relkind: "VIEW", writer_owner: "VIEW_DERIVED",
      verbs: { insert: 0, update: 0, delete: 0, read: 1 }, readers: 1,
      rows_dev: null, rows_stable: null, retention: "INHERITED_FROM_BACKING_TABLES",
      disposal_decision: "FOLLOWS_BACKING_TABLES" });
    expect(ledger.owner_enum).toContain(rows[0].writer_owner);
    expect(rows[0].ingress).toMatch(/^NONE /);
    expect(rows[0].backing_tables.split(", ").sort()).toEqual(
      ["governance_approval_inbox", "governance_r2_lineage", "governance_approval_requests"].sort());
    const migration = read("apps/control-api/migrations/1723680000133_governance-portal-decisions.sql").split("-- Down Migration")[0];
    expect(migration).toMatch(/CREATE VIEW governance_approval_decision_inbox AS/);
    for (const table of rows[0].backing_tables.split(", "))
      expect(migration).toMatch(new RegExp("(?:FROM|JOIN) " + table + "\\b"));
    expect(migration).not.toMatch(/CREATE (?:MATERIALIZED VIEW|TABLE) governance_approval_decision_inbox/);
    expect(read("apps/control-api/src/governance/contracts.ts"))
      .toContain('table: "governance_approval_decision_inbox"');
  });
});
