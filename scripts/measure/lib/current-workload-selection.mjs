/** CORE-07 opt-in selection for M5/M7. Preparation is NOT approval or a load run.
 * Reads pinned public JSON/OpenAPI inputs only; never opens credentials, calls
 * a source, starts collectors or substitutes the fixture workload/IDs.
 */
import { readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { buildCurrentManagerWorkload, createCurrentManagerInventory,
  preflightCurrentManagerWorkload } from "./current-manager-workload.mjs";
import { readPinnedJson } from "./pinned-json.mjs";
import { loadWindow } from "./window.mjs";

export const CURRENT_SELECTION_SCHEMA = "portal.elp2-10.current-manager-workload-selection.v1";
export const CURRENT_COLLECTORS_SCHEMA = "portal.elp2-10.collector-preparation.v1";
const HASH = /^sha256:[a-f0-9]{64}$/;
const SHA = /^[a-f0-9]{40}$/;
const fail = code => { throw new Error(`REFUSED:CURRENT_WORKLOAD_${code}`); };
const object = v => v !== null && typeof v === "object" && !Array.isArray(v);
const text = v => typeof v === "string" && v.trim().length > 0 && v.length <= 4096 && !/[\u0000-\u001f\u007f]/.test(v);
const pin = v => object(v) && text(v.ref) && HASH.test(v.sha256);
const closed = (v, fields, code) => { if (!object(v) || Object.keys(v).some(k => !fields.includes(k))) fail(code); };
const schemaCheck = fn => {
  try { return fn(); } catch (e) { if (e.code) fail(`SCHEMA:${e.code}`); throw e; }
};

/** Recheck immediately before credential I/O too: compilation time cannot
 * consume the drain reserve approved at the first preflight clock. */
export function assertCurrentWorkloadDrain(window, durationMs, nowMs) {
  if (nowMs + durationMs + 20_000 > window.ends_at_ms || durationMs + 15_000 > window.max_duration_ms)
    fail("WINDOW_DRAIN_RESERVE");
}

/** File hash is computed from the same bytes that are parsed. Absolute file
 * references are private operator inputs, never URLs or credential material.
 */
function artifact(reference, base, read, code) {
  closed(reference, ["file", "sha256"], `${code}_REFERENCE`);
  if (!text(reference.file) || !HASH.test(reference.sha256)) fail(`${code}_REFERENCE`);
  const file = isAbsolute(reference.file) ? reference.file : resolve(base, reference.file);
  const body = readPinnedJson(file, reference.sha256, `CURRENT_WORKLOAD_${code}_DIGEST_MISMATCH`, { read });
  if (!object(body)) fail(`${code}_SHAPE`);
  // A pin belongs to the enclosing reference, not a self-hash inside JSON.
  if (Object.hasOwn(body, "sha256")) fail(`${code}_SELF_HASH_NOT_SUPPORTED`);
  return { ...body, sha256: reference.sha256 };
}

function collectorsReady(collectors, { budget, target, workload, window }) {
  closed(collectors, ["schema_version", "status", "window_id", "workload_sha256", "target_sha256", "budget_sha256",
    "clock", "collectors", "stop_restore", "teardown", "sha256"], "COLLECTORS_SHAPE");
  if (collectors.schema_version !== CURRENT_COLLECTORS_SCHEMA || collectors.status !== "OWNER_APPROVED" ||
    collectors.window_id !== window.window_id || collectors.workload_sha256 !== workload.digest_input ||
    collectors.target_sha256 !== target.sha256 || collectors.budget_sha256 !== budget.sha256 ||
    !pin(collectors.clock) || !pin(collectors.stop_restore) || !pin(collectors.teardown)) fail("COLLECTORS_BINDING");
  const rows = collectors.collectors;
  if (!Array.isArray(rows) || rows.length !== 14 || rows.some(r => !pin(r) || !text(r.group) || !text(r.owner)) ||
    new Set(rows.map(r => r.group)).size !== 14) fail("COLLECTOR_POPULATION");
  if (JSON.stringify(rows.map(r => r.group).sort()) !== JSON.stringify(budget.numeric_group_pins.map(r => r.group).sort()))
    fail("COLLECTOR_BUDGET_GROUP_MISMATCH");
}

/** Compile one explicitly selected manifest. Missing owner inputs may be
 * reported in a --dry-run; actual load selection refuses them. No caller flag
 * or coherent TEST_ONLY artifact is promoted into authority_verified=true.
 * `read` is injectable for focused tests, never a transport implementation.
 */
export function selectCurrentManagerWorkload({ manifestPath, manifestSha256, root, measurement, stage, durationMs,
  window = null, repin = null, repinMaxAgeMs = 0, nowMs = Date.now(), dryRun = false, read = readFileSync }) {
  if (!text(manifestPath) || !HASH.test(manifestSha256)) fail("MANIFEST_PIN_REQUIRED");
  if (!["M-5", "M-7"].includes(measurement) || !["B1", "B2"].includes(stage) ||
    !Number.isSafeInteger(durationMs) || durationMs < 1 || !Number.isSafeInteger(nowMs)) fail("STAGE_DURATION_OR_CLOCK");
  const manifest = readPinnedJson(manifestPath, manifestSha256, "CURRENT_WORKLOAD_MANIFEST_DIGEST_MISMATCH", { read });
  closed(manifest, ["schema_version", "contracts", "context", "groups", "cadence_ms", "seed", "target", "budget", "collectors"], "MANIFEST_SHAPE");
  if (manifest.schema_version !== CURRENT_SELECTION_SCHEMA || !Array.isArray(manifest.contracts) || !manifest.contracts.length)
    fail("MANIFEST_SCHEMA");
  if (typeof root !== "string" || !isAbsolute(root)) fail("REPOSITORY_ROOT_REQUIRED");
  const repository = resolve(root), base = dirname(resolve(manifestPath));
  const sources = manifest.contracts.map(p => {
    closed(p, ["file", "sha256"], "CONTRACT_REFERENCE");
    if (!text(p.file) || isAbsolute(p.file) || !HASH.test(p.sha256)) fail("CONTRACT_REFERENCE");
    const file = resolve(repository, p.file);
    if (!file.startsWith(`${repository}${sep}packages${sep}contracts${sep}openapi${sep}`)) fail("CONTRACT_OUTSIDE_PUBLISHED_ROOT");
    const bytes = read(file);
    // Inventory also applies its fixed current-contract allowlist.
    return { file: p.file, bytes, sha256: p.sha256 };
  });
  const inventory = schemaCheck(() => createCurrentManagerInventory(sources));
  const workload = schemaCheck(() => buildCurrentManagerWorkload({ inventory, context: manifest.context, groups: manifest.groups,
    cadence_ms: manifest.cadence_ms, seed: manifest.seed }));
  const missing = [];
  const selected = {};
  for (const name of ["target", "budget", "collectors"]) {
    if (manifest[name] === undefined) missing.push(`OWNER_${name.toUpperCase()}_ARTIFACT`);
    else selected[name] = artifact(manifest[name], base, read, name.toUpperCase());
  }
  if (!window) missing.push("MATCHED_MEASUREMENT_WINDOW");
  if (!repin) missing.push("FRESH_TARGET_REPIN");
  if (missing.length && !dryRun) fail(`OWNER_INPUTS_REQUIRED:${missing.join(",")}`);
  let preflight = null;
  if (!missing.length) {
    const { target, budget, collectors } = selected;
    if (window.current_workload_manifest_sha256 !== manifestSha256) fail("WINDOW_MANIFEST_BINDING");
    preflight = schemaCheck(() => preflightCurrentManagerWorkload({ workload, inventory, target, budget, window, measurement, stage,
      duration_ms: durationMs, now_ms: nowMs }));
    if (!SHA.test(repin.edge_sha) || !SHA.test(repin.pm_sha) || !SHA.test(repin.core_source_sha) ||
      !Number.isSafeInteger(repin.observed_at_ms) || repin.observed_at_ms > nowMs ||
      !Number.isSafeInteger(repinMaxAgeMs) || repinMaxAgeMs <= 0 || nowMs - repin.observed_at_ms > repinMaxAgeMs ||
      repin.lease_root_user_checked !== true || !Array.isArray(repin.competing_jobs) || repin.competing_jobs.length ||
      repin.core_source_sha !== target.source_sha || repin.core_image_digest !== target.image_digest ||
      repin.core_config_sha256 !== target.config_sha256 || repin.core_schema_sha256 !== target.schema_sha256) fail("REPIN_TARGET_MISMATCH");
    collectorsReady(collectors, { budget, target, workload, window });
    // Existing replay uses a 15s request timeout and drains pending requests.
    // Reserve that bounded drain PLUS the existing 5s window guard; never
    // declare load finished while a late request can outlive its owner window.
    assertCurrentWorkloadDrain(window, durationMs, nowMs);
  }
  return { workload, preparation: {
    schema_version: "portal.elp2-10.current-manager-workload-dry-run.v1",
    status: missing.length ? "BLOCKED_MISSING_OWNER_INPUTS" : "PREFLIGHT_VALIDATED_NOT_EXECUTED",
    measurement, stage, duration_ms: durationMs, dry_run: dryRun,
    manifest_sha256: manifestSha256, workload_sha256: workload.digest_input,
    total_tabs: workload.stages[stage].reduce((n, e) => n + e.tabs, 0),
    request_count: workload.requests.length, context: workload.context, contract_pins: workload.contract_pins,
    owner_artifact_pins: Object.fromEntries(Object.entries(selected).map(([name, body]) => [name, body.sha256])),
    inventory: { get_operations: inventory.operations.length, finite_json: inventory.operations.filter(o => o.finite).length,
      nonfinite_refused: inventory.operations.filter(o => !o.finite).length },
    missing_inputs: missing, preflight, authority_verified: false, execution_authorized: false, calibration_evidence: false,
    collector_preparation: selected.collectors ? { status: missing.length ? "UNVALIDATED_PENDING_OTHER_INPUTS" : "STRUCTURALLY_MATCHED_NOT_STARTED",
      group_count: selected.collectors.collectors?.length ?? null, sha256: selected.collectors.sha256 } : { status: "NOT_SUPPLIED" },
    stop_cleanup: { request_timeout_ms: 15000, drain_reserve_ms: 15000, window_guard_ms: 5000,
      stop_conditions: ["STOP_429", "STOP_5XX_RATE", "STOP_NETWORK_RATE", "STOP_OVERLOAD", "STOP_SIGNAL", "OWNER_WINDOW_END"],
      collectors_started: false, requests_started: 0, credentials_opened: false,
      session_revocation: "OWNER_OFFICIAL_REVOCATION_AND_CUSTODY_READBACK_REQUIRED_AFTER_REAL_RUN",
      stop_restore: "OWNER_PINNED_STOP_RESTORE_AND_COLLECTOR_TEARDOWN_REQUIRED" },
    limitations: ["Structure/pin checks are not verification that a claimed owner approved an artifact.",
      "Dry run starts no load, collector, credential, source request or authority mutation.",
      "Existing live window/repin/plan and replay safety gates still apply before real load.",
      "No G2 apparatus, capacity result, financial source qualification or calibrated setting is inferred."],
  } };
}

/** Opt-in flags are mutually exclusive with fixture rewriting/selftests/G2
 * result ingestion. Calling an old/default path remains entirely unchanged.
 */
export function assertCurrentWorkloadFlags(args, legacyWorkload) {
  const selected = Boolean(args["current-workload-manifest"] || args["current-workload-manifest-sha256"]);
  if (!selected) { if (args["dry-run"]) fail("DRY_RUN_REQUIRES_CURRENT_MANIFEST"); return false; }
  if (!args["current-workload-manifest"] || !HASH.test(args["current-workload-manifest-sha256"])) fail("MANIFEST_PIN_REQUIRED");
  if (args.selftest || args.ingest || args["id-map"] || args.workload !== legacyWorkload) fail("INCOMPATIBLE_LEGACY_OR_INGEST_FLAGS");
  return true;
}

/** Public-only CLI preparation. A missing owner/plan input is an explicit
 * BLOCKED result, not a fabricated future window or an authorization record.
 * Present-but-invalid pins fail closed. No credential path is opened/returned.
 */
export function prepareCurrentManagerDryRun({ args, root, measurement, nowMs = Date.now() }) {
  let window = null, repin = null, plan = null;
  if (args.authorization || args["authorization-sha256"]) window = loadWindow(args.authorization, args["authorization-sha256"],
    { measurement, nowMs, allowLanes: ["REAL_READ_RETAINED", "REAL_READ_QUALIFIED"] });
  if (args.repin) repin = JSON.parse(readFileSync(args.repin, "utf8"));
  if (measurement === "M-5" && (args.plan || args["plan-sha256"])) {
    if (!args.plan || !HASH.test(args["plan-sha256"])) fail("PLAN_PIN_REQUIRED");
    plan = readPinnedJson(args.plan, args["plan-sha256"], "CURRENT_WORKLOAD_PLAN_DIGEST_MISMATCH");
    if (plan.schema_version !== "portal.elp2-10.coexistence-plan.v1" ||
      !Array.isArray(plan.stage_orders?.[args["repetition-id"]]) || !plan.stage_orders[args["repetition-id"]].includes(args.stage)) fail("PLAN_STAGE_OR_REPETITION");
  }
  const durationMs = args["duration-ms"] || plan?.minimum_duration_ms;
  if (plan && (!Number.isSafeInteger(plan.minimum_duration_ms) || plan.minimum_duration_ms < 1 || durationMs < plan.minimum_duration_ms)) fail("PLAN_MINIMUM_DURATION");
  const selected = selectCurrentManagerWorkload({ manifestPath: args["current-workload-manifest"],
    manifestSha256: args["current-workload-manifest-sha256"], root, measurement, stage: args.stage,
    durationMs, window, repin, repinMaxAgeMs: args["repin-max-age-ms"], nowMs, dryRun: true });
  if (plan && plan.portal_workload_sha256 !== selected.workload.digest_input) fail("PLAN_WORKLOAD_MISMATCH");
  if (measurement === "M-5" && !plan) {
    selected.preparation.missing_inputs.push("MATCHED_COEXISTENCE_PLAN_AND_REPETITION");
    selected.preparation.status = "BLOCKED_MISSING_OWNER_INPUTS";
  }
  return { ...selected.preparation, proposed_workload: selected.workload };
}
