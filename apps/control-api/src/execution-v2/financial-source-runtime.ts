/** Opt-in private Research/Paper configuration. Preparation reads pinned files
 * only: it creates no key, session, context, lease, grant, DB client or listener.
 * Identity assertions are not PM financial-purpose proofs. */
import { createPrivateKey, X509Certificate } from "node:crypto";
import { isIP } from "node:net";
import { isAbsolute, normalize } from "node:path";
import { createSecureContext } from "node:tls";
import { exportJWK, importPKCS8, importSPKI } from "jose";
import { z } from "zod";
import type { CorePoolProfile } from "../db/pool";
import type { AccessActor } from "./access.contract";
import { nativeCoreSchemaTarget, type NativeCoreSchemaTarget } from "./current-human-schema";
import { financialSourceAssertionRequest } from "./financial-source-assertion";
import type { FinancialSourceCompositionConfig, FinancialSourceListenerTargets } from "./financial-source-composition";
import type { CurrentHumanRecoveryClientConfig } from "./current-human-recovery-client";
import { readNativeRuntimeReference } from "./native-core-runtime";

export class FinancialSourceRuntimeError extends Error {
  readonly code = "FINANCIAL_SOURCE_RUNTIME_CONFIG_INVALID";
  constructor() { super("The private financial source runtime configuration is not available."); }
}
const fail = (): never => { throw new FinancialSourceRuntimeError(); };
const text = z.string().min(1).max(128).refine(value => value === value.trim() &&
  !/[\u0000-\u0020\u007f-\u009f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/u.test(value) &&
  Buffer.from(value, "utf8").toString("utf8") === value);
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const pin = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const path = z.string().min(1).max(4096).refine(value => isAbsolute(value) && normalize(value) === value &&
  !/[\u0000-\u001f\u007f]/u.test(value) && Buffer.from(value, "utf8").toString("utf8") === value);
const reference = z.object({ path, sha256: hash }).strict();
export type FinancialSourceRuntimeReference = z.infer<typeof reference>;
const positive = z.number().int().positive().safe();
const poolProfile = z.object({ max: positive.max(10), connectionTimeoutMillis: positive.max(60_000),
  statement_timeout: positive.max(60_000), query_timeout: positive.max(60_000),
  idle_in_transaction_session_timeout: positive.max(60_000) }).strict()
  .refine(profile => profile.query_timeout > profile.statement_timeout);
const privateIP = z.string().refine(host => isIP(host) === 4
  ? /^(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2[0-9]|3[01])\.)/u.test(host)
  : isIP(host) === 6 && (host === "::1" || /^(?:fc|fd)/iu.test(host)));
const dns = z.string().regex(/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u);
const tls = z.object({ key_ref: reference, cert_ref: reference, ca_ref: reference, server_name: dns }).strict();
const listener = z.object({ host: privateIP, port: positive.max(65535) }).strict();
const privateOrigin = z.string().max(2048).refine(value => {
  try { const url = new URL(value);
    return /^https:\/\/[^/?#\\\s]+\/?$/u.test(value) && !url.username && !url.password && !url.search && !url.hash &&
      url.pathname === "/" && privateIP.safeParse(url.hostname.replace(/^\[|\]$/gu, "")).success;
  } catch { return false; }
});
const actor = z.object({ user_id: text, session_id: text, session_generation: z.number().int().nonnegative().safe() }).strict();
const sourceSelection = z.object({ workspace_id: text, environment: z.literal("paper"), workload_id: text,
  receiver_id: financialSourceAssertionRequest.shape.receiver_id, binding_digest: pin,
  paths: z.array(financialSourceAssertionRequest.shape.path).length(6)
    .refine(paths => new Set(paths).size === paths.length) }).strict();

/** Exact private selection, not a public API or an authority/config default. */
export const financialSourceRuntimeManifest = z.object({
  schema_version: z.literal("portal.execution.financial-source-runtime.v1"),
  target: z.object({ kind: z.literal("RESEARCH"), environment: z.literal("paper") }).strict(),
  schema_target: nativeCoreSchemaTarget,
  pool_profile: poolProfile,
  actor,
  listeners: z.object({ assertion: listener, reverse: listener }).strict(),
  candidate: z.object({ issuer: text, audience: text, key_id: text, private_key_ref: reference,
    source: z.object({ issuer: text, audience: text, key_id: text, public_key_ref: reference, workload_id: text }).strict(),
    limits: z.object({ ttl_ms: positive.min(1000).max(30_000), maximum_unresolved: positive.max(128),
      maximum_retained: positive.max(4096) }).strict().refine(value => value.maximum_retained >= value.maximum_unresolved),
    installation_scope: z.object({ workspace_id: text, environment: z.literal("paper"), valid_until_ms: positive }).strict(),
  }).strict(),
  assertion_limits: z.object({ ttl_ms: positive.max(300_000), maximum_contexts: positive.max(128),
    maximum_requests_per_context: positive.max(64) }).strict(),
  assertion_transport: z.object({ tls, peer: z.object({ certificate_sha256: pin, dns_name: dns, workload_id: text }).strict(),
    limits: z.object({ maximum_in_flight: positive.max(16), request_bytes: positive.min(256).max(2_129_920),
      response_bytes: positive.min(256).max(65_536), deadline_ms: positive.max(5000) }).strict() }).strict(),
  current_human_transport: z.object({ tls, source_certificate_sha256: pin,
    limits: z.object({ maximum_in_flight: positive.max(16), request_bytes: positive.min(256).max(32_768),
      deadline_ms: positive.max(10_000) }).strict() }).strict(),
  // Outbound recovery has its OWN explicit client identity and Edge gateway.
  // Inbound assertion credentials never imply permission to recover a source.
  recovery: z.object({ origin: privateOrigin, tls, source_certificate_sha256: pin,
    deadline_ms: positive.max(10_000), response_bytes: positive.min(256).max(32_768) }).strict(),
  source_selection: sourceSelection,
  shutdown_deadline_ms: positive.max(5000),
}).strict();

export interface PreparedFinancialSourceRuntime {
  readonly poolProfile: Readonly<CorePoolProfile>;
  /** Caller MUST assertRegisteredResearchCurrentHumanSchema on the actual pool
   * before composition. Parsing this private pin does not verify a database. */
  readonly schemaTarget: Readonly<NativeCoreSchemaTarget>;
  /** Server-owned exact pin; re-read/validate the real session before use. */
  readonly actor: Readonly<AccessActor>;
  readonly config: FinancialSourceCompositionConfig;
  readonly recovery: CurrentHumanRecoveryClientConfig;
  readonly listeners: Readonly<FinancialSourceListenerTargets>;
}

/** Both absent is OFF and performs no I/O. Empty/partial/malformed is refusal. */
export function financialSourceRuntimeReference(env: NodeJS.ProcessEnv = process.env): FinancialSourceRuntimeReference | undefined {
  const selected = env.CONTROL_API_FINANCIAL_SOURCE_CONFIG_FILE, sha256 = env.CONTROL_API_FINANCIAL_SOURCE_CONFIG_SHA256;
  if (selected === undefined && sha256 === undefined) return undefined;
  try { return reference.parse({ path: selected, sha256 }); } catch { return fail(); }
}

function certificates(raw: Buffer): X509Certificate[] {
  const source = new TextDecoder("utf-8", { fatal: true }).decode(raw);
  const blocks = source.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu);
  if (!blocks?.length || blocks.length > 32 || blocks.join("").replace(/\s/gu, "") !== source.replace(/\s/gu, "")) return fail();
  const now = Date.now();
  return blocks.map(block => {
    const certificate = new X509Certificate(block);
    if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) return fail();
    return certificate;
  });
}

export async function prepareFinancialSourceRuntime(input: FinancialSourceRuntimeReference): Promise<PreparedFinancialSourceRuntime> {
  const originals: Buffer[] = [], outputs: Buffer[] = [];
  let complete = false;
  try {
    const read = async (ref: FinancialSourceRuntimeReference, maximum: number) => {
      const bytes = await readNativeRuntimeReference(ref, maximum); originals.push(bytes); return bytes;
    };
    const bytes = await read(reference.parse(input), 65_536);
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!Buffer.from(JSON.stringify(value), "utf8").equals(bytes)) return fail();
    const selected = financialSourceRuntimeManifest.parse(value), selection = selected.source_selection;
    const target = selected.schema_target, principal = target.principal_workspace_pins[0]!;
    for (const value of [target.database_name, target.role_name, target.protected_owner_user_id, target.workspace_id,
      principal.user_id, principal.workspace_id]) text.parse(value);
    if (selection.workspace_id !== selected.candidate.installation_scope.workspace_id || selection.workspace_id !== target.workspace_id ||
      principal.workspace_id !== target.workspace_id || principal.user_id !== selected.actor.user_id ||
      selection.workload_id !== selected.candidate.source.workload_id || selection.workload_id !== selected.assertion_transport.peer.workload_id ||
      selected.listeners.assertion.host === selected.listeners.reverse.host && selected.listeners.assertion.port === selected.listeners.reverse.port)
      return fail();
    const privateKey = await importPKCS8(new TextDecoder("utf-8", { fatal: true }).decode(await read(selected.candidate.private_key_ref, 16_384)), "EdDSA");
    const publicKey = await importSPKI(new TextDecoder("utf-8", { fatal: true }).decode(await read(selected.candidate.source.public_key_ref, 16_384)), "EdDSA");
    const own = await exportJWK(privateKey), source = await exportJWK(publicKey);
    if (own.kty !== "OKP" || own.crv !== "Ed25519" || typeof own.d !== "string" ||
      source.kty !== "OKP" || source.crv !== "Ed25519" || source.d !== undefined || own.x === source.x) return fail();
    const hydrate = async (pins: z.infer<typeof tls>, usage: "server" | "client" = "server") => {
      const copy = async (ref: FinancialSourceRuntimeReference) => { const bytes = Buffer.from(await read(ref, 32_768)); outputs.push(bytes); return bytes; };
      const key = await copy(pins.key_ref), cert = await copy(pins.cert_ref), ca = await copy(pins.ca_ref);
      const chain = certificates(cert), roots = certificates(ca), leaf = chain[0]!;
      if (leaf.ca || roots.some(root => !root.ca) || !leaf.checkPrivateKey(createPrivateKey(key)) || !leaf.keyUsage?.includes(usage === "server" ? "1.3.6.1.5.5.7.3.1" : "1.3.6.1.5.5.7.3.2") ||
        leaf.checkHost(pins.server_name, { subject: "never", wildcards: false }) !== pins.server_name) return fail();
      for (let i = 0; i < chain.length - 1; i++) {
        const child = chain[i]!, issuer = chain[i + 1]!;
        if (!issuer.ca || !child.checkIssued(issuer) || !child.verify(issuer.publicKey)) return fail();
      }
      const last = chain[chain.length - 1]!;
      if (!roots.some(root => last.checkIssued(root) && last.verify(root.publicKey))) return fail();
      createSecureContext({ key, cert, ca, minVersion: "TLSv1.3", maxVersion: "TLSv1.3" });
      return { key, cert, ca };
    };
    const assertionTls = await hydrate(selected.assertion_transport.tls), reverseTls = await hydrate(selected.current_human_transport.tls);
    const recoveryTls = await hydrate(selected.recovery.tls, "client");
    const { private_key_ref: _privateRef, source: sourceConfig, ...candidate } = selected.candidate;
    const { public_key_ref: _publicRef, ...sourceFields } = sourceConfig;
    const config: FinancialSourceCompositionConfig = {
      candidate: { ...candidate, private_key: privateKey, source: { ...sourceFields, public_key: publicKey } },
      assertion_limits: { ...selected.assertion_limits },
      assertion_transport: { ...selected.assertion_transport, tls: assertionTls },
      current_human_transport: { ...selected.current_human_transport, tls: reverseTls },
      source_selection: { ...selection, paths: [...selection.paths] }, shutdown_deadline_ms: selected.shutdown_deadline_ms,
    };
    // Expired installation remains readable for SAME-key recovery only. The
    // actual candidate's DB-clock fences still refuse fresh ISSUE/ENTER.
    complete = true;
    return Object.freeze({ poolProfile: Object.freeze({ ...selected.pool_profile }), schemaTarget: Object.freeze(structuredClone(target)),
      actor: Object.freeze({ ...selected.actor }), config,
      recovery: { ...selected.recovery, tls: recoveryTls },
      listeners: Object.freeze({ assertion: Object.freeze({ ...selected.listeners.assertion }), reverse: Object.freeze({ ...selected.listeners.reverse }) }) });
  } catch { return fail(); }
  finally { originals.forEach(bytes => bytes.fill(0)); if (!complete) outputs.forEach(bytes => bytes.fill(0)); }
}
