/** RV-12 / BE-P14. The canonical scoped Manager scenarios are ANSWERS OF THE REAL ScopedManagerReader (real ExecutionReadScopes, real access evaluation,
 * real cursor codec) over TEST_ONLY source worlds; no database, source or network. Capture mode (CAPTURE_MANAGER_SCOPED=1) writes
 * packages/contracts/tooling/execution-manager-scoped-capture.json, which generate-execution-manager-scoped.mjs publishes. Verify mode (default) re-reads every
 * scenario and refusal from the live reader and compares it with that file, then asserts the substance (no peer bytes, no double count, stable cursors).
 * Nothing here qualifies a production publication, policy or financial source. */
import "reflect-metadata";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { AlphaFleetQuerySchema, BindingsQuerySchema, PortfolioListQuerySchema } from "../src/manager-lists/contracts";
import { scopedManagerResponseSchema } from "../src/manager-lists/scoped-manager.contract";
import { makeReader, type Options } from "./elp2-manager-scoped-world.harness";

const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const CAPTURE_FILE = join(contracts, "tooling/execution-manager-scoped-capture.json");
const NOW = 1_790_812_800_000;
const capturing = process.env.CAPTURE_MANAGER_SCOPED === "1";
let scenarios: any[], refusals: any[], worlds: Record<string, () => any>;

beforeAll(async () => {
  const module: any = await import(pathToFileURL(join(contracts, "tooling/execution-manager-scoped-scenarios.mjs")).href);
  scenarios = module.SCENARIOS; refusals = module.REFUSALS; worlds = module.WORLDS;
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW);
});
afterAll(() => { vi.useRealTimers(); });

const optionsOf = (definition: any, override: Partial<Options> = {}): Options => {
  const raw = { ...(definition.options ?? {}), ...override } as any;
  const { researcherFieldsWithout, ...rest } = raw;
  return { principal: definition.principal, ...rest,
    ...(researcherFieldsWithout ? { researcherFields: BUSINESS_READ_FIELDS.filter(field => !researcherFieldsWithout.includes(field)) } : {}) };
};
const parse = (surface: string, query: any) => (surface === "PORTFOLIOS" ? PortfolioListQuerySchema : surface === "ALPHA_FLEET" ? AlphaFleetQuerySchema : BindingsQuerySchema).parse(query);
async function readOnce(definition: any, query: any, override: Partial<Options> = {}, workspaceId?: string) {
  const world = worlds[definition.world]();
  if (workspaceId) world.workspace_id = workspaceId;
  const { reader, principal } = makeReader(world, optionsOf(definition, override));
  return reader.read(principal as any, definition.surface, parse(definition.surface, query) as any, async () => { throw new Error("legacy compatibility must not be used"); }, definition.bindingId);
}
const outcome = async (run: () => Promise<unknown>) => {
  try { return { response: await run() as any }; } catch (error: any) { return { error: { status: error?.status as number, code: error?.code as string } }; }
};
async function runScenario(definition: any) {
  const pages: Array<{ query: any; response: any }> = [];
  let query = { ...definition.query };
  for (let index = 0; index < (definition.pages ?? 1); index++) {
    const response = await readOnce(definition, query) as any;
    pages.push({ query, response });
    if (index + 1 < (definition.pages ?? 1)) query = { ...definition.query, after: response.page.next_cursor };
  }
  return pages;
}
async function runRefusal(definition: any) {
  const variant = definition.variant;
  if (!variant) return outcome(() => readOnce(definition, definition.query));
  const first = await readOnce({ ...definition, options: undefined }, { environment: "paper", limit: 1 }) as any;
  let token: string = first.page.next_cursor;
  if (variant.tamper) token = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
  const query = { ...variant.query, [variant.as ?? "after"]: token };
  if (variant.advance_seconds) vi.setSystemTime(NOW + variant.advance_seconds * 1000);
  try { return await outcome(() => readOnce(definition, query, variant.options ?? {}, variant.workspace_id)); } finally { vi.setSystemTime(NOW); }
}
/** A cursor is compared by what it binds (resource, workspace, direction, boundary); the query fingerprint is an opaque digest of scope internals. */
const decodeCursor = (token: string | null) => {
  if (token === null) return null;
  const payload = JSON.parse(Buffer.from(token.split(".")[2], "base64url").toString("utf8"));
  const { query_fingerprint: _fingerprint, ...bound } = payload;
  return bound;
};
const normalize = (response: any) => ({ ...response, page: { ...response.page, next_cursor: decodeCursor(response.page.next_cursor), previous_cursor: decodeCursor(response.page.previous_cursor) } });

if (capturing) {
  describe("RV-12 capture (writes the generator input)", () => {
    it("records every scenario and refusal from the real reader", async () => {
      const output: any = { lane: "TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT", scenarios: [], refusals: [] };
      for (const definition of scenarios) output.scenarios.push({ id: definition.id, pages: await runScenario(definition) });
      for (const definition of refusals) output.refusals.push({ id: definition.id, ...(await runRefusal(definition)) });
      writeFileSync(CAPTURE_FILE, JSON.stringify(output) + "\n");
    }, 120_000);
  });
} else {
  describe("RV-12 scoped Manager scenarios are the real reader's answers", () => {
    const captured = () => JSON.parse(readFileSync(CAPTURE_FILE, "utf8"));
    it("the capture covers exactly the defined scenarios and refusals", () => {
      expect(captured().scenarios.map((s: any) => s.id)).toEqual(scenarios.map(s => s.id));
      expect(captured().refusals.map((s: any) => s.id)).toEqual(refusals.map(s => s.id));
    });
    it("every scenario page equals the live reader (cursors compared by what they bind) and passes the producer's own validator", async () => {
      for (const definition of scenarios) {
        const live = await runScenario(definition), recorded = captured().scenarios.find((s: any) => s.id === definition.id).pages;
        expect(live.length, definition.id).toBe(recorded.length);
        live.forEach((page, index) => {
          expect(normalize(page.response), `${definition.id} page ${index + 1}`).toEqual(normalize(recorded[index].response));
          expect(scopedManagerResponseSchema.safeParse(recorded[index].response).success, definition.id).toBe(true);
        });
      }
    }, 120_000);
    it("every refusal carries the declared status and code", async () => {
      const recorded = captured().refusals;
      for (const definition of refusals) {
        const live = await runRefusal(definition);
        expect(live, definition.id).toEqual({ error: { status: definition.status, code: definition.code } });
        expect(recorded.find((r: any) => r.id === definition.id), definition.id).toEqual({ id: definition.id, error: { status: definition.status, code: definition.code } });
      }
    }, 120_000);

    const page = (id: string, index = 0) => captured().scenarios.find((s: any) => s.id === id).pages[index].response;
    const facts = (item: any, kind: string) => item.financial_facts.filter((fact: any) => fact.kind === kind);
    it("a researcher reads an authorized subset: the peer's rows, ids and balance are in no byte", () => {
      const response = page("fleet-researcher-paper"), text = JSON.stringify(response);
      expect(response.items.map((item: any) => item.identity.alpha_id)).toEqual(["alpha_TEST_ONLY_A1", "alpha_TEST_ONLY_A2"]);
      for (const hidden of ["alpha_TEST_ONLY_A3", "portfolio_TEST_ONLY_P3", "deployment_TEST_ONLY_D3", "Cirrus", "20000.000000000000000001"]) expect(text).not.toContain(hidden);
      expect(facts(response.items[1], "INTERNAL_ACCOUNT_BALANCE")).toEqual([]);
    });
    it("a shared physical account is stated once, on the binding, never on the child portfolios or the alpha (no double count)", () => {
      const balances = (response: any) => response.items.flatMap((item: any) => facts(item, "INTERNAL_ACCOUNT_BALANCE").map((fact: any) => [item.identity.portfolio_id ?? item.identity.binding_id, fact.facts.account_id]));
      const shared = "account_TEST_ONLY_XS";
      expect(balances(page("portfolios-owner-all")).filter(([, account]: string[]) => account === shared)).toEqual([]);
      expect(balances(page("bindings-owner-live")).filter(([, account]: string[]) => account === shared)).toEqual([["binding_TEST_ONLY_B2", shared]]);
      expect(balances(page("binding-detail-owner-live"))).toEqual([["binding_TEST_ONLY_B2", shared]]);
    });
    it("multi-currency totals are per currency; null, zero and an unstated currency stay three different things", () => {
      const live = page("portfolios-owner-all").items.filter((item: any) => item.environment === "paper");
      expect(live.map((item: any) => item.financial_totals.map((total: any) => total.currency))).toEqual([["EUR", "USD"], ["USD"], ["EUR"]]);
      const bindings = page("bindings-owner-live").items;
      expect(bindings[1].financial_totals.find((total: any) => total.currency === "EUR").allocation).toBeNull();
      expect(live[1].financial_totals[0].allocation).toBe("0");
      for (const item of live) for (const fact of facts(item, "POSITION_PNL")) expect(fact.facts.currency).toBeUndefined();
    });
    it("all-environment reads state a disposition per environment and never merge a withheld environment into an empty one", () => {
      const states = (id: string) => page(id).profile_dispositions.map((d: any) => [d.environment, d.state, d.reason_code]);
      expect(states("portfolios-owner-all").map((s: string[]) => s[1])).toEqual(["PARTIAL", "PARTIAL", "PARTIAL"]);
      expect(states("fleet-researcher-all-pending-unrecorded")).toEqual([["paper", "PARTIAL", "AUTHORIZED_RETAINED_FACTS"], ["sandbox", "DENIED", "EXECUTION_READ_POLICY_PENDING"], ["live", "UNAVAILABLE", "SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED"]]);
      expect(states("fleet-researcher-all-denied-unavailable")).toEqual([["paper", "PARTIAL", "AUTHORIZED_RETAINED_FACTS"], ["sandbox", "UNAVAILABLE", "EXECUTION_READ_AUTHORITY_UNAVAILABLE"], ["live", "DENIED", "EXECUTION_READ_NOT_AVAILABLE"]]);
      const mixed = page("fleet-researcher-all-pending-unrecorded");
      expect(mixed.items.every((item: any) => item.environment === "paper")).toBe(true);
      expect(mixed.page).toMatchObject({ visible_count: 2, returned_count: 1, has_more: true });
    });
    it("a 3 page chain is stable: visible_count is constant, pages are disjoint and previous_cursor walks back to the same page", async () => {
      const pages = captured().scenarios.find((s: any) => s.id === "fleet-owner-paper-chain").pages.map((p: any) => p.response);
      expect(pages.map((p: any) => [p.page.visible_count, p.page.returned_count, p.page.has_more, p.page.next_cursor !== null, p.page.previous_cursor !== null]))
        .toEqual([[3, 1, true, true, false], [3, 1, true, true, true], [3, 1, false, false, true]]);
      expect(new Set(pages.map((p: any) => p.items[0].identity.alpha_id)).size).toBe(3);
      const definition = scenarios.find(s => s.id === "fleet-owner-paper-chain");
      const back = await readOnce(definition, { environment: "paper", limit: 1, before: pages[2].page.previous_cursor }) as any;
      expect(back.items).toEqual(pages[1].items);
      expect(decodeCursor(back.page.previous_cursor)).toEqual(decodeCursor(pages[1].page.previous_cursor));
    });
    it("the bounded page is the maximum 100 items inside the 1 MiB budget, one item at the 200 total bound, and says there is more", () => {
      const response = captured().scenarios.find((s: any) => s.id === "portfolios-grid-bounded").pages[0].response;
      expect(response.page).toMatchObject({ visible_count: 101, returned_count: 100, limit: 100, has_more: true });
      expect(response.items[0].financial_totals).toHaveLength(200);
      expect(Buffer.byteLength(JSON.stringify(response))).toBeLessThan(1048576 - 16384);
    });
  });
}
