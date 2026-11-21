import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { pmHttpRequestDigest, PmHttpRequestBindingError,
  type PmHttpRequestBounds, type PmHttpRequestBytes } from "../src/execution-v2/pm-http-request-binding";

/** Source-contract codec qualification only; no issuer, HTTP transport, source
 * COMMIT, actual provider or production profile is exercised by these tests. */
describe("ELP2-10 exact PM HTTP byte binding", () => {
  const bounds: PmHttpRequestBounds = { request_bytes: 4096 }; // TEST_ONLY explicit ceiling.
  const request = (changes: Partial<PmHttpRequestBytes> = {}): PmHttpRequestBytes => ({ method: "POST",
    raw_path: Buffer.from("/internal/pma11-candidate/capital/target/apply", "utf8"),
    query_string: Buffer.alloc(0), body: Buffer.from("{}", "utf8"), ...changes });
  const digest = (changes: Partial<PmHttpRequestBytes> = {}) => pmHttpRequestDigest(request(changes), bounds);
  const rejects = (input: unknown, limits: unknown, code: string) => {
    try {
      pmHttpRequestDigest(input as PmHttpRequestBytes, limits as PmHttpRequestBounds);
      throw new Error("TEST_ONLY_EXPECTED_REFUSAL");
    } catch (error) {
      expect(error).toBeInstanceOf(PmHttpRequestBindingError);
      expect(error).toMatchObject({ code, message: code });
    }
  };

  it("matches PM's frozen POST exact-byte vector", () => {
    expect(digest()).toBe("sha256:9de8d410b8cfdac664b05dd2ff4a88fdb02459961f63b1ad0ea2252a4d8e1cf9");
  });
  it("matches PM's frozen percent-encoded GET/query vector", () => {
    expect(digest({ method: "GET", raw_path: Buffer.from("/internal/pma11-candidate/reports/%CE%B1"),
      query_string: Buffer.from("limit=2&cursor=a%2Bb"), body: Buffer.alloc(0) }))
      .toBe("sha256:51b68eb973f4f3d5bd1ffd99c7bfa41aedd04ca3385e78732e1dadbc8f7da6f2");
  });
  it("changes for method, mounted path, query or body independently", () => {
    const original = digest();
    for (const change of [{ method: "GET" as const }, { raw_path: Buffer.from("/other/apply") },
      { query_string: Buffer.from("limit=2") }, { body: Buffer.from('{"amount":"1"}') }])
      expect(digest(change)).not.toBe(original);
  });
  it("does not normalize equivalent JSON, percent encoding or query ordering", () => {
    expect(digest({ body: Buffer.from('{"a":1,"b":2}') })).not.toBe(digest({ body: Buffer.from('{ "b":2, "a":1 }') }));
    expect(digest({ raw_path: Buffer.from("/reports/%CE%B1") })).not.toBe(digest({ raw_path: Buffer.from("/reports/α", "utf8") }));
    expect(digest({ raw_path: Buffer.from("/reports/%2f") })).not.toBe(digest({ raw_path: Buffer.from("/reports/%2F") }));
    expect(digest({ query_string: Buffer.from("a=1&b=2") })).not.toBe(digest({ query_string: Buffer.from("b=2&a=1") }));
    expect(digest({ query_string: Buffer.from("q=a+b") })).not.toBe(digest({ query_string: Buffer.from("q=a%20b") }));
  });
  it("hashes exact buffer slices/Uint8Arrays without surrounding backing bytes or UTF8 replacement", () => {
    const wrapped = Buffer.from("x{}y");
    expect(digest({ body: wrapped.subarray(1, 3) })).toBe(digest());
    expect(digest({ body: new Uint8Array([0x7b, 0x7d]) })).toBe(digest());
    expect(digest({ body: new Uint8Array([0xff]) })).not.toBe(digest({ body: Buffer.from("�", "utf8") }));
  });
  it("uses the fixed sorted ASCII descriptor codec even for UTF8 request bytes", () => {
    const input = request({ body: Buffer.from('{"label":"α · 研究"}', "utf8"), query_string: Buffer.from("q=%E7%A0%94") });
    const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
    const descriptor = '{"body_sha256":"' + hash(input.body) + '","method":"POST","path_sha256":"'
      + hash(input.raw_path) + '","query_sha256":"' + hash(input.query_string) + '","schema":"pma.http-request-binding.v1"}';
    expect(pmHttpRequestDigest(input, bounds)).toBe(`sha256:${createHash("sha256").update(descriptor, "utf8").digest("hex")}`);
    // Not a hash of parsed business JSON or of the body alone.
    expect(pmHttpRequestDigest(input, bounds)).not.toBe(`sha256:${hash(input.body)}`);
  });
  it("permits frozen source path/query caps and exact explicit body ceiling, without mutating input", () => {
    const input = request({ raw_path: Buffer.concat([Buffer.from("/"), Buffer.alloc(8191, 0x61)]),
      query_string: Buffer.alloc(2048, 0x61), body: Buffer.alloc(4096, 0x61) });
    const before = [Buffer.from(input.raw_path), Buffer.from(input.query_string), Buffer.from(input.body)];
    expect(pmHttpRequestDigest(input, bounds)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect([input.raw_path, input.query_string, input.body]).toEqual(before);
    expect(digest({ method: "GET", body: Buffer.alloc(0) })).toMatch(/^sha256:/);
  });
  it.each(["get", "POST ", "PUT", "HEAD", "", null, 1])("rejects method %s without case/whitespace normalization", method => {
    rejects({ ...request(), method }, bounds, "HTTP_REQUEST_BINDING_INVALID");
  });
  it.each([Buffer.alloc(0), Buffer.from("relative"), Buffer.from("/path?query"), Buffer.from("/path#fragment"),
    Buffer.concat([Buffer.from("/"), Buffer.alloc(8192)]), "/path", new DataView(new ArrayBuffer(2)), null])
    ("rejects invalid raw path %#", raw_path => rejects({ ...request(), raw_path }, bounds, "HTTP_REQUEST_BINDING_INVALID"));
  it.each(["a=1", Buffer.alloc(2049), null, []])("rejects invalid raw query %#", query_string => {
    rejects({ ...request(), query_string }, bounds, "QUERY_LIMIT_EXCEEDED");
  });
  it.each(["{}", {}, null, Buffer.alloc(4097)])("rejects non-byte or oversized body %#", body => {
    rejects({ ...request(), body }, bounds, "BODY_LIMIT_EXCEEDED");
  });
  it.each([undefined, null, {}, { request_bytes: 0 }, { request_bytes: -1 }, { request_bytes: 0.5 },
    { request_bytes: Infinity }, { request_bytes: NaN }, { request_bytes: Number.MAX_SAFE_INTEGER + 1 },
    { request_bytes: "4096" }, { request_bytes: 4096, fallback: true }])("requires explicit bounded configuration %#", limits => {
    rejects(request(), limits, "BODY_LIMIT_EXCEEDED");
  });
  it("rejects caller digests, extra fields, incomplete descriptors and accessors instead of treating them as authority", () => {
    rejects({ ...request(), request_digest: `sha256:${"a".repeat(64)}` }, bounds, "HTTP_REQUEST_BINDING_INVALID");
    rejects({ method: "POST", raw_path: Buffer.from("/") }, bounds, "HTTP_REQUEST_BINDING_INVALID");
    rejects(null, bounds, "HTTP_REQUEST_BINDING_INVALID");
    const accessor = { ...request() };
    Object.defineProperty(accessor, "body", { get: () => { throw new Error("TEST_ONLY_GETTER_MUST_NOT_RUN"); }, enumerable: true });
    rejects(accessor, bounds, "HTTP_REQUEST_BINDING_INVALID");
  });
});
