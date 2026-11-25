/** FE-073/074: served envelope publication; every new fixture is TEST_ONLY_SYNTHETIC_NOT_PRODUCT_RECEIPT.
 * The fixtures describe wire shapes and grant no source, runtime or workspace authority.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const load = (path: string): any => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const copy = <T>(value: T): T => structuredClone(value);
const paperSchema = load("schemas/execution-paper-read.v1.schema.json");
const paperApi = load("openapi/execution-paper-read.openapi.json");
const governanceApi = load("openapi/execution-governance.openapi.json");
const productSchema = load("schemas/execution-governance-product.v1.schema.json");
const paper = load("fixtures/execution-paper-read.served-envelope.valid.json");
const duplicate = load("fixtures/execution-governance.duplicate-open.valid.json");
const problem = load("fixtures/execution-governance.served-problem.valid.json");

const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
for (const name of readdirSync(resolve(root, "schemas"))) {
  if (name.endsWith(".json")) ajv.addSchema(load(`schemas/${name}`));
}
const standalone = ajv.getSchema(paperSchema.$id)!;
const request = ajv.getSchema(`${productSchema.$id}#/$defs/ApprovalCreateRequest`)!;
const compiled = new Map<string, ReturnType<typeof ajv.compile>>();
function component(family: "paper" | "governance", name: string) {
  const key = `${family}/${name}`;
  if (!compiled.has(key)) {
    const document = family === "paper" ? paperApi : governanceApi;
    // The published standalone schemas use these ids. Keep relative OpenAPI schema refs
    // pointed at those same registered definitions rather than inventing a second oracle.
    const components = JSON.parse(JSON.stringify(document.components).replaceAll(
      "../schemas/", "https://schemas.primusspark.com/portal/",
    ));
    compiled.set(key, ajv.compile({
      $id: `https://contracts.test/served-envelope/${key}.json`,
      $ref: `#/components/schemas/${name}`,
      components,
    }));
  }
  return compiled.get(key)!;
}

function bothPaper(value: unknown, expected: boolean) {
  expect(standalone(value), JSON.stringify(standalone.errors)).toBe(expected);
  const fromOpenApi = component("paper", "PaperReadResponse");
  expect(fromOpenApi(value), JSON.stringify(fromOpenApi.errors)).toBe(expected);
}

describe("FE-073 Paper served envelope", () => {
  it("publishes the actual optional clocks, panels, history and lineage counts together", () => {
    bothPaper(paper, true);
    expect(paper.read_at_ms).toBe(Date.parse(paper.read_at));
    expect(paper.as_of_ms).toBe(Date.parse(paper.as_of));
    expect(paper.panels.orders.coverage.returned_count).toBe(paper.panels.orders.data.rows.length);
    expect(paper.data.history_windows.account_equity.returned_rows).toBe(paper.data.account_equity.length);
    expect(paper.capabilities[0].lineage_scoped_out).toEqual({ account: 2, strategy: 1 });
    for (const name of ["PanelEnvelope", "PaperHistoryWindow", "PaperHistoryDownsample"])
      expect(paperSchema.$defs[name], name).toBeDefined();
  });

  it.each([
    "execution-paper-workbench.partial.valid.json",
    "execution-paper-workbench-vnm.partial.valid.json",
    "execution-paper-overview.empty.valid.json",
    "execution-full-blotter.partial.valid.json",
  ])("keeps the existing v1 fixture %s valid", file => {
    bothPaper(load(`fixtures/${file}`), true);
  });

  it.each([
    "execution-paper-workbench.okx.valid.json",
    "execution-full-blotter.okx.valid.json",
  ])("accepts the PAPER_OKX_SWAP body %s in standalone and OpenAPI", file => {
    const body = load(`fixtures/${file}`);
    expect(body.delivery_profile).toBe("PAPER_OKX_SWAP");
    bothPaper(body, true);
  });

  it("serves exactly the Paper profiles Core can read, and no other profile id", () => {
    expect(paperSchema.properties.delivery_profile.enum).toEqual(["PAPER_BINANCE_USDM", "PAPER_OKX_SWAP"]);
    for (const profile of ["PAPER_DNSE_VNM", "SANDBOX_BINANCE_USDM", "LIVE_BINANCE_USDM", "paper_okx_swap", "PAPER_OKX", "", null]) {
      const bad = copy(paper);
      bad.delivery_profile = profile;
      bothPaper(bad, false);
    }
  });

  it("keeps source-clock absence null and leaves optional additions backward compatible", () => {
    const missingClock = copy(paper);
    missingClock.as_of = null;
    missingClock.as_of_ms = null;
    bothPaper(missingClock, true);
    const legacy = copy(paper);
    delete legacy.read_at_ms;
    delete legacy.as_of_ms;
    delete legacy.panels;
    delete legacy.data.history_windows;
    delete legacy.capabilities[0].lineage_scoped_out;
    bothPaper(legacy, true);
    const exactHistory = copy(paper);
    delete exactHistory.data.history_windows.account_equity.downsample;
    exactHistory.data.history_windows.account_equity.source_rows = 2;
    bothPaper(exactHistory, true);
  });

  it("does not mistake retained history for a 200-row snapshot page or claim a hard output ceiling", () => {
    const retained = copy(paper);
    retained.data.account_equity = Array.from({ length: 720 }, (_, index) => ({
      ...paper.data.account_equity[0], equity: String(20_000 + index),
    }));
    retained.data.history_windows.account_equity.returned_rows = 720;
    retained.data.history_windows.account_equity.source_rows = 720;
    delete retained.data.history_windows.account_equity.downsample;
    bothPaper(retained, true);
    expect(paperSchema.$defs.Records.maxItems).toBe(200);
    expect(paperSchema.$defs.PaperHistoryRecords.maxItems).toBeUndefined();
    const invalidHistory = copy(retained);
    invalidHistory.data.account_equity[0].private_token = "TEST_ONLY";
    bothPaper(invalidHistory, false);
    const overPage = copy(paper);
    overPage.data.positions = Array(201).fill({ quantity: "0" });
    expect(standalone(overPage)).toBe(false);
  });

  const badCases: Array<[string, (value: any) => void]> = [
    ["ISO in the canonical read clock", value => { value.read_at_ms = value.read_at; }],
    ["null read clock", value => { value.read_at_ms = null; }],
    ["fractional source clock", value => { value.as_of_ms += 0.5; }],
    ["unknown root field", value => { value.source_token = "TEST_ONLY_not_a_credential"; }],
    ["panel that is not an envelope", value => { value.panels.orders = []; }],
    ["unknown panel field", value => { value.panels.orders.grant_ref = "TEST_ONLY"; }],
    ["positive panel with absent data", value => { value.panels.orders.data = null; }],
    ["negative panel row count", value => { value.panels.orders.coverage.returned_count = -1; }],
    ["unknown panel clock", value => { value.panels.orders.clocks.observed_at = "TEST_ONLY"; }],
    ["zero lineage count", value => { value.capabilities[0].lineage_scoped_out.account = 0; }],
    ["unknown lineage axis", value => { value.capabilities[0].lineage_scoped_out.peer = 1; }],
    ["negative history rows", value => { value.data.history_windows.account_equity.source_rows = -1; }],
    ["history without a basis", value => { delete value.data.history_windows.account_equity.basis; }],
    ["invented history basis", value => { value.data.history_windows.account_equity.basis = "TRADING_SYSTEM"; }],
    ["unknown history field", value => { value.data.history_windows.account_equity.source_cursor = "TEST_ONLY"; }],
    ["unknown history relation", value => { value.data.history_windows.private_relation = {}; }],
    ["unknown downsampling method", value => { value.data.history_windows.account_equity.downsample.method = "AVERAGE"; }],
    ["zero bucket width", value => { value.data.history_windows.account_equity.downsample.bucket_seconds = 0; }],
    ["unknown downsample field", value => { value.data.history_windows.account_equity.downsample.raw_rows = []; }],
  ];
  it.each(badCases)("refuses %s in standalone and OpenAPI", (_label, mutate) => {
    const bad = copy(paper);
    mutate(bad);
    bothPaper(bad, false);
  });
});

describe("FE-074 approval request and served problems", () => {
  const payload = {
    schema_version: "governance.approval-create-request.v1",
    request_key: "req_TEST_ONLY_create",
    gate: "R1",
    alpha_id: "alpha_TEST_ONLY",
    evidence_run_id: "run_TEST_ONLY",
    methodology_claim_id: "claim_TEST_ONLY",
    summary: "Synthetic contract example for an independent R1 review.",
  };

  it("allows session workspace resolution and a valid explicitly named workspace", () => {
    expect(request(payload), JSON.stringify(request.errors)).toBe(true);
    expect(request({ ...payload, workspace_id: "ws_TEST_ONLY" }), JSON.stringify(request.errors)).toBe(true);
    const operation = governanceApi.paths["/api/v1/execution/governance/approvals"].post;
    expect(operation.requestBody.content["application/json"].schema.$ref)
      .toBe("../schemas/execution-governance-product.v1.schema.json#/$defs/ApprovalCreateRequest");
    expect(productSchema.$defs.ApprovalCreateRequest.required).not.toContain("workspace_id");
  });

  it.each([null, "", "ab", 1, [], {}])("does not treat workspace %j as omitted", workspace => {
    expect(request({ ...payload, workspace_id: workspace })).toBe(false);
  });

  it("keeps explicit authority selectors and unknown request fields rejected", () => {
    expect(request({ ...payload, actor_user_id: "usr_TEST_ONLY" })).toBe(false);
    expect(request({ ...payload, grant_ref: "TEST_ONLY" })).toBe(false);
    expect(request({ ...payload, gate: "R2" })).toBe(false);
  });

  it("publishes the served problem and the duplicate's structured id", () => {
    const generic = component("governance", "Problem");
    const specific = component("governance", "DuplicateOpenApprovalProblem");
    expect(generic(problem), JSON.stringify(generic.errors)).toBe(true);
    expect(generic(duplicate), JSON.stringify(generic.errors)).toBe(true);
    expect(specific(duplicate), JSON.stringify(specific.errors)).toBe(true);
    expect(duplicate.details.approval_id).toBe("apr_TEST_ONLY_existing");
    expect(duplicate.error.message).not.toContain(duplicate.details.approval_id);
    expect(governanceApi.components.schemas.DuplicateOpenApprovalProblem.properties.details.properties.approval_id)
      .toEqual(productSchema.$defs.Identifier);
    expect(specific({ ...duplicate, details: { approval_id: ".legacy:approval" } })).toBe(true);
    expect(specific({ ...duplicate, details: { approval_id: "apr_invalid+identifier" } })).toBe(false);
    const noExtensions = { error: { code: "SESSION_REQUIRED", message: "Invalid session." }, request_id: "req_TEST_ONLY" };
    expect(generic(noExtensions), JSON.stringify(generic.errors)).toBe(true);
    expect(generic({ ...problem, safe_next_action: "REVIEW_BLOCKER" })).toBe(true);
  });

  it.each([
    ["missing details", (value: any) => { delete value.details; }],
    ["missing approval id", (value: any) => { value.details = {}; }],
    ["numeric approval id", (value: any) => { value.details.approval_id = 7; }],
    ["empty approval id", (value: any) => { value.details.approval_id = ""; }],
    ["non-identifier approval id", (value: any) => { value.details.approval_id = "apr_TEST_ONLY/path"; }],
    ["wrong error code", (value: any) => { value.error.code = "REQUEST_KEY_PAYLOAD_CONFLICT"; }],
    ["unknown details key", (value: any) => { value.details.grant_ref = "TEST_ONLY"; }],
    ["unknown top-level key", (value: any) => { value.raw_exception = "TEST_ONLY"; }],
  ] as Array<[string, (value: any) => void]>)("refuses duplicate with %s", (_label, mutate) => {
    const bad = copy(duplicate);
    mutate(bad);
    expect(component("governance", "DuplicateOpenApprovalProblem")(bad)).toBe(false);
  });

  it.each([
    { details: [] }, { details: null }, { public_copy_key: 42 }, { public_copy_key: "" },
    { safe_next_action: "APPLY_NOW" }, { raw_exception: "TEST_ONLY" },
    { error: { code: "X", message: "X", raw_exception: "TEST_ONLY" } },
  ])("rejects a malformed or unpublished problem member %j", change => {
    expect(component("governance", "Problem")({ ...problem, ...change })).toBe(false);
  });

  it("keeps the unrelated RFC9457 fixture and schema intact", () => {
    const existing = load("fixtures/problem.valid.json");
    const check = ajv.getSchema("https://schemas.primusspark.com/portal/problem.v1.schema.json")!;
    expect(check(existing), JSON.stringify(check.errors)).toBe(true);
    expect(component("governance", "Problem")(existing)).toBe(false);
  });

  it("publishes generated names for both served surfaces", () => {
    const paperTypes = readFileSync(resolve(root, "generated/execution-paper-read.d.ts"), "utf8");
    const governanceTypes = readFileSync(resolve(root, "generated/execution-governance.d.ts"), "utf8");
    for (const name of ["PaperReadResponse", "read_at_ms", "as_of_ms", "history_windows", "lineage_scoped_out"])
      expect(paperTypes, name).toContain(name);
    expect(governanceTypes).toContain("DuplicateOpenApprovalProblem");
  });
});
