/** Additive Replay presentation, preserving immutable source revisions/fixtures. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const nullable = schema => ({ anyOf: [schema, { type: "null" }] });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const count = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const ms = count;
const reason = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" };
const availability = obj({ state: { enum: ["AVAILABLE", "NOT_PUBLISHED", "NOT_APPLICABLE"] }, reason_code: nullable(reason) });
const identity = obj({ alpha_id: nullable({ type: "string", minLength: 1, maxLength: 191 }),
  alpha_version_id: nullable({ type: "string", minLength: 1, maxLength: 191 }),
  basis: { enum: ["IMMUTABLE_REQUEST_ALPHA_BINDING", "HUB_BOUND_ALPHA_IDENTITY"] }, availability });
identity.allOf = [{ if: { properties: { availability: { properties: { state: { const: "AVAILABLE" } } } } },
  then: { properties: { alpha_id: { type: "string" }, alpha_version_id: { type: "string" },
    availability: { properties: { reason_code: { type: "null" } } } } },
  else: { properties: { alpha_id: { type: "null" }, alpha_version_id: { type: "null" },
    availability: { properties: { reason_code: reason } } } } }];
const window = obj({ window: { enum: ["IS", "OOS", "HOLDOUT"] },
  start_utc_ms: nullable(ms), end_utc_ms: nullable(ms), bars: nullable(count),
  bounds_semantics: nullable({ enum: ["START_INCLUSIVE_END_EXCLUSIVE", "SOURCE_RETAINED_FOLD_BOUNDS"] }),
  count_basis: nullable({ enum: ["FULL_SOURCE_WINDOW_OBSERVATIONS", "SUM_OF_FOLD_WINDOWS_MAY_OVERLAP"] }),
  segments: { type: "array", maxItems: 256, items: obj({ fold_id: { type: "string", minLength: 1, maxLength: 191 },
    start_utc_ms: ms, end_utc_ms: ms, bars: nullable(count) }) },
  basis: { enum: ["BOUND_WINDOW_METADATA", "DECLARED_IS_WINDOW", "DECLARED_OOS_WINDOW", "DECLARED_HOLDOUT_WINDOW",
    "RETAINED_FOLD_TRAIN_WINDOWS", "RETAINED_FOLD_TEST_WINDOWS"] }, availability });
window.description = "Existing immutable metadata only. Retained fold start/end are exact source bounds, not converted half-open dates; the top range is an envelope, not contiguous coverage. Sum counts may overlap and are not unique bars. A partial NOT_PUBLISHED object may retain known bounds. Holdout never publishes bars or source values.";
window.allOf = [{ if: { properties: { availability: { properties: { state: { const: "AVAILABLE" } } } } },
  then: { properties: { start_utc_ms: ms, end_utc_ms: ms, bars: count,
    bounds_semantics: { type: "string" }, count_basis: { type: "string" },
    availability: { properties: { reason_code: { type: "null" } } } } },
  else: { properties: { availability: { properties: { reason_code: reason } } } } },
  { if: { properties: { window: { const: "HOLDOUT" } } }, then: { properties: {
    bars: { type: "null" }, count_basis: { type: "null" }, segments: { maxItems: 0 },
    availability: { properties: { state: { enum: ["NOT_PUBLISHED", "NOT_APPLICABLE"] } } } } } }];

export function amendReplayNavigation(original, name) {
  const document = JSON.parse(original), schemas = document.components.schemas;
  const replay = structuredClone(schemas.Replay);
  const fields = replay.properties ?? replay.allOf.find(row => row.properties)?.properties;
  if (!fields) throw new Error(`Missing Replay fields in ${name}`);
  Object.assign(fields, {
    identity: { $ref: "#/components/schemas/ReplayNavigationIdentity" },
    is_window: { $ref: "#/components/schemas/ReplayNavigationWindow" },
    oos_window: { $ref: "#/components/schemas/ReplayNavigationWindow" },
    holdout_window: { $ref: "#/components/schemas/ReplayNavigationWindow" },
    presentation_revision: { const: "research.replay-navigation.v1", description: "Separate additive presentation; immutable replay source revision, source digest and frozen Report/RC pins are unchanged." },
    presentation_digest: { type: "string", pattern: "^[0-9a-f]{64}$", description: "Canonical SHA256 of presentation_revision plus identity/is_window/oos_window/holdout_window. Neither a source digest nor an HTTP cache validator (Replay is private no-store)." },
  });
  let next = original;
  for (const [key, value] of Object.entries({ Replay: replay, ReplayNavigationIdentity: identity, ReplayNavigationWindow: window })) {
    if (schemas[key]) next = replaceComponent(next, key, value, next.indexOf('"schemas": {'));
    else next = next.replace('"schemas": {\n', `"schemas": {\n      "${key}": ${JSON.stringify(value)},\n`);
  }
  return next;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const names = process.argv.find(value => value.startsWith("--only="))?.slice(7).split(",")
    ?? ["research-replay", "research-current-source"];
  for (const name of names) {
    if (!["research-replay", "research-current-source"].includes(name)) throw new Error("Unexpected Replay navigation contract");
    const path = new URL(`../openapi/${name}.openapi.json`, import.meta.url);
    const old = readFileSync(path, "utf8"), next = amendReplayNavigation(old, name);
    if (process.argv.includes("--check")) { if (old !== next) throw new Error(`Replay navigation drift: ${name}`); }
    else if (next !== old) writeFileSync(path, next);
  }
}
