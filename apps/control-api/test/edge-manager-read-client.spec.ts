/** Source-dark Edge Manager catalogue/projection consumer. SYNTHETIC TEST_ONLY.
 * Real loopback TLS1.3/mTLS server with in-memory certificates; no real Edge, no real token, no signer.
 * Contract cross-checks read the Edge's own pack (manager-v2-paper-read-v1) and edge-service source. */
import { createHash, generateKeyPairSync, X509Certificate, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer, type Server } from "node:https";
import type { Duplex } from "node:stream";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  EDGE_MANAGER_READ_ABSENT, EdgeManagerReadClient, EdgeManagerReadError, createEdgeManagerReadPort, edgeManagerReadBootstrap,
  type EdgeManagerReadBootstrapInput,
} from "../src/execution-v2/edge-manager-read-client";
import {
  EDGE_MANAGER_AVAILABILITY, EDGE_MANAGER_COMPLETENESS, EDGE_MANAGER_FRESHNESS, EDGE_MANAGER_KEY_STATUSES, EDGE_MANAGER_PATTERNS,
  EDGE_MANAGER_PROBLEM_STATUS, EDGE_MANAGER_PROJECTION_KINDS, EDGE_MANAGER_QUERY_STATUS, EDGE_MANAGER_RUNTIME_CONTRACT_VERSION,
  EDGE_MANAGER_VALUE_KINDS, edgeManagerCatalogueEnvelopeSchema, edgeManagerProjectionEnvelopeSchema, edgeManagerUnavailableSchema,
} from "../src/execution-v2/edge-manager-read-contract";
import { commonName, testCertificate } from "./fixtures/elp210-test-certificates";

const PACK = process.env.EDGE_MANAGER_V2_PACK ??
  resolve(__dirname, "../../../services/portal-execution-edge-rs/contracts/manager-v2-paper-read-v1");
const EDGE_MAIN = process.env.EDGE_SERVICE_MAIN ??
  resolve(__dirname, "../../../services/portal-execution-edge-rs/crates/edge-service/src/main.rs");
const readJson = (name: string) => JSON.parse(readFileSync(resolve(PACK, name), "utf8"));
const openapi = readJson("manager-v2.openapi.json");
const overlay = readJson("owner-runtime-overlay/manager-v2-runtime-qualification.json");
const fixtures = readJson("manager-v2-fixtures.json");

const DIGEST = `sha256:${"a".repeat(64)}`;
const PROFILE = "PAPER_BINANCE_USDM";
const TOKEN = "TESTONLYhead.TESTONLYbody.TESTONLYsig";
// Shapes mirror crates/manager-v2-contract/src/tests.rs (envelope/relation/record helpers).
const meta = (extra: Record<string, unknown> = {}) => ({
  contract_version: EDGE_MANAGER_RUNTIME_CONTRACT_VERSION, authority: "EXECUTION_CELL", profile_id: PROFILE,
  catalogue_sha256: DIGEST, availability: "AVAILABLE", freshness: "FRESH", completeness: "COMPLETE",
  trace_id: "manager-v2-contract-test", as_of: "2026-08-28T00:00:00Z", ...extra,
});
const relation = (name: string) => ({
  id: { schema: "public", relation: name }, kind: "TABLE",
  safe_columns: [{ name: "id", ordinal: 1, data_type: "bigint", nullable: false }, { name: "amount", ordinal: 2, data_type: "numeric", nullable: true }],
  secret_cell_excluded_column_count: 1, key: { status: "PRIMARY_KEY", name: null, columns: ["id"] },
  profile_classification: "FIXED_PROFILE_CONTEXT", profile_columns: [], query_status: EDGE_MANAGER_QUERY_STATUS,
});
const catalogueBody = (extra: Record<string, unknown> = {}) => ({
  ...meta(), data: { catalogue_revision: DIGEST, relation_count: 2, relations: [relation("orders"), relation("fills")] }, ...extra,
});
const record = (key = "rk_1") => ({
  relation: { schema: "public", relation: "orders" }, record_key: key,
  fields: { id: { kind: "INTEGER", value: 1 }, amount: { kind: "DECIMAL", value: "12.5000" }, note: { kind: "TEXT", value: "internal" } },
});
const projectionBody = (kind = "order", items: unknown[] = [record()], next: string | null = "next_cursor-1") => ({
  ...meta(), data: { kind, items, next_cursor: next },
});
const unavailableBody = (extra: Record<string, unknown> = {}) => ({
  contract_version: EDGE_MANAGER_RUNTIME_CONTRACT_VERSION, authority: "EXECUTION_CELL", profile_id: PROFILE, catalogue_sha256: DIGEST,
  availability: "UNAVAILABLE", reason_code: "SOURCE_UNAVAILABLE", trace_id: "manager-v2-test-unavailable", ...extra,
});

describe("contract cross-check against the Edge's own documents", () => {
  const schemas = openapi.components.schemas;
  it("projection kinds, availability, freshness, completeness and value kinds equal the openapi", () => {
    expect([...EDGE_MANAGER_PROJECTION_KINDS]).toEqual(schemas.NamedProjection.properties.kind.enum);
    expect([...EDGE_MANAGER_AVAILABILITY]).toEqual(schemas.Availability.enum);
    expect([...EDGE_MANAGER_FRESHNESS]).toEqual(schemas.Freshness.enum);
    expect([...EDGE_MANAGER_COMPLETENESS]).toEqual(schemas.Completeness.enum);
    expect(schemas.ManagerValue.oneOf.map((v: { properties: { kind: { const: string } } }) => v.properties.kind.const)).toEqual([...EDGE_MANAGER_VALUE_KINDS]);
  });
  it("records the documented drift: runtime version, record_key, key statuses, query status", () => {
    expect(overlay.contract_revision).toBe(EDGE_MANAGER_RUNTIME_CONTRACT_VERSION);
    expect(schemas.ContractVersion.const).not.toBe(EDGE_MANAGER_RUNTIME_CONTRACT_VERSION);
    expect(overlay.wire_overlay.manager_record_required_addition).toBe("record_key");
    expect(schemas.ManagerRecord.required).not.toContain("record_key");
    const openapiStatuses: string[] = schemas.KeyDescriptor.properties.status.enum;
    const expected = [...openapiStatuses.filter(s => s !== "PENDING_QUERY_KEY"), ...overlay.wire_overlay.key_descriptor_status_additions];
    expect([...EDGE_MANAGER_KEY_STATUSES].sort()).toEqual(expected.sort());
    expect(EDGE_MANAGER_QUERY_STATUS).toBe(overlay.catalogue.runtime_query_status);
    expect(overlay.limits.maximum_page_rows).toBe(200);
    expect(overlay.limits.maximum_response_bytes).toBe(1_048_576);
  });
  it("patterns equal the openapi patterns", () => {
    expect(schemas.CatalogueDigest.pattern).toBe(EDGE_MANAGER_PATTERNS.digest);
    expect(schemas.OpaqueCursor.pattern.replace("+$", "{1,4096}$")).toBe(EDGE_MANAGER_PATTERNS.opaque);
    expect(schemas.OpaqueRecordKey.pattern.replace("+$", "{1,4096}$")).toBe(EDGE_MANAGER_PATTERNS.opaque);
    expect(schemas.SafeColumn.properties.name.pattern).toBe("^[A-Za-z_][A-Za-z0-9_]*$");
    expect(schemas.SafeColumn.properties.name.maxLength).toBe(63);
    expect(EDGE_MANAGER_PATTERNS.identifier).toBe("^[A-Za-z_][A-Za-z0-9_]{0,62}$");
    expect(schemas.ManagerValue.oneOf[3].properties.value.pattern).toBe(EDGE_MANAGER_PATTERNS.decimal);
  });
  it("the pack's synthetic source-dark fixtures are REFUSED by the runtime mirror (v1 version, PENDING query status)", () => {
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse(fixtures.synthetic_catalogue_response).success).toBe(false);
    for (const item of fixtures.unavailable_responses) expect(edgeManagerUnavailableSchema.safeParse(item.body).success).toBe(false);
    // With only the documented runtime deltas applied, the pack's own catalogue fixture is accepted.
    const patched = structuredClone(fixtures.synthetic_catalogue_response);
    patched.contract_version = EDGE_MANAGER_RUNTIME_CONTRACT_VERSION;
    patched.data.relations[0].query_status = EDGE_MANAGER_QUERY_STATUS;
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse(patched).success).toBe(true);
  });
  it("every problem code and its status exists in the Edge service source", () => {
    const source = readFileSync(EDGE_MAIN, "utf8");
    for (const code of Object.keys(EDGE_MANAGER_PROBLEM_STATUS)) expect(source, code).toContain(`"${code}"`);
    // Status pairing for a sample of codes straight from the Rust match arms.
    expect(source).toMatch(/StatusCode::PAYLOAD_TOO_LARGE,\s*"MANAGER_V2_SOURCE_RESPONSE_TOO_LARGE"/);
    expect(source).toMatch(/StatusCode::NOT_FOUND,\s*"MANAGER_COMPAT_RELATION_NOT_APPROVED"/);
    expect(source).toMatch(/StatusCode::FORBIDDEN,\s*"MANAGER_COMPAT_BINDING_DENIED"/);
    expect(source).toMatch(/StatusCode::BAD_REQUEST,\s*"MANAGER_V2_INVALID_PROJECTION"/);
  });
  it("source-dark guard: the consumer reads no environment, registers nothing and is imported by no app entry", () => {
    const src = resolve(__dirname, "../src");
    for (const file of ["execution-v2/edge-manager-read-client.ts", "execution-v2/edge-manager-read-contract.ts"]) {
      const text = readFileSync(resolve(src, file), "utf8");
      expect(text).not.toMatch(/process\.env|@Injectable|@Controller|@Module|console\.|logger/i);
    }
    for (const file of ["app.module.ts", "main.ts"]) expect(readFileSync(resolve(src, file), "utf8")).not.toContain("edge-manager-read");
  });
  it("mirror schemas: strict envelopes refuse drift", () => {
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse(catalogueBody()).success).toBe(true);
    expect(edgeManagerProjectionEnvelopeSchema.safeParse(projectionBody()).success).toBe(true);
    for (const bad of [
      { ...projectionBody(), extra: 1 }, { ...projectionBody(), freshness: "AGING" }, { ...projectionBody(), availability: "STALE" },
      projectionBody("order", [{ ...record(), extra: 1 }]), projectionBody("order", [{ ...record(), record_key: "bad key" }]),
      projectionBody("order", [{ ...record(), fields: { "bad-name": { kind: "NULL", value: null } } }]),
      projectionBody("order", [{ ...record(), fields: { a: { kind: "DECIMAL", value: "1e3" } } }]),
      projectionBody("order", [{ ...record(), fields: { a: { kind: "TEXT", value: "" } } }]),
      projectionBody("order", [{ ...record(), fields: { a: { kind: "TIMESTAMP", value: "2026-01-01T00:00:00+07:00" } } }]),
      projectionBody("nope"), projectionBody("order", [], "bad cursor"),
      projectionBody("order", Array.from({ length: 201 }, () => record())),
    ]) expect(edgeManagerProjectionEnvelopeSchema.safeParse(bad).success).toBe(false);
    const deep = (n: number): unknown => n === 0 ? { kind: "NULL", value: null } : { kind: "ARRAY", value: [deep(n - 1)] };
    expect(edgeManagerProjectionEnvelopeSchema.safeParse(projectionBody("order", [{ ...record(), fields: { a: deep(16) } }])).success).toBe(true);
    expect(edgeManagerProjectionEnvelopeSchema.safeParse(projectionBody("order", [{ ...record(), fields: { a: deep(17) } }])).success).toBe(false);
    const cat = catalogueBody();
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse({ ...cat, data: { ...cat.data, relation_count: 3 } }).success).toBe(false);
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse({ ...cat, data: { ...cat.data, catalogue_revision: `sha256:${"b".repeat(64)}` } }).success).toBe(false);
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse({ ...cat, data: { ...cat.data, relations: [relation("orders"), relation("orders")] } }).success).toBe(false);
    const pending = { ...relation("orders"), key: { status: "PENDING_QUERY_KEY", name: null, columns: ["id"] } };
    expect(edgeManagerCatalogueEnvelopeSchema.safeParse({ ...cat, data: { ...cat.data, relation_count: 1, relations: [pending] } }).success).toBe(false);
  });
});

const digest = (bytes: string | Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
type Authority = { key: KeyObject; name: Buffer; cert: Buffer };
type Identity = { key: Buffer; cert: Buffer; ca: Buffer; pin: string };
function authority(label: string): Authority {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" }), dn = commonName(`TEST_ONLY_${label}`);
  return { key: keys.privateKey, name: dn, cert: testCertificate(dn, keys, { name: dn, key: keys.privateKey }, true) };
}
function identity(label: string, ca: Authority, host = "localhost"): Identity {
  const keys = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const cert = testCertificate(commonName(`TEST_ONLY_${label}`), keys, ca, false, host);
  return { key: Buffer.from(keys.privateKey.export({ type: "pkcs8", format: "pem" })), cert, ca: ca.cert, pin: digest(new X509Certificate(cert).raw) };
}

describe("Edge Manager read client over real TLS1.3/mTLS (synthetic wire)", () => {
  let core: Identity, edge: Identity, otherEdge: Identity, foreign: Identity, foreignCore: Identity;
  const allocations: Array<{ server: Server; sockets: Set<Duplex> }> = [];
  beforeAll(() => {
    const ca = authority("manager_root"), other = authority("manager_foreign");
    core = identity("core", ca); edge = identity("edge", ca); otherEdge = identity("other_edge", ca);
    foreign = identity("foreign_edge", other); foreignCore = identity("foreign_core", other);
  }, 15000);
  afterEach(async () => {
    for (const { server, sockets } of allocations.splice(0)) {
      const closed = new Promise<void>(r => server.close(() => r()));
      for (const s of sockets) s.destroy();
      server.closeAllConnections(); await closed;
    }
  });
  afterAll(() => { for (const i of [core, edge, otherEdge, foreign, foreignCore]) i?.key.fill(0); });

  type Handler = (req: IncomingMessage, res: ServerResponse) => void;
  async function endpoint(handler: Handler, options: { identity?: Identity; tls12?: boolean } = {}) {
    const id = options.identity ?? edge, sockets = new Set<Duplex>(), received: Array<{ path: string; method: string; headers: IncomingMessage["headers"]; body: number }> = [];
    const server = createServer({ key: id.key, cert: id.cert, ca: core.ca, requestCert: true, rejectUnauthorized: true,
      minVersion: options.tls12 ? "TLSv1.2" : "TLSv1.3", maxVersion: options.tls12 ? "TLSv1.2" : "TLSv1.3" }, (req, res) => {
      let bytes = 0; req.on("error", () => {}); res.on("error", () => {}); req.on("data", c => { bytes += c.length; });
      req.on("end", () => { received.push({ path: req.url ?? "", method: req.method ?? "", headers: req.headers, body: bytes }); handler(req, res); });
    });
    server.on("tlsClientError", () => {}); server.on("clientError", (_e, s) => s.destroy());
    server.on("connection", s => { sockets.add(s); s.once("close", () => sockets.delete(s)); });
    allocations.push({ server, sockets });
    await new Promise<void>((ok, bad) => { server.once("error", bad); server.listen(0, "127.0.0.1", () => { server.off("error", bad); ok(); }); });
    const address = server.address(); if (!address || typeof address === "string") throw new Error("TEST_ONLY_LISTEN");
    return { origin: `https://127.0.0.1:${address.port}`, received };
  }
  const send = (res: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}, ok = true) => {
    const body = Buffer.from(typeof value === "string" ? value : JSON.stringify(value));
    res.writeHead(status, { "content-type": "application/json", "content-length": String(body.length), connection: "close",
      ...(ok ? { "cache-control": "no-store", "x-content-type-options": "nosniff" } : {}), ...headers });
    res.end(body);
  };
  const GRANTS = { catalogue: true, projections: { order: ["id", "amount"] as string[], fill: ["id"] as string[] } };
  function input(origin: string, changes: Partial<EdgeManagerReadBootstrapInput> = {}): EdgeManagerReadBootstrapInput {
    return { origin, tls: { key: core.key, cert: core.cert, ca: edge.ca }, edge_leaf_sha256: edge.pin, profile_id: PROFILE,
      deadline_ms: 2000, response_bytes: 1_048_576, max_inflight: 1, token_provider: () => TOKEN, grants: GRANTS, ...changes };
  }
  const client = (origin: string, changes: Partial<EdgeManagerReadBootstrapInput> = {}) =>
    new EdgeManagerReadClient(edgeManagerReadBootstrap(input(origin, changes)));
  async function refusal(promise: Promise<unknown>, code: string, delivery?: "NOT_ATTEMPTED" | "MAY_HAVE_OCCURRED") {
    let caught: unknown; try { await promise; } catch (e) { caught = e; }
    expect(caught).toBeInstanceOf(EdgeManagerReadError);
    expect(caught).toMatchObject({ code, message: "The Edge Manager read is not available.", ...(delivery ? { http_delivery: delivery } : {}) });
    expect(String(caught)).not.toMatch(/TESTONLY|127\.0\.0\.1|BEGIN |sha256|SSL|CERT/);
  }
  const drained = (c: EdgeManagerReadClient) => expect.poll(() => c.snapshot().in_flight, { timeout: 2000 }).toBe(0);

  it("reads the catalogue over exact GET bytes; summary only, relations named by the Edge", async () => {
    const lane = await endpoint((_r, res) => send(res, 200, catalogueBody()));
    const c = client(lane.origin), out = await c.catalogue(); await drained(c);
    expect(out.kind).toBe("AVAILABLE");
    if (out.kind !== "AVAILABLE") return;
    expect(out.data).toEqual({ catalogue_revision: DIGEST, relation_count: 2, relations: [
      { schema: "public", relation: "orders", kind: "TABLE", key_status: "PRIMARY_KEY", columns: ["id", "amount"] },
      { schema: "public", relation: "fills", kind: "TABLE", key_status: "PRIMARY_KEY", columns: ["id", "amount"] }] });
    expect(out.meta).toMatchObject({ profile_id: PROFILE, freshness: "FRESH", completeness: "COMPLETE" });
    expect(lane.received).toHaveLength(1);
    expect(lane.received[0]).toMatchObject({ method: "GET", path: "/internal/v2/manager/catalogue", body: 0 });
    expect(lane.received[0]!.headers).toMatchObject({ authorization: `Bearer ${TOKEN}`, connection: "close", accept: "application/json" });
  });

  it("reads a projection page: only granted fields leave, record_key never does, withheld cells are counted", async () => {
    const lane = await endpoint((_r, res) => send(res, 200, projectionBody("order", [record("rk_a"), record("rk_b")])));
    const c = client(lane.origin), out = await c.projection("order", { limit: 50, cursor: "abc-DEF_1" }); await drained(c);
    expect(out.kind).toBe("AVAILABLE");
    if (out.kind !== "AVAILABLE") return;
    expect(out.data.withheld_field_cells).toBe(2);
    expect(out.data.next_cursor).toBe("next_cursor-1");
    expect(out.data.items[0]!.fields).toEqual({ id: { kind: "INTEGER", value: 1 }, amount: { kind: "DECIMAL", value: "12.5000" } });
    expect(JSON.stringify(out)).not.toMatch(/rk_a|rk_b|internal|record_key/);
    expect(Object.isFrozen(out.data)).toBe(true);
    expect(lane.received[0]).toMatchObject({ method: "GET", path: "/internal/v2/manager/projections/order?limit=50&cursor=abc-DEF_1" });
  });

  it("defaults the page size to the Edge default and never widens a query", async () => {
    const lane = await endpoint((_r, res) => send(res, 200, projectionBody("fill", [])));
    const c = client(lane.origin); await c.projection("fill"); await drained(c);
    expect(lane.received[0]!.path).toBe("/internal/v2/manager/projections/fill?limit=100");
  });

  describe("deny-all and absence (no network)", () => {
    it("no bootstrap = typed ABSENT port, no socket", async () => {
      const port = createEdgeManagerReadPort(undefined);
      expect(port).toBe(EDGE_MANAGER_READ_ABSENT);
      expect(port.state).toBe("ABSENT");
      expect(await port.catalogue()).toEqual({ kind: "ABSENT", reason: "EDGE_MANAGER_READ_NOT_CONFIGURED" });
      expect(await port.projection("order")).toEqual({ kind: "ABSENT", reason: "EDGE_MANAGER_READ_NOT_CONFIGURED" });
    });
    it("default grants deny the catalogue and every projection; the server sees nothing", async () => {
      const lane = await endpoint((_r, res) => send(res, 200, catalogueBody()));
      const c = client(lane.origin, { grants: undefined });
      expect(await c.catalogue()).toEqual({ kind: "DENIED", reason: "CATALOGUE_AUTHORITY_NOT_GRANTED" });
      for (const kind of EDGE_MANAGER_PROJECTION_KINDS) expect(await c.projection(kind)).toEqual({ kind: "DENIED", reason: "FIELD_AUTHORITY_NOT_GRANTED" });
      const empty = client(lane.origin, { grants: { projections: { order: [] } } });
      expect(await empty.projection("order")).toEqual({ kind: "DENIED", reason: "FIELD_AUTHORITY_NOT_GRANTED" });
      expect(await client(lane.origin).projection("position")).toEqual({ kind: "DENIED", reason: "FIELD_AUTHORITY_NOT_GRANTED" });
      expect(lane.received).toHaveLength(0);
    });
    it("a plain object is not a bootstrap: only edgeManagerReadBootstrap() output builds a client", () => {
      expect(() => new EdgeManagerReadClient({} as never)).toThrow(EdgeManagerReadError);
      expect(() => new EdgeManagerReadClient(input("https://127.0.0.1:1") as never)).toThrow(EdgeManagerReadError);
      expect(() => new EdgeManagerReadClient(undefined as never)).toThrow(EdgeManagerReadError);
    });
    it.each([
      ["http origin", { origin: "http://127.0.0.1:9" }], ["userinfo origin", { origin: "https://u:p@127.0.0.1:9" }],
      ["path origin", { origin: "https://127.0.0.1:9/x" }], ["bad pin", { edge_leaf_sha256: "sha256:zz" }],
      ["lower-case profile", { profile_id: "paper_binance" }], ["zero deadline", { deadline_ms: 0 }],
      ["huge response", { response_bytes: 3_000_000 }], ["zero inflight", { max_inflight: 0 }],
      ["no provider", { token_provider: undefined as never }], ["bad catalogue pin", { catalogue_sha256: "x" }],
      ["bad field name", { grants: { projections: { order: ["bad-name"] } } }],
      ["unknown kind grant", { grants: { projections: { nope: ["id"] } as never } }],
      ["extra key", { surprise: 1 } as never],
    ])("refuses config: %s", (_label, change) => {
      let caught: unknown; try { edgeManagerReadBootstrap(input("https://127.0.0.1:9", change as never)); } catch (e) { caught = e; }
      expect(caught).toMatchObject({ code: "EDGE_MANAGER_READ_CONFIG_INVALID", http_delivery: "NOT_ATTEMPTED" });
      expect(String(caught)).not.toMatch(/127\.0\.0\.1/);
    });
    it("refuses invalid kind, limit, cursor and token before any byte is sent", async () => {
      const lane = await endpoint((_r, res) => send(res, 200, projectionBody()));
      const c = client(lane.origin);
      await refusal(c.projection("nope" as never), "EDGE_MANAGER_READ_REQUEST_INVALID", "NOT_ATTEMPTED");
      await refusal(c.projection("order", { limit: 0 }), "EDGE_MANAGER_READ_REQUEST_INVALID");
      await refusal(c.projection("order", { limit: 201 }), "EDGE_MANAGER_READ_REQUEST_INVALID");
      await refusal(c.projection("order", { cursor: "bad cursor" }), "EDGE_MANAGER_READ_REQUEST_INVALID");
      await refusal(c.projection("order", { cursor: "a".repeat(4097) }), "EDGE_MANAGER_READ_REQUEST_INVALID");
      for (const token of ["not-a-jwt", "a.b", "a.b.c\r\nx: y", ""]) {
        await refusal(client(lane.origin, { token_provider: () => token }).catalogue(), "EDGE_MANAGER_READ_REQUEST_INVALID", "NOT_ATTEMPTED");
      }
      await refusal(client(lane.origin, { token_provider: () => { throw new Error(`secret ${TOKEN}`); } }).catalogue(),
        "EDGE_MANAGER_READ_REQUEST_INVALID", "NOT_ATTEMPTED");
      expect(lane.received).toHaveLength(0);
    });
  });

  describe("every Edge problem code", () => {
    it.each(Object.entries(EDGE_MANAGER_PROBLEM_STATUS))("%s answers status %i as a typed EDGE_PROBLEM", async (code, status) => {
      const lane = await endpoint((_r, res) => send(res, status, { error: { code, message: "Edge message." } }, {}, false));
      const c = client(lane.origin);
      expect(await c.projection("order")).toEqual({ kind: "EDGE_PROBLEM", status, code });
      expect(await c.catalogue()).toEqual({ kind: "EDGE_PROBLEM", status, code });
      await drained(c);
    });
    it("a known code under the wrong status, an unknown code or a widened body is UNVERIFIED", async () => {
      for (const [status, body] of [
        [503, { error: { code: "MANAGER_V2_INVALID_CURSOR", message: "m" } }], [400, { error: { code: "INVENTED_CODE", message: "m" } }],
        [400, { error: { code: "MANAGER_V2_INVALID_CURSOR", message: "m", detail: "x" } }], [400, { detail: "x" }],
      ] as const) {
        const lane = await endpoint((_r, res) => send(res, status, body, {}, false));
        await refusal(client(lane.origin).projection("order"), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED", "MAY_HAVE_OCCURRED");
      }
    });
    it("bare 401 and 403 (Edge returns an empty body) are typed", async () => {
      for (const status of [401, 403]) {
        const lane = await endpoint((_r, res) => { res.writeHead(status, { "content-length": "0", connection: "close" }); res.end(); });
        expect(await client(lane.origin).catalogue()).toEqual({ kind: "EDGE_PROBLEM", status, code: status === 401 ? "EDGE_UNAUTHENTICATED" : "EDGE_FORBIDDEN" });
      }
    });
    it("503 typed owner unavailability is returned as-is, never as an empty success", async () => {
      const lane = await endpoint((_r, res) => send(res, 503, unavailableBody({ availability: "PENDING_TS_OC_03D", reason_code: "SOURCE_BINDING_DISABLED" })));
      expect(await client(lane.origin).projection("order")).toEqual({ kind: "OWNER_UNAVAILABLE", availability: "PENDING_TS_OC_03D",
        reason_code: "SOURCE_BINDING_DISABLED", trace_id: "manager-v2-test-unavailable" });
      const other = await endpoint((_r, res) => send(res, 503, unavailableBody({ profile_id: "LIVE_BINANCE_USDM" })));
      await refusal(client(other.origin).projection("order"), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED");
      const bad = await endpoint((_r, res) => send(res, 503, unavailableBody({ availability: "AVAILABLE" })));
      await refusal(client(bad.origin).projection("order"), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED");
    });
  });

  describe("response verification", () => {
    it.each([
      ["wrong profile", () => projectionBody("order", [record()], null), { profile_id: "SANDBOX_BINANCE_USDM" }],
      ["wrong contract version", () => projectionBody(), { contract_version: "trading-system.portal-execution.manager-v2.v1" }],
      ["not AVAILABLE", () => projectionBody(), { availability: "PARTIAL" }],
      ["unknown field", () => projectionBody(), { surprise: true }],
    ])("200 with %s is refused", async (_label, build, patch) => {
      const lane = await endpoint((_r, res) => send(res, 200, { ...build(), ...patch }));
      await refusal(client(lane.origin).projection("order"), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED", "MAY_HAVE_OCCURRED");
    });
    it("refuses a projection of another kind, too many rows, and a drifted pinned catalogue digest", async () => {
      const kind = await endpoint((_r, res) => send(res, 200, projectionBody("fill")));
      await refusal(client(kind.origin).projection("order"), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED");
      const rows = await endpoint((_r, res) => send(res, 200, projectionBody("order", [record(), record(), record()])));
      await refusal(client(rows.origin).projection("order", { limit: 2 }), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED");
      const pin = await endpoint((_r, res) => send(res, 200, projectionBody()));
      await refusal(client(pin.origin, { catalogue_sha256: `sha256:${"c".repeat(64)}` }).projection("order"), "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED");
      expect((await client(pin.origin, { catalogue_sha256: DIGEST }).projection("order")).kind).toBe("AVAILABLE");
    });
    it("refuses a 200 without no-store/nosniff, with the wrong media type, chunked, encoded, oversized or malformed bodies", async () => {
      const U = "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED", T = "EDGE_MANAGER_READ_UNAVAILABLE";
      const cases: Array<[string, string, Handler]> = [
        ["no-store missing", U, (_r, res) => send(res, 200, projectionBody(), {}, false)],
        ["media type", T, (_r, res) => send(res, 200, projectionBody(), { "content-type": "text/plain" })],
        ["encoding", T, (_r, res) => send(res, 200, projectionBody(), { "content-encoding": "gzip" })],
        ["not JSON", U, (_r, res) => send(res, 200, "not json")],
        ["bom", U, (_r, res) => send(res, 200, `\uFEFF${JSON.stringify(projectionBody())}`)],
        ["redirect", T, (_r, res) => { res.writeHead(302, { location: "https://elsewhere.invalid/", "content-length": "0" }); res.end(); }],
        ["chunked", T, (_r, res) => { res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store", "x-content-type-options": "nosniff" });
          res.write(JSON.stringify(projectionBody())); res.end(); }],
        ["body shorter than length", T, (_r, res) => { res.writeHead(200, { "content-type": "application/json", "content-length": "99999", "cache-control": "no-store", "x-content-type-options": "nosniff" });
          res.end("{}"); }],
      ];
      for (const [label, code, handler] of cases) {
        const lane = await endpoint(handler);
        await refusal(client(lane.origin).projection("order"), code, "MAY_HAVE_OCCURRED").catch(error => { throw new Error(`${label}: ${String(error)}`); });
      }
      const big = await endpoint((_r, res) => send(res, 200, projectionBody()));
      await refusal(client(big.origin, { response_bytes: 64 }).projection("order"), "EDGE_MANAGER_READ_UNAVAILABLE");
    });
  });

  describe("transport authority", () => {
    it("refuses a wrong leaf pin, a foreign CA and a TLS1.2 server before writing a request", async () => {
      const lane = await endpoint((_r, res) => send(res, 200, catalogueBody()), { identity: otherEdge });
      await refusal(client(lane.origin).catalogue(), "EDGE_MANAGER_READ_UNAVAILABLE", "NOT_ATTEMPTED");
      const foreignLane = await endpoint((_r, res) => send(res, 200, catalogueBody()), { identity: foreign });
      await refusal(client(foreignLane.origin).catalogue(), "EDGE_MANAGER_READ_UNAVAILABLE", "NOT_ATTEMPTED");
      const old = await endpoint((_r, res) => send(res, 200, catalogueBody()), { tls12: true });
      await refusal(client(old.origin).catalogue(), "EDGE_MANAGER_READ_UNAVAILABLE", "NOT_ATTEMPTED");
      const noClient = await endpoint((_r, res) => send(res, 200, catalogueBody()));
      await refusal(client(noClient.origin, { tls: { key: foreignCore.key, cert: foreignCore.cert, ca: edge.ca } }).catalogue(),
        "EDGE_MANAGER_READ_UNAVAILABLE");
      for (const l of [lane, foreignLane, old, noClient]) expect(l.received).toHaveLength(0);
    });
    it("admits one call at a time (BUSY) and enforces the deadline", async () => {
      let release!: () => void; const gate = new Promise<void>(r => { release = r; });
      const lane = await endpoint((_r, res) => { void gate.then(() => send(res, 200, projectionBody())); });
      const c = client(lane.origin, { deadline_ms: 5000 });
      const first = c.projection("order");
      await expect.poll(() => lane.received.length, { timeout: 2000 }).toBe(1);
      await refusal(c.catalogue(), "EDGE_MANAGER_READ_BUSY", "NOT_ATTEMPTED");
      release(); expect((await first).kind).toBe("AVAILABLE"); await drained(c);
      const slow = await endpoint(() => { /* never answers */ });
      const s = client(slow.origin, { deadline_ms: 250 });
      await refusal(s.projection("order"), "EDGE_MANAGER_READ_DEADLINE_EXCEEDED", "MAY_HAVE_OCCURRED");
      await drained(s);
    });
    it("never puts the bearer, origin, pin or key in a thrown error", async () => {
      const lane = await endpoint((_r, res) => send(res, 200, "garbage"));
      let caught: unknown; try { await client(lane.origin).projection("order"); } catch (e) { caught = e; }
      const text = JSON.stringify(caught, Object.getOwnPropertyNames(caught as object)) + String(caught);
      expect(text).not.toContain(TOKEN); expect(text).not.toContain(lane.origin); expect(text).not.toContain(edge.pin);
      expect(text).not.toMatch(/BEGIN /);
    });
  });
});
