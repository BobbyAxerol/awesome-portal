import { X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { isAbsolute, normalize } from "node:path";
import { createSecureContext } from "node:tls";
import { z } from "zod";
import type { CorePoolProfile } from "../db/pool";
import type { CurrentViewCompositionConfig } from "./current-view-composition";
import { readNativeRuntimeReference } from "./native-core-runtime";

export class CurrentViewRuntimeError extends Error {
  readonly code = "CURRENT_VIEW_RUNTIME_CONFIG_INVALID";
  constructor() { super("The private current-view runtime configuration is not available."); }
}
const fail = (): never => { throw new CurrentViewRuntimeError(); };
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const path = z.string().min(1).max(4096).refine(value => isAbsolute(value) && normalize(value) === value && !/[\u0000-\u001f\u007f]/u.test(value));
/** `path` is the shared runtime spelling for an absoluteNormalizedPath. */
const reference = z.object({ path, sha256: hash }).strict();
export type CurrentViewRuntimeReference = z.infer<typeof reference>;
const positive = z.number().int().positive().safe();
const poolProfile = z.object({ max: positive.max(10), connectionTimeoutMillis: positive.max(5000),
  statement_timeout: positive.max(5000), query_timeout: positive.max(5000), idle_in_transaction_session_timeout: positive.max(5000) })
  .strict().refine(profile => profile.query_timeout > profile.statement_timeout);
const privateIP = z.string().refine(host => isIP(host) === 4
  ? /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host)
  : isIP(host) === 6 && (host === "::1" || /^(?:fc|fd)/iu.test(host)));
const dns = z.string().regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u);
const text = z.string().min(1).max(256).refine(value => !/[\u0000-\u001f\u007f]/u.test(value));
const peer = z.object({ certificate_sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/u), dns_name: dns }).strict();
const tls = z.object({ key_ref: reference, cert_ref: reference, ca_ref: reference }).strict();
const origin = z.string().max(2048).refine(value => {
  try {
    const parsed = new URL(value);
    return /^https:\/\/[^/?#\\\s]+\/?$/u.test(value) && !parsed.username && !parsed.password && parsed.pathname === "/" && !parsed.search && !parsed.hash;
  } catch { return false; }
});
/** Private canonical-JSON manifest, not an HTTP/browser or production default.
 * Research/Paper is an explicit approved installation ceiling, not proof that
 * a process/database/Edge binding actually belongs to that target. */
export const currentViewRuntimeManifest = z.object({
  schema_version: z.literal("portal.execution.current-view-runtime.v1"),
  target: z.object({ kind: z.literal("RESEARCH"), environment: z.literal("paper") }).strict(),
  pool_profile: poolProfile,
  listener: z.object({ host: privateIP, port: positive.max(65535) }).strict(),
  authority: z.object({ ttl_ms: positive.max(300000), maximum_contexts: positive.max(2000) }).strict(),
  transport: z.object({ tls, peer: peer.extend({ workload_id: text }).strict(),
    limits: z.object({ maximum_in_flight: positive.max(16), request_bytes: positive.min(256).max(8192),
      response_bytes: positive.min(256).max(65536), deadline_ms: positive.max(5000) }).strict() }).strict(),
  edge: z.object({ origin, tls, peer,
    limits: z.object({ maximum_in_flight: positive.max(16), response_bytes: positive.max(1048576), deadline_ms: positive.max(5000) }).strict() }).strict(),
  shutdown_deadline_ms: positive.max(5000),
}).strict();
export interface PreparedCurrentViewRuntime {
  readonly poolProfile: Readonly<CorePoolProfile>;
  readonly config: CurrentViewCompositionConfig;
  readonly listener: { readonly host: string; readonly port: number };
}

/** Opt-in pair only; partial/empty/malformed values refuse startup. No file,
 * credential, policy or service is touched when BOTH names are absent. */
export function currentViewRuntimeReference(env: NodeJS.ProcessEnv = process.env): CurrentViewRuntimeReference | undefined {
  const selected = env.CONTROL_API_CURRENT_VIEW_CONFIG_FILE, sha256 = env.CONTROL_API_CURRENT_VIEW_CONFIG_SHA256;
  if (selected === undefined && sha256 === undefined) return undefined;
  try { return reference.parse({ path: selected, sha256 }); } catch { return fail(); }
}

function certificates(bytes: Buffer): X509Certificate[] {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const blocks = source.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu);
  if (!blocks?.length || blocks.length > 32 || blocks.join("").replace(/\s/gu, "") !== source.replace(/\s/gu, "")) return fail();
  const now = Date.now();
  return blocks.map(block => {
    const cert = new X509Certificate(block), before = Date.parse(cert.validFrom), until = Date.parse(cert.validTo);
    if (!Number.isFinite(before) || !Number.isFinite(until) || now < before || now >= until) return fail();
    return cert;
  });
}

/** Shared native runtime reader enforces effective UID, 0400/0600, bounded
 * regular leaf, O_NOFOLLOW, stable fstat inode/size and the exact SHA256.
 * Raw input buffers are wiped even on parse/hydration failure; successful
 * output TLS copies belong to the caller until its composition copies them.
 * No listener, source request, account/grant mutation or trust issuance. */
export async function prepareCurrentViewRuntime(input: CurrentViewRuntimeReference): Promise<PreparedCurrentViewRuntime> {
  const originals: Buffer[] = [], outputs: Buffer[] = [];
  let complete = false;
  try {
    const bytes = await readNativeRuntimeReference(reference.parse(input), 65536); originals.push(bytes);
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    // Same compact canonical encoding as the existing native runtime loader;
    // catches duplicate keys, formatting/escape alternatives and lossy UTF8.
    if (!Buffer.from(JSON.stringify(value), "utf8").equals(bytes)) return fail();
    const selected = currentViewRuntimeManifest.parse(value);
    const hydrate = async (pins: z.infer<typeof tls>, usage: "serverAuth" | "clientAuth") => {
      const read = async (pin: CurrentViewRuntimeReference) => {
        const raw = await readNativeRuntimeReference(pin, 32768); originals.push(raw);
        const copy = Buffer.from(raw); outputs.push(copy); return copy;
      };
      const key = await read(pins.key_ref), cert = await read(pins.cert_ref), ca = await read(pins.ca_ref);
      const chain = certificates(cert), roots = certificates(ca), leaf = chain[0]!;
      if (leaf.ca || roots.some(root => !root.ca) || !leaf.keyUsage?.includes(usage === "serverAuth" ? "1.3.6.1.5.5.7.3.1" : "1.3.6.1.5.5.7.3.2")) return fail();
      // Real PEM parse/key match; peer SAN/leaf pin remain checked at EACH
      // TLS connection, not asserted from this configuration declaration.
      createSecureContext({ key, cert, ca, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });
      return { key, cert, ca };
    };
    const inbound = await hydrate(selected.transport.tls, "serverAuth"), outbound = await hydrate(selected.edge.tls, "clientAuth");
    const config: CurrentViewCompositionConfig = { authority: { ...selected.authority }, shutdown_deadline_ms: selected.shutdown_deadline_ms,
      transport: { ...selected.transport, tls: inbound }, edge: { ...selected.edge, tls: outbound } };
    complete = true;
    return Object.freeze({ config, listener: Object.freeze({ ...selected.listener }), poolProfile: Object.freeze({ ...selected.pool_profile }) });
  } catch { return fail(); }
  finally { originals.forEach(bytes => bytes.fill(0)); if (!complete) outputs.forEach(bytes => bytes.fill(0)); }
}
