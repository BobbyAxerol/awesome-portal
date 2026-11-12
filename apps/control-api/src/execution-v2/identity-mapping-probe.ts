/** Read-only probe of the TS identity mapping (Edge decision sheet C04, 2026-11-12).
 *
 * Composes the EXISTING `ExistingIdentityMappingClient` through `withExistingIdentityMapping`, so the
 * answer is what Core's SDK call `verifiedHumanMapping(subject, workspace)` would return. It opens one
 * pinned mTLS connection to the mapping route, writes nothing, creates no mapping, reads no native
 * acceptance and mints no session. Output is a public tuple only; no path, key or error text.
 * A pass is NOT an SDK ACK by itself: it is the evidence Core's gate (c) ACK is built from. */
import { createHash } from "node:crypto";
import { z } from "zod";
import { unqualifiedAccessTrust } from "./access-trust";
import { ExistingIdentityMappingClient, withExistingIdentityMapping,
  type ExistingIdentityMapping, type ExistingIdentityMappingClientConfig } from "./existing-identity-mapping-client";
import { readNativeRuntimeReference } from "./native-core-runtime";
import { parseCompactJson } from "./private-root-file";

export const IDENTITY_MAPPING_PROBE_CONFIG_SCHEMA = "portal.identity-mapping-probe.v1";
export const IDENTITY_MAPPING_PROBE_RESULT_SCHEMA = "portal.identity-mapping-probe-result.v1";
const hex64 = z.string().regex(/^[a-f0-9]{64}$/);
const ref = z.object({ path: z.string().startsWith("/").max(512), sha256: hex64 }).strict();
const text = z.string().min(1).max(512);
export const identityMappingProbeConfig = z.object({
  schema_version: z.literal(IDENTITY_MAPPING_PROBE_CONFIG_SCHEMA),
  origin: z.string().startsWith("https://").max(256),
  tls: z.object({ ca_ref: ref, cert_ref: ref, key_ref: ref }).strict(),
  /** SHA256 of the mapping server's leaf certificate (DER), pinned independently of the CA. */
  source_certificate_sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  human_issuer: text, subject: text, workspace_id: text, environment: z.enum(["paper", "sandbox", "live"]),
  workload_id: text, deadline_ms: z.number().int().min(1).max(5_000), response_bytes: z.number().int().min(1).max(8192),
  max_inflight: z.literal(1), installation_expires_at_utc_ms: z.number().int().positive().safe(),
}).strict();
export type IdentityMappingProbeConfig = z.infer<typeof identityMappingProbeConfig>;

export type IdentityMappingProbeCode = "PROBE_CONFIG_REFUSED" | "PROBE_REFERENCE_REFUSED" | "PROBE_MAPPING_UNAVAILABLE";
export class IdentityMappingProbeError extends Error {
  constructor(readonly code: IdentityMappingProbeCode) { super(code); }
}
export type IdentityMappingProbeResult =
  | { schema_version: typeof IDENTITY_MAPPING_PROBE_RESULT_SCHEMA; status: "FOUND"; subject: string; workspace_id: string;
      ts_user_id: string; revision: string; config_sha256: string }
  | { schema_version: typeof IDENTITY_MAPPING_PROBE_RESULT_SCHEMA; status: "NOT_FOUND"; subject: string; workspace_id: string;
      config_sha256: string };

export interface IdentityMappingProbeDeps {
  readReference?: typeof readNativeRuntimeReference;
  /** Test seam only; production uses the existing client. */
  makeClient?: (config: ExistingIdentityMappingClientConfig) => Pick<ExistingIdentityMappingClient, "lookup">;
}

/** `configBytes` must be the exact compact-JSON bytes whose SHA256 the operator approved. */
export async function runIdentityMappingProbe(configBytes: Buffer, approvedSha256: string,
  deps: IdentityMappingProbeDeps = {}): Promise<IdentityMappingProbeResult> {
  const sha = createHash("sha256").update(configBytes).digest("hex");
  let config: IdentityMappingProbeConfig;
  try {
    if (!hex64.safeParse(approvedSha256).success || sha !== approvedSha256) throw new Error();
    config = identityMappingProbeConfig.parse(parseCompactJson(configBytes));
    if (config.installation_expires_at_utc_ms <= Date.now()) throw new Error();
  } catch { throw new IdentityMappingProbeError("PROBE_CONFIG_REFUSED"); }
  const read = deps.readReference ?? readNativeRuntimeReference;
  const loaded: Buffer[] = [];
  let tls: ExistingIdentityMappingClientConfig["tls"];
  try {
    const settled = await Promise.allSettled([read(config.tls.ca_ref, 32768), read(config.tls.cert_ref, 32768), read(config.tls.key_ref, 16384)]);
    for (const item of settled) if (item.status === "fulfilled") loaded.push(item.value);
    if (settled.some(item => item.status === "rejected")) throw new Error();
    tls = { ca: loaded[0]!, cert: loaded[1]!, key: loaded[2]! };
  } catch { for (const b of loaded) b.fill(0); throw new IdentityMappingProbeError("PROBE_REFERENCE_REFUSED"); }
  const clientConfig: ExistingIdentityMappingClientConfig = { origin: config.origin, tls,
    source_certificate_sha256: config.source_certificate_sha256, human_issuer: config.human_issuer,
    workspace_id: config.workspace_id, environment: config.environment, workload_id: config.workload_id,
    deadline_ms: config.deadline_ms, response_bytes: config.response_bytes, max_inflight: config.max_inflight,
    installation_expires_at_utc_ms: config.installation_expires_at_utc_ms };
  let mapping: ExistingIdentityMapping;
  try {
    const client = (deps.makeClient ?? (c => new ExistingIdentityMappingClient(c)))(clientConfig);
    // The SDK's own call shape: only verifiedHumanMapping is replaced; every other callback stays unqualified.
    const trust = withExistingIdentityMapping(unqualifiedAccessTrust, client as ExistingIdentityMappingClient);
    mapping = await trust.verifiedHumanMapping!(config.subject, config.workspace_id) as ExistingIdentityMapping;
  } catch { throw new IdentityMappingProbeError("PROBE_MAPPING_UNAVAILABLE"); }
  finally { for (const b of loaded) b.fill(0); }
  const base = { schema_version: IDENTITY_MAPPING_PROBE_RESULT_SCHEMA, subject: config.subject,
    workspace_id: config.workspace_id, config_sha256: sha } as const;
  return mapping === null ? { ...base, status: "NOT_FOUND" }
    : { ...base, status: "FOUND", ts_user_id: mapping.ts_user_id, revision: mapping.revision };
}
