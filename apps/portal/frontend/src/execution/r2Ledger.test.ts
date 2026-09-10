/**
 * PHASE R2-0 · the ledgers have to stay true, not just exist.
 *
 * R2-0 asks for a contract/ownership/capability/performance baseline before any
 * of round 2 touches a payload or a flag, and its exit gate is "no route, table
 * or screen without an owner", validated in CI.
 *
 * A ledger that is only written once rots the day someone adds a route. So this
 * test re-derives the route list from the control-api controllers and fails when
 * the inventory disagrees, re-derives the table list from the same source, and
 * recomputes every pinned structure digest. It also refuses to let a captured
 * response smuggle a credential into the repository.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..", "..", "..", "..");
const LEDGER = join(ROOT, "upgrade", "upgrade_frontend_plan_hifi", "hifi_execution_loop", "r2_ledger");
const CONTROL_API = join(ROOT, "apps", "control-api", "src");

const read = (name: string): any => JSON.parse(readFileSync(join(LEDGER, name), "utf8"));

function walk(dir: string, keep: (f: string) => boolean): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(join(dir, e.name), keep) : keep(e.name) ? [join(dir, e.name)] : [],
  );
}

/** The same derivation the ledger was generated from: @Controller prefix + method decorator. */
function publishedRoutes(): string[] {
  const routes: string[] = [];
  for (const file of walk(CONTROL_API, (f) => f.endsWith(".controller.ts"))) {
    const body = readFileSync(file, "utf8");
    const prefix = /@Controller\(\s*["']([^"']*)["']/.exec(body)?.[1] ?? "";
    for (const m of body.matchAll(/@(Get|Post|Put|Patch|Delete)\(\s*(?:["']([^"']*)["'])?\s*\)/g)) {
      const segments = [prefix.replace(/^\/|\/$/g, ""), (m[2] ?? "").replace(/^\/|\/$/g, "")].filter(Boolean);
      routes.push(`${m[1].toUpperCase()} /${segments.join("/")}`);
    }
  }
  return [...new Set(routes)].sort();
}

/** Table names the control-api actually names in SQL, tests excluded. */
function referencedTables(): Set<string> {
  const found = new Set<string>();
  for (const file of walk(CONTROL_API, (f) => f.endsWith(".ts") && !/\.(spec|test)\.ts$/.test(f))) {
    const body = readFileSync(file, "utf8");
    for (const m of body.matchAll(/\b(?:FROM|JOIN|INSERT INTO|UPDATE|DELETE FROM)\s+((?:execution|governance)_[a-z0-9_]+)/gi)) {
      found.add(m[1]);
    }
  }
  return found;
}

const CLASSES = ["AUTO_READ", "INTERACTION_READ", "PORTAL_MUTATION", "EDGE_COMMAND", "INTENTIONALLY_UNEXPOSED"];
const OWNERS = ["PORTAL_WORKFLOW", "PORTAL_PROJECTION", "TRADING_SYSTEM_READ", "MIGRATION_ONLY",
  "RETIRED_PENDING_REMOVAL", "NEEDS_CODEX_REVIEW", "VIEW_DERIVED"];
const REQUIRED_STATES = ["READY", "EMPTY", "PARTIAL", "STALE", "UNAVAILABLE", "LOADING", "ACCESS_DENIED"];

describe("R2-0 · capability inventory", () => {
  const inventory = read("capability-inventory.v1.json");

  it("covers exactly the routes the controllers publish", () => {
    const declared = inventory.routes.map((r: any) => r.route).sort();
    const actual = publishedRoutes();
    // Named separately so a diff points at the missing side instead of a length mismatch.
    expect(actual.filter((r) => !declared.includes(r))).toEqual([]);
    expect(declared.filter((r: string) => !actual.includes(r))).toEqual([]);
  });

  it("gives every route a class, an owner and evidence", () => {
    for (const route of inventory.routes) {
      expect(CLASSES, route.route).toContain(route.interaction_class);
      expect(route.owner, route.route).toBeTruthy();
      expect(route.test_owner, route.route).toBeTruthy();
      expect(String(route.evidence ?? "").length, route.route).toBeGreaterThan(10);
    }
  });

  it("makes every INTENTIONALLY_UNEXPOSED route say why", () => {
    for (const route of inventory.routes.filter((r: any) => r.interaction_class === "INTENTIONALLY_UNEXPOSED")) {
      expect(String(route.evidence), route.route).toMatch(/design|infrastructure|probe|forbidden|auth/i);
    }
  });

  it("records why no route is an EDGE_COMMAND", () => {
    const commands = inventory.routes.filter((r: any) => r.interaction_class === "EDGE_COMMAND");
    if (commands.length === 0) expect(inventory.edge_command_count_zero_because).toBeTruthy();
  });
});

describe("R2-0 · persistence ownership", () => {
  const ownership = read("persistence-ownership.v1.json");
  const byTable = new Map<string, any>(ownership.tables.map((t: any) => [t.table, t]));

  it("declares an owner for every table, with no silent unknowns", () => {
    for (const table of ownership.tables) {
      expect(OWNERS, table.table).toContain(table.writer_owner);
      expect(table.ingress, table.table).toBeTruthy();
      expect(table.disposal_decision, table.table).toBeTruthy();
    }
  });

  it("makes an unresolved or retired table carry its reason", () => {
    for (const table of ownership.tables) {
      if (table.writer_owner === "NEEDS_CODEX_REVIEW" || table.writer_owner === "RETIRED_PENDING_REMOVAL") {
        expect(String(table.note ?? "").length, table.table).toBeGreaterThan(20);
      }
    }
  });

  it("covers every execution/governance table the control-api names in SQL", () => {
    const missing = [...referencedTables()].filter((t) => !byTable.has(t)).sort();
    expect(missing).toEqual([]);
  });

  it("states the method, because grepping for INSERT is not ownership", () => {
    expect(ownership.method).toMatch(/call-graph/i);
    expect(ownership.method).toMatch(/NOT the method/i);
  });
});

describe("R2-0 · screen contract and performance baseline", () => {
  const contracts = read("execution-screen-contract-ledger.v1.json");
  const baseline = read("performance-baseline.v1.json");

  it("gives every named operation a schema, an owner and a byte baseline", () => {
    expect(contracts.operations.length).toBeGreaterThan(0);
    for (const op of contracts.operations) {
      expect(op.schema_version, op.named_operation).toBeTruthy();
      expect(op.owner, op.named_operation).toBeTruthy();
      expect(op.test_owner, op.named_operation).toBeTruthy();
      expect(op.byte_baseline?.identity, op.named_operation).toBeGreaterThan(0);
      expect(op.latency_ms?.samples, op.named_operation).toBeGreaterThanOrEqual(30);
    }
  });

  it("keeps percentiles ordered, so a broken capture cannot pass as a baseline", () => {
    for (const op of contracts.operations) {
      const { p50, p95, p99, max } = op.latency_ms;
      expect(p50, op.named_operation).toBeLessThanOrEqual(p95);
      expect(p95, op.named_operation).toBeLessThanOrEqual(p99);
      expect(p99, op.named_operation).toBeLessThanOrEqual(max);
    }
  });

  it("names what is not instrumented instead of leaving a blank", () => {
    expect(baseline.cache_admission_outcome).toMatch(/not instrumented/i);
    expect(baseline.method).toMatch(/r2-benchmark/);
  });
});

describe("R2-0 · frontend consumer and panel state ledgers", () => {
  const consumers = read("frontend-consumer-ledger.v1.json");
  const panels = read("panel-state-ledger.v1.json");

  it("admits that the data-branch count is an upper bound", () => {
    expect(consumers.counting_caveat).toMatch(/UPPER BOUND/);
    expect(consumers.totals.tighter_candidate_files.length).toBeGreaterThan(0);
    expect(consumers.totals.tighter_candidate_files.length)
      .toBeLessThanOrEqual(consumers.totals.files_needing_v2_migration);
  });

  it("lists all seven required states and every vocabulary that disagrees with them", () => {
    expect(panels.r2_0_required_states.slice().sort()).toEqual(REQUIRED_STATES.slice().sort());
    expect(Object.keys(panels.vocabularies_in_code).length).toBeGreaterThanOrEqual(3);
    expect(panels.vocabulary_findings.length).toBeGreaterThan(0);
  });

  it("derives the unobserved states from the observed ones rather than asserting them", () => {
    const observed = Object.keys(panels.observed_on_dev);
    expect(panels.unobserved_states.slice().sort())
      .toEqual(REQUIRED_STATES.filter((s) => !observed.includes(s)).sort());
  });

  it("counts EMPTY panels that carry no reason, because EMPTY must not hide 'never measured'", () => {
    const counted = panels.panels.filter((p: any) => p.observed_state === "EMPTY" && !p.reason_code).length;
    expect(panels.empty_without_reason.count).toBe(counted);
  });
});

describe("R2-0 · pinned response shapes", () => {
  const index = read("golden-shape-index.v1.json");

  it("pins a shape whose digest still matches its file", () => {
    expect(index.pins.length).toBeGreaterThan(0);
    for (const pin of index.pins) {
      const file = join(LEDGER, pin.file);
      expect(existsSync(file), pin.file).toBe(true);
      const shape = JSON.parse(readFileSync(file, "utf8")).shape;
      const digest = `sha256:${createHash("sha256").update(stableStringify(shape)).digest("hex")}`;
      expect(digest, pin.operation).toBe(pin.structure_digest);
    }
  });

  it("stores types only, never a captured value", () => {
    for (const pin of index.pins) {
      const body = JSON.parse(readFileSync(join(LEDGER, pin.file), "utf8"));
      expect(body.values_excluded).toMatch(/Types and key paths only/);
      const leaves = new Set<string>();
      collectLeaves(body.shape, leaves);
      // Every leaf is a type name or a list marker; anything else would be data.
      for (const leaf of leaves) {
        expect(leaf, `${pin.operation} leaf`).toMatch(/^(string|integer|number|boolean|null|<[^>]*>)$/);
      }
    }
  });
});

describe("R2-0 · no ledger carries a secret", () => {
  it("keeps credentials, cookies and tokens out of every ledger file", () => {
    const files = walk(LEDGER, (f) => f.endsWith(".json") || f.endsWith(".sh"));
    expect(files.length).toBeGreaterThan(5);
    for (const file of files) {
      const body = readFileSync(file, "utf8");
      // A value, not a field name: "<key>": "<something long and secret-shaped>".
      const leak = /"(?:credential|password|secret|token|cookie|authorization|session_id)"\s*:\s*"(?!(?:string|null)")[^"]{6,}"/i.exec(body);
      expect(leak?.[0] ?? null, file).toBeNull();
      expect(/probe-claude-\d{4}/.test(body), file).toBe(false);
    }
  });
});

describe("R2-0 · the anonymous capture", () => {
  const capture = read("anonymous-capture.v1.json");

  it("shows a browser that reaches nothing but the Portal origin", () => {
    expect(capture.authenticated).toBe(false);
    expect(capture.foreign_origin_requests).toBe(0);
    expect(capture.origins_contacted.length).toBe(1);
  });

  it("shows no cookie and no secret-shaped value on any page", () => {
    expect(capture.cookie_names).toEqual([]);
    for (const page of capture.per_path) {
      expect(page.htmlSecretMatch, page.path).toBeNull();
      // Preferences are fine; anything else in storage would need a reason.
      expect(page.localStorageKeys, page.path).toEqual(["portal.preferences.v1"]);
    }
  });

  it("shows every unauthenticated read refused, not merely empty", () => {
    const results: Record<string, number> = capture.anonymous_api_probe.results;
    expect(Object.keys(results).length).toBeGreaterThanOrEqual(5);
    for (const [operation, status] of Object.entries(results)) {
      expect(status, operation).toBe(401);
    }
    expect(capture.anonymous_api_probe.error_code).toBe("SESSION_REQUIRED");
  });

  it("records names and flags, never values", () => {
    expect(capture.cookie_values_recorded).toBe(false);
    expect(capture.values_recorded).toMatch(/Names and flags only/);
  });
});

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as object).sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as any)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

function collectLeaves(value: unknown, into: Set<string>): void {
  if (Array.isArray(value)) { value.forEach((v) => collectLeaves(v, into)); return; }
  if (value && typeof value === "object") { Object.values(value as object).forEach((v) => collectLeaves(v, into)); return; }
  into.add(String(value));
}
