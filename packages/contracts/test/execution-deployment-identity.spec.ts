/**
 * FE-066 / S3-U5 (BE-P3): the Alpha-Portfolio identity on a deployment. Paper profile `deployment`
 * block, and the Sandbox / Canary / Live stage bodies. The vocabulary is shared with the producer
 * (apps/control-api/src/execution/deployment-identity.contract.ts); this spec is the drift gate.
 */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  ALPHA_IDENTITY_REASONS, composeDeploymentIdentity, identityFields, IDENTITY_NOT_READ, PORTFOLIO_NAME_REASONS,
} from "../../../apps/control-api/src/execution/deployment-identity.contract";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const clone = <T>(value: T): T => structuredClone(value);

const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
for (const name of readdirSync(resolve(root, "schemas"))) ajv.addSchema(load(`schemas/${name}`));
const BASE = "https://schemas.primusspark.com/portal/";
const need = (id: string) => ajv.getSchema(id) ?? (() => { throw new Error(`schema ${id} missing`); })();

const paper = need(`${BASE}execution-paper-read.v1.schema.json`);
const sandbox = need(`${BASE}execution-sandbox-certification.v1.schema.json#/$defs/CertificationResponse`);
const canary = need(`${BASE}execution-canary-control-room.v1.schema.json#/$defs/CanaryControlRoom`);
const live = need(`${BASE}execution-live-full-operations.v1.schema.json#/$defs/LiveFullOperations`);

/** Each body kind: where the identity sits, how to validate, and its fixtures. */
const KINDS = [
  { name: "paper workbench", validate: paper, block: (body: any) => body.data.deployment,
    populated: "fixtures/execution-paper-workbench.identity.valid.json" },
  { name: "sandbox certification", validate: sandbox, block: (body: any) => body.certification,
    populated: "fixtures/execution-sandbox-certification.identity.valid.json",
    notRead: "fixtures/execution-sandbox-certification.unavailable.valid.json" },
  { name: "canary control room", validate: canary, block: (body: any) => body.deployment,
    populated: "fixtures/execution-canary-control-room.identity.valid.json",
    notRead: "fixtures/execution-canary-control-room.unavailable.valid.json" },
  { name: "live full operations", validate: live, block: (body: any) => body.deployment,
    populated: "fixtures/execution-live-full-operations.identity.valid.json",
    notRead: "fixtures/execution-live-full-operations.unavailable.valid.json" },
] as const;
const KEYS = ["alpha_id", "alpha_name", "portfolio_name", "alpha_reason_code", "portfolio_name_reason_code"];

describe.each(KINDS)("$name identity", (kind) => {
  const body = () => load(kind.populated);
  const valid = (value: unknown) => kind.validate(value);

  it("the canonical populated fixture validates and carries all five keys", () => {
    const fixture = body();
    expect(valid(fixture), JSON.stringify(kind.validate.errors)).toBe(true);
    expect(KEYS.every((key) => key in kind.block(fixture))).toBe(true);
  });

  if ("notRead" in kind) {
    it("the existing unavailable fixture says the identity was not read, key by key, instead of omitting it", () => {
      const fixture = load(kind.notRead);
      expect(valid(fixture), JSON.stringify(kind.validate.errors)).toBe(true);
      expect(identityFieldsOf(kind.block(fixture))).toEqual(identityFields(IDENTITY_NOT_READ));
    });
  }

  it("older bodies without the keys stay valid (additive)", () => {
    const fixture = body();
    for (const key of KEYS) delete kind.block(fixture)[key];
    expect(valid(fixture), JSON.stringify(kind.validate.errors)).toBe(true);
  });

  const mutate = (change: (block: Record<string, unknown>) => void) => {
    const fixture = body(); change(kind.block(fixture)); return valid(fixture);
  };

  it("rejects a partial set: the five keys travel together", () => {
    for (const key of KEYS) expect(mutate((block) => { delete block[key]; }), `missing ${key}`).toBe(false);
  });

  it("a null name always carries a reason; a present name never does", () => {
    expect(mutate((block) => { block.alpha_reason_code = null; }), "alpha_name null, reason null").toBe(false);
    expect(mutate((block) => { block.portfolio_name = null; block.portfolio_name_reason_code = null; }), "portfolio null, reason null").toBe(false);
    expect(mutate((block) => { block.portfolio_name = "Core"; block.portfolio_name_reason_code = "PORTFOLIO_NAME_NOT_PUBLISHED"; }), "named and reasoned").toBe(false);
    expect(mutate((block) => { block.alpha_name = "BTC-Trend"; }), "alpha_name present with reason").toBe(false);
    expect(mutate((block) => { block.alpha_id = null; block.alpha_name = "BTC-Trend"; block.alpha_reason_code = null; }), "name without id").toBe(false);
    expect(mutate((block) => { block.alpha_id = "alpha_x"; block.alpha_name = "BTC-Trend"; block.alpha_reason_code = null; }), "future: published name").toBe(true);
  });

  it("closed vocabularies: an unknown reason code, a number, or hostile text is refused", () => {
    expect(mutate((block) => { block.alpha_reason_code = "BECAUSE"; })).toBe(false);
    expect(mutate((block) => { block.portfolio_name_reason_code = "ALPHA_MEMBERSHIP_NOT_QUALIFIED"; })).toBe(false);
    expect(mutate((block) => { block.alpha_id = 7; })).toBe(false);
    for (const bad of ["", " ", " padded", "padded ", "line\nbreak", "rlo ‮ x", "nul\u0000", "x".repeat(257)]) {
      expect(mutate((block) => { block.portfolio_name = bad; block.portfolio_name_reason_code = null; }), JSON.stringify(bad)).toBe(false);
    }
    expect(mutate((block) => { block.portfolio_name = "x".repeat(256); block.portfolio_name_reason_code = null; })).toBe(true);
    expect(mutate((block) => { block.portfolio_name = "Core Book (USDT-M)"; block.portfolio_name_reason_code = null; })).toBe(true);
  });
});

function identityFieldsOf(block: Record<string, unknown>) {
  return Object.fromEntries(KEYS.map((key) => [key, block[key]]));
}

describe("producer vocabulary and the schemas cannot drift", () => {
  const enumOf = (schema: any, name: string) => schema.$defs[name].enum;
  const schemas = [
    ["paper", load("schemas/execution-paper-read.v1.schema.json")],
    ["sandbox", load("schemas/execution-sandbox-certification.v1.schema.json")],
    ["canary", load("schemas/execution-canary-control-room.v1.schema.json")],
    ["live", load("schemas/execution-live-full-operations.v1.schema.json")],
  ] as const;

  it.each(schemas)("%s: reason enums equal the producer constants (plus null)", (_name, schema) => {
    expect(enumOf(schema, "AlphaIdentityReason")).toEqual([...ALPHA_IDENTITY_REASONS, null]);
    expect(enumOf(schema, "PortfolioNameReason")).toEqual([...PORTFOLIO_NAME_REASONS, null]);
  });

  it("the four schemas and the OpenAPI document share one rule set, byte for byte", () => {
    const [paperSchema, ...stages] = schemas.map(([, schema]) => schema);
    const openapi = load("openapi/execution-paper-read.openapi.json").components.schemas;
    const rules = JSON.stringify(paperSchema.$defs.DeploymentIdentityRules);
    for (const stage of stages) expect(JSON.stringify(stage.$defs.DeploymentIdentityRules)).toBe(rules);
    expect(JSON.stringify(openapi.DeploymentIdentityRules)).toBe(rules);
    const name = JSON.stringify(paperSchema.$defs.DeploymentDisplayName);
    for (const stage of stages) expect(JSON.stringify(stage.$defs.DeploymentDisplayName)).toBe(name);
    expect(JSON.stringify(openapi.DeploymentDisplayName)).toBe(name);
    expect(openapi.AlphaIdentityReason.enum).toEqual(paperSchema.$defs.AlphaIdentityReason.enum);
    expect(openapi.PortfolioNameReason.enum).toEqual(paperSchema.$defs.PortfolioNameReason.enum);
    expect(openapi.PaperData.properties.deployment.oneOf[0]).toEqual({ $ref: "#/components/schemas/DeploymentRecord" });
  });

  it("every value the producer's composer can emit validates in the Canary block (all reason combinations)", () => {
    const fixture = load("fixtures/execution-canary-control-room.identity.valid.json");
    const alphaMemberships = [
      { kind: "UNQUALIFIED" as const },
      { kind: "QUALIFIED" as const, alphaIds: [], alphaIdAllowed: true },
      { kind: "QUALIFIED" as const, alphaIds: ["a1", "a2"], alphaIdAllowed: true },
      { kind: "QUALIFIED" as const, alphaIds: ["a1"], alphaIdAllowed: false },
      { kind: "QUALIFIED" as const, alphaIds: ["a1"], alphaIdAllowed: true },
    ];
    const portfolios = [
      { portfolioId: null, portfolios: { kind: "UNAVAILABLE" as const } },
      { portfolioId: "pf", portfolios: { kind: "UNAVAILABLE" as const } },
      { portfolioId: "pf", portfolios: { kind: "ROWS" as const, nameAllowed: false, rows: [] } },
      { portfolioId: "pf", portfolios: { kind: "ROWS" as const, nameAllowed: true, rows: [], hiddenMatch: true } },
      { portfolioId: "pf", portfolios: { kind: "ROWS" as const, nameAllowed: true, rows: [{ portfolio_id: "pf", name: "A" }, { portfolio_id: "pf", name: "B" }] } },
      { portfolioId: "pf", portfolios: { kind: "ROWS" as const, nameAllowed: true, rows: [{ portfolio_id: "pf", name: "Core" }] } },
    ];
    let count = 0;
    for (const membership of alphaMemberships) for (const portfolio of portfolios) {
      const next = clone(fixture);
      Object.assign(next.deployment, identityFields(composeDeploymentIdentity({ membership, ...portfolio })));
      expect(canary(next), JSON.stringify([membership, portfolio, canary.errors])).toBe(true);
      count += 1;
    }
    expect(count).toBe(30);
  });
});
