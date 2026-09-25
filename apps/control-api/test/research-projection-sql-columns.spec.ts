/**
 * W5c · the progress-snapshot reads name only columns the table has.
 *
 * Found on the Research preview (2026-09-25): every Screen 13 read of an Alpha
 * with runs answered `503 RESEARCH_COMPARE_UNAVAILABLE "Compare is temporarily
 * unavailable."`. The compare snapshot ordered `research.run_progress_snapshots`
 * by `progress.updated_at`, a column that table never had (it has
 * `received_at`); PostgreSQL rejected the statement and the repository wrapped
 * the untyped error as unavailable. The service and controller specs mock the
 * repository and the P20 disposable-DB proof exercises `pairRaw` only, so no
 * test ever sent this statement to a database.
 *
 * This check needs no database: it reads the table's columns from its
 * migration and every lateral read of that table in the Research repositories.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..");

function tableColumns(table: string): Set<string> {
  const migrations = readdirSync(join(ROOT, "migrations")).filter((name) => name.endsWith(".sql")).sort();
  const columns = new Set<string>();
  for (const name of migrations) {
    const sql = readFileSync(join(ROOT, "migrations", name), "utf8");
    const create = new RegExp(`CREATE TABLE ${table.replace(".", "\\.")} \\(([\\s\\S]*?)\\n\\);`).exec(sql);
    if (create) {
      for (const line of create[1]!.split("\n")) {
        const column = /^\s{2}([a-z_][a-z0-9_]*)\s+[a-z]/.exec(line);
        if (column && !["primary", "foreign", "check", "unique", "constraint"].includes(column[1]!)) columns.add(column[1]!);
      }
    }
    for (const added of sql.matchAll(new RegExp(`ALTER TABLE ${table.replace(".", "\\.")}[\\s\\S]*?ADD COLUMN (?:IF NOT EXISTS )?([a-z_][a-z0-9_]*)`, "g"))) {
      columns.add(added[1]!);
    }
  }
  return columns;
}

/** Every `alias.column` inside a `FROM <table> <alias> … )` read window. */
function aliasReferences(source: string, table: string): Array<{ alias: string; column: string }> {
  const references: Array<{ alias: string; column: string }> = [];
  for (const match of source.matchAll(new RegExp(`FROM ${table.replace(".", "\\.")}\\s+([a-z_]+)`, "g"))) {
    const alias = match[1]!;
    const start = match.index! + match[0].length;
    const window = source.slice(start, source.indexOf(")", start));
    for (const reference of window.matchAll(new RegExp(`\\b${alias}\\.([a-z_][a-z0-9_]*)`, "g"))) {
      references.push({ alias, column: reference[1]! });
    }
  }
  return references;
}

describe("Research reads of run_progress_snapshots", () => {
  const table = "research.run_progress_snapshots";
  const columns = tableColumns(table);

  it("reads the table definition from its migration", () => {
    expect(columns.has("received_at")).toBe(true);
    expect(columns.has("snapshot")).toBe(true);
    expect(columns.has("updated_at")).toBe(false);
  });

  const repositories = readdirSync(join(ROOT, "src", "research")).filter((name) => name.endsWith(".repository.ts"));
  for (const name of repositories) {
    const source = readFileSync(join(ROOT, "src", "research", name), "utf8");
    const references = aliasReferences(source, table);
    if (references.length === 0) continue;
    it(`${name} orders and filters only by columns the table has`, () => {
      const unknown = references.filter((reference) => !columns.has(reference.column));
      expect(unknown).toEqual([]);
    });
  }

  it("covers the compare snapshot that failed on the preview", () => {
    const source = readFileSync(join(ROOT, "src", "research", "compare.repository.ts"), "utf8");
    expect(aliasReferences(source, table).map((reference) => reference.column)).toContain("received_at");
  });
});
