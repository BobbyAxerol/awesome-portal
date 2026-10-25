/** Private opt-in Research/Paper STATUS configuration. Preparation reads exact
 * installed bytes only; it does not qualify an Edge gateway, create a human,
 * original/attempt/grant, contact a source or open either private listener. */
import { createPrivateKey, X509Certificate } from "node:crypto";
import { createSecureContext } from "node:tls";
import { exportJWK, importPKCS8, importSPKI } from "jose";
import { z } from "zod";
import type { CorePoolProfile } from "../db/pool";
import type { NativeCoreSchemaTarget } from "./current-human-schema";
import type { CurrentHumanRecoveryClientConfig } from "./current-human-recovery-client";
import { EDGE_CAPITAL_OPERATIONS } from "./edge-command-adapter";
import { inspectEdgeCommandGatewayBinding } from "./edge-command-gateway-binding";
import type { CommandStatusCompositionConfig, CommandStatusListenerTargets } from "./command-status-composition";
import { financialSourceRuntimeManifest } from "./financial-source-runtime";
import { readNativeRuntimeReference } from "./native-core-runtime";
import { parseCompactJson } from "./private-root-file";

export class CommandStatusRuntimeError extends Error {
  readonly code = "COMMAND_STATUS_RUNTIME_CONFIG_INVALID";
  constructor() { super("The private command STATUS runtime configuration is not available."); }
}
const fail = (): never => { throw new CommandStatusRuntimeError(); };
// Reuse the already reviewed neutral private-file/schema/pool/TLS shapes, NOT
// the financial purpose, source selection, issuer or authority composition.
const common = financialSourceRuntimeManifest.shape;
const text = common.candidate.shape.issuer;
// A bare `$` also matches before a final LF in JavaScript. Reject that at the
// env/reference boundary itself, before the private reader performs any I/O.
const reference = common.candidate.shape.private_key_ref.extend({ sha256: z.string().length(64).regex(/^[a-f0-9]{64}$/u) }).strict();
const tls = common.assertion_transport.shape.tls;
const positive = z.number().int().positive().safe();
const pin = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const gatewayBinding = z.object({
  selection: z.object({ gateway_ref: text, qualification: z.literal("OWNER_VERIFIED"),
    operations: z.array(z.enum(EDGE_CAPITAL_OPERATIONS)).min(1).max(8).refine(items => new Set(items).size === items.length),
    recovery: z.enum(["UNCOMMISSIONED", "EXPLICIT_SERVICE_STATUS_ONLY"]) }).strict(),
  scope: z.object({ workspace_id: text, environment: z.literal("paper"), authority_ref: text, profile_ref: text }).strict(),
  edge_contract: z.object({ reference: text, sha256: z.string().regex(/^[a-f0-9]{64}$/u), edge_source_revision: text }).strict(),
  requester_status: z.literal("FRESH_CURRENT_HUMAN"),
}).strict();

export const commandStatusRuntimeManifest = z.object({
  schema_version: z.literal("portal.execution.command-status-runtime.v1"),
  target: common.target,
  schema_target: common.schema_target,
  pool_profile: common.pool_profile,
  listeners: common.listeners,
  candidate: common.candidate,
  authority: z.object({ issuer: text, audience: text, key_id: text, private_key_ref: reference,
    workload_id: text, ttl_ms: positive.min(1000).max(30_000), maximum_contexts: positive.max(128),
    maximum_requests_per_context: positive.max(64) }).strict(),
  assertion_transport: common.assertion_transport,
  current_human_transport: common.current_human_transport,
  // This independently installed service recovery identity addresses EDGE only.
  // It is not requester STATUS, submit authority or a second HUMAN credential.
  recovery: common.recovery,
  gateway_binding: gatewayBinding,
  edge_transport: z.object({ mode: z.literal("EXPLICIT_CURRENT_REQUESTER_STATUS_ONLY"), origin: common.recovery.shape.origin,
    gateway_ref: text, tls, peer: common.assertion_transport.shape.peer.omit({ workload_id: true }),
    limits: z.object({ maximum_in_flight: positive.max(16), deadline_ms: positive.max(5000),
      request_bytes: positive.max(131_072), response_bytes: positive.max(1_048_576), maximum_originals: positive.max(128) }).strict(),
  }).strict(),
  shutdown_deadline_ms: common.shutdown_deadline_ms,
}).strict();

export type CommandStatusRuntimeReference = z.infer<typeof reference>;
export interface PreparedCommandStatusRuntime {
  readonly poolProfile: Readonly<CorePoolProfile>;
  readonly schemaTarget: Readonly<NativeCoreSchemaTarget>;
  readonly config: CommandStatusCompositionConfig;
  readonly recovery: CurrentHumanRecoveryClientConfig;
  readonly listeners: Readonly<CommandStatusListenerTargets>;
}

/** Both absent is OFF without I/O; malformed/partial never selects a default. */
export function commandStatusRuntimeReference(env: NodeJS.ProcessEnv = process.env): CommandStatusRuntimeReference | undefined {
  const path = env.CONTROL_API_COMMAND_STATUS_CONFIG_FILE, sha256 = env.CONTROL_API_COMMAND_STATUS_CONFIG_SHA256;
  if (path === undefined && sha256 === undefined) return undefined;
  try { return reference.parse({ path, sha256 }); } catch { return fail(); }
}

function certificates(bytes: Buffer): X509Certificate[] {
  const raw = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const blocks = raw.match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/gu);
  if (!blocks?.length || blocks.length > 32 || blocks.join("").replace(/\s/gu, "") !== raw.replace(/\s/gu, "")) return fail();
  const now = Date.now();
  return blocks.map(block => {
    const certificate = new X509Certificate(block);
    if (now < Date.parse(certificate.validFrom) || now >= Date.parse(certificate.validTo)) return fail();
    return certificate;
  });
}

export async function prepareCommandStatusRuntime(input: CommandStatusRuntimeReference): Promise<PreparedCommandStatusRuntime> {
  const originals: Buffer[] = [], outputs: Buffer[] = [];
  let complete = false;
  try {
    const read = async (ref: CommandStatusRuntimeReference, maximum: number) => {
      const bytes = await readNativeRuntimeReference(ref, maximum); originals.push(bytes); return bytes;
    };
    const selected = commandStatusRuntimeManifest.parse(parseCompactJson(await read(reference.parse(input), 65_536)));
    const target = selected.schema_target, principal = target.principal_workspace_pins[0]!;
    for (const id of [target.database_name, target.role_name, target.protected_owner_user_id, target.workspace_id,
      principal.user_id, principal.workspace_id]) text.parse(id);
    const candidate = selected.candidate, authority = selected.authority, gateway = selected.gateway_binding;
    if (target.principal_workspace_pins.length !== 1 || principal.user_id !== target.protected_owner_user_id ||
      gateway.scope.workspace_id !== target.workspace_id || principal.workspace_id !== target.workspace_id ||
      candidate.installation_scope.workspace_id !== target.workspace_id || candidate.source.workload_id !== authority.workload_id ||
      authority.workload_id !== selected.assertion_transport.peer.workload_id ||
      authority.audience !== gateway.selection.gateway_ref || selected.edge_transport.gateway_ref !== gateway.selection.gateway_ref ||
      inspectEdgeCommandGatewayBinding(gateway).state === "REFUSED" ||
      authority.key_id === candidate.key_id || authority.key_id === candidate.source.key_id ||
      selected.listeners.assertion.host === selected.listeners.reverse.host && selected.listeners.assertion.port === selected.listeners.reverse.port)
      return fail();
    const privateKey = async (ref: CommandStatusRuntimeReference) => importPKCS8(
      new TextDecoder("utf-8", { fatal: true }).decode(await read(ref, 16_384)), "EdDSA");
    const candidateKey = await privateKey(candidate.private_key_ref), statusKey = await privateKey(authority.private_key_ref);
    const sourceKey = await importSPKI(new TextDecoder("utf-8", { fatal: true })
      .decode(await read(candidate.source.public_key_ref, 16_384)), "EdDSA");
    const keys = await Promise.all([candidateKey, statusKey, sourceKey].map(key => exportJWK(key)));
    if (keys.some(key => key.kty !== "OKP" || key.crv !== "Ed25519") ||
      keys[0]!.d === undefined || keys[1]!.d === undefined || keys[2]!.d !== undefined ||
      new Set(keys.map(key => key.x)).size !== 3) return fail();
    const hydrate = async (pins: z.infer<typeof tls>, usage: "server" | "client") => {
      const copy = async (ref: CommandStatusRuntimeReference) => {
        const value = Buffer.from(await read(ref, 32_768)); outputs.push(value); return value;
      };
      const key = await copy(pins.key_ref), cert = await copy(pins.cert_ref), ca = await copy(pins.ca_ref);
      const chain = certificates(cert), roots = certificates(ca), leaf = chain[0]!;
      if (leaf.ca || roots.some(root => !root.ca) || !leaf.checkPrivateKey(createPrivateKey(key)) ||
        !leaf.keyUsage?.includes(usage === "server" ? "1.3.6.1.5.5.7.3.1" : "1.3.6.1.5.5.7.3.2") ||
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
    const assertionTls = await hydrate(selected.assertion_transport.tls, "server");
    const reverseTls = await hydrate(selected.current_human_transport.tls, "server");
    const recoveryTls = await hydrate(selected.recovery.tls, "client"), edgeTls = await hydrate(selected.edge_transport.tls, "client");
    const { private_key_ref: _candidateRef, source: sourceConfig, ...candidateFields } = candidate;
    const { public_key_ref: _sourceRef, ...sourceFields } = sourceConfig;
    const { private_key_ref: _authorityRef, ...authorityFields } = authority;
    const config: CommandStatusCompositionConfig = {
      candidate: { ...candidateFields, private_key: candidateKey, source: { ...sourceFields, public_key: sourceKey } },
      authority: { ...authorityFields, key: statusKey },
      assertion_transport: { ...selected.assertion_transport, tls: assertionTls },
      current_human_transport: { ...selected.current_human_transport, tls: reverseTls },
      gateway_binding: structuredClone(gateway), edge_transport: { ...selected.edge_transport, tls: edgeTls },
      shutdown_deadline_ms: selected.shutdown_deadline_ms,
    };
    // Expired source installation remains parseable ONLY for same-key custody
    // recovery. The real candidate still fences every fresh ISSUE/ENTER.
    complete = true;
    return Object.freeze({ poolProfile: Object.freeze({ ...selected.pool_profile }),
      schemaTarget: Object.freeze(structuredClone(target)), config,
      recovery: { ...selected.recovery, tls: recoveryTls },
      listeners: Object.freeze({ assertion: Object.freeze({ ...selected.listeners.assertion }), reverse: Object.freeze({ ...selected.listeners.reverse }) }) });
  } catch { return fail(); }
  finally { originals.forEach(bytes => bytes.fill(0)); if (!complete) outputs.forEach(bytes => bytes.fill(0)); }
}
