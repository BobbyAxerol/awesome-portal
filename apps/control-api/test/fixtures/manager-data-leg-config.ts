/** TEST_ONLY. SYNTHETIC positive configs for the Manager data-leg config validator. Every hash is
 * sha256("TEST_ONLY:<name>"), every kid/workspace is invented. Nothing here is a key, certificate,
 * CSR, JWK, hash of a real file, grant, approval or session, and no real PKI owner is named. */
import { createHash } from "node:crypto";
import { MANAGER_DATA_LEG_CONFIG_SCHEMA, MANAGER_DATA_LEG_FILE_REFS, MANAGER_DATA_LEG_MODES, type ManagerDataLegMode } from "../../src/execution-v2/manager-data-leg-config";

export const SYNTHETIC_WORKSPACE = "ws-synthetic-research-0001";
export const SYNTHETIC_NOW = Date.UTC(2026, 9, 21, 12, 0, 0);
export const pad = (name: string): string => createHash("sha256").update("TEST_ONLY:" + name).digest("hex");
const deep = <T>(v: T): T => JSON.parse(JSON.stringify(v));

export const SYNTHETIC_KIDS: Record<ManagerDataLegMode, string> = {
  paper: "research-synth-paper-0001", sandbox: "research-synth-sandbox-0002", live: "research-synth-live-0003",
};

function mode(m: ManagerDataLegMode, stream: boolean) {
  const pin = MANAGER_DATA_LEG_MODES[m];
  return {
    origin: pin.origin, profile_id: pin.profile_id, audience: pin.audience, workspace_id: SYNTHETIC_WORKSPACE,
    kid: SYNTHETIC_KIDS[m], ttl_seconds: 45,
    read: { enabled: true, resources: ["execution:manager-v2:read"], grants_stream: false, grant_ref_sha256: pad(`read-grant-${m}`) },
    stream: stream
      ? { enabled: true, resources: ["execution:manager-realtime"], grant_ref_sha256: pad(`stream-grant-${m}`) }
      : { enabled: false, resources: [] },
  };
}

/** Coherent issued-leaf config: READ in all three modes, STREAM separately enabled in all three. */
export function goodConfig(): any {
  return deep({
    schema_version: MANAGER_DATA_LEG_CONFIG_SCHEMA,
    workspace_id: SYNTHETIC_WORKSPACE,
    file_refs: { ...MANAGER_DATA_LEG_FILE_REFS },
    delegation: { issuer: "portal-control-api", algorithm: "RS256", scopes: ["execution.read"] },
    features: {
      FEATURE_EXECUTION_EDGE: "true", FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
      FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true", FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true",
      FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE: "false", FEATURE_EXECUTION_COMMAND_RELAY: "false",
      FEATURE_EXECUTION_REALTIME_SSE: "false", FEATURE_EXECUTION_LOCAL_R0_TASKS: "false",
    },
    activation: { command: false, capital: false, live_trading: false },
    modes: { paper: mode("paper", true), sandbox: mode("sandbox", true), live: mode("live", true) },
    canary: { resolves_as: "live" },
    public_inputs: {
      signer_public_key_sha256: pad("signer-public-key"), client_public_key_sha256: pad("client-public-key"),
      client_csr_sha256: pad("client-csr"), ca_sha256: pad("issuer-ca-public"),
      client_leaf: {
        kind: "issued_leaf", sha256: pad("client-leaf"), public_key_sha256: pad("client-public-key"),
        san_uri: "spiffe://primusspark/portal/control-api/paper", eku: ["clientAuth"], ca: false, key_usage: ["digitalSignature"],
        issuer_ref: "synthetic-offline-issuer-ref", not_before: "2026-10-21T00:00:00Z", not_after: "2026-11-21T00:00:00Z",
      },
    },
  });
}

/** Inactive preparation: no issued leaf yet (the CSR exists), STREAM not enabled anywhere. */
export function inactiveConfig(): any {
  const c = goodConfig();
  delete c.public_inputs.client_leaf;
  for (const m of ["paper", "sandbox", "live"] as const) c.modes[m].stream = { enabled: false, resources: [] };
  return c;
}
