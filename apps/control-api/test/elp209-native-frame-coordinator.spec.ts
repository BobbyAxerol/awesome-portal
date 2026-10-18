/** Native frame coordinator codec and early-refusal regressions.
 * Canonical integration and execution receipts belong to the ELP2-09 packet.
 * These are codec and early-refusal tests, not physical-frame/source authority.
 * Positive real Hub custody tests belong to native-frame-coupled.spec.ts.
 */
import type { ServerResponse } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ScopedReplayCursorCodec, ScopedReplayError, ScopedReplayHub,
  type ScopedNoticeSource, type ScopedReplayLimits } from "../src/execution-v2/realtime";
import { ScopedReplayCursorCodec as LeafCodec, ScopedReplayError as LeafError,
  decodeScopedReplayContinuation, encodeScopedReplayContinuation } from "../src/execution-v2/scoped-replay-cursor";
import type { ScopedReplayBinding } from "../src/execution-v2/realtime.contract";

const NOW = 1792281600000;
const SECRET = "TEST_ONLY-native-coordinator-cursor-key-".repeat(3);
const SOURCE = "TEST_ONLY.private.source-continuation-1";
const binding = (): ScopedReplayBinding => ({
  workspace_id: "TEST_ONLY:workspace", environment: "paper", profile_id: "TEST_ONLY:profile",
  principal_scope_digest: "TEST_ONLY:current-session-scope", app_policy_revision: "TEST_ONLY:policy",
  field_policy_revision: "TEST_ONLY:fields", model_revision: "TEST_ONLY:model",
  schema_revision: "portal.execution.scoped-realtime.v1", dataset: "alpha_fleet_overview",
  query_digest: "TEST_ONLY:query", source_set_digest: "TEST_ONLY:sources",
  source_continuity_epoch: "TEST_ONLY:epoch", projection_generation: "TEST_ONLY:generation",
  snapshot_id: "TEST_ONLY:snapshot", window: { from_ms: NOW - 60000, to_ms: NOW },
});
const codec = () => new ScopedReplayCursorCodec("test", { test: SECRET }, 60000, () => NOW);
const limits: ScopedReplayLimits = { maximumClients: 2, maximumEntriesPerClient: 2,
  maximumFrameBytes: 8192, maximumClientBytes: 32768, maximumTotalBytes: 65536,
  maximumNoticesPerRead: 2, readTimeoutMs: 100 };

afterEach(() => vi.restoreAllMocks());

describe("ELP2 native coordinator intrinsic cursor identity — no authority supplied by shape", () => {
  it("retains the original realtime re-export class/error identities and genuine round trip", () => {
    expect(ScopedReplayCursorCodec).toBe(LeafCodec);
    expect(ScopedReplayError).toBe(LeafError);
    const actual = codec(), scope = binding();
    const token = encodeScopedReplayContinuation(actual, scope, SOURCE);
    expect(actual).toBeInstanceOf(LeafCodec);
    expect(decodeScopedReplayContinuation(actual, token, scope)).toBe(SOURCE);
    expect(actual.decode(token, scope)).toBe(SOURCE);
    expect(() => decodeScopedReplayContinuation(actual, "invalid", scope)).toThrow(ScopedReplayError);
  });

  it("rejects prototype clones, own-property copies, proxies and borrowed decode methods", () => {
    const actual = codec(), scope = binding();
    const token = encodeScopedReplayContinuation(actual, scope, SOURCE);
    // Negative attack inputs only: a class-shaped object is not a registry entry.
    const clone = Object.create(LeafCodec.prototype) as ScopedReplayCursorCodec;
    const copied = Object.assign(Object.create(LeafCodec.prototype), actual) as ScopedReplayCursorCodec;
    const proxy = new Proxy(actual, {});
    for (const counterfeit of [clone, copied, proxy]) {
      expect(() => decodeScopedReplayContinuation(counterfeit, token, scope)).toThrow(LeafError);
      expect(() => encodeScopedReplayContinuation(counterfeit, scope, SOURCE)).toThrow(LeafError);
      expect(() => LeafCodec.prototype.decode.call(counterfeit, token, scope)).toThrow(LeafError);
    }
    // Failed spoofing must not corrupt the actual original codec registry.
    expect(decodeScopedReplayContinuation(actual, token, scope)).toBe(SOURCE);
  });

  it("ignores an overridden instance decoder instead of accepting its forged source cursor", () => {
    const actual = codec(), scope = binding();
    const token = encodeScopedReplayContinuation(actual, scope, SOURCE);
    const overridden = vi.spyOn(actual, "decode").mockReturnValue("TEST_ONLY.forged-continuation");
    expect(decodeScopedReplayContinuation(actual, token, scope)).toBe(SOURCE);
    expect(() => decodeScopedReplayContinuation(actual, "invalid", scope)).toThrow(LeafError);
    expect(overridden).not.toHaveBeenCalled();
  });

  it("ignores later public prototype encoder/decoder overrides using captured original state", () => {
    const actual = codec(), scope = binding();
    const fakeDecode = vi.spyOn(LeafCodec.prototype, "decode").mockReturnValue("TEST_ONLY.forged-continuation");
    const fakeEncode = vi.spyOn(LeafCodec.prototype, "encode").mockReturnValue("TEST_ONLY.forged-token");
    const token = encodeScopedReplayContinuation(actual, scope, SOURCE);
    expect(decodeScopedReplayContinuation(actual, token, scope)).toBe(SOURCE);
    expect(() => decodeScopedReplayContinuation(actual, "invalid", scope)).toThrow(LeafError);
    expect(fakeDecode).not.toHaveBeenCalled();
    expect(fakeEncode).not.toHaveBeenCalled();
  });
});

describe("ELP2 native subscribe — absence of actual fixed dependencies stays fail-closed", () => {
  it("refuses before source/current-scope/response access, without creating a native or legacy client", async () => {
    const read = vi.fn<ScopedNoticeSource["read"]>(async () => {
      throw new Error("TEST_ONLY source must not be reached");
    });
    const hub = new ScopedReplayHub({ read }, codec(), limits);
    const current = vi.fn<Parameters<ScopedReplayHub["subscribeNative"]>[0]["current"]>(async () => {
      throw new Error("TEST_ONLY current scope must not be requested");
    });
    const responseAccess = vi.fn((): never => { throw new Error("TEST_ONLY response must not be acquired"); });
    const input: Parameters<ScopedReplayHub["subscribeNative"]>[0] = {
      binding: binding(), resource: { kind: "ROOT", id: "TEST_ONLY:root" }, current,
      get response(): ServerResponse { return responseAccess(); }, baselineCursor: SOURCE,
    };
    try {
      await expect(hub.subscribeNative(input)).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
      expect(current).not.toHaveBeenCalled();
      expect(responseAccess).not.toHaveBeenCalled();
      expect(read).not.toHaveBeenCalled();
      expect(hub.diagnostics()).toMatchObject({ clients: 0, queued_bytes: 0, source_flights: 0,
        pending_subscriptions: 0, browser_source_calls: 0 });
      await hub.poll();
      expect(read).not.toHaveBeenCalled();
    } finally { hub.stop(); }
  });
});
