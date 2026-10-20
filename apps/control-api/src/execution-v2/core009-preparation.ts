/** OFFLINE Core009 preparation inspector. PURE: no filesystem, network, database,
 * clock (the caller passes `nowMs`), key, certificate or session access, and it
 * installs nothing. It checks only the SHAPE and FINITE VALIDITY of a filled
 * `portal.native-core-runtime.v1` manifest and a filled
 * `portal.private-owner-manager-commissioning.v1` artifact, using the SAME
 * strict schemas the runtime/installer use, then cross-checks the bindings the
 * composer and the installer would otherwise only discover at start/install.
 *
 * It never echoes a value from either file: findings carry a stable code and a
 * JSON path only. A passing report is NOT an owner approval, a source
 * acceptance, a policy installation or a READ/STREAM grant. */
import { createHash } from "node:crypto";
import { accessDigest } from "./access-digest";
import { nativeCoreRuntimeManifest, nativeCoreResearchReviewTarget } from "./native-core-runtime";
import { privateOwnerCommissioningDocument, planBGrantFindings, PLAN_B_MAXIMUM_GRANT_MS } from "./core-owner-commissioning";
import { nativeBusinessReadUtcMicroseconds } from "./native-business-read-codec";

export type Core009Plan = "read-only" | "read-and-stream";
export interface Core009InspectionOptions {
  /** Caller clock, UTC epoch ms. */
  nowMs: number;
  /** Default `read-only`: any ALLOW stream.subscribe grant is an error. */
  plan?: Core009Plan;
  /** Research-only single-Paper-actor ceiling (default true). */
  researchReview?: boolean;
  /** Public workspace id the Research ceiling is checked against. */
  workspaceId?: string;
  /** Candidate trust expiry (UTC epoch ms): installation must end before it. */
  trustExpiresAtMs?: number;
  /** `serve` (default): source/native windows must be current. `policy-install-only`: those
   * timing findings become warnings (manifest used only by the offline installer). */
  mode?: "serve" | "policy-install-only";
  /** Required remaining validity of every window (default 15 min). */
  minRemainingMs?: number;
  /** Upper bound of the installation window (default 24 h, as the reverse bootstrap). */
  maxWindowMs?: number;
  /** Upper bound of one domain grant (default 72 h; operator guard, not a product rule).
   * Plan B (`read-and-stream`) is hard-capped at 2 h: this option can only lower it. */
  maxGrantMs?: number;
  /** Independent pin of the runtime file, e.g. the CONTROL_API_NATIVE_CORE_CONFIG_SHA256 value. */
  expectedRuntimeSha256?: string;
}
export interface Core009Finding { code: string; path: string }
export interface Core009Report {
  ok: boolean;
  errors: Core009Finding[];
  warnings: Core009Finding[];
  summary: {
    runtime_sha256: string | null;
    owner_artifact_sha256: string | null;
    plan: Core009Plan;
    selections: number;
    retained_recovery: number;
    grants: { business_read_all_allow: number; stream_subscribe_allow: number; deny: number };
    /** Counts only; reference paths and their hashes are deliberately not printed. */
    private_references: number;
    window_remaining_ms: { installation: number | null; owner_intake: number | null; shortest_grant: number | null };
  };
}

const MAX_BYTES = 131072;
const DAY = 86_400_000;
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");
/** Template marker: `<<FILL:type:NAME|hint>>` (hints may contain `<`/`>`). */
const PLACEHOLDER = /<<FILL:/u;

function placeholders(value: unknown, path: string, out: string[]): void {
  if (typeof value === "string") { if (PLACEHOLDER.test(value)) out.push(path); return; }
  if (Array.isArray(value)) { value.forEach((item, i) => placeholders(item, `${path}/${i}`, out)); return; }
  if (value && typeof value === "object")
    for (const [key, item] of Object.entries(value)) placeholders(item, `${path}/${key}`, out);
}
/** Parse a UTF-8 JSON file that must already be in its one reviewed compact
 * form (the runtime and installer both refuse any other byte spelling). */
function load(bytes: Uint8Array, label: "RUNTIME" | "OWNER", errors: Core009Finding[]): unknown {
  if (bytes.length < 1 || bytes.length > MAX_BYTES) { errors.push({ code: `${label}_SIZE_INVALID`, path: "" }); return undefined; }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(bytes).toString("utf8")); }
  catch { errors.push({ code: `${label}_NOT_JSON`, path: "" }); return undefined; }
  if (!Buffer.from(JSON.stringify(parsed), "utf8").equals(Buffer.from(bytes)))
    errors.push({ code: `${label}_NOT_CANONICAL_COMPACT_JSON`, path: "" });
  const open: string[] = [];
  placeholders(parsed, "", open);
  for (const path of open) errors.push({ code: `${label}_PLACEHOLDER_UNRESOLVED`, path });
  return open.length ? undefined : parsed;
}
/** Code + path only: zod messages can quote the received value. */
function schemaFindings(error: { issues: readonly { code: string; path: readonly (string | number)[] }[] },
  label: "RUNTIME" | "OWNER", errors: Core009Finding[]): void {
  for (const issue of error.issues.slice(0, 50))
    errors.push({ code: `${label}_SCHEMA_${issue.code.toUpperCase()}`, path: "/" + issue.path.join("/") });
}
const iso = (value: string): number | undefined => {
  try { return Number(nativeBusinessReadUtcMicroseconds(value) / 1000n); } catch { return undefined; }
};

export function inspectCore009Preparation(runtimeBytes: Uint8Array, ownerBytes: Uint8Array,
  options: Core009InspectionOptions): Core009Report {
  const errors: Core009Finding[] = [], warnings: Core009Finding[] = [];
  const plan = options.plan ?? "read-only", now = options.nowMs, policyOnly = options.mode === "policy-install-only";
  const minRemaining = options.minRemainingMs ?? 15 * 60_000, maxWindow = options.maxWindowMs ?? DAY,
    planB = plan === "read-and-stream",
    maxGrant = planB ? Math.min(options.maxGrantMs ?? PLAN_B_MAXIMUM_GRANT_MS, PLAN_B_MAXIMUM_GRANT_MS) : options.maxGrantMs ?? 72 * 3_600_000;
  const summary: Core009Report["summary"] = {
    runtime_sha256: runtimeBytes.length ? sha256(runtimeBytes) : null,
    owner_artifact_sha256: ownerBytes.length ? sha256(ownerBytes) : null, plan, selections: 0, retained_recovery: 0,
    grants: { business_read_all_allow: 0, stream_subscribe_allow: 0, deny: 0 }, private_references: 0,
    window_remaining_ms: { installation: null, owner_intake: null, shortest_grant: null },
  };
  const report = (): Core009Report => ({ ok: errors.length === 0, errors, warnings, summary });
  if (!Number.isSafeInteger(now) || now < 1) { errors.push({ code: "CLOCK_INVALID", path: "" }); return report(); }
  if (options.expectedRuntimeSha256 !== undefined && summary.runtime_sha256 !== options.expectedRuntimeSha256)
    errors.push({ code: "RUNTIME_SHA256_PIN_MISMATCH", path: "" });

  // 1. Shape through the real strict schemas.
  const runtimeValue = load(runtimeBytes, "RUNTIME", errors), ownerValue = load(ownerBytes, "OWNER", errors);
  const runtime = runtimeValue === undefined ? undefined : nativeCoreRuntimeManifest.safeParse(runtimeValue);
  if (runtime && !runtime.success) schemaFindings(runtime.error, "RUNTIME", errors);
  const owner = ownerValue === undefined ? undefined : privateOwnerCommissioningDocument.safeParse(ownerValue);
  if (owner && !owner.success) schemaFindings(owner.error, "OWNER", errors);
  const manifest = runtime?.success ? runtime.data : undefined, artifact = owner?.success ? owner.data : undefined;

  // 2. Runtime: finite validity and Research ceiling.
  if (manifest) {
    const { selections, retained_recovery, owner_intakes } = manifest.composition;
    summary.selections = selections.length; summary.retained_recovery = retained_recovery.length;
    // Per entry: CA, client cert, client key, human signing key, terminal signing key.
    summary.private_references = (selections.length + retained_recovery.length) * 5;
    let shortest: number | null = null;
    [...selections, ...retained_recovery].forEach((entry, index) => {
      const base = `/composition/${index < selections.length ? "selections" : "retained_recovery"}/${index < selections.length ? index : index - selections.length}`;
      const c = entry.config, s = c.selected_source, ends = s.installation_expires_at_utc_ms;
      const native = iso(s.pins.native.expires_at), from = iso(s.pins.native.effective_from);
      const retainedEntry = index >= selections.length;
      // A policy-install-only manifest may carry a historical source window: the
      // installer never contacts the source and an expired private installation
      // stays constructible, but the SERVING manifest must be current.
      const timing = (code: string, path: string) => (policyOnly ? warnings : errors).push({ code, path });
      if (!retainedEntry) {
        shortest = shortest === null ? ends - now : Math.min(shortest, ends - now);
        if (ends - now < minRemaining) timing("INSTALLATION_WINDOW_EXPIRED_OR_TOO_SHORT", `${base}/selected_source/installation_expires_at_utc_ms`);
        if (ends - now > maxWindow) errors.push({ code: "INSTALLATION_WINDOW_NOT_FINITE", path: `${base}/selected_source/installation_expires_at_utc_ms` });
        if (c.installation_scope.valid_until_ms - now < minRemaining)
          timing("INSTALLATION_SCOPE_EXPIRED_OR_TOO_SHORT", `${base}/config/installation_scope/valid_until_ms`);
        if (native === undefined || native - now < minRemaining)
          timing("NATIVE_ACCEPTANCE_EXPIRED_OR_TOO_SHORT", `${base}/selected_source/pins/native/expires_at`);
        if (from === undefined || from > now) timing("NATIVE_ACCEPTANCE_NOT_YET_EFFECTIVE", `${base}/selected_source/pins/native/effective_from`);
        if (options.trustExpiresAtMs !== undefined && ends > options.trustExpiresAtMs)
          timing("INSTALLATION_OUTLIVES_TRUST", `${base}/selected_source/installation_expires_at_utc_ms`);
      }
      // Structural limits the candidate / selected-source constructors enforce at start.
      if (c.installation_scope.valid_until_ms > ends) errors.push({ code: "SCOPE_OUTLIVES_INSTALLATION", path: `${base}/config/installation_scope/valid_until_ms` });
      if (native === undefined || from === undefined || native <= from) errors.push({ code: "NATIVE_WINDOW_INVERTED", path: `${base}/selected_source/pins/native` });
      else if (c.installation_scope.valid_until_ms > native) errors.push({ code: "SCOPE_OUTLIVES_NATIVE_ACCEPTANCE", path: `${base}/config/installation_scope/valid_until_ms` });
      const l = c.limits;
      if (l.ttl_ms < 1000 || l.ttl_ms > 60000 || l.maximum_unresolved > 128 || l.maximum_retained < l.maximum_unresolved || l.maximum_retained > 4096)
        errors.push({ code: "LEASE_LIMITS_OUT_OF_RANGE", path: `${base}/config/limits` });
      if (c.terminal.ttl_seconds > 60) errors.push({ code: "TERMINAL_TTL_OUT_OF_RANGE", path: `${base}/config/terminal/ttl_seconds` });
      if (s.pins.human.mapping_revision.split(":").slice(0, 2).join(":") !== "ts-user:" + s.pins.human.ts_user_id)
        errors.push({ code: "MAPPING_REVISION_TS_USER_MISMATCH", path: `${base}/selected_source/pins/human/mapping_revision` });
      if (s.transport.workload_id !== s.pins.binding.workload_id) errors.push({ code: "SOURCE_WORKLOAD_PIN_MISMATCH", path: `${base}/selected_source/pins/binding/workload_id` });
      if (accessDigest(c.limits) !== accessDigest([...selections, ...retained_recovery][0]!.config.limits)) errors.push({ code: "LIMITS_NOT_COMMON", path: `${base}/config/limits` });
      if (c.installation_scope.workspace_id !== entry.selector.workspace_id || c.installation_scope.environment !== entry.selector.environment)
        errors.push({ code: "SCOPE_SELECTOR_MISMATCH", path: `${base}/config/installation_scope` });
      if (s.transport.workload_id !== manifest.composition.expected_workload_id) errors.push({ code: "WORKLOAD_NOT_EXPECTED", path: `${base}/selected_source/transport/workload_id` });
      if (s.pins.binding.subject !== entry.selector.subject || s.pins.binding.workspace_id !== entry.selector.workspace_id ||
        s.pins.binding.environment !== entry.selector.environment || s.pins.binding.human_issuer !== entry.selector.human_issuer ||
        s.pins.human.portal_user_id !== entry.selector.portal_user_id ||
        accessDigest(s.pins.domain) !== accessDigest(entry.selector.domain))
        errors.push({ code: "SELECTOR_PIN_MISMATCH", path: `${base}/selector` });
      if (c.issuer !== entry.selector.human_issuer) errors.push({ code: "ISSUER_SELECTOR_MISMATCH", path: `${base}/config/issuer` });
    });
    summary.window_remaining_ms.installation = shortest;
    const identities = new Set<string>();
    [...selections, ...retained_recovery].forEach(entry => {
      const t = entry.config.selected_source.transport;
      let origin = "";
      try { origin = new URL(t.origin).origin; } catch { errors.push({ code: "SOURCE_ORIGIN_INVALID", path: "/composition" }); return; }
      const id = accessDigest({ origin, pm: t.pm_leaf_sha256, workload: t.workload_id, pins: entry.config.selected_source.pins });
      if (identities.has(id)) errors.push({ code: "DUPLICATE_SOURCE_IDENTITY", path: "/composition" });
      identities.add(id);
    });
    // Active selection must be a principal of its own workspace's owner intake (composeNativeCore).
    selections.forEach((entry, i) => {
      const pin = owner_intakes.find(p => p.target.workspace_id === entry.selector.workspace_id);
      if (!pin || !pin.target.principal_workspace_pins.some(p => p.user_id === entry.selector.portal_user_id && p.workspace_id === entry.selector.workspace_id))
        errors.push({ code: "SELECTION_NOT_IN_OWNER_INTAKE", path: `/composition/selections/${i}/selector` });
    });
    owner_intakes.forEach((pin, i) => {
      const left = pin.intake_not_after_ms - now;
      summary.window_remaining_ms.owner_intake = summary.window_remaining_ms.owner_intake === null ? left : Math.min(summary.window_remaining_ms.owner_intake, left);
      if (pin.intake_not_before_ms > now) errors.push({ code: "OWNER_INTAKE_NOT_YET_OPEN", path: `/composition/owner_intakes/${i}/intake_not_before_ms` });
      if (left < minRemaining) errors.push({ code: "OWNER_INTAKE_EXPIRED_OR_TOO_SHORT", path: `/composition/owner_intakes/${i}/intake_not_after_ms` });
      if (left > maxWindow) errors.push({ code: "OWNER_INTAKE_NOT_FINITE", path: `/composition/owner_intakes/${i}/intake_not_after_ms` });
    });
    if (options.researchReview !== false) {
      const workspace = options.workspaceId ?? selections[0]?.selector.workspace_id ?? "";
      try { nativeCoreResearchReviewTarget(manifest, workspace); }
      catch { errors.push({ code: "RESEARCH_REVIEW_CEILING_NOT_MET", path: "/composition" }); }
    }
    // 3. Pin <-> artifact (installer's independent checks, performed here first).
    owner_intakes.forEach((pin, i) => {
      if (pin.approved_sha256 !== summary.owner_artifact_sha256) errors.push({ code: "OWNER_ARTIFACT_SHA256_PIN_MISMATCH", path: `/composition/owner_intakes/${i}/approved_sha256` });
      // Plan B caps ride in the hash-pinned manifest and are what the installer enforces.
      const at = `/composition/owner_intakes/${i}/grant_window`;
      if (planB && !pin.grant_window) errors.push({ code: "GRANT_WINDOW_PIN_MISSING", path: at });
      if (!planB && pin.grant_window) errors.push({ code: "GRANT_WINDOW_PIN_IN_READ_ONLY_PLAN", path: at });
      if (planB && pin.grant_window && options.trustExpiresAtMs !== undefined && pin.grant_window.trust_not_after_ms > options.trustExpiresAtMs)
        errors.push({ code: "GRANT_WINDOW_PIN_OUTLIVES_TRUST", path: `${at}/trust_not_after_ms` });
      if (artifact && accessDigest(artifact.target) !== accessDigest(pin.target)) errors.push({ code: "OWNER_TARGET_PIN_MISMATCH", path: `/composition/owner_intakes/${i}/target` });
    });
  }

  // 4. Artifact: the installer's exact binding rules, finite validity, READ/STREAM plan.
  if (artifact) {
    const { target, policy, manager_domain_grants } = artifact;
    if (policy.state !== "REVIEWED" || policy.qualification !== "OWNER_VERIFIED") errors.push({ code: "POLICY_NOT_OWNER_REVIEWED", path: "/policy" });
    if (policy.workspace_id !== target.workspace_id || policy.protected_owner_user_id !== target.protected_owner_user_id)
      errors.push({ code: "POLICY_TARGET_MISMATCH", path: "/policy" });
    if (new Set(target.principal_workspace_pins.map(p => p.user_id)).size !== target.principal_workspace_pins.length)
      errors.push({ code: "PRINCIPAL_PINS_NOT_UNIQUE", path: "/target/principal_workspace_pins" });
    const ids = new Set<string>(), seals = policy.manager_read_domains ?? [];
    if (seals.length === 0) errors.push({ code: "NO_REVIEWED_FIELD_SEAL", path: "/policy/manager_read_domains" });
    let shortestGrant: number | null = null;
    manager_domain_grants.forEach((g, i) => {
      const at = `/manager_domain_grants/${i}`;
      if (ids.has(g.grant_id)) errors.push({ code: "GRANT_ID_DUPLICATE", path: `${at}/grant_id` });
      ids.add(g.grant_id);
      if (g.workspace_id !== target.workspace_id || g.issued_by !== target.protected_owner_user_id ||
        g.policy_revision !== policy.revision || g.revoked_at_ms !== null ||
        !target.principal_workspace_pins.some(p => p.user_id === g.subject_user_id && p.workspace_id === target.workspace_id))
        errors.push({ code: "GRANT_BINDING_MISMATCH", path: at });
      const seal = seals.find(s => s.environment === g.environment && accessDigest(s.domain) === accessDigest(g.domain) &&
        s.field_policy_ref === g.field_policy_ref && s.valid_from_ms <= g.valid_from_ms && s.valid_until_ms >= g.valid_until_ms);
      if (!seal) errors.push({ code: "GRANT_OUTSIDE_FIELD_SEAL", path: at });
      if (g.effect === "DENY") { summary.grants.deny++; warnings.push({ code: "DENY_GRANT_IN_FIRST_INSTALL", path: at }); return; }
      if (g.action === "business.read_all") summary.grants.business_read_all_allow++; else summary.grants.stream_subscribe_allow++;
      const left = g.valid_until_ms - now;
      shortestGrant = shortestGrant === null ? left : Math.min(shortestGrant, left);
      if (g.valid_from_ms > now) errors.push({ code: "GRANT_NOT_YET_VALID", path: `${at}/valid_from_ms` });
      if (left < minRemaining) errors.push({ code: "GRANT_EXPIRED_OR_TOO_SHORT", path: `${at}/valid_until_ms` });
      if (!planB && g.valid_until_ms - g.valid_from_ms > maxGrant) errors.push({ code: "GRANT_NOT_FINITE", path: `${at}/valid_until_ms` });
    });
    // Plan B: ONE artifact installs the READ and the STREAM grant together. Each is finite
    // (<= 2 h), has its own id and expiry, and ends no later than the renewed source trust,
    // judged against the STRICTER of the validator options and the installer's manifest pin.
    if (planB) {
      const pins = manifest?.composition.owner_intakes.filter(p => p.target.workspace_id === target.workspace_id) ?? [];
      const trusts = [options.trustExpiresAtMs, ...pins.map(p => p.grant_window?.trust_not_after_ms)].filter((v): v is number => v !== undefined);
      if (options.trustExpiresAtMs === undefined) errors.push({ code: "TRUST_END_REQUIRED_FOR_PLAN_B", path: "" });
      if (trusts.length > 0) {
        const window = { plan: "READ_AND_STREAM" as const,
          maximum_grant_ms: Math.min(maxGrant, ...pins.map(p => p.grant_window?.maximum_grant_ms ?? PLAN_B_MAXIMUM_GRANT_MS)),
          trust_not_after_ms: Math.min(...trusts) };
        for (const f of planBGrantFindings(manager_domain_grants, window, now))
          if (f.code !== "GRANT_ALREADY_EXPIRED")
            errors.push({ code: f.code, path: f.index === null ? "/manager_domain_grants" : `/manager_domain_grants/${f.index}/valid_until_ms` });
      }
    }
    summary.window_remaining_ms.shortest_grant = shortestGrant;
    for (const s of seals) if (s.valid_until_ms <= now) errors.push({ code: "FIELD_SEAL_EXPIRED", path: "/policy/manager_read_domains" });
    // READ and STREAM are independent: the plan states which are intended, and
    // STREAM may only ride on an exact READ (STREAM alone never grants READ).
    const key = (g: { subject_user_id: string; environment: string; domain: unknown; field_policy_ref: string }) =>
      accessDigest([g.subject_user_id, g.environment, g.domain, g.field_policy_ref]);
    const reads = new Set(manager_domain_grants.filter(g => g.action === "business.read_all" && g.effect === "ALLOW").map(key));
    const streams = manager_domain_grants.filter(g => g.action === "stream.subscribe" && g.effect === "ALLOW");
    if (reads.size === 0) errors.push({ code: "NO_READ_ALLOW_GRANT", path: "/manager_domain_grants" });
    if (plan === "read-only" && streams.length > 0) errors.push({ code: "STREAM_GRANT_IN_READ_ONLY_PLAN", path: "/manager_domain_grants" });
    if (plan === "read-and-stream" && streams.length === 0) errors.push({ code: "STREAM_GRANT_MISSING_FROM_READ_AND_STREAM_PLAN", path: "/manager_domain_grants" });
    streams.forEach(g => { if (!reads.has(key(g))) errors.push({ code: "STREAM_WITHOUT_MATCHING_READ", path: "/manager_domain_grants" }); });
    // 5. Runtime <-> artifact: every active selection must be readable under this artifact.
    if (manifest) manifest.composition.selections.forEach((entry, i) => {
      const matches = manager_domain_grants.filter(g => g.action === "business.read_all" && g.effect === "ALLOW" &&
        g.subject_user_id === entry.selector.portal_user_id && g.workspace_id === entry.selector.workspace_id &&
        g.environment === entry.selector.environment && accessDigest(g.domain) === accessDigest(entry.selector.domain));
      if (matches.length === 0) errors.push({ code: "SELECTION_HAS_NO_READ_GRANT", path: `/composition/selections/${i}/selector` });
      else if (matches.every(g => g.valid_until_ms < entry.config.installation_scope.valid_until_ms))
        warnings.push({ code: "GRANT_ENDS_BEFORE_INSTALLATION_SCOPE", path: `/composition/selections/${i}/selector` });
    });
  }
  return report();
}

/** Metadata-only view of one file: never an open/read of its bytes. */
export interface Core009StatLike { uid: number; mode: number; size: number; isFile(): boolean; isSymbolicLink(): boolean }
export interface Core009StatOptions {
  /** uid the standard `main` process runs as (it must OWN every private reference it loads). */
  runtimeUid?: number;
  /** Absolute path of the pinned manifest itself (CONTROL_API_NATIVE_CORE_CONFIG_FILE). */
  runtimePath?: string;
}
/** Mirrors the loaders' ownership/mode/size gates using lstat ONLY, so a
 * root-only owner artifact and a service-owned reference set cannot be confused
 * before an installation window is spent. Reports kind+JSON path, never a file path. */
export async function statCore009References(runtimeBytes: Uint8Array,
  lstat: (path: string) => Promise<Core009StatLike>, options: Core009StatOptions = {}): Promise<Core009Finding[]> {
  const findings: Core009Finding[] = [];
  let value: unknown;
  try { value = JSON.parse(Buffer.from(runtimeBytes).toString("utf8")); } catch { value = undefined; }
  const parsed = nativeCoreRuntimeManifest.safeParse(value);
  if (!parsed.success) return [{ code: "RUNTIME_NOT_PARSEABLE_FOR_STAT", path: "" }];
  const check = async (kind: string, path: string, cap: number, uid: number | undefined, modes: readonly number[], at: string) => {
    let s: Core009StatLike;
    try { s = await lstat(path); } catch { findings.push({ code: `${kind}_UNAVAILABLE`, path: at }); return; }
    if (!s.isFile() || s.isSymbolicLink()) findings.push({ code: `${kind}_NOT_REGULAR_FILE`, path: at });
    if (!modes.includes(s.mode & 0o7777)) findings.push({ code: `${kind}_MODE_NOT_ALLOWED`, path: at });
    if (s.size < 1 || s.size > cap) findings.push({ code: `${kind}_SIZE_OUT_OF_RANGE`, path: at });
    if (uid !== undefined && s.uid !== uid) findings.push({ code: `${kind}_OWNER_MISMATCH`, path: at });
  };
  const owned = [0o400, 0o600];
  if (options.runtimePath) await check("RUNTIME_FILE", options.runtimePath, MAX_BYTES, options.runtimeUid, owned, "/runtime");
  const { selections, retained_recovery, owner_intakes } = parsed.data.composition;
  const entries = [...selections.map((e, i) => [`/composition/selections/${i}`, e] as const),
    ...retained_recovery.map((e, i) => [`/composition/retained_recovery/${i}`, e] as const)];
  for (const [at, e] of entries) {
    const tls = e.config.selected_source.transport.tls;
    await check("TLS_REF", tls.ca_ref.path, 32768, options.runtimeUid, owned, `${at}/tls/ca_ref`);
    await check("TLS_REF", tls.cert_ref.path, 32768, options.runtimeUid, owned, `${at}/tls/cert_ref`);
    await check("TLS_REF", tls.key_ref.path, 16384, options.runtimeUid, owned, `${at}/tls/key_ref`);
    await check("SIGNING_REF", e.config.private_key_ref.path, 16384, options.runtimeUid, owned, `${at}/config/private_key_ref`);
    await check("SIGNING_REF", e.config.terminal.private_key_ref.path, 16384, options.runtimeUid, owned, `${at}/config/terminal/private_key_ref`);
  }
  // Only the offline installer reads the owner artifact, and only as root with mode 0600.
  for (const [i, p] of owner_intakes.entries())
    await check("OWNER_ARTIFACT", p.artifact_path, MAX_BYTES, 0, [0o600], `/composition/owner_intakes/${i}/artifact_path`);
  return findings;
}
