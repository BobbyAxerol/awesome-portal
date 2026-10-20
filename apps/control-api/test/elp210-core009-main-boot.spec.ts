/** TEST_ONLY. The actual `src/main.ts` bootstrap with every collaborator replaced by
 * a fake (no database, listener, file, key or Nest container). Proves WHICH path
 * main takes: config absent keeps the ordinary boot unchanged; config present
 * runs prepareNativeCoreRuntime -> bootstrap-owned compose -> createControlApiApp
 * with the SAME Pool object and the exact dependencies compose returned, and
 * never falls back to the legacy boot. The AppModule consumer's own
 * pool/trust/coordinator/registry binding is proven by native-core-bootstrap.spec.ts. */
import type { Pool } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeCoreApplicationOwner } from "../src/execution-v2/native-core-bootstrap";

const h = vi.hoisted(() => ({
  loadConfig: vi.fn(), buildPool: vi.fn(), createApp: vi.fn(), reference: vi.fn(), prepare: vi.fn(), assertSchema: vi.fn(),
}));
vi.mock("../src/config", () => ({ loadConfig: h.loadConfig }));
vi.mock("../src/db/pool", () => ({ buildPool: h.buildPool }));
vi.mock("../src/app", () => ({ createControlApiApp: h.createApp }));
vi.mock("../src/execution-v2/native-core-runtime", () => ({
  nativeCoreRuntimeReference: h.reference, prepareNativeCoreRuntime: h.prepare }));
vi.mock("../src/execution-v2/current-human-schema", () => ({ assertRegisteredResearchCurrentHumanSchema: h.assertSchema }));

const REF = { path: "/TEST_ONLY/runtime.json", sha256: "a".repeat(64) };
const WORKSPACE = "TEST_ONLY-workspace";
const ordinary = { DATABASE_URL: "postgres://TEST_ONLY/core", EXECUTION_READ_PROFILE: "source_current_v1" };
const research = { ...ordinary, EXECUTION_READ_PROFILE: "native_manager_review_v1", EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: WORKSPACE };

let exits: unknown[], stderr: string[], signals: string[], settle: () => void, settled: Promise<void>;
let pool: { end: ReturnType<typeof vi.fn>; query: ReturnType<typeof vi.fn> };
let app: { listen: ReturnType<typeof vi.fn>; enableShutdownHooks: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
const dependencies = Object.freeze({ nativeManagerRead: Object.freeze({}), currentHumanMutations: Object.freeze({}),
  executionAccessTrust: Object.freeze({}) });
const target = Object.freeze({ database_name: "TEST_ONLY" });
function prepared(overrides: Record<string, unknown> = {}) {
  const profile = Object.freeze({ max: 4 });
  return { poolProfile: profile, researchReviewTarget: vi.fn(() => target), compose: vi.fn(async () => dependencies), ...overrides };
}
async function boot(): Promise<void> {
  vi.resetModules();
  await import("../src/main");
  await settled;
  await new Promise(resolve => setImmediate(resolve)); // let main's synchronous tail (signals) run
}
beforeEach(() => {
  exits = []; stderr = []; signals = [];
  settled = new Promise<void>(resolve => { settle = resolve; });
  pool = { end: vi.fn(async () => undefined), query: vi.fn() };
  app = { listen: vi.fn(async () => { settle(); }), enableShutdownHooks: vi.fn(), close: vi.fn(async () => undefined) };
  h.loadConfig.mockReset().mockReturnValue(ordinary);
  h.buildPool.mockReset().mockReturnValue(pool as unknown as Pool);
  h.createApp.mockReset().mockResolvedValue(app);
  h.reference.mockReset().mockReturnValue(undefined);
  h.prepare.mockReset();
  h.assertSchema.mockReset().mockResolvedValue(undefined);
  vi.spyOn(process, "exit").mockImplementation(((code?: number) => { exits.push(code); settle(); }) as never);
  vi.spyOn(process.stderr, "write").mockImplementation(((text: string) => { stderr.push(String(text)); return true; }) as never);
  vi.spyOn(process, "once").mockImplementation(((event: string) => { signals.push(event); return process; }) as never);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("TEST_ONLY main.ts with the native selection ABSENT (ordinary boot, unchanged)", () => {
  it("builds the default pool and app with no native dependency and installs the ordinary shutdown hooks", async () => {
    await boot();
    expect(h.prepare).not.toHaveBeenCalled(); expect(h.assertSchema).not.toHaveBeenCalled();
    expect(h.buildPool).toHaveBeenCalledOnce();
    expect(h.buildPool.mock.calls[0]).toEqual([ordinary.DATABASE_URL, undefined]);
    expect(h.createApp.mock.calls[0]).toHaveLength(5);
    expect(h.createApp.mock.calls[0]).toEqual([ordinary, pool, undefined, undefined, undefined]);
    expect(app.listen).toHaveBeenCalledWith(4000, "0.0.0.0");
    expect(app.enableShutdownHooks).toHaveBeenCalledOnce();
    expect(signals).toEqual([]); expect(exits).toEqual([]);
  });
  it("without the selection the Research profile is refused before any pool exists (no legacy fallback)", async () => {
    h.loadConfig.mockReturnValue(research);
    await boot();
    expect(exits).toEqual([1]); expect(stderr).toEqual(["CONTROL_API_STARTUP_FAILED\n"]);
    expect(h.buildPool).not.toHaveBeenCalled(); expect(h.createApp).not.toHaveBeenCalled();
  });
});

describe("TEST_ONLY main.ts with the native selection PRESENT (standard composition)", () => {
  it("prepare -> compose -> app share ONE Pool object and the exact compose result; the bootstrap owner owns that pool", async () => {
    const native = prepared();
    h.reference.mockReturnValue(REF); h.prepare.mockResolvedValue(native);
    await boot();
    expect(h.prepare).toHaveBeenCalledWith(REF);
    expect(h.buildPool.mock.calls[0]![1]).toBe(native.poolProfile);
    expect(native.compose).toHaveBeenCalledOnce();
    expect((native.compose.mock.calls as unknown[][])[0]![0]).toBe(pool);
    const [config, appPool, executionPool, deps, owner] = h.createApp.mock.calls[0]!;
    expect(config).toBe(ordinary); expect(appPool).toBe(pool); expect(executionPool).toBeUndefined();
    expect(deps).toBe(dependencies); // not copied, not wrapped, nothing added
    expect((owner as object).constructor.name).toBe("NativeCoreApplicationOwner"); // module reset: compare by name
    expect((owner as NativeCoreApplicationOwner).usesPool(pool as unknown as Pool)).toBe(true);
    expect((owner as NativeCoreApplicationOwner).usesPool({ end: vi.fn() } as unknown as Pool)).toBe(false);
    expect(native.researchReviewTarget).not.toHaveBeenCalled(); expect(h.assertSchema).not.toHaveBeenCalled();
    expect(app.listen).toHaveBeenCalledWith(4000, "0.0.0.0");
    expect(app.enableShutdownHooks).not.toHaveBeenCalled();
    expect(signals).toEqual(["SIGINT", "SIGTERM"]); expect(h.buildPool).toHaveBeenCalledOnce();
  });
  it("Research review verifies the registered schema on the SAME owned pool BEFORE composing", async () => {
    h.loadConfig.mockReturnValue(research);
    const native = prepared(); h.reference.mockReturnValue(REF); h.prepare.mockResolvedValue(native);
    await boot();
    expect(native.researchReviewTarget).toHaveBeenCalledWith(WORKSPACE);
    expect(h.assertSchema).toHaveBeenCalledWith(pool, target);
    expect(h.assertSchema.mock.invocationCallOrder[0]).toBeLessThan(native.compose.mock.invocationCallOrder[0]!);
    expect(h.createApp.mock.calls[0]![3]).toBe(dependencies);
    expect(h.buildPool).toHaveBeenCalledOnce();
  });
  it.each([
    ["a malformed or partial selection", () => { h.reference.mockImplementation(() => { throw new Error("SECRET-DETAIL"); }); }],
    ["a manifest that cannot be prepared", () => { h.reference.mockReturnValue(REF); h.prepare.mockRejectedValue(new Error("SECRET-DETAIL")); }],
    ["a Research ceiling the manifest does not meet", () => {
      h.loadConfig.mockReturnValue(research); h.reference.mockReturnValue(REF);
      h.prepare.mockResolvedValue(prepared({ researchReviewTarget: vi.fn(() => { throw new Error("SECRET-DETAIL"); }) })); }],
    ["a Research profile that yields no review target", () => {
      h.loadConfig.mockReturnValue(research); h.reference.mockReturnValue(REF);
      h.prepare.mockResolvedValue(prepared({ researchReviewTarget: vi.fn(() => undefined) })); }],
  ])("%s fails closed before any pool or app, with no legacy fallback and no detail", async (_label, arrange) => {
    arrange();
    await boot();
    expect(exits).toEqual([1]); expect(stderr).toEqual(["CONTROL_API_STARTUP_FAILED\n"]);
    expect(h.buildPool).not.toHaveBeenCalled(); expect(h.createApp).not.toHaveBeenCalled(); expect(h.assertSchema).not.toHaveBeenCalled();
  });
  it.each([
    ["schema registration", (native: any) => { h.assertSchema.mockRejectedValue(new Error("SECRET-DETAIL")); return native; }],
    ["composition", (native: any) => { native.compose.mockRejectedValue(new Error("SECRET-DETAIL")); return native; }],
  ])("a %s failure disposes the SAME bootstrap-owned pool once and starts no app", async (_label, arrange) => {
    h.loadConfig.mockReturnValue(research);
    h.reference.mockReturnValue(REF); h.prepare.mockResolvedValue(arrange(prepared()));
    await boot();
    expect(pool.end).toHaveBeenCalledOnce(); expect(h.createApp).not.toHaveBeenCalled();
    expect(exits).toEqual([1]); expect(stderr).toEqual(["CONTROL_API_STARTUP_FAILED\n"]); expect(stderr.join("")).not.toContain("SECRET");
  });
  it("an app failure goes through the owner (Core pool ended once), never a legacy retry", async () => {
    h.reference.mockReturnValue(REF); h.prepare.mockResolvedValue(prepared());
    h.createApp.mockRejectedValue(new Error("SECRET-DETAIL"));
    await boot();
    expect(h.createApp).toHaveBeenCalledOnce(); expect(pool.end).toHaveBeenCalledOnce();
    expect(app.listen).not.toHaveBeenCalled(); expect(exits).toEqual([1]); expect(stderr.join("")).not.toContain("SECRET");
  });
});
