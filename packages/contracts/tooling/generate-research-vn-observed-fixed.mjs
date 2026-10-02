/** Additive source-qualified FPT observed-date contracts. No legacy profile rewrite. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const profileId = "p10.vn-stock-daily-observed-fixed.v1";
const profileDigest = "acb6566ebae23bcf77c77974136c9d083a95f0967260b1332530f600f5abe00e";
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const ms = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const digest = { type: "string", pattern: "^[0-9a-f]{64}$" };
const closedPolicy = "SOURCE_LOCAL_DATE_OBSERVED_AT_AS_OF_V1";
export const vnObservedProvenance = obj({
  clock_basis: { const: "OBSERVED_SOURCE_LOCAL_DATE_V1" }, source_timezone: { const: "Asia/Ho_Chi_Minh" },
  metadata_index_revision: digest, metadata_index_source_manifest_digest: digest,
  metadata_index_as_of_utc_ms: ms, warmup_semantics: { const: "LAST_N_OBSERVED_PREDECESSORS_V1" }, warmup_start_utc_ms: ms,
});
export function amendVnObservedFixedOpenApi(original, file) {
  const d = JSON.parse(original), schemas = d.components.schemas, updates = {};
  const edit = name => updates[name] ??= structuredClone(schemas[name]);
  const addEnum = (s, value) => { if (!s.enum.includes(value)) s.enum.push(value); };
  if (file === "research-foundation") {
    const admission = edit("PortalAdmission"), profiles = admission.properties.profiles, props = profiles.items.properties;
    profiles.maxItems = 5;
    addEnum(props.profile_id, profileId);
    addEnum(props.reason, "SOURCE_PROFILE_UNQUALIFIED");
    if (!profiles.allOf.some(s => s.contains?.properties?.profile_id?.const === profileId))
      profiles.allOf.push({ contains: { type: "object", required: ["profile_id"], properties: { profile_id: { const: profileId } } }, minContains: 0, maxContains: 1 });
    Object.assign(props, { dataset_id: { const: "vn-stock-daily" }, symbol: { const: "FPT" }, source_timezone: { const: "Asia/Ho_Chi_Minh" },
      clock_basis: { const: "OBSERVED_SOURCE_LOCAL_DATE_V1" }, calendar_authority: { const: "NOT_PUBLISHED" },
      warmup_semantics: { const: "LAST_N_OBSERVED_PREDECESSORS_V1" }, account_model: { const: "GENERIC_SIGNAL_NOTIONAL_RESEARCH_NOT_VN_VENUE" } });
    updates.VnObservedDailyQualification = {
      ...obj({ state: { enum: ["AVAILABLE", "NOT_PUBLISHED"] }, reason_code: { enum: ["VN_OBSERVED_PROFILE_NOT_QUALIFIED", null] },
        profile_id: { const: profileId }, profile_digest: { const: profileDigest }, dataset_id: { const: "vn-stock-daily" },
        symbol: { const: "FPT" }, timeframe: { const: "1d" }, source_timezone: { const: "Asia/Ho_Chi_Minh" },
        clock_basis: { const: "OBSERVED_SOURCE_LOCAL_DATE_V1" }, index_revision: { anyOf: [digest, { type: "null" }] } }),
      description: "Private provider/index qualification projected as metadata only. An enabled flag alone never qualifies a dataset. No VN exchange/session authority is inferred.",
      allOf: [{ if: { properties: { state: { const: "AVAILABLE" } } }, then: { properties: { reason_code: { type: "null" }, index_revision: digest } },
        else: { properties: { reason_code: { const: "VN_OBSERVED_PROFILE_NOT_QUALIFIED" }, index_revision: { type: "null" } } } }],
    };
    edit("AtlasRelease").properties.vn_observed_daily_qualification = ref("VnObservedDailyQualification");
  } else if (file === "research-preflight") {
    updates.VnObservedProvenance = vnObservedProvenance;
    updates.ObservedTapeQuality = obj({ rows: { type: "integer", minimum: 1 }, gaps: { type: "null" }, duplicates: { const: 0 },
      gap_ratio: { type: "null" }, passed: { const: true }, reason_codes: { type: "array", maxItems: 0 },
      missing_bar_count: { type: "null" }, state: { const: "OBSERVED_TAPE_INTEGRITY_ONLY" } });
    if (schemas.Quality.properties) updates.RegularSnapshotQuality = structuredClone(schemas.Quality);
    updates.Quality = { oneOf: [ref("RegularSnapshotQuality"), ref("ObservedTapeQuality")],
      description: "Observed-tape integrity does not certify a trading calendar: expected session gaps remain unknown/null, not zero." };
    for (const name of ["DatasetBinding", "EffectiveDataBinding"]) {
      const binding = edit(name);
      binding.properties.closed_bar_policy = { enum: ["CLOSED_BARS_ONLY", closedPolicy] };
      binding.properties.provenance = ref("VnObservedProvenance");
      binding.allOf = [{ if: { properties: { closed_bar_policy: { const: closedPolicy } } }, then: {
        required: ["provenance"], properties: { timezone: { const: "Asia/Ho_Chi_Minh" }, ...(name === "DatasetBinding" ? {
          dataset_id: { const: "vn-stock-daily" }, symbol: { const: "FPT" }, timeframe: { const: "1d" },
        } : {}) },
      }, else: { not: { required: ["provenance"] } } }];
    }
    const snapshot = edit("Snapshot");
    snapshot.properties.closed_bar_policy = { enum: ["CLOSED_BARS_ONLY", closedPolicy] };
    const provenanceKeys = ["clock_basis", "source_timezone", "metadata_index_revision", "metadata_index_source_manifest_digest",
      "metadata_index_as_of_utc_ms", "warmup_start_utc_ms", "warmup_semantics", "daily_timestamp_basis",
      "session_quality_state", "session_quality_reason_code", "instrument_metadata_state", "instrument_metadata_reason_code"];
    for (const key of provenanceKeys) addEnum(snapshot.properties.provenance.propertyNames, key);
    snapshot.allOf = [{ if: { properties: { closed_bar_policy: { const: closedPolicy } } }, then: { properties: {
      timezone: { const: "Asia/Ho_Chi_Minh" }, quality: ref("ObservedTapeQuality"),
      provenance: { required: Object.keys(vnObservedProvenance.properties), properties: vnObservedProvenance.properties },
    } }, else: { properties: { quality: ref("RegularSnapshotQuality") } } }];
  } else if (file === "research-current-source") {
    addEnum(edit("LaneNotApplicable").properties.lane.properties.run_profile, "VN_OBSERVED_FIXED_QUALIFICATION");
  } else if (file === "research-split" || file === "research-search") {
    const visit = value => {
      if (!value || typeof value !== "object") return;
      if (value.enum?.includes("P04_OBSERVED_AFTER_FIXED_PROFILE")) addEnum(value, "VN_OBSERVED_AFTER_FIXED_PROFILE");
      for (const child of Object.values(value)) visit(child);
    };
    for (const name of Object.keys(schemas)) {
      const old = schemas[name], candidate = structuredClone(old); visit(candidate);
      if (JSON.stringify(old) !== JSON.stringify(candidate)) updates[name] = candidate;
    }
  }
  let next = original;
  for (const [name, value] of Object.entries(updates)) {
    if (schemas[name]) next = replaceComponent(next, name, value, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${name}": ${JSON.stringify(value)},\n`);
  }
  return next;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const targets = ["research-foundation", "research-preflight", "research-current-source", "research-split", "research-search"];
  const only = process.argv.find(arg => arg.startsWith("--only="))?.slice(7);
  if (only !== undefined && !targets.includes(only)) throw new Error("Named VN contract target required");
  for (const file of only === undefined ? targets : [only]) {
    const path = new URL(`../openapi/${file}.openapi.json`, import.meta.url), old = readFileSync(path, "utf8"), next = amendVnObservedFixedOpenApi(old, file);
    if (process.argv.includes("--check")) { if (next !== old) throw new Error(`VN observed contract drift: ${file}`); }
    else if (next !== old) writeFileSync(path, next);
  }
}
