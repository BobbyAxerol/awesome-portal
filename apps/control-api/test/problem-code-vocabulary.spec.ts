/**
 * FE-061 / FE-049 · the published closed vocabularies must contain every code the control-api sources can emit on
 * the access v2 and pending-recall routes (and nothing the sources cannot justify), and the fleet-v2 `MetricState`
 * must contain every state the service emits.  Pure source/contract scan: no database, no HTTP.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { pendingControlReason } from "../src/execution-v2/pending-control.contract";

const src = (path: string) => readFileSync(resolve(__dirname, "../src", path), "utf8");
const contracts = process.env.PORTAL_CONTRACTS_DIR ?? resolve(__dirname, "../../../packages/contracts");
const contract = (path: string) => JSON.parse(readFileSync(resolve(contracts, path), "utf8"));

const accessEnum: string[] = contract("openapi/execution-access.openapi.json")
  .components.schemas.AccessProblem.properties.error.properties.code.enum;
const pendingEnum: string[] = contract("openapi/execution-pending-control.openapi.json")
  .components.schemas.PendingControlProblem.properties.error.properties.code.enum;

const literals = (text: string) => [...text.matchAll(/"([A-Z][A-Z0-9_]+)"/g)].map((match) => match[1]);
/** First-argument string literal of every `new <Class>("CODE"` in the given sources. */
function thrown(klass: string, ...files: string[]): string[] {
  const pattern = new RegExp(`new ${klass}\\(\\s*"([A-Z][A-Z0-9_]+)"`, "g");
  return [...new Set(files.flatMap((file) => [...src(file).matchAll(pattern)].map((match) => match[1])))].sort();
}
function unionOf(file: string, name: string): string[] {
  const match = new RegExp(`export type ${name}\\s*=([^;]*);`).exec(src(file));
  if (!match) throw new Error(`${name} not found in ${file}`);
  return literals(match[1]);
}

const ACCESS_FAMILY = [
  "execution-v2/access.controller.ts", "execution-v2/access.service.ts", "execution-v2/access.repository.ts",
  "execution-v2/access-policy.ts", "execution-v2/access.contract.ts", "execution-v2/self-eligibility.ts",
  "execution-v2/access-delegated-receipt.ts", "execution-v2/access-root-receipt.ts", "execution-v2/current-audit-read.ts",
  "execution-v2/current-human-snapshot.ts", "execution-v2/current-human-workspace.ts", "facade/session.guard.ts",
];
const PENDING_FAMILY = [
  "execution-v2/pending-control.controller.ts", "execution-v2/pending-control.service.ts",
  "execution-v2/pending-control.store.ts", "execution-v2/pending-control.contract.ts",
  "execution-v2/pending-control.trust.ts",
];
const accessRefusal = unionOf("execution-v2/access.contract.ts", "AccessRefusal");
const mutationDenial = unionOf("auth/mutation-security.ts", "MutationSecurityDenial");
// http-error.filter.ts: every literal of the `error: { code: ... }` envelope expressions (ternaries included).
const filterCodes = [...new Set([...src("http-error.filter.ts").matchAll(/error:\s*\{\s*code:([\s\S]*?)message:/g)]
  .flatMap((match) => literals(match[1])))].sort();
// Reachable only through the Execution data pool (db/pool.ts buildExecutionPool); the access service and the pending
// control service run on CONTROL_API_POOL (app.module.ts), so it can never be an access or pending-control body.
const EXECUTION_POOL_ONLY = ["EXECUTION_LOCAL_READ_BUSY"];

describe("AccessProblem.error.code (FE-061)", () => {
  it("is typed end to end: AccessPolicyError can carry only the AccessRefusal union, and every member is published", () => {
    expect(src("execution-v2/access.contract.ts")).toMatch(/constructor\(readonly code: AccessRefusal,/);
    expect(accessRefusal.length).toBeGreaterThan(20);
    expect(accessRefusal.filter((code) => !accessEnum.includes(code))).toEqual([]);
    expect(mutationDenial).toEqual(["ORIGIN_MISSING", "ORIGIN_DENIED", "CSRF_MISSING", "CSRF_INVALID"]);
    expect(mutationDenial.filter((code) => !accessEnum.includes(code))).toEqual([]);
    // The controller forwards exactly these two typed sources plus its own literals.
    const controller = src("execution-v2/access.controller.ts");
    expect(controller).toContain("new AuthError(error.code,");
    expect(controller).toContain("new AuthError(denial,");
  });

  it("publishes every literal code the access routes' sources throw", () => {
    const codes = [...thrown("AccessPolicyError", ...ACCESS_FAMILY), ...thrown("AuthError", ...ACCESS_FAMILY)];
    expect(codes.length).toBeGreaterThan(20);
    expect([...new Set(codes)].filter((code) => !accessEnum.includes(code))).toEqual([]);
    expect(thrown("AuthError", "execution-v2/access.controller.ts")).toEqual(["ACCESS_INPUT_INVALID", "IDEMPOTENCY_KEY_REQUIRED"]);
  });

  it("publishes every public code of the shared error filter, except the one the access pool cannot reach", () => {
    expect(filterCodes.filter((code) => !accessEnum.includes(code)).sort()).toEqual(EXECUTION_POOL_ONLY);
    for (const code of EXECUTION_POOL_ONLY) expect(accessEnum).not.toContain(code);
  });

  it("publishes nothing the sources cannot justify", () => {
    const justified = new Set([
      ...accessRefusal, ...mutationDenial, ...thrown("AccessPolicyError", ...ACCESS_FAMILY),
      ...thrown("AuthError", ...ACCESS_FAMILY), ...filterCodes,
    ]);
    expect(accessEnum.filter((code) => !justified.has(code))).toEqual([]);
    expect(new Set(accessEnum).size).toBe(accessEnum.length);
  });
});

describe("PendingControlProblem.error.code (FE-061)", () => {
  const pendingFiles = PENDING_FAMILY;

  it("publishes the closed PendingControlReason set, the access refusals the controller forwards and the security denials", () => {
    expect(src("execution-v2/pending-control.contract.ts")).toMatch(/class PendingControlError[^{]*\{\s*constructor\(readonly code: z\.infer<typeof pendingControlReason>/);
    expect(pendingControlReason.options.filter((code) => !pendingEnum.includes(code))).toEqual([]);
    expect(accessRefusal.filter((code) => !pendingEnum.includes(code))).toEqual([]);
    expect(mutationDenial.filter((code) => !pendingEnum.includes(code))).toEqual([]);
    const controller = src("execution-v2/pending-control.controller.ts");
    expect(controller).toContain("new CommandHttpError(denial,");
    expect(controller).toMatch(/error instanceof PendingControlError \|\| error instanceof AccessPolicyError/);
  });

  it("publishes every literal code the pending-recall routes' sources throw", () => {
    const codes = [...thrown("PendingControlError", ...pendingFiles), ...thrown("CommandHttpError", ...pendingFiles),
      ...thrown("AccessPolicyError", ...pendingFiles), ...thrown("AuthError", ...pendingFiles)];
    expect(codes.length).toBeGreaterThan(3);
    expect([...new Set(codes)].filter((code) => !pendingEnum.includes(code))).toEqual([]);
    expect(thrown("CommandHttpError", "execution-v2/pending-control.controller.ts"))
      .toEqual(["PENDING_CONTROL_INPUT_INVALID", "PENDING_CONTROL_UNAVAILABLE"]);
  });

  it("publishes every public code of the shared error filter and the session guard, except the execution-pool one", () => {
    expect(filterCodes.filter((code) => !pendingEnum.includes(code)).sort()).toEqual(EXECUTION_POOL_ONLY);
    expect(thrown("AuthError", "facade/session.guard.ts", "execution-v2/current-human-workspace.ts")
      .filter((code) => !pendingEnum.includes(code))).toEqual([]);
  });

  it("publishes nothing the sources cannot justify", () => {
    const justified = new Set([
      ...pendingControlReason.options, ...accessRefusal, ...mutationDenial, ...filterCodes,
      ...thrown("CommandHttpError", ...pendingFiles), ...thrown("AuthError", "facade/session.guard.ts", "execution-v2/current-human-workspace.ts"),
    ]);
    expect(pendingEnum.filter((code) => !justified.has(code))).toEqual([]);
    expect(new Set(pendingEnum).size).toBe(pendingEnum.length);
  });
});

describe("alpha fleet v2 MetricState (FE-049)", () => {
  it("contains every state the service emits for metrics_availability, including PARTIAL", () => {
    const service = src("manager-lists/manager-lists.service.ts");
    const start = service.indexOf("metricsAvailability: {");
    const end = service.indexOf("updatedAt: latestRecordDate", start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const emitted = [...new Set([...service.slice(start, end).matchAll(/"([A-Z]+)"/g)].map((match) => match[1]))].sort();
    const published: string[] = contract("schemas/execution-alpha-fleet-list.v2.schema.json").$defs.MetricState.properties.state.enum;
    expect(emitted).toContain("PARTIAL");
    expect(emitted.filter((state) => !published.includes(state))).toEqual([]);
  });
});
