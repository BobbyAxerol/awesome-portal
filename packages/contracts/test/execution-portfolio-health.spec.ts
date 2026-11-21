import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

// WP-K slice 6 (N3): the optional portfolio health roll-up on execution.portfolio-list.v1, additive: the L0 fixture is untouched and still valid.
const root = resolve(__dirname, "..");
const load = (file: string) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
const ajv = new Ajv2020({ strict: true, allErrors: true });
addFormats(ajv);
const check = ajv.compile(load("schemas/execution-portfolio-list.v1.schema.json"));
const withHealth = () => structuredClone(load("fixtures/execution-portfolio-list.health.valid.json"));

describe("WP-K slice 6: portfolio health roll-up", () => {
  it("the L0 fixture (no health) is still valid, byte for byte the one it was", () => {
    const l0 = load("fixtures/execution-portfolio-list.valid.json");
    expect(l0.items.every((i: any) => !("health" in i))).toBe(true);
    expect(check(l0), JSON.stringify(check.errors)).toBe(true);
  });
  it("the health fixture is valid: a published worst-of roll-up with counts, and a typed absence with a reason and no value", () => {
    const body = withHealth();
    expect(check(body), JSON.stringify(check.errors)).toBe(true);
    expect(body.items[0].health).toMatchObject({ state: "PUBLISHED", value: "ATTENTION", basis: "WORST_OF_DEPLOYMENT_HEALTH", deployments_by_health: { HEALTHY: 1, ATTENTION: 1, DEGRADED: 0, HALTED: 0 } });
    expect(body.items[1].health).toEqual({ state: "NOT_PUBLISHED", value: null, basis: null, deployments_by_health: null, as_of: null, reason_code: "DEPLOYMENT_HEALTH_NOT_PUBLISHED" });
  });
  it.each([
    ["a published roll-up without a value", (b: any) => { b.items[0].health.value = null; }],
    ["a published roll-up with a reason code", (b: any) => { b.items[0].health.reason_code = "X_Y"; }],
    ["a published roll-up without counts", (b: any) => { b.items[0].health.deployments_by_health = null; }],
    ["a count that is not an integer", (b: any) => { b.items[0].health.deployments_by_health.HEALTHY = 1.5; }],
    ["a negative count", (b: any) => { b.items[0].health.deployments_by_health.HALTED = -1; }],
    ["a missing class", (b: any) => { delete b.items[0].health.deployments_by_health.DEGRADED; }],
    ["a class outside the vocabulary", (b: any) => { b.items[0].health.value = "FINE"; }],
    ["a typed absence that carries a value", (b: any) => { b.items[1].health.value = "HEALTHY"; }],
    ["a typed absence without a reason", (b: any) => { b.items[1].health.reason_code = null; }],
    ["an unknown key", (b: any) => { b.items[0].health.score = 1; }],
    ["a lower-case reason", (b: any) => { b.items[1].health.reason_code = "not published"; }],
  ])("refuses %s", (_name, mutate) => {
    const body = withHealth();
    mutate(body);
    expect(check(body)).toBe(false);
  });
});
