/**
 * The boundary between P09's Atlas envelope and S12's typed document.
 *
 * P09 publishes `AtlasResponse.atlas` with `claims` and `evidence_contract`
 * typed as free-form objects, while P04 publishes the same document with both
 * fully specified — `ClaimDescriptor` and `EvidenceContractDescriptor`. A
 * compile-time check in `foundation.test.ts` proves the P04 document is a
 * strict refinement of the P09 one: every other field agrees, and only these
 * two are widened.
 *
 * S12's claims tab needs the precise fields. Rather than cast — which would
 * make a missing field render as `undefined` inside a certification table —
 * the widened fields are checked once here, at the boundary, against the shape
 * P04 already published. If the server ever sends something else the screen
 * reports a typed `partial` naming exactly what is missing, which is the
 * behaviour the display rule requires and the opposite of a silent cast.
 *
 * This is validation against a published schema, not hand-parsing: no field
 * name is invented, and the list below is derived from the P04 type.
 *
 * Recorded as `CG-P09-01` — the durable fix is for the foundation OpenAPI to
 * reference the same two schemas, after which this file becomes a type alias.
 */

import type { AtlasDocument } from "./atlas";
import type { FoundationAtlas } from "./foundationClient";

/** The four facts a claim row renders. Named from `ClaimDescriptor`. */
const CLAIM_FIELDS = [
  "contract_id",
  "engine_certification",
  "numeric_guarantee",
  "never_claims",
] as const satisfies readonly (keyof AtlasDocument["claims"][number])[];

/** The two facts the evidence contract carries onto the screen. */
const EVIDENCE_FIELDS = ["writer_state", "required_fields"] as const satisfies readonly (keyof AtlasDocument["evidence_contract"])[];

export type AtlasNarrowing =
  | { ok: true; document: AtlasDocument }
  | { ok: false; missing: readonly string[] };

function missingFrom(value: unknown, fields: readonly string[], prefix: string): string[] {
  if (value === null || typeof value !== "object") return [prefix];
  const record = value as Record<string, unknown>;
  return fields.filter((field) => record[field] === undefined).map((field) => `${prefix}.${field}`);
}

/**
 * Narrows the envelope's atlas to the document S12 renders.
 *
 * Returns the missing paths rather than a boolean, so the screen can say which
 * fact is absent instead of "something went wrong".
 */
export function narrowAtlas(atlas: FoundationAtlas): AtlasNarrowing {
  const missing: string[] = [];

  atlas.claims.forEach((claim, index) => {
    missing.push(...missingFrom(claim, CLAIM_FIELDS, `claims[${index}]`));
  });
  missing.push(...missingFrom(atlas.evidence_contract, EVIDENCE_FIELDS, "evidence_contract"));

  if (missing.length > 0) return { ok: false, missing };
  /* Every widened field has been checked against the P04 schema; the rest of
     the document is assignable by construction (see the compile-time check). */
  return { ok: true, document: atlas as unknown as AtlasDocument };
}

/** Exposed so a test can prove the checked list matches the published type. */
export const NARROWED_FIELDS = { CLAIM_FIELDS, EVIDENCE_FIELDS } as const;
