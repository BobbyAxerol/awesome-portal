/** Group 4: exact P11 orchestration observations, never engine freeze/read clocks. */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { replaceComponent } from "./generate-research-progress-truth.mjs";

const ref = name => ({ $ref: `#/components/schemas/${name}` });
const nullable = value => ({ anyOf: [value, { type: "null" }] });
const obj = properties => ({ type: "object", additionalProperties: false, required: Object.keys(properties), properties });
const reason = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,159}$" };
const keys = ["s3_completed", "s4_started", "s4_completed"];

export const p11StageEventsSchema = {
  ...obj({
    schema_version: { const: "research.p11-stage-event-clocks.v1" },
    source: { const: "P11_STAGE_EVENTS" },
    semantics: { const: "PORTAL_ORCHESTRATION_NOT_ENGINE_SEARCH_FREEZE_OR_OOS_READ" },
    source_binding_digest: { ...nullable(ref("Digest")), description: "Hash of exact retained artifact, producer attempt/lease, request/effective/data and historical execution profile bindings. Private attempt identifiers are not exposed." },
    ...Object.fromEntries(keys.map(key => [`${key}_utc_ms`, nullable(ref("UtcMs"))])),
    reason_codes: obj(Object.fromEntries(keys.map(key => [key, nullable(reason)]))),
  }),
  allOf: keys.map(key => ({
    if: { properties: { [`${key}_utc_ms`]: { type: "null" } } },
    then: { properties: { reason_codes: { properties: { [key]: reason } } } },
    else: { properties: { source_binding_digest: ref("Digest"), reason_codes: { properties: { [key]: { type: "null" } } } } },
  })),
  description: "P11 records Portal orchestration, not engine chronology: S3 completion can precede the actual study inside S4. No search-completed, pool-frozen, first-OOS-read or causal-order assertion is inferred. Missing fields carry individual reasons; legacy responses may omit this additive block.",
};

export function amendP11StageEventsOpenApi(original) {
  const document = JSON.parse(original);
  const schemas = document.components.schemas;
  const search = structuredClone(schemas.Search);
  const searchBody = search.allOf?.find(value => value.properties?.pool);
  if (!searchBody || !schemas.FoldOrdering?.properties?.wall_clock || !schemas.SearchPool?.properties?.frozen_at_reason_code) {
    throw new Error("Missing named P11 consumer contracts");
  }
  searchBody.properties.stage_events = ref("P11StageEvents");
  const ordering = structuredClone(schemas.FoldOrdering);
  ordering.properties.stage_events = ref("P11StageEvents");
  const pool = structuredClone(schemas.SearchPool);
  pool.properties.frozen_at_utc_ms.description = "Legacy field: new responses return null because P11 S4 completion is not engine pool freeze. Retained P11 times are published separately in Search.stage_events.";
  pool.properties.frozen_at_source.description = "Legacy source tag accepted for historical captures only. New responses return null and never present S4 completion as pool freeze.";
  pool.properties.frozen_at_reason_code = nullable({ enum: ["P11_S4_COMPLETION_EVENT_NOT_RETAINED", "QUANTBT_WALK_FORWARD_DID_NOT_PUBLISH_POOL_FREEZE_CLOCK"] });
  let next = original;
  if (schemas.P11StageEvents) next = replaceComponent(next, "P11StageEvents", p11StageEventsSchema, next.indexOf('"schemas": {'));
  else {
    const anchor = '"schemas": {\n';
    if (!next.includes(anchor)) throw new Error("Missing current-source schemas anchor");
    next = next.replace(anchor, `${anchor}      "P11StageEvents": ${JSON.stringify(p11StageEventsSchema)},\n`);
  }
  for (const [name, value] of Object.entries({ Search: search, FoldOrdering: ordering, SearchPool: pool })) {
    next = replaceComponent(next, name, value, next.indexOf('"schemas": {'));
  }
  return next;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const path = new URL("../openapi/research-current-source.openapi.json", import.meta.url);
  const old = readFileSync(path, "utf8");
  const next = amendP11StageEventsOpenApi(old);
  if (process.argv.includes("--check")) {
    if (next !== old) throw new Error("Research P11 stage-event OpenAPI drift");
  } else if (next !== old) writeFileSync(path, next);
}
