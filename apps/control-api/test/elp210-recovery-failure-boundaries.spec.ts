/** TEST_ONLY mocked https.request failure-path proof, NOT TLS/transport or
 * installed source authority evidence. Actual mTLS stays in the transport suite.
 * No private key, socket, listener, DB or accepted policy is created here. */
import { EventEmitter } from "node:events";
import type { IncomingMessage, RequestOptions } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CurrentHumanLeaseError } from "../src/execution-v2/current-human-candidate";
import { CurrentHumanRecoveryClient, type CurrentHumanRecoveryClientConfig } from "../src/execution-v2/current-human-recovery-client";
import type { CurrentHumanRecoveryAttempt } from "../src/execution-v2/current-human-mutations";

const wire = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("node:https", () => ({ request: wire.request }));
const diagnostic = "TEST_ONLY_NATIVE_DIAGNOSTIC_NOT_PUBLIC";
const publicMessage = "The current identity operation is not available.";
const attempt: CurrentHumanRecoveryAttempt = {
  lease_id: "TEST_ONLY-lease", attempt_id: "TEST_ONLY-attempt", workspace_id: "TEST_ONLY-workspace", environment: "paper",
  workload_id: "TEST_ONLY-workload", request_digest: `sha256:${"a".repeat(64)}`, human_issuer: "TEST_ONLY-issuer",
  subject: "TEST_ONLY-subject", session_id: "TEST_ONLY-session", session_revision: 2, authority_revision: 3, expires_at: 1,
};
const acknowledgement = { schema_version: "pma.current-human-recover-ack.v1", lease_id: attempt.lease_id,
  attempt_id: attempt.attempt_id, phase: "UNKNOWN", portal_acknowledged: true };
const config = (): CurrentHumanRecoveryClientConfig => ({ origin: "https://pm.candidate.invalid",
  tls: { key: "TEST_ONLY-mocked-key", cert: "TEST_ONLY-mocked-certificate", ca: "TEST_ONLY-mocked-CA" },
  source_certificate_sha256: `sha256:${"b".repeat(64)}`, deadline_ms: 50, response_bytes: 4096 });
const client = () => new CurrentHumanRecoveryClient(config());
async function expectFailure(action: () => unknown, code: string) {
  const error = await Promise.resolve().then(action).then(() => null, reason => reason);
  expect(error).toBeInstanceOf(CurrentHumanLeaseError);
  expect(error).toMatchObject({ code, message: publicMessage });
  expect(String(error)).not.toContain(diagnostic);
  expect(JSON.stringify(error)).not.toContain(diagnostic);
}
function mockedRequest() {
  const req = Object.assign(new EventEmitter(), { end: vi.fn(), destroy: vi.fn() });
  let receive!: (response: IncomingMessage) => void;
  wire.request.mockImplementation((_url: URL, _options: RequestOptions, callback: typeof receive) => {
    receive = callback; return req;
  });
  return { req, respond(headers: Record<string, string | string[]> = {}, statusCode = 200) {
    const res = Object.assign(new EventEmitter(), { statusCode, headers: { "content-type": "application/json", ...headers }, destroy: vi.fn() });
    receive(res as unknown as IncomingMessage); return res;
  } };
}

describe("ELP2-10 recovery typed failure boundaries (TEST_ONLY mocked HTTPS)", () => {
  beforeEach(() => { wire.request.mockReset(); vi.useFakeTimers(); });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); });

  it.each([
    ["missing TLS", { tls: undefined }], ["null TLS", { tls: null }], ["incomplete TLS", { tls: {} }],
    ["invalid origin", { origin: "not-a-url" }], ["invalid byte bound", { response_bytes: NaN }],
  ])("sanitizes %s configuration before request creation", async (_label, change) => {
    await expectFailure(() => new CurrentHumanRecoveryClient({ ...config(), ...change } as CurrentHumanRecoveryClientConfig),
      "CURRENT_HUMAN_RECOVERY_CONFIG_INVALID");
    expect(wire.request).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("captures array and passphrase-key TLS material without retaining caller buffers", async () => {
    const key=Buffer.from("TEST_ONLY-key"),cert=Buffer.from("TEST_ONLY-cert"),ca=Buffer.from("TEST_ONLY-ca");
    const input={...config(),tls:{key:[{pem:key,passphrase:"TEST_ONLY-pass"}],cert:[cert],ca:[ca]}};
    const target=new CurrentHumanRecoveryClient(input),mock=mockedRequest();
    key.fill(0);cert.fill(0);ca.fill(0);input.tls.key.length=0;
    const pending=target.recover(attempt),options=wire.request.mock.calls[0][1];
    expect(options.key[0].pem.toString()).toBe("TEST_ONLY-key");
    expect(options.cert[0].toString()).toBe("TEST_ONLY-cert");
    expect(options.ca[0].toString()).toBe("TEST_ONLY-ca");
    const res=mock.respond();res.emit("data",Buffer.from(JSON.stringify(acknowledgement)));res.emit("end");
    await expect(pending).resolves.toEqual(acknowledgement);
  });
  it("keeps the selected recovery origin and TLS binding when public-looking properties are replaced", async () => {
    const target=client(),mock=mockedRequest();
    expect(Reflect.set(target,"url",new URL("https://test-only-other.invalid/"))).toBe(true);
    expect(Reflect.set(target,"config",{...config(),origin:"https://test-only-other.invalid",
      tls:{key:"TEST_ONLY-other-key",cert:"TEST_ONLY-other-cert",ca:"TEST_ONLY-other-ca"},
      source_certificate_sha256:`sha256:${"f".repeat(64)}`,deadline_ms:5000,response_bytes:32768})).toBe(true);
    const pending=target.recover(attempt),[url,options]=wire.request.mock.calls[0];
    expect(String(url)).toBe("https://pm.candidate.invalid/internal/elp210/current-human/recover");
    expect(options.key).toBe("TEST_ONLY-mocked-key");
    expect(options.cert).toBe("TEST_ONLY-mocked-certificate");
    expect(options.ca).toBe("TEST_ONLY-mocked-CA");
    const res=mock.respond();res.emit("data",Buffer.from(JSON.stringify(acknowledgement)));res.emit("end");
    await expect(pending).resolves.toEqual(acknowledgement);
  });
  it.each([
    ["circular", () => { const value: Record<string, unknown> = { ...attempt }; value.self = value; return value; }],
    ["throwing toJSON", () => ({ ...attempt, toJSON() { throw new Error(diagnostic); } })],
    ["throwing getter", () => Object.defineProperty({ ...attempt }, "session_id", { enumerable: true, get() { throw new Error(diagnostic); } })],
  ])("sanitizes %s serialization without making a request", async (_label, make) => {
    await expectFailure(() => client().recover(make() as CurrentHumanRecoveryAttempt), "CURRENT_HUMAN_RECOVERY_REQUEST_INVALID");
    expect(wire.request).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("refuses an oversized request before request creation", async () => {
    await expectFailure(() => client().recover({ ...attempt, session_id: "x".repeat(8192) }), "CURRENT_HUMAN_RECOVERY_REQUEST_INVALID");
    expect(wire.request).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
  });
  it("sanitizes a synchronous native TLS/request construction failure", async () => {
    wire.request.mockImplementation(() => { throw new Error(diagnostic); });
    await expectFailure(() => client().recover(attempt), "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(wire.request).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("sanitizes synchronous end failure and destroys only the created request once", async () => {
    const mock = mockedRequest(); mock.req.end.mockImplementation(() => { throw new Error(diagnostic); });
    await expectFailure(() => client().recover(attempt), "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(mock.req.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    mock.req.emit("error", new Error(diagnostic));
    expect(mock.req.destroy).toHaveBeenCalledTimes(1);
  });
  it("sanitizes asynchronous request errors and clears the deadline", async () => {
    const mock = mockedRequest(), pending = client().recover(attempt);
    mock.req.emit("error", new Error(diagnostic));
    await expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(mock.req.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["error", "aborted"] as const)("sanitizes response %s and ignores a late successful ACK", async event => {
    const mock = mockedRequest(), pending = client().recover(attempt), res = mock.respond(), resolved = vi.fn();
    void pending.then(resolved, () => undefined);
    res.emit(event, ...(event === "error" ? [new Error(diagnostic)] : []));
    await expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(mock.req.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    res.emit("data", Buffer.from(JSON.stringify(acknowledgement))); res.emit("end");
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled(); expect(mock.req.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("times out once, destroys the request and ignores a late error/ACK", async () => {
    const mock = mockedRequest(), pending = client().recover(attempt);
    const checked = expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    await vi.advanceTimersByTimeAsync(51); await checked;
    expect(mock.req.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    mock.req.emit("error", new Error(diagnostic));
    const late = mock.respond(); late.emit("data", Buffer.from(JSON.stringify(acknowledgement))); late.emit("end");
    expect(mock.req.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("refuses an oversized declared content length before accepting response body bytes", async () => {
    const mock = mockedRequest(), pending = client().recover(attempt);
    const res = mock.respond({ "content-length": "4097" });
    expect(res.listenerCount("data")).toBe(0);
    await expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(res.destroy).toHaveBeenCalledTimes(1); expect(mock.req.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each([
    ["leading zero", "04096"], ["nondecimal", "invalid-length"], ["array", ["1", "2"]],
  ] as const)("refuses %s declared length before body parsing and cannot accept a late ACK", async (_label, value) => {
    const mock = mockedRequest(), pending = client().recover(attempt), resolved = vi.fn();
    void pending.then(resolved, () => undefined);
    const res = mock.respond({ "content-length": Array.isArray(value) ? [...value] : value as string });
    expect(res.listenerCount("data")).toBe(0);
    await expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(res.destroy).toHaveBeenCalledTimes(1); expect(mock.req.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    res.emit("data", Buffer.from(JSON.stringify(acknowledgement))); res.emit("end");
    await Promise.resolve();
    expect(resolved).not.toHaveBeenCalled(); expect(mock.req.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refuses actual response bytes above the bound even without a declared length", async () => {
    const mock = mockedRequest(), pending = client().recover(attempt), res = mock.respond();
    res.emit("data", Buffer.alloc(4097, 0x20));
    await expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(res.destroy).toHaveBeenCalledTimes(1); expect(mock.req.destroy).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("refuses malformed ACK bytes without leaking the parse error or clearing UNKNOWN as rollback", async () => {
    const mock = mockedRequest(), pending = client().recover(attempt), res = mock.respond();
    res.emit("data", Buffer.from([0x7b, 0xff, 0x7d])); res.emit("end");
    await expectFailure(() => pending, "CURRENT_HUMAN_RECOVERY_UNAVAILABLE");
    expect(mock.req.destroy).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("preserves a valid UNKNOWN ACK and the exact fixed transport bounds", async () => {
    const mock = mockedRequest(), pending = client().recover(attempt), res = mock.respond();
    res.emit("data", Buffer.from(JSON.stringify(acknowledgement))); res.emit("end");
    expect(await pending).toEqual(acknowledgement);
    const [url, options] = wire.request.mock.calls[0];
    expect(String(url)).toBe("https://pm.candidate.invalid/internal/elp210/current-human/recover");
    expect(options).toMatchObject({ method: "POST", agent: false, minVersion: "TLSv1.3", maxVersion: "TLSv1.3",
      rejectUnauthorized: true, maxHeaderSize: 8192, headers: { "content-type": "application/json", connection: "close" } });
    const body = mock.req.end.mock.calls[0][0] as Buffer;
    expect(body.length).toBeLessThanOrEqual(8192);
    expect(JSON.parse(body.toString())).toEqual({ schema_version: "pma.current-human-recover.v1", attempt });
    expect(wire.request).toHaveBeenCalledTimes(1); expect(mock.req.destroy).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
    mock.req.emit("error", new Error(diagnostic)); expect(mock.req.destroy).not.toHaveBeenCalled();
  });
});
