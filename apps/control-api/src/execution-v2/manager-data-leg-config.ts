/** OFFLINE, PURE validator of the future reviewed Research overlay for the existing Manager
 * data leg (Core -> Edge https://10.70.0.2:{8443,8444,8445} -> SourceProxy -> Manager, RS256
 * delegation + mTLS). It is NOT the native 28446 / Ed25519 trust and it never touches it.
 *
 * It checks STRUCTURE and REFERENCES only: strings, integers, booleans and 64-hex hashes. It
 * has no filesystem, network, database, clock (the caller passes `nowMs`), key, certificate
 * or session access, it never opens a referenced file, issues no PKI, and wires nothing. The
 * real key names and pins it mirrors are read-only references to `config.ts`,
 * `current-source.proxy.ts` and `delegation.ts`; none of them is modified or imported at run
 * time beyond two resource-name constants.
 *
 * Findings carry a stable code and a JSON path ONLY: a value is never echoed (a rejected value
 * may be key material). A passing report is not a PKI issuance, a trust pin, a grant, an owner
 * approval or a runtime configuration; it is a pre-reconcile coherence check. */
import { createHash } from "node:crypto";
import { MANAGER_REALTIME_RESOURCE, MANAGER_V2_READ_RESOURCE } from "../execution/delegation";

export const MANAGER_DATA_LEG_CONFIG_SCHEMA = "portal.manager-data-leg-config.v1";
export const MANAGER_DATA_LEG_REPORT_SCHEMA = "portal.manager-data-leg-config-report.v1";

/** Exact overlay reference contract (CORE009_EXISTING_MANAGER_DATA_LEG_PREPARATION 2026-10-21). */
export const MANAGER_DATA_LEG_FILE_REFS = Object.freeze({
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/research-native/edge-signing.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/research-native/edge-ca.pem",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/research-native/edge-client.pem",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/research-native/edge-client-key.pem",
} as const);

export type ManagerDataLegMode = "paper" | "sandbox" | "live";
/** Per-mode pins, as `config.ts` `currentSourceProfiles` (N13B) defines them. */
export const MANAGER_DATA_LEG_MODES: Readonly<Record<ManagerDataLegMode, { origin: string; port: number; profile_id: string; audience: string }>> = Object.freeze({
  paper: { origin: "https://10.70.0.2:8443", port: 8443, profile_id: "PAPER_BINANCE_USDM", audience: "portal-execution-edge-paper" },
  sandbox: { origin: "https://10.70.0.2:8444", port: 8444, profile_id: "SANDBOX_BINANCE_USDM", audience: "portal-execution-edge-sandbox" },
  live: { origin: "https://10.70.0.2:8445", port: 8445, profile_id: "LIVE_BINANCE_USDM", audience: "portal-execution-edge-live" },
});
const MODE_ORDER = ["paper", "sandbox", "live"] as const;
export const MANAGER_DATA_LEG_ISSUER = "portal-control-api";
export const MANAGER_DATA_LEG_MAX_TTL_SECONDS = 60;
export const MANAGER_DATA_LEG_DEFAULT_LEAF_SAN = "spiffe://primusspark/portal/control-api/paper";
/** Anything this long and base64-looking is treated as key/cert/token material (sha256 hex is 64). */
export const MANAGER_DATA_LEG_BASE64_BLOB_BOUND = 80;
const MAX_STRING = 512;
const MAX_NODES = 2000;
const MAX_DEPTH = 8;

/** Feature flags, with the value the Manager data leg requires (`config.ts` names). */
export const MANAGER_DATA_LEG_FEATURES = Object.freeze({
  FEATURE_EXECUTION_EDGE: "true",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  FEATURE_EXECUTION_CURRENT_SOURCE_SANDBOX: "true",
  FEATURE_EXECUTION_CURRENT_SOURCE_LIVE: "true",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER_DNSE: "false",
  FEATURE_EXECUTION_COMMAND_RELAY: "false",
  FEATURE_EXECUTION_REALTIME_SSE: "false",
  FEATURE_EXECUTION_LOCAL_R0_TASKS: "false",
} as const);

export interface ManagerDataLegFinding { code: string; path: string }
export interface ManagerDataLegOptions {
  /** The exact Research workspace id the overlay must carry (required: no default). */
  expectedWorkspaceId: string;
  /** Caller clock for leaf validity; without it validity is checked for order only. */
  nowMs?: number;
  /** Default true: an issued client leaf is required. false = inactive preparation (leaf may be absent, warning). */
  requireIssuedLeaf?: boolean;
  /** Default `MANAGER_DATA_LEG_DEFAULT_LEAF_SAN`; a different reviewed workload SAN must be passed explicitly. */
  expectedLeafSanUri?: string;
  /** If given, the single shared kid must be one of these reviewed kids. */
  reviewedKids?: readonly string[];
  /** Public hashes of stable/native workload material; any equal public hash is a reuse. */
  knownStableSha256?: readonly string[];
}
export interface ManagerDataLegReport {
  ok: boolean;
  errors: ManagerDataLegFinding[];
  warnings: ManagerDataLegFinding[];
  summary: {
    input_sha256: string | null;
    modes: ManagerDataLegMode[];
    stream_enabled_modes: ManagerDataLegMode[];
    canary: "LIVE_FACTS" | "INVALID";
    kids: number;
    leaf: "ISSUED" | "ABSENT" | "INVALID";
  };
}

type Obj = Record<string, unknown>;
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
const isObj = (value: unknown): value is Obj => typeof value === "object" && value !== null && !Array.isArray(value);
const HEX64 = /^[a-f0-9]{64}$/;
const KID = /^research-[A-Za-z0-9_-]{1,23}$/;
const WORKSPACE = /^[A-Za-z0-9._-]{1,128}$/;
const ORIGIN = /^https:\/\/10\.70\.0\.2:([0-9]{1,5})$/;
const PEM_HEADER = /-----\s*(?:BEGIN|END)\s+[A-Z0-9 ]+-----/;
const BASE64_BLOB = new RegExp(`[A-Za-z0-9+/_-]{${MANAGER_DATA_LEG_BASE64_BLOB_BOUND},}={0,2}`);
const JWT_LIKE = /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}(?:\.[A-Za-z0-9_-]*)?/;
/** Key names that suggest a secret value. The four file-reference names are the only exceptions. */
const SECRET_KEY_NAME = /(?:secret|passw(?:or)?d|passphrase|token|bearer|credential|api[_-]?key|private[_-]?key|(?:^|[_-])(?:pem|der|p12|pfx|pkcs8|seed|mnemonic)(?:$|[_-])|^(?:d|p|q|dp|dq|qi|k)$)/i;
const FILE_REF_NAMES = new Set(Object.keys(MANAGER_DATA_LEG_FILE_REFS));
/** Trust/reuse markers. `stable` and the runtime default kid are never Research material. */
const STABLE_MARKER = /stable|execution-k1|(?:^|[^a-z])prod(?:uction)?(?:[^a-z]|$)|dev-?(?:key|signer)|native-(?:core|trust)|ed25519/i;
const TEST_CA_MARKER = /test|self[-_]?signed|snakeoil|dummy|fake|insecure|mkcert|localhost[-_.]?ca|invalid/i;
const CSR_MARKER = /(?:^|[^a-z])csr(?:[^a-z]|$)|certificate[-_ ]?request/i;

/** Parse a UTF-8 JSON document that must already be in compact canonical form (as the Core009
 * loaders require), then inspect it. */
export function inspectManagerDataLegConfigBytes(bytes: Uint8Array, options: ManagerDataLegOptions): ManagerDataLegReport {
  const errors: ManagerDataLegFinding[] = [];
  let parsed: unknown;
  if (bytes.length < 1 || bytes.length > 65536) errors.push({ code: "CONFIG_SIZE_INVALID", path: "" });
  else {
    try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")); }
    catch { errors.push({ code: "CONFIG_NOT_JSON", path: "" }); }
    if (parsed !== undefined && !Buffer.from(JSON.stringify(parsed), "utf8").equals(Buffer.from(bytes)))
      errors.push({ code: "CONFIG_NOT_CANONICAL_COMPACT_JSON", path: "" });
  }
  if (parsed === undefined) {
    return { ok: false, errors, warnings: [], summary: emptySummary(bytes.length ? sha256(bytes) : null) };
  }
  const report = inspectManagerDataLegConfig(parsed, options);
  report.errors.unshift(...errors);
  report.ok = report.errors.length === 0;
  report.summary.input_sha256 = sha256(bytes);
  return report;
}

const emptySummary = (input: string | null): ManagerDataLegReport["summary"] =>
  ({ input_sha256: input, modes: [], stream_enabled_modes: [], canary: "INVALID", kids: 0, leaf: "ABSENT" });

export function inspectManagerDataLegConfig(value: unknown, options: ManagerDataLegOptions): ManagerDataLegReport {
  const errors: ManagerDataLegFinding[] = [], warnings: ManagerDataLegFinding[] = [];
  const err = (code: string, path: string): void => { errors.push({ code, path }); };
  const summary = emptySummary(null);
  const finish = (): ManagerDataLegReport => ({ ok: errors.length === 0, errors, warnings, summary });

  if (!options.expectedWorkspaceId || !WORKSPACE.test(options.expectedWorkspaceId)) err("WORKSPACE_EXPECTATION_INVALID", "");
  if (!isObj(value)) { err("CONFIG_NOT_OBJECT", ""); return finish(); }

  // 0. Whole-tree hygiene first: nothing that looks like key material or a secret name survives.
  scanTree(value, "", 0, { n: 0 }, err);

  // 1. Closed top-level shape.
  closed(value, "", ["schema_version", "workspace_id", "file_refs", "delegation", "features", "activation", "modes", "canary", "public_inputs"], err);
  if (value.schema_version !== MANAGER_DATA_LEG_CONFIG_SCHEMA) err("SCHEMA_VERSION_MISMATCH", "/schema_version");

  // 2. Workspace.
  const workspace = value.workspace_id;
  if (typeof workspace !== "string" || !WORKSPACE.test(workspace)) err("WORKSPACE_ID_INVALID", "/workspace_id");
  else if (workspace !== options.expectedWorkspaceId) err("WORKSPACE_MISMATCH", "/workspace_id");

  // 3. The four file references: exact contract, never opened.
  fileRefs(value.file_refs, err);

  // 4. Delegation (issuer, scopes). TTL is per mode.
  const delegation = value.delegation;
  if (!isObj(delegation)) err("DELEGATION_MISSING", "/delegation");
  else {
    closed(delegation, "/delegation", ["issuer", "algorithm", "scopes"], err);
    if (delegation.issuer !== MANAGER_DATA_LEG_ISSUER) err("ISSUER_MISMATCH", "/delegation/issuer");
    if (delegation.algorithm !== "RS256") err("DELEGATION_ALGORITHM_MISMATCH", "/delegation/algorithm");
    if (!Array.isArray(delegation.scopes) || delegation.scopes.length !== 1 || delegation.scopes[0] !== "execution.read")
      err("DELEGATION_SCOPES_NOT_READ_ONLY", "/delegation/scopes");
  }

  // 5. Disabled surfaces.
  features(value.features, err);
  const activation = value.activation;
  if (!isObj(activation)) err("ACTIVATION_MISSING", "/activation");
  else {
    closed(activation, "/activation", ["command", "capital", "live_trading"], err);
    for (const key of ["command", "capital", "live_trading"]) if (activation[key] !== false) err("ACTIVATION_NOT_DISABLED", `/activation/${key}`);
  }

  // 6. Modes.
  const kidsSeen = new Map<string, ManagerDataLegMode>();
  const modes = value.modes;
  if (!isObj(modes)) err("MODES_MISSING", "/modes");
  else {
    for (const key of Object.keys(modes))
      if (!(MODE_ORDER as readonly string[]).includes(key)) err(key === "canary" ? "CANARY_HAS_OWN_MODE_ENTRY" : "MODE_UNKNOWN", `/modes/${key}`);
    for (const mode of MODE_ORDER) {
      const entry = modes[mode];
      if (entry === undefined) { err("MODE_MISSING", `/modes/${mode}`); continue; }
      summary.modes.push(mode);
      modeEntry(mode, entry, `/modes/${mode}`, options, kidsSeen, summary, err);
    }
  }
  summary.kids = kidsSeen.size;

  // 7. Canary = governed Live facts, no endpoint of its own.
  const canary = value.canary;
  if (!isObj(canary)) err("CANARY_MISSING", "/canary");
  else {
    const extra = Object.keys(canary).filter(k => k !== "resolves_as");
    for (const key of extra) err("CANARY_HAS_OWN_ENDPOINT_FIELD", `/canary/${key}`);
    if (canary.resolves_as !== "live") err("CANARY_NOT_RESOLVED_AS_LIVE", "/canary/resolves_as");
    else if (extra.length === 0) summary.canary = "LIVE_FACTS";
  }

  // 8. Public inputs (hashes + leaf descriptor).
  publicInputs(value.public_inputs, options, summary, errors, warnings);

  return finish();
}

// ---------------------------------------------------------------------------------------------

type Err = (code: string, path: string) => void;

function closed(obj: Obj, base: string, allowed: readonly string[], err: Err): void {
  for (const key of Object.keys(obj)) if (!allowed.includes(key)) err("UNKNOWN_KEY", `${base}/${key}`);
}

/** Value and key scans over every node. Reports at the first offending node per rule per path. */
function scanTree(node: unknown, path: string, depth: number, budget: { n: number }, err: Err): void {
  if (++budget.n > MAX_NODES) { if (budget.n === MAX_NODES + 1) err("CONFIG_TOO_LARGE", path); return; }
  if (depth > MAX_DEPTH) { err("CONFIG_TOO_DEEP", path); return; }
  if (typeof node === "string") {
    if (node.length > MAX_STRING) err("STRING_TOO_LONG", path);
    if (PEM_HEADER.test(node) || /PRIVATE KEY|CERTIFICATE REQUEST/.test(node)) err("KEY_MATERIAL_PEM_HEADER", path);
    else if (JWT_LIKE.test(node)) err("TOKEN_LIKE_VALUE", path);
    else if (BASE64_BLOB.test(node)) err("KEY_MATERIAL_BASE64_BLOB", path);
    return;
  }
  if (Array.isArray(node)) { node.forEach((item, i) => scanTree(item, `${path}/${i}`, depth + 1, budget, err)); return; }
  if (isObj(node)) {
    for (const [key, item] of Object.entries(node)) {
      const at = `${path}/${key}`;
      if (!FILE_REF_NAMES.has(key) && SECRET_KEY_NAME.test(key)) err("SECRET_LOOKING_KEY_NAME", at);
      if (PEM_HEADER.test(key) || BASE64_BLOB.test(key)) err("KEY_MATERIAL_IN_KEY_NAME", at);
      scanTree(item, at, depth + 1, budget, err);
    }
    return;
  }
  if (node !== null && typeof node !== "boolean" && typeof node !== "number") err("VALUE_TYPE_INVALID", path);
}

function fileRefs(refs: unknown, err: Err): void {
  if (!isObj(refs)) { err("FILE_REFS_MISSING", "/file_refs"); return; }
  closed(refs, "/file_refs", [...FILE_REF_NAMES], err);
  const values = new Map<string, string>();
  for (const [key, expected] of Object.entries(MANAGER_DATA_LEG_FILE_REFS)) {
    const at = `/file_refs/${key}`, got = refs[key];
    if (got === undefined) { err("FILE_REF_MISSING", at); continue; }
    if (typeof got !== "string") { err("FILE_REF_NOT_STRING", at); continue; }
    if (key === "EXECUTION_EDGE_CLIENT_CERT_FILE" && CSR_MARKER.test(got)) err("CSR_PRESENTED_AS_LEAF", at);
    if (key === "EXECUTION_EDGE_CA_FILE" && TEST_CA_MARKER.test(got)) err("TEST_CA_MARKER", at);
    if (STABLE_MARKER.test(got)) err("STABLE_KEY_REUSE_MARKER", at);
    if (got !== expected) err("FILE_REF_PATH_MISMATCH", at);
    const prior = values.get(got);
    if (prior !== undefined) err("FILE_REF_DUPLICATE", at);
    values.set(got, key);
  }
}

function features(map: unknown, err: Err): void {
  if (!isObj(map)) { err("FEATURES_MISSING", "/features"); return; }
  closed(map, "/features", Object.keys(MANAGER_DATA_LEG_FEATURES), err);
  for (const [key, expected] of Object.entries(MANAGER_DATA_LEG_FEATURES)) {
    const got = map[key], at = `/features/${key}`;
    if (got === undefined) err("FEATURE_MISSING", at);
    else if (got !== expected) {
      const disabled = expected === "false";
      err(disabled ? "FEATURE_MUST_BE_DISABLED" : "FEATURE_MUST_BE_ENABLED", at);
    }
  }
}

function modeEntry(mode: ManagerDataLegMode, entry: unknown, path: string, options: ManagerDataLegOptions,
  kidsSeen: Map<string, ManagerDataLegMode>, summary: ManagerDataLegReport["summary"], err: Err): void {
  if (!isObj(entry)) { err("MODE_NOT_OBJECT", path); return; }
  closed(entry, path, ["origin", "profile_id", "audience", "workspace_id", "kid", "ttl_seconds", "read", "stream"], err);
  const pin = MANAGER_DATA_LEG_MODES[mode];

  const origin = entry.origin;
  if (typeof origin !== "string") err("ORIGIN_MISSING", `${path}/origin`);
  else if (origin !== pin.origin) {
    const match = ORIGIN.exec(origin);
    const port = match ? Number(match[1]) : undefined;
    const otherModePort = port !== undefined && Object.values(MANAGER_DATA_LEG_MODES).some(m => m.port === port && m.port !== pin.port);
    err(otherModePort ? "ORIGIN_PORT_MODE_MISMATCH" : "ORIGIN_NOT_EXACT", `${path}/origin`);
  }
  if (entry.profile_id !== pin.profile_id) err(isString(entry.profile_id) && otherProfile(entry.profile_id, mode) ? "PROFILE_ID_MODE_MISMATCH" : "PROFILE_ID_MISMATCH", `${path}/profile_id`);
  if (entry.audience !== pin.audience) err(isString(entry.audience) && otherAudience(entry.audience, mode) ? "AUDIENCE_MODE_MISMATCH" : "AUDIENCE_MISMATCH", `${path}/audience`);

  if (entry.workspace_id !== options.expectedWorkspaceId) err("WORKSPACE_MISMATCH", `${path}/workspace_id`);

  const ttl = entry.ttl_seconds;
  if (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 1) err("TTL_INVALID", `${path}/ttl_seconds`);
  else if (ttl > MANAGER_DATA_LEG_MAX_TTL_SECONDS) err("TTL_OVER_60_SECONDS", `${path}/ttl_seconds`);

  const kid = entry.kid;
  if (typeof kid !== "string") err("KID_MISSING", `${path}/kid`);
  else {
    if (!KID.test(kid)) err("KID_NOT_RESEARCH_SCOPED", `${path}/kid`);
    if (STABLE_MARKER.test(kid)) err("STABLE_KEY_REUSE_MARKER", `${path}/kid`);
    if (options.reviewedKids && !options.reviewedKids.includes(kid)) err("KID_NOT_REVIEWED", `${path}/kid`);
    // Runtime has ONE Research signer and ONE EXECUTION_EDGE_KEY_ID (config.ts, current-source.proxy.ts):
    // all three mode entries must carry the same single reviewed kid. Differing kids are refused.
    if (kidsSeen.size > 0 && !kidsSeen.has(kid)) err("KID_DIFFERS_ACROSS_MODES", `${path}/kid`);
    if (!kidsSeen.has(kid)) kidsSeen.set(kid, mode);
  }

  readStream(entry.read, entry.stream, path, mode, summary, err);
}

const isString = (v: unknown): v is string => typeof v === "string";
const otherProfile = (v: string, mode: ManagerDataLegMode): boolean =>
  Object.entries(MANAGER_DATA_LEG_MODES).some(([m, p]) => m !== mode && p.profile_id === v);
const otherAudience = (v: string, mode: ManagerDataLegMode): boolean =>
  Object.entries(MANAGER_DATA_LEG_MODES).some(([m, p]) => m !== mode && p.audience === v);

/** READ and STREAM are two separate authorities. READ never grants STREAM. */
function readStream(read: unknown, stream: unknown, path: string, mode: ManagerDataLegMode,
  summary: ManagerDataLegReport["summary"], err: Err): void {
  let readGrant: string | undefined;
  if (!isObj(read)) err("READ_MISSING", `${path}/read`);
  else {
    closed(read, `${path}/read`, ["enabled", "resources", "grants_stream", "grant_ref_sha256"], err);
    if (read.enabled !== true) err("READ_NOT_ENABLED", `${path}/read/enabled`);
    if (read.grants_stream !== false) err("READ_GRANTS_STREAM", `${path}/read/grants_stream`);
    const resources = read.resources;
    if (Array.isArray(resources) && resources.includes(MANAGER_REALTIME_RESOURCE)) err("READ_GRANTS_STREAM", `${path}/read/resources`);
    else if (!Array.isArray(resources) || resources.length !== 1 || resources[0] !== MANAGER_V2_READ_RESOURCE)
      err("READ_RESOURCE_SET_INVALID", `${path}/read/resources`);
    if (read.grant_ref_sha256 !== undefined) {
      if (isString(read.grant_ref_sha256) && HEX64.test(read.grant_ref_sha256)) readGrant = read.grant_ref_sha256;
      else err("GRANT_REF_HASH_INVALID", `${path}/read/grant_ref_sha256`);
    }
  }
  if (!isObj(stream)) { err("STREAM_MISSING", `${path}/stream`); return; }
  closed(stream, `${path}/stream`, ["enabled", "resources", "grant_ref_sha256"], err);
  if (typeof stream.enabled !== "boolean") { err("STREAM_ENABLED_INVALID", `${path}/stream/enabled`); return; }
  const resources = stream.resources;
  if (!stream.enabled) {
    if (!Array.isArray(resources) || resources.length !== 0) err("STREAM_DISABLED_WITH_RESOURCES", `${path}/stream/resources`);
    if (stream.grant_ref_sha256 !== undefined) err("STREAM_DISABLED_WITH_GRANT", `${path}/stream/grant_ref_sha256`);
    return;
  }
  summary.stream_enabled_modes.push(mode);
  if (!Array.isArray(resources) || resources.length !== 1 || resources[0] !== MANAGER_REALTIME_RESOURCE)
    err("STREAM_RESOURCE_SET_INVALID", `${path}/stream/resources`);
  const grant = stream.grant_ref_sha256;
  if (!isString(grant) || !HEX64.test(grant)) err("STREAM_SEPARATE_GRANT_MISSING", `${path}/stream/grant_ref_sha256`);
  else if (grant === readGrant) err("STREAM_GRANT_SAME_AS_READ", `${path}/stream/grant_ref_sha256`);
}

function publicInputs(inputs: unknown, options: ManagerDataLegOptions, summary: ManagerDataLegReport["summary"],
  errors: ManagerDataLegFinding[], warnings: ManagerDataLegFinding[]): void {
  const err: Err = (code, path) => { errors.push({ code, path }); };
  if (!isObj(inputs)) { err("PUBLIC_INPUTS_MISSING", "/public_inputs"); return; }
  closed(inputs, "/public_inputs", ["signer_public_key_sha256", "client_public_key_sha256", "client_csr_sha256", "ca_sha256", "client_leaf"], err);
  const hash = (key: string, required: boolean): string | undefined => {
    const v = inputs[key], at = `/public_inputs/${key}`;
    if (v === undefined) { if (required) err("PUBLIC_HASH_MISSING", at); return undefined; }
    if (!isString(v) || !HEX64.test(v)) { err("PUBLIC_HASH_INVALID", at); return undefined; }
    if (options.knownStableSha256?.includes(v)) err("STABLE_KEY_REUSE_MARKER", at);
    return v;
  };
  const signer = hash("signer_public_key_sha256", true), client = hash("client_public_key_sha256", true);
  const csr = hash("client_csr_sha256", false), ca = hash("ca_sha256", false);
  if (signer && client && signer === client) err("SIGNER_AND_CLIENT_KEY_NOT_DISTINCT", "/public_inputs/client_public_key_sha256");

  const leaf = inputs.client_leaf;
  if (leaf === undefined) {
    summary.leaf = "ABSENT";
    if (options.requireIssuedLeaf === false) warnings.push({ code: "ISSUED_LEAF_NOT_YET_RETURNED", path: "/public_inputs/client_leaf" });
    else err("ISSUED_LEAF_MISSING", "/public_inputs/client_leaf");
    return;
  }
  const before = errors.length;
  const at = "/public_inputs/client_leaf";
  if (!isObj(leaf)) { err("CLIENT_LEAF_NOT_OBJECT", at); summary.leaf = "INVALID"; return; }
  closed(leaf, at, ["kind", "sha256", "public_key_sha256", "san_uri", "eku", "ca", "key_usage", "issuer_ref", "not_before", "not_after"], err);
  if (leaf.kind === "csr" || (isString(leaf.kind) && CSR_MARKER.test(leaf.kind))) err("CSR_PRESENTED_AS_LEAF", `${at}/kind`);
  else if (leaf.kind !== "issued_leaf") err("CLIENT_LEAF_KIND_INVALID", `${at}/kind`);
  if (!isString(leaf.sha256) || !HEX64.test(leaf.sha256)) err("PUBLIC_HASH_INVALID", `${at}/sha256`);
  else {
    if (leaf.sha256 === csr) err("CSR_PRESENTED_AS_LEAF", `${at}/sha256`);
    if (leaf.sha256 === client) err("PUBLIC_KEY_PRESENTED_AS_LEAF", `${at}/sha256`);
    if (leaf.sha256 === ca) err("LEAF_IS_CA_CERTIFICATE", `${at}/sha256`);
    if (options.knownStableSha256?.includes(leaf.sha256)) err("STABLE_KEY_REUSE_MARKER", `${at}/sha256`);
  }
  if (!isString(leaf.public_key_sha256) || !HEX64.test(leaf.public_key_sha256)) err("PUBLIC_HASH_INVALID", `${at}/public_key_sha256`);
  else if (client && leaf.public_key_sha256 !== client) err("LEAF_KEY_NOT_CLIENT_KEY", `${at}/public_key_sha256`);
  if (leaf.san_uri !== (options.expectedLeafSanUri ?? MANAGER_DATA_LEG_DEFAULT_LEAF_SAN)) err("LEAF_SAN_MISMATCH", `${at}/san_uri`);
  if (!Array.isArray(leaf.eku) || leaf.eku.length !== 1 || leaf.eku[0] !== "clientAuth") err("LEAF_EKU_NOT_CLIENT_AUTH_ONLY", `${at}/eku`);
  if (leaf.ca !== false) err("LEAF_IS_CA", `${at}/ca`);
  if (!Array.isArray(leaf.key_usage) || !leaf.key_usage.includes("digitalSignature")) err("LEAF_KEY_USAGE_INVALID", `${at}/key_usage`);
  const issuer = leaf.issuer_ref;
  if (!isString(issuer) || !/^[A-Za-z0-9._:/@-]{1,160}$/.test(issuer)) err("LEAF_ISSUER_REF_INVALID", `${at}/issuer_ref`);
  else {
    if (TEST_CA_MARKER.test(issuer)) err("TEST_CA_MARKER", `${at}/issuer_ref`);
    if (STABLE_MARKER.test(issuer)) err("STABLE_KEY_REUSE_MARKER", `${at}/issuer_ref`);
  }
  const instant = (v: unknown): number | undefined =>
    isString(v) && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(v) && Number.isFinite(Date.parse(v)) ? Date.parse(v) : undefined;
  const from = instant(leaf.not_before), until = instant(leaf.not_after);
  if (from === undefined) err("LEAF_VALIDITY_INVALID", `${at}/not_before`);
  if (until === undefined) err("LEAF_VALIDITY_INVALID", `${at}/not_after`);
  if (from !== undefined && until !== undefined) {
    if (until <= from) err("LEAF_VALIDITY_INVALID", `${at}/not_after`);
    if (options.nowMs !== undefined && (options.nowMs < from || options.nowMs >= until)) err("LEAF_NOT_CURRENTLY_VALID", `${at}/not_after`);
  }
  if (!ca) err("PUBLIC_HASH_MISSING", "/public_inputs/ca_sha256");
  summary.leaf = errors.length === before ? "ISSUED" : "INVALID";
}
