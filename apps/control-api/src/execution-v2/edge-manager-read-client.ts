import { createHash } from "node:crypto";
import type { ClientRequest, IncomingMessage } from "node:http";
import { request } from "node:https";
import { isIP } from "node:net";
import { checkServerIdentity, TLSSocket, type ConnectionOptions } from "node:tls";
import { types } from "node:util";
import {
  EDGE_MANAGER_DEFAULT_PAGE_ROWS, EDGE_MANAGER_MAXIMUM_PAGE_ROWS, EDGE_MANAGER_MAXIMUM_RESPONSE_BYTES,
  EDGE_MANAGER_MAXIMUM_TOKEN_BYTES, EDGE_MANAGER_PROBLEM_STATUS, EDGE_MANAGER_PROJECTION_KINDS,
  edgeManagerCatalogueEnvelopeSchema, edgeManagerProblemSchema, edgeManagerProjectionEnvelopeSchema,
  edgeManagerUnavailableSchema, type EdgeManagerProblemCode, type EdgeManagerProjectionKind,
  type EdgeManagerValue,
} from "./edge-manager-read-contract";

/**
 * SOURCE-DARK consumer of the Rust Edge's Manager catalogue and named projections.
 *
 * - Built only from a branded bootstrap object made by `edgeManagerReadBootstrap()`. There is no flag, no
 *   environment read, no Nest provider/controller and no import from app.module.ts or main.ts. Nothing in the
 *   public request path can reach it; the composition owner must hand it a bootstrap explicitly.
 * - Deny-all by default: no grant, no network. A projection needs an explicit field grant for that kind; the
 *   catalogue needs `catalogue: true`. Unconfigured = typed ABSENT.
 * - The delegated bearer is minted by an injected provider (this file holds no key and no signer) and is never
 *   logged, stored or placed in an error. No origin/pin/token value appears in any message.
 * - One fresh mTLS TLS1.3 connection per call, exact hostname + leaf SHA-256 pin checked before any byte is
 *   written; no redirect, retry, proxy, cookie or keep-alive. GET only, two fixed paths.
 */

export type EdgeManagerReadErrorCode =
  | "EDGE_MANAGER_READ_CONFIG_INVALID" | "EDGE_MANAGER_READ_REQUEST_INVALID" | "EDGE_MANAGER_READ_BUSY"
  | "EDGE_MANAGER_READ_UNAVAILABLE" | "EDGE_MANAGER_READ_DEADLINE_EXCEEDED" | "EDGE_MANAGER_READ_RESPONSE_UNVERIFIED";
export class EdgeManagerReadError extends Error {
  /** Transport fact only; never a source state. */
  constructor(readonly code: EdgeManagerReadErrorCode, readonly http_delivery: "NOT_ATTEMPTED" | "MAY_HAVE_OCCURRED") {
    super("The Edge Manager read is not available.");
  }
}
const fail = (code: EdgeManagerReadErrorCode, sent = false) =>
  new EdgeManagerReadError(code, sent ? "MAY_HAVE_OCCURRED" : "NOT_ATTEMPTED");

export interface EdgeManagerReadGrants {
  /** Catalogue names relations and columns; default false. */
  readonly catalogue?: boolean;
  /** Per projection kind: the only field names that may leave this client. Absent or empty = denied. */
  readonly projections?: Readonly<Partial<Record<EdgeManagerProjectionKind, readonly string[]>>>;
}
export interface EdgeManagerReadBootstrapInput {
  origin: string;
  tls: { ca: string | Uint8Array; key: string | Uint8Array; cert: string | Uint8Array };
  edge_leaf_sha256: string;
  profile_id: string;
  /** Optional pin: a catalogue digest drift becomes an UNVERIFIED refusal. */
  catalogue_sha256?: string;
  deadline_ms: number;
  response_bytes: number;
  max_inflight: number;
  /** Returns a short-lived delegated bearer for resource `execution:manager-v2:read`. */
  token_provider: () => Promise<string> | string;
  grants?: EdgeManagerReadGrants;
}
declare const bootstrapBrand: unique symbol;
export type EdgeManagerReadBootstrap = Readonly<{ readonly [bootstrapBrand]: true }>;
const issued = new WeakMap<object, Readonly<Config>>();

interface Config {
  origin: string; hostname: string;
  tls: { ca: Buffer; key: Buffer; cert: Buffer };
  leaf: string; profile_id: string; catalogue_sha256?: string;
  deadline_ms: number; response_bytes: number; max_inflight: number;
  token_provider: () => Promise<string> | string;
  catalogue_grant: boolean; fields: ReadonlyMap<EdgeManagerProjectionKind, ReadonlySet<string>>;
}

function pem(value: unknown): Buffer {
  if (typeof value === "string") {
    if (!value || Buffer.byteLength(value, "utf8") > 32768) throw new Error();
    return Buffer.from(value, "utf8");
  }
  if (!types.isUint8Array(value) || value.byteLength < 1 || value.byteLength > 32768) throw new Error();
  return Buffer.from(value);
}
function integer(value: unknown, maximum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum) throw new Error();
  return value;
}
const KNOWN_KEYS = ["origin", "tls", "edge_leaf_sha256", "profile_id", "catalogue_sha256", "deadline_ms", "response_bytes",
  "max_inflight", "token_provider", "grants"];
function plain(value: unknown, keys: readonly string[], optional: readonly string[] = []): Record<string, unknown> {
  if (value === null || typeof value !== "object" || types.isProxy(value) || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error();
  const out: Record<string, unknown> = Object.create(null);
  for (const name of Reflect.ownKeys(value)) {
    if (typeof name !== "string" || !keys.includes(name)) throw new Error();
    const descriptor = Object.getOwnPropertyDescriptor(value, name)!;
    if (!Object.hasOwn(descriptor, "value") || !descriptor.enumerable) throw new Error();
    out[name] = descriptor.value;
  }
  for (const name of keys) if (!(name in out) && !optional.includes(name)) throw new Error();
  return out;
}

/** The only way to obtain a bootstrap. Validates everything; never reads the environment. */
export function edgeManagerReadBootstrap(input: EdgeManagerReadBootstrapInput): EdgeManagerReadBootstrap {
  try {
    const data = plain(input, KNOWN_KEYS, ["catalogue_sha256", "grants"]);
    if (typeof data.origin !== "string" || data.origin.length > 2048 ||
        !/^https:\/\/[^/?#\\\s@]+\/?$(?![\s\S])/.test(data.origin)) throw new Error();
    const origin = new URL(data.origin);
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" ||
        origin.search || origin.hash || !origin.hostname) throw new Error();
    if (typeof data.edge_leaf_sha256 !== "string" || !/^sha256:[a-f0-9]{64}$/.test(data.edge_leaf_sha256)) throw new Error();
    if (typeof data.profile_id !== "string" || !/^[A-Z0-9_]{3,128}$/.test(data.profile_id)) throw new Error();
    if (data.catalogue_sha256 !== undefined &&
        (typeof data.catalogue_sha256 !== "string" || !/^sha256:[0-9a-f]{64}$/.test(data.catalogue_sha256))) throw new Error();
    if (typeof data.token_provider !== "function") throw new Error();
    const tls = plain(data.tls, ["ca", "key", "cert"]);
    const grants = data.grants === undefined ? {} : plain(data.grants, ["catalogue", "projections"], ["catalogue", "projections"]);
    if (grants.catalogue !== undefined && typeof grants.catalogue !== "boolean") throw new Error();
    const fields = new Map<EdgeManagerProjectionKind, ReadonlySet<string>>();
    if (grants.projections !== undefined) {
      const byKind = plain(grants.projections, EDGE_MANAGER_PROJECTION_KINDS, EDGE_MANAGER_PROJECTION_KINDS);
      for (const [kind, names] of Object.entries(byKind)) {
        if (!Array.isArray(names) || names.length > 1600 ||
            !names.every(name => typeof name === "string" && /^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name))) throw new Error();
        if (names.length > 0) fields.set(kind as EdgeManagerProjectionKind, new Set(names as string[]));
      }
    }
    const config: Config = Object.freeze({
      origin: origin.origin, hostname: origin.hostname.replace(/^\[|\]$/g, ""),
      tls: Object.freeze({ ca: pem(tls.ca), key: pem(tls.key), cert: pem(tls.cert) }),
      leaf: data.edge_leaf_sha256, profile_id: data.profile_id,
      ...(data.catalogue_sha256 === undefined ? {} : { catalogue_sha256: data.catalogue_sha256 as string }),
      deadline_ms: integer(data.deadline_ms, 10_000),
      response_bytes: integer(data.response_bytes, 2 * EDGE_MANAGER_MAXIMUM_RESPONSE_BYTES),
      max_inflight: integer(data.max_inflight, 16),
      token_provider: data.token_provider as Config["token_provider"],
      catalogue_grant: grants.catalogue === true, fields,
    });
    const brand = Object.freeze(Object.create(null)) as EdgeManagerReadBootstrap;
    issued.set(brand, config);
    return brand;
  } catch { throw fail("EDGE_MANAGER_READ_CONFIG_INVALID"); }
}

export type EdgeManagerReadMeta = Readonly<{
  profile_id: string; catalogue_sha256: string; freshness: string; completeness: string; as_of: string; trace_id: string;
}>;
export interface EdgeManagerProjectionPage {
  readonly kind: EdgeManagerProjectionKind;
  /** Only granted fields; `record_key` is never exposed. */
  readonly items: ReadonlyArray<Readonly<{ relation: Readonly<{ schema: string; relation: string }>;
    fields: Readonly<Record<string, EdgeManagerValue>> }>>;
  readonly next_cursor: string | null;
  /** Count of cells removed by the grant, so a thinned page is never mistaken for the source's own page. */
  readonly withheld_field_cells: number;
}
export interface EdgeManagerCatalogueSummary {
  readonly catalogue_revision: string;
  readonly relation_count: number;
  readonly relations: ReadonlyArray<Readonly<{ schema: string; relation: string; kind: string;
    key_status: string; columns: readonly string[] }>>;
}
export type EdgeManagerReadOutcome<T> =
  | { readonly kind: "AVAILABLE"; readonly meta: EdgeManagerReadMeta; readonly data: T }
  | { readonly kind: "OWNER_UNAVAILABLE"; readonly availability: string; readonly reason_code: string; readonly trace_id: string }
  | { readonly kind: "EDGE_PROBLEM"; readonly status: number; readonly code: EdgeManagerProblemCode | "EDGE_UNAUTHENTICATED" | "EDGE_FORBIDDEN" }
  | { readonly kind: "DENIED"; readonly reason: "CATALOGUE_AUTHORITY_NOT_GRANTED" | "FIELD_AUTHORITY_NOT_GRANTED" }
  | { readonly kind: "ABSENT"; readonly reason: "EDGE_MANAGER_READ_NOT_CONFIGURED" };

export interface EdgeManagerReadPage { limit?: number; cursor?: string }
export interface EdgeManagerReadPort {
  readonly state: "CONFIGURED" | "ABSENT";
  catalogue(): Promise<EdgeManagerReadOutcome<EdgeManagerCatalogueSummary>>;
  projection(kind: EdgeManagerProjectionKind, page?: EdgeManagerReadPage): Promise<EdgeManagerReadOutcome<EdgeManagerProjectionPage>>;
}

const ABSENT = Object.freeze({ kind: "ABSENT", reason: "EDGE_MANAGER_READ_NOT_CONFIGURED" } as const);
/** The unconfigured port: every call answers typed ABSENT and opens no socket. */
export const EDGE_MANAGER_READ_ABSENT: EdgeManagerReadPort = Object.freeze({
  state: "ABSENT" as const,
  catalogue: async () => ABSENT,
  projection: async () => ABSENT,
});
export function createEdgeManagerReadPort(bootstrap: EdgeManagerReadBootstrap | undefined): EdgeManagerReadPort {
  return bootstrap === undefined ? EDGE_MANAGER_READ_ABSENT : new EdgeManagerReadClient(bootstrap);
}

interface Wire { status: number; body: Buffer; ok_headers: boolean }
const BEARER = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

export class EdgeManagerReadClient implements EdgeManagerReadPort {
  readonly state = "CONFIGURED" as const;
  private readonly config: Readonly<Config>;
  private inFlight = 0;
  constructor(bootstrap: EdgeManagerReadBootstrap) {
    const config = typeof bootstrap === "object" && bootstrap !== null ? issued.get(bootstrap) : undefined;
    if (!config) throw fail("EDGE_MANAGER_READ_CONFIG_INVALID");
    this.config = config;
  }
  snapshot(): Readonly<{ in_flight: number }> { return Object.freeze({ in_flight: this.inFlight }); }

  async catalogue(): Promise<EdgeManagerReadOutcome<EdgeManagerCatalogueSummary>> {
    if (!this.config.catalogue_grant) return { kind: "DENIED", reason: "CATALOGUE_AUTHORITY_NOT_GRANTED" };
    const wire = await this.get("/internal/v2/manager/catalogue");
    return this.decode(wire, edgeManagerCatalogueEnvelopeSchema, envelope => ({
      catalogue_revision: envelope.data.catalogue_revision, relation_count: envelope.data.relation_count,
      relations: envelope.data.relations.map(r => ({ schema: r.id.schema, relation: r.id.relation, kind: r.kind,
        key_status: r.key.status, columns: r.safe_columns.map(c => c.name) })),
    }));
  }

  async projection(kind: EdgeManagerProjectionKind, page: EdgeManagerReadPage = {}): Promise<EdgeManagerReadOutcome<EdgeManagerProjectionPage>> {
    if (!(EDGE_MANAGER_PROJECTION_KINDS as readonly string[]).includes(kind)) throw fail("EDGE_MANAGER_READ_REQUEST_INVALID");
    const limit = page.limit ?? EDGE_MANAGER_DEFAULT_PAGE_ROWS;
    if (!Number.isInteger(limit) || limit < 1 || limit > EDGE_MANAGER_MAXIMUM_PAGE_ROWS ||
        page.cursor !== undefined && (typeof page.cursor !== "string" || !/^[A-Za-z0-9_-]{1,4096}$/.test(page.cursor)))
      throw fail("EDGE_MANAGER_READ_REQUEST_INVALID");
    const granted = this.config.fields.get(kind);
    if (!granted) return { kind: "DENIED", reason: "FIELD_AUTHORITY_NOT_GRANTED" };
    const query = `limit=${limit}${page.cursor === undefined ? "" : `&cursor=${page.cursor}`}`;
    const wire = await this.get(`/internal/v2/manager/projections/${kind}?${query}`);
    return this.decode(wire, edgeManagerProjectionEnvelopeSchema, envelope => {
      if (envelope.data.kind !== kind || envelope.data.items.length > limit) throw fail("EDGE_MANAGER_READ_RESPONSE_UNVERIFIED");
      let withheld = 0;
      const items = envelope.data.items.map(item => {
        const kept: Record<string, EdgeManagerValue> = Object.create(null);
        for (const [name, value] of Object.entries(item.fields)) {
          if (granted.has(name)) kept[name] = value as EdgeManagerValue; else withheld++;
        }
        return Object.freeze({ relation: Object.freeze({ ...item.relation }), fields: Object.freeze(kept) });
      });
      return Object.freeze({ kind, items: Object.freeze(items), next_cursor: envelope.data.next_cursor, withheld_field_cells: withheld });
    });
  }

  private decode<E extends { profile_id: string; catalogue_sha256: string; freshness: string; completeness: string; as_of: string;
    trace_id: string }, T>(wire: Wire, schema: { safeParse(value: unknown): { success: true; data: E } | { success: false } },
    project: (envelope: E) => T): EdgeManagerReadOutcome<T> {
    const unverified = fail("EDGE_MANAGER_READ_RESPONSE_UNVERIFIED", true);
    const empty = wire.body.length === 0;
    if (empty) {
      if (wire.status === 401) return { kind: "EDGE_PROBLEM", status: 401, code: "EDGE_UNAUTHENTICATED" };
      if (wire.status === 403) return { kind: "EDGE_PROBLEM", status: 403, code: "EDGE_FORBIDDEN" };
      throw unverified;
    }
    let json: unknown;
    try { json = JSON.parse(new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(wire.body)); } catch { throw unverified; }
    if (wire.status === 200) {
      if (!wire.ok_headers) throw unverified;
      const parsed = schema.safeParse(json);
      if (!parsed.success) throw unverified;
      const e = parsed.data;
      if (e.profile_id !== this.config.profile_id ||
          this.config.catalogue_sha256 !== undefined && e.catalogue_sha256 !== this.config.catalogue_sha256) throw unverified;
      let data: T;
      try { data = project(e); } catch { throw unverified; }
      return { kind: "AVAILABLE", data, meta: Object.freeze({ profile_id: e.profile_id, catalogue_sha256: e.catalogue_sha256,
        freshness: e.freshness, completeness: e.completeness, as_of: e.as_of, trace_id: e.trace_id }) };
    }
    const problem = edgeManagerProblemSchema.safeParse(json);
    if (problem.success) {
      const code = problem.data.error.code;
      if (EDGE_MANAGER_PROBLEM_STATUS[code] !== wire.status) throw unverified;
      return { kind: "EDGE_PROBLEM", status: wire.status, code };
    }
    if (wire.status === 503) {
      const owner = edgeManagerUnavailableSchema.safeParse(json);
      if (!owner.success || !wire.ok_headers || owner.data.profile_id !== this.config.profile_id) throw unverified;
      return { kind: "OWNER_UNAVAILABLE", availability: owner.data.availability, reason_code: owner.data.reason_code,
        trace_id: owner.data.trace_id };
    }
    throw unverified;
  }

  private async get(path: string): Promise<Wire> {
    if (this.inFlight >= this.config.max_inflight) throw fail("EDGE_MANAGER_READ_BUSY");
    this.inFlight++;
    let released = false;
    const release = () => { if (!released) { released = true; this.inFlight--; } };
    try {
      // Minted per call, handed straight to the socket, never retained.
      let bearer: string;
      try {
        bearer = await this.config.token_provider();
        if (typeof bearer !== "string" || Buffer.byteLength(bearer) > EDGE_MANAGER_MAXIMUM_TOKEN_BYTES * 2 || !BEARER.test(bearer))
          throw new Error();
      } catch { release(); throw fail("EDGE_MANAGER_READ_REQUEST_INVALID"); }
      return await this.exchange(path, bearer, release);
    } catch (error) { release(); throw error; }
  }

  private exchange(path: string, bearer: string, release: () => void): Promise<Wire> {
    const cfg = this.config;
    return new Promise<Wire>((resolve, reject) => {
      let req: ClientRequest | undefined, response: IncomingMessage | undefined, socket: TLSSocket | undefined;
      let settled = false, sent = false, tlsAllowed = false, ended = false, finished: Wire | undefined;
      let deadline: ReturnType<typeof setTimeout> | undefined;
      const done = () => { clearTimeout(deadline); release(); };
      const abort = (code: EdgeManagerReadErrorCode = "EDGE_MANAGER_READ_UNAVAILABLE") => {
        if (!settled) { settled = true; reject(fail(code, sent)); }
        try { response?.destroy(); } catch { /* refusal only */ }
        try { req?.destroy(); } catch { /* refusal only */ }
        try { socket?.destroy(); } catch { /* refusal only */ }
        if (!req) done();
      };
      const onError = () => abort();
      deadline = setTimeout(() => abort("EDGE_MANAGER_READ_DEADLINE_EXCEEDED"), cfg.deadline_ms);
      try {
        const alpn: Pick<ConnectionOptions, "ALPNProtocols"> = { ALPNProtocols: ["http/1.1"] };
        const pinned = (cert: { raw?: Buffer }) =>
          !!cert.raw && `sha256:${createHash("sha256").update(cert.raw).digest("hex")}` === cfg.leaf;
        req = request(new URL(path, cfg.origin), { ...cfg.tls, ...alpn, method: "GET", agent: false,
          minVersion: "TLSv1.3", maxVersion: "TLSv1.3", rejectUnauthorized: true,
          ...(isIP(cfg.hostname) ? {} : { servername: cfg.hostname }),
          maxHeaderSize: 8192, insecureHTTPParser: false,
          checkServerIdentity: (host, cert) => checkServerIdentity(host, cert) ?? (pinned(cert) ? undefined : new Error("peer")),
          headers: { accept: "application/json", authorization: `Bearer ${bearer}`, connection: "close" },
        }, res => {
          response = res;
          res.on("error", onError); res.on("aborted", onError);
          if (!sent || !tlsAllowed || res.httpVersion !== "1.1") { abort(); return; }
          const fields = new Map<string, string>();
          if (res.rawHeaders.length % 2 !== 0 || res.rawHeaders.length > 64) { abort(); return; }
          for (let i = 0; i < res.rawHeaders.length; i += 2) {
            const name = res.rawHeaders[i]!, value = res.rawHeaders[i + 1]!;
            if (!/^[A-Za-z0-9-]+$/.test(name) || fields.has(name.toLowerCase()) || /[\r\n\u0000]/.test(value)) { abort(); return; }
            fields.set(name.toLowerCase(), value);
          }
          const length = fields.get("content-length"), status = res.statusCode ?? 0;
          const emptyOk = (status === 401 || status === 403) && length === "0";
          if (fields.has("transfer-encoding") || fields.has("content-encoding") || length === undefined ||
              !/^(?:0|[1-9][0-9]{0,7})$/.test(length) || Number(length) > cfg.response_bytes ||
              length === "0" && !emptyOk ||
              !emptyOk && fields.get("content-type") !== "application/json") { abort(); return; }
          const okHeaders = fields.get("cache-control") === "no-store" && fields.get("x-content-type-options") === "nosniff";
          const expected = Number(length), chunks: Buffer[] = []; let size = 0;
          res.once("close", () => { if (!ended) abort(); });
          res.on("data", (chunk: unknown) => {
            if (settled) return;
            if (!Buffer.isBuffer(chunk)) { abort(); return; }
            size += chunk.length;
            if (size > expected) { abort(); return; }
            chunks.push(Buffer.from(chunk));
          });
          res.once("end", () => {
            ended = true;
            if (settled) return;
            if (!res.complete || size !== expected) { abort(); return; }
            finished = { status, body: Buffer.concat(chunks, size), ok_headers: okHeaders };
          });
        });
        req.maxHeadersCount = 0;
        req.on("error", onError);
        req.once("close", () => {
          if (!settled && finished) { settled = true; done(); resolve(finished); }
          else { if (!settled) abort(); done(); }
        });
        req.once("socket", candidate => {
          if (!(candidate instanceof TLSSocket)) { abort(); return; }
          socket = candidate; socket.on("error", onError);
          socket.once("secureConnect", () => {
            if (settled || sent) return;
            try {
              if (!socket || !socket.authorized || socket.getProtocol() !== "TLSv1.3" ||
                  socket.alpnProtocol && socket.alpnProtocol !== "http/1.1") throw new Error();
              const cert = socket.getPeerCertificate();
              if (checkServerIdentity(cfg.hostname, cert) || !pinned(cert)) throw new Error();
              tlsAllowed = true; sent = true; // before end(): a synchronous throw may still follow a partial send
              req!.end();
            } catch { abort(); }
          });
        });
        // No end()/write()/flushHeaders() outside the secureConnect handler above.
      } catch { abort(); }
    });
  }
}
