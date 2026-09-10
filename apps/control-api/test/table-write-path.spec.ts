import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PHASE 4 (round 2) · a table the product reads and only a test writes.
 *
 * `execution_command_center_pins` had a SELECT in the repository, a panel on
 * Command Center, and its only INSERT in a spec file. The suite was green
 * because the test inserted the rows it then read back — the one shape of bug
 * that running the tests can never catch, because the test is the bug's alibi.
 *
 * This walks the migrations for every table the schema declares, then asks two
 * questions of `src/`: is it read, and is it written. A table that is read in
 * `src` but written only under `test/` fails here, by name.
 *
 * The allowlist is per table and carries a reason, never a directory. A
 * blanket waiver would reintroduce exactly the blindness this exists to
 * remove.
 */

const ROOT = resolve(__dirname, "..");
const MIGRATIONS = resolve(ROOT, "migrations");
const SRC = resolve(ROOT, "src");
const TEST = resolve(ROOT, "test");

/**
 * Tables read by `src` whose only writer is a test, each with the reason it is
 * tolerated and who has to resolve it. Measured 2026-09-10; every entry was
 * traced through the migrations, `src`, and the Rust cells under `services/`.
 *
 * These are not waivers of the rule. They are the list of places the rule is
 * already broken, written down so the number can only go down: a new one fails
 * this test on the commit that introduces it.
 */
const KNOWN_READ_WITHOUT_WRITE: Readonly<Record<string, string>> = {
  governance_paper_exit_reviews:
    "Blocks the whole Paper-exit flow: paper-exit.service requires a review before a decision can be planned, and nothing creates one. Owner decision — build the creation route or retire the feature.",
  governance_paper_exit_findings: "Child of governance_paper_exit_reviews; empty until that record can exist.",
  governance_paper_exit_lineage: "Child of governance_paper_exit_reviews; empty until that record can exist.",
  governance_paper_exit_panels: "Child of governance_paper_exit_reviews; empty until that record can exist.",
  governance_approval_findings: "Read by governance.repository for the R1/R2 gate screens; no writer traced. Owner decision.",
  governance_approval_analytics_scopes: "Read by governance.repository; no writer traced. Owner decision.",
  governance_r2_lineage: "Read by governance.repository for R2 provenance; no writer traced. Owner decision.",
  governance_sandbox_findings: "Read by sandbox-certification.repository; no writer traced anywhere — not src, not test, not the Rust cells. Owner decision.",
  governance_sandbox_step_evidence: "Read by sandbox-certification.repository; no writer traced. Owner decision.",
};

function sqlFiles(directory: string): string[] {
  const out: string[] = [];
  const walk = (path: string) => {
    for (const entry of readdirSync(path)) {
      const full = resolve(path, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|sql)$/.test(entry) && !entry.endsWith(".d.ts")) out.push(full);
    }
  };
  walk(directory);
  return out;
}

/**
 * Every table the migrations create, minus every table a later one drops.
 *
 * Only the Up section counts. Each migration carries a Down that drops
 * everything it made, so reading the whole file said all 73 tables were
 * created and all 73 dropped, leaving 22 by accident of ordering — a scan
 * that looks like it works and silently covers a third of the schema.
 */
function declaredTables(): string[] {
  const created = new Set<string>();
  const dropped = new Set<string>();
  for (const file of sqlFiles(MIGRATIONS)) {
    const sql = readFileSync(file, "utf8").split(/^--\s*Down Migration/mi)[0];
    for (const match of sql.matchAll(/CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      created.add(match[1].toLowerCase());
    }
    for (const match of sql.matchAll(/DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?"?([a-z0-9_]+)"?/gi)) {
      dropped.add(match[1].toLowerCase());
    }
  }
  return [...created].filter((table) => !dropped.has(table)).sort();
}

function corpus(directory: string): string {
  return sqlFiles(directory).map((file) => readFileSync(file, "utf8")).join("\n");
}

/**
 * Can anything here bring a row of this table into existence?
 *
 * Deliberately not UPDATE or DELETE. `governance_paper_exit_reviews` has both
 * in `src` and is still unreachable, because an UPDATE needs a row that
 * something else created and nothing else does. Counting an UPDATE as a write
 * path is how this gap stayed invisible: the code looks like it maintains the
 * record, and no code can ever produce one.
 */
function creates(text: string, table: string): boolean {
  return new RegExp(
    `(?:INSERT\\s+INTO|COPY|MERGE\\s+INTO)\\s+(?:ONLY\\s+)?(?:public\\.)?"?${table}"?\\b`,
    "i",
  ).test(text);
}

function reads(text: string, table: string): boolean {
  return new RegExp(`(?:FROM|JOIN|USING)\\s+(?:ONLY\\s+)?(?:public\\.)?"?${table}"?\\b`, "i").test(text);
}

describe("every table the product reads can have a row created by the product", () => {
  const tables = declaredTables();
  const src = corpus(SRC);
  const tests = corpus(TEST);

  it("declares a non-trivial schema, so a silent glob failure cannot pass this file", () => {
    // 73 tables on 2026-09-10. A scan that silently narrows is the failure
    // this whole file exists to prevent, so it is asserted here too.
    expect(tables.length).toBeGreaterThan(60);
    expect(src.length).toBeGreaterThan(100_000);
  });

  it("finds no table that src reads and src cannot create", () => {
    // Deliberately NOT "and a test writes it". My first version had that
    // clause and let `governance_sandbox_findings` through, because no test
    // writes that one either — it is read by the product and created by
    // nothing anywhere, which is the worse case, not the excusable one. A test
    // INSERT explains why the suite stayed green; it is not what makes the
    // table broken.
    const offenders = tables.filter((table) => reads(src, table) && !creates(src, table));
    expect(offenders.filter((table) => !(table in KNOWN_READ_WITHOUT_WRITE))).toEqual([]);
  });

  it("keeps the known list honest: every entry is still broken, and still read", () => {
    // An entry that has been fixed must leave this list, or the list stops
    // describing anything and starts excusing everything.
    for (const [table, reason] of Object.entries(KNOWN_READ_WITHOUT_WRITE)) {
      expect(tables, `${table} is allowlisted but no migration declares it`).toContain(table);
      expect(reads(src, table), `${table} is allowlisted but src no longer reads it`).toBe(true);
      expect(creates(src, table), `${table} now has a writer in src — remove it from the list`).toBe(false);
      expect(reason.length, `${table} needs a real reason, not a placeholder`).toBeGreaterThan(40);
    }
  });

  it("would fail on a new offender, not merely on the ones already listed", () => {
    // The guard proved against a table that really is in this state today.
    const proof = "governance_paper_exit_reviews";
    expect(reads(src, proof)).toBe(true);
    expect(creates(src, proof)).toBe(false);
    // Its INSERT lives only here, under test/ — the alibi, not the defect.
    expect(creates(tests, proof)).toBe(true);
    // And one the tests do not write either, which the first version missed.
    expect(reads(src, "governance_sandbox_findings")).toBe(true);
    expect(creates(src, "governance_sandbox_findings")).toBe(false);
    expect(creates(tests, "governance_sandbox_findings")).toBe(false);
    // And a table with a real writer is not flagged, so the rule is a rule and
    // not a way of failing everything.
    expect(creates(src, "execution_incidents")).toBe(true);
  });
});
