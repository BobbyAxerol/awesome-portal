/** TEST_ONLY C7 definitions; execution receipts belong to the C7 packet. Actual narrow Nest hook order;
 * no business source, DB, sockets/listen, grant install or physical ACK proof. */
import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import type { Pool } from "pg";
import { describe, expect, it, vi } from "vitest";
import { AppModule } from "../src/app.module";
import { NativeCoreApplicationOwner } from "../src/execution-v2/native-core-bootstrap";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, failed) => { resolve = done; reject = failed; });
  return {promise, resolve, reject};
}
async function actualModule(held: {onApplicationShutdown(): Promise<void>}, owns: boolean) {
  const domain = {end: vi.fn(async () => undefined)};
  let closing: Promise<void> | undefined;
  const closeOwnedPool = vi.fn(() => owns
    ? closing ??= Promise.resolve().then(() => domain.end()) : Promise.resolve());
  // Use the ACTUAL AppModule class hook, not a copied class-last approximation.
  const app = await NestFactory.createApplicationContext({module: AppModule, providers: [
    {provide: "EXECUTION_POOL_LIFECYCLE", useValue: {closeOwnedPool}},
    {provide: "TEST_ONLY_HELD_PROVIDER", useValue: held},
  ]}, {logger: false, abortOnError: false});
  return {app, domain, closeOwnedPool};
}
describe("TEST_ONLY actual module-class finalizer ordering", () => {
  it.each([true, false])("awaits same-phase provider work before owned pool finalizer (owned=%s)", async owns => {
    const entered = deferred<void>(), pending = deferred<void>();
    const f = await actualModule({onApplicationShutdown: async () => {
      entered.resolve(); await pending.promise;
    }}, owns);
    let settled = false;
    const result = f.app.close().then(() => { settled = true; });
    try {
      await entered.promise;
      expect(settled).toBe(false); expect(f.closeOwnedPool).not.toHaveBeenCalled();
      expect(f.domain.end).not.toHaveBeenCalled();
    } finally { pending.resolve(); await result; }
    expect(f.closeOwnedPool).toHaveBeenCalledOnce();
    expect(f.domain.end).toHaveBeenCalledTimes(owns ? 1 : 0);
  });
  it("skips the class finalizer when an actual provider shutdown rejects", async () => {
    const failure = Error("TEST_ONLY-provider-shutdown-failed");
    const f = await actualModule({onApplicationShutdown: async () => { throw failure; }}, true);
    await expect(f.app.close()).rejects.toBe(failure);
    expect(f.closeOwnedPool).not.toHaveBeenCalled(); expect(f.domain.end).not.toHaveBeenCalled();
    // No retry app.close: duplicate lifecycle execution is not cleanup proof.
  });
  it("does not dispose either pool when another provider fails while real work is still held", async () => {
    const entered = deferred<void>(), pending = deferred<void>(), otherEntered = deferred<void>();
    const failure = Error("TEST_ONLY-peer-shutdown-failed"), domainEnd = vi.fn(async () => undefined);
    const app = await NestFactory.createApplicationContext({module: AppModule, providers: [
      {provide: "EXECUTION_POOL_LIFECYCLE", useValue: {closeOwnedPool: domainEnd}},
      {provide: "TEST_ONLY_HELD_PROVIDER", useValue: {onApplicationShutdown: async () => {
        entered.resolve(); await pending.promise;
      }}},
      {provide: "TEST_ONLY_FAILED_PROVIDER", useValue: {onApplicationShutdown: async () => {
        otherEntered.resolve(); throw failure;
      }}},
    ]}, {logger: false, abortOnError: false});
    const coreEnd = vi.fn(async () => undefined), owner = new NativeCoreApplicationOwner({end: coreEnd} as unknown as Pool);
    owner.beginApplicationConstruction(); owner.captureApplication(app);
    const closing = owner.close(), rejected = expect(closing).rejects.toBe(failure);
    try {
      await Promise.all([entered.promise, otherEntered.promise]); await rejected;
      expect(owner.status()).toEqual({state: "CLOSE_FAILED"});
      expect(domainEnd).not.toHaveBeenCalled(); expect(coreEnd).not.toHaveBeenCalled();
      expect(owner.close()).toBe(closing);
    } finally { pending.resolve(); await pending.promise; }
  });
});
describe("TEST_ONLY explicit native Core application owner", () => {
  it("joins the actual app barrier once and ends only the owned SAME Core pool afterwards", async () => {
    const held = deferred<void>(), entered = deferred<void>(), end = vi.fn(async () => undefined);
    const pool = {end} as unknown as Pool, other = {end: vi.fn()} as unknown as Pool;
    const app = {close: vi.fn(async () => { entered.resolve(); await held.promise; })};
    const owner = new NativeCoreApplicationOwner(pool);
    expect(owner.usesPool(pool)).toBe(true); expect(owner.usesPool(other)).toBe(false);
    owner.beginApplicationConstruction(); owner.captureApplication(app);
    const first = owner.close();
    try {
      await entered.promise; expect(owner.close()).toBe(first);
      expect(end).not.toHaveBeenCalled(); expect(app.close).toHaveBeenCalledOnce();
    } finally { held.resolve(); await first; }
    expect(owner.status()).toEqual({state: "CORE_ENDED"}); expect(end).toHaveBeenCalledOnce();
    expect(other.end).not.toHaveBeenCalled();
  });
  it("preserves the exact startup error after a half-init app drain failure and never ends Core", async () => {
    const startup = Error("TEST_ONLY-original-startup"), drain = Error("TEST_ONLY-private-drain");
    const end = vi.fn(async () => undefined), close = vi.fn(async () => { throw drain; });
    const owner = new NativeCoreApplicationOwner({end} as unknown as Pool);
    owner.beginApplicationConstruction(); owner.captureApplication({close});
    await expect(owner.failStartup(startup)).rejects.toBe(startup);
    expect(owner.status()).toEqual({state: "CLOSE_FAILED"}); expect(end).not.toHaveBeenCalled();
    await expect(owner.close()).rejects.toBe(drain); expect(close).toHaveBeenCalledOnce();
  });
  it("preserves exact startup failure after successful partial-app cleanup and Core end", async () => {
    const startup = Error("TEST_ONLY-original-ready-failure"), end = vi.fn(async () => undefined);
    const close = vi.fn(async () => undefined), owner = new NativeCoreApplicationOwner({end} as unknown as Pool);
    owner.beginApplicationConstruction(); owner.captureApplication({close});
    await expect(owner.failStartup(startup)).rejects.toBe(startup);
    expect(close).toHaveBeenCalledOnce(); expect(end).toHaveBeenCalledOnce();
    expect(owner.status()).toEqual({state: "CORE_ENDED"});
  });
  it("does not equate a pre-handle Nest factory rejection with safe disposal", async () => {
    const original = Error("TEST_ONLY-private-factory-rejection"), end = vi.fn(async () => undefined);
    const owner = new NativeCoreApplicationOwner({end} as unknown as Pool);
    owner.beginApplicationConstruction();
    await expect(owner.failStartup(original)).rejects.toBe(original);
    expect(owner.status()).toEqual({state: "NOT_SAFE_TO_DISPOSE"}); expect(end).not.toHaveBeenCalled();
    const closing = owner.close();
    await expect(closing).rejects.toMatchObject({code: "CURRENT_HUMAN_NATIVE_APPLICATION_NOT_SAFE_TO_DISPOSE"});
    expect(owner.close()).toBe(closing); expect(end).not.toHaveBeenCalled();
  });
  it("ends inert pre-construction Core once, but preserves original failure if pg.end rejects", async () => {
    const original = Error("TEST_ONLY-inert-startup"), failure = Error("TEST_ONLY-end-error");
    const end = vi.fn(async () => { throw failure; }), owner = new NativeCoreApplicationOwner({end} as unknown as Pool);
    await expect(owner.failStartup(original)).rejects.toBe(original);
    expect(end).toHaveBeenCalledOnce(); expect(owner.status()).toEqual({state: "CLOSE_FAILED"});
  });
});
