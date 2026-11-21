/** Explicit Research/Paper private commissioning input. No env-driven startup,
 * listener, source authority, registration or request is created on import. */
import { createPrivateKey, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { isAbsolute, normalize } from "node:path";
import { createSecureContext } from "node:tls";
import { z } from "zod";
import { nativeRootCanonical, nativeRootDecode } from "./native-root-codec";
import { readNativeRuntimeReference } from "./native-core-runtime";
import { ResearchMembershipDiscoveryClient } from "./research-membership-discovery-client";

const text = z.string().min(1).max(512).refine(v => v === v.trim() &&
  !/[\u0000-\u001f\u007f]/.test(v) && Buffer.byteLength(v, "utf8") <= 256);
const pin = z.object({ path: z.string().min(1).max(4096).refine(v => isAbsolute(v) && normalize(v) === v),
  sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const origin = z.string().max(2048).refine(value => {
  try {
    const url = new URL(value), host = url.hostname.replace(/^\[|\]$/g, "");
    return url.protocol === "https:" && !url.username && !url.password && url.pathname === "/" && !url.search && !url.hash
      && (isIP(host) === 4 ? /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/.test(host)
        : isIP(host) === 6 && (host === "::1" || /^(?:fc|fd)/i.test(host)));
  } catch { return false; }
});
const bounded = z.number().int().positive().safe();
export const researchMembershipDiscoveryManifest = z.object({
  schema_version: z.literal("portal.research-membership-discovery-runtime.v1"),
  target: z.object({ kind: z.literal("RESEARCH"), environment: z.literal("paper"),
    human_issuer: text, subject: text, workspace_id: text, workload_id: text }).strict(),
  transport: z.object({ origin, edge_leaf_sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    wire_version: z.enum(["v1", "v2"]).optional(),
    key_ref: pin, cert_ref: pin, ca_ref: pin, deadline_ms: bounded.max(10000),
    response_bytes: bounded.max(32768), max_inflight: bounded.max(16) }).strict(),
  not_before_utc_ms: bounded, expires_at_utc_ms: bounded,
}).strict().superRefine((v, ctx) => {
  if (v.not_before_utc_ms >= v.expires_at_utc_ms || v.expires_at_utc_ms - v.not_before_utc_ms > 86_400_000
    || new Set([v.transport.key_ref.path, v.transport.cert_ref.path, v.transport.ca_ref.path]).size !== 3)
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "RESEARCH_DISCOVERY_RUNTIME_BOUNDS" });
});
export class ResearchMembershipDiscoveryRuntimeError extends Error {
  readonly code = "RESEARCH_DISCOVERY_RUNTIME_INVALID";
  constructor() { super("The Research discovery commissioning input is unavailable."); }
}
function certificates(bytes: Buffer): X509Certificate[] {
  const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const blocks = value.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
  if (!blocks?.length || blocks.length > 16 || blocks.join("").replace(/\s/g, "") !== value.replace(/\s/g, ""))
    throw new ResearchMembershipDiscoveryRuntimeError();
  const now = Date.now();
  return blocks.map(block => { const cert = new X509Certificate(block);
    if (now < Date.parse(cert.validFrom) || now >= Date.parse(cert.validTo))
      throw new ResearchMembershipDiscoveryRuntimeError();
    return cert;
  });
}

/** Caller supplies independent expected identity/workspace and pinned private
 * manifest; caller must dispose the returned client after its finite use. */
export async function prepareResearchMembershipDiscovery(reference: z.infer<typeof pin>,
  expected: { human_issuer: string; subject: string; workspace_id: string }): Promise<{
    client: ResearchMembershipDiscoveryClient; dispose: () => void;
  }> {
  const held: Buffer[] = [];
  try {
    const read = async (ref: z.infer<typeof pin>, limit: number) => {
      const bytes = await readNativeRuntimeReference(pin.parse(ref), limit); held.push(bytes); return bytes;
    };
    const raw = await read(reference, 32768), decoded = nativeRootDecode(raw, 32768);
    if (nativeRootCanonical(decoded) !== raw.toString("utf8")) throw new Error();
    const manifest = researchMembershipDiscoveryManifest.parse(decoded), now = Date.now();
    if (now < manifest.not_before_utc_ms || now >= manifest.expires_at_utc_ms
      || manifest.target.human_issuer !== expected.human_issuer || manifest.target.subject !== expected.subject
      || manifest.target.workspace_id !== expected.workspace_id) throw new Error();
    const key = await read(manifest.transport.key_ref, 32768), cert = await read(manifest.transport.cert_ref, 32768),
      ca = await read(manifest.transport.ca_ref, 32768);
    const chain = certificates(cert), roots = certificates(ca), leaf = chain[0]!;
    if (leaf.ca || roots.some(root => !root.ca) || !leaf.keyUsage?.includes("1.3.6.1.5.5.7.3.2")
      || !leaf.checkPrivateKey(createPrivateKey(key))) throw new Error();
    for (let i = 0; i < chain.length - 1; i++) {
      const child = chain[i]!, issuer = chain[i + 1]!;
      if (!issuer.ca || !child.checkIssued(issuer) || !child.verify(issuer.publicKey)) throw new Error();
    }
    createSecureContext({ key, cert, ca, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });
    const client = new ResearchMembershipDiscoveryClient({ origin: manifest.transport.origin,
      wire_version: manifest.transport.wire_version,
      source_certificate_sha256: manifest.transport.edge_leaf_sha256,
      human_issuer: manifest.target.human_issuer, subject: manifest.target.subject,
      workspace_id: manifest.target.workspace_id, workload_id: manifest.target.workload_id,
      deadline_ms: manifest.transport.deadline_ms, response_bytes: manifest.transport.response_bytes,
      max_inflight: manifest.transport.max_inflight, installation_expires_at_utc_ms: manifest.expires_at_utc_ms,
      tls: { key, cert, ca } });
    let disposed = false;
    return { client, dispose: () => { if (!disposed) { disposed = true; held.forEach(bytes => bytes.fill(0)); } } };
  } catch { held.forEach(bytes => bytes.fill(0)); throw new ResearchMembershipDiscoveryRuntimeError(); }
}
