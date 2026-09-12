import { describe, expect, it, vi } from "vitest";
import { sharedRead } from "./sharedRead";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe("BE-R2-9 in-flight authorized read sharing", () => {
  it("rejects an oversized body, aborts upstream and releases admission for a later read", async () => {
    const scope = {}; let signal!: AbortSignal;
    await expect(sharedRead(scope,"large",undefined,async upstream => {
      signal = upstream;
      return new Response(new Uint8Array(33 * 1024 * 1024));
    })).rejects.toThrow("PORTAL_READ_TOO_LARGE");
    expect(signal.aborted).toBe(true);
    expect((await sharedRead(scope,"large",undefined,async()=>new Response(null,{status:204}))).status).toBe(204);
  });
  it("shares body completion, supplies independent readers and never caches results", async () => {
    const scope = {}; const body = deferred<ReadableStreamReadResult<Uint8Array>>();
    const reader = { read: vi.fn().mockReturnValueOnce(body.promise).mockResolvedValue({ done: true }), releaseLock: vi.fn() };
    const read = vi.fn(async () => ({ status: 200, body: { getReader: () => reader }, headers: {} }) as unknown as Response);
    const first = sharedRead(scope,"paper/alpha/a",undefined,read);
    await Promise.resolve();
    const second = sharedRead(scope,"paper/alpha/a",undefined,read);
    expect(read).toHaveBeenCalledTimes(1);
    body.resolve({ done: false, value: new TextEncoder().encode('{"value":"1.000000000000000001"}') });
    const [a,b] = await Promise.all([first,second]);
    expect(await a.json()).toEqual(await b.json());
    await sharedRead(scope,"paper/alpha/a",undefined,async () => new Response("{}"));
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
  it("one cancelled panel cannot cancel another; the final unsubscribe aborts HTTP", async () => {
    const scope = {}; const response = deferred<Response>(); let upstream!: AbortSignal;
    const read = vi.fn((signal: AbortSignal) => { upstream = signal; return response.promise; });
    const a = new AbortController(); const b = new AbortController();
    const first = sharedRead(scope,"same",a.signal,read).catch(e => e.name);
    const second = sharedRead(scope,"same",b.signal,read).catch(e => e.name);
    a.abort(); expect(await first).toBe("AbortError"); expect(upstream.aborted).toBe(false);
    b.abort(); expect(await second).toBe("AbortError"); expect(upstream.aborted).toBe(true);
    response.resolve(new Response("{}"));
  });
  it("isolates profile/subject and session clients, preserves denial responses", async () => {
    const a = {}, b = {}; const response = deferred<Response>();
    const read = vi.fn(() => response.promise.then(reply=>reply.clone()));
    const pending = [sharedRead(a,"paper/a",undefined,read),sharedRead(a,"live/a",undefined,read),
      sharedRead(a,"paper/b",undefined,read),sharedRead(b,"paper/a",undefined,read)];
    expect(read).toHaveBeenCalledTimes(4);
    response.resolve(new Response('{"code":"DENIED"}',{status:403}));
    for (const reply of await Promise.all(pending)) expect(reply.status).toBe(403);
  });
  it("rejects an already cancelled read before allocating network work", async () => {
    const abort = new AbortController(); abort.abort(); const read = vi.fn();
    await expect(sharedRead({},"x",abort.signal,read)).rejects.toMatchObject({name:"AbortError"});
    expect(read).not.toHaveBeenCalled();
  });
});
