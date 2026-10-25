/**
 * BE-P21 (ELP2-10 C5): the CLOSED input / output shapes of the dark economic-source reducer.
 *
 * STATUS: PROPOSAL_NOT_A_PRODUCER_MAPPING. This file is Portal's own statement of the evidence the C5 handoff
 * (C5_FINANCIAL_PRODUCER_REVIEW_AND_CLAUDE_HANDOFF_2026-10-21, "PM/Edge return: one exact selected-producer mapping") says a
 * financial row must carry before two rows may be summed. It names SEMANTICS only. Every field name below is a Portal-side
 * proposal; none is a producer column, a wire name or a claim about what PM / TS / Edge publish. The producer mapping is owed by
 * PM/Edge (see the BE-P21 receipt) and nothing here may be read as accepted, qualified or commissioned.
 *
 * OPTIONAL OWNING ADAPTER: manager-economic-source-runtime.ts binds these
 * shapes to actual dataset/series callers only when an accepted server-side
 * producer mapping is explicitly installed. No such mapping is inferred from
 * existing account IDs or fixtures; WIRE_MAPPING_OPEN remains a source gate.
 * Pure reducer tests and the integration tests use TEST_ONLY synthetic rows.
 *
 * The rule set it carries is PM's returned rule (PM_OWNER_ACK_AND_NET_PNL_RETURN_2026-10-21, C5), and nothing else:
 *   1. equal rows with the same TRUSTED source id count once;      2. changed content under that identity is a conflict;
 *   3. different identities whose economic leaves overlap refuse;   4. only validated disjoint populations sum; missing expected
 *   source / valuation proof is PARTIAL, never zero.
 * Physical-account equality, equal money and different Portal fact ids prove neither duplication nor disjointness. Cumulative
 * snapshots are not events: one reduction is ONE cut, never a sum across time. `economic_account_ref` and `ownership_partition_ref`
 * stay typed-absent unless an accepted bridge provides them, and are never an identity, a dedupe key or a disjointness proof.
 */
import { z } from "zod";
import { exactDecimal, executionEnvironment, opaqueRevision, utcMilliseconds } from "./foundation.contract";

export const MANAGER_ECONOMIC_SOURCE_STATUS = "PROPOSAL_NOT_A_PRODUCER_MAPPING" as const;
export const MANAGER_ECONOMIC_SOURCE_REDUCER_REVISION = "manager-economic-source-reducer.proposal.v1" as const;
export const MAX_ECONOMIC_SOURCE_ROWS = 2_000;
export const MAX_ECONOMIC_LEAVES_PER_ROW = 256;
export const MAX_ECONOMIC_CENSUS_SOURCES = 2_000;
export const MAX_ECONOMIC_FINDINGS = 256;

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const digest = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const ms = utcMilliseconds;
const unique = (values: readonly string[]) => new Set(values).size === values.length;

/** Only the two metrics a source sum can serve. RETURN needs a denominator / scale no source publishes: it is not representable. */
export const economicSourceMetric = z.enum(["NAV", "NET_PNL"]);
export const economicRestatementRelation = z.enum(["ORIGINAL", "CORRECTED", "RESTATED"]);

/** PROPOSAL: a trusted row identity is a namespaced source id. Trust is NOT a property of the row: it is the caller's policy
 * (`trust_policy`), which an accepted bridge must supply. Id lifetime / reuse rules are owed by the producer. */
export const economicSourceIdentity = z.object({ namespace: text, source_id: text }).strict();
/** One cut. Effective / recorded are the two cutoffs the Manager document already separates; the valuation cutoff is distinct. */
export const economicCut = z.object({ effective_at_ms: ms, recorded_through_ms: ms }).strict();
export const economicWindow = z.object({ from_ms: ms, to_ms: ms }).strict()
  .refine(w => w.from_ms < w.to_ms, "ECONOMIC_WINDOW_INVALID");
/** A ref an accepted bridge may or may not provide. Absence is TYPED: the reducer never fills it and never keys on it. */
export const economicTypedRef = z.discriminatedUnion("state", [
  z.object({ state: z.literal("PROVIDED"), ref: text }).strict(),
  z.object({ state: z.literal("ABSENT"), reason_code: z.enum(["NO_ACCEPTED_BRIDGE", "NOT_PUBLISHED_BY_SOURCE"]) }).strict(),
]);
/** PROPOSAL: the valuation proof a row states. `null` on the row means "no valuation proof": PARTIAL, never zero. */
export const economicValuationProof = z.object({ valuation_cutoff_ms: ms, valuation_revision: opaqueRevision }).strict();
/** PROPOSAL: attribution evidence for a shared account. Weights are never inferred from capital / budget / deployment names. */
export const economicOwnershipProof = z.object({ ownership_revision: opaqueRevision, attribution_ref: text,
  assignment_digest: digest, owner_digest: digest, economic_account_ref: economicTypedRef, ownership_partition_ref: economicTypedRef }).strict();
/** PROPOSAL: cost layers the source states as included / missing (fees, funding, interest, borrow, slippage, other). Opaque names. */
export const economicCostLayers = z.object({ included: z.array(text).max(32), missing: z.array(text).max(32) }).strict()
  .refine(c => unique(c.included) && unique(c.missing) && c.included.every(x => !c.missing.includes(x)), "ECONOMIC_COST_LAYERS_INVALID");
export const economicRestatement = z.object({ relation: economicRestatementRelation, original_ref: text.nullable() }).strict()
  .refine(r => (r.relation === "ORIGINAL") === (r.original_ref === null), "ECONOMIC_RESTATEMENT_INVALID");

/** A row with the evidence PM's rule needs. */
export const economicProvenRow = z.object({
  evidence: z.literal("PROVEN_SOURCE_ROW"),
  /** Portal-side id. Informational: it is never identity, never a dedupe key, never a disjointness proof. */
  portal_fact_id: text,
  /** A hint only. Two logical accounts may share one physical pool; equality proves neither duplication nor disjointness. */
  physical_account_ref: text.nullable(),
  source_identity: economicSourceIdentity,
  /** Economic leaf identities the amount is made of (grammar owed by the producer). Compared as a set, by exact string. */
  leaves: z.array(text).min(1).max(MAX_ECONOMIC_LEAVES_PER_ROW),
  metric: economicSourceMetric,
  amount: exactDecimal,
  environment: executionEnvironment, currency: text, basis: text,
  cut: economicCut, window: economicWindow.nullable(),
  economic_revision: opaqueRevision, cashflow_revision: opaqueRevision,
  valuation: economicValuationProof.nullable(), ownership: economicOwnershipProof.nullable(),
  cost_layers: economicCostLayers, restatement: economicRestatement,
}).strict().refine(r => unique(r.leaves), "ECONOMIC_LEAVES_NOT_UNIQUE");

/** What pre-existing Portal facts look like: an amount and a Portal id. No trusted source id, no leaves, no census: unproven. */
export const economicLegacyRow = z.object({
  evidence: z.literal("LEGACY_UNPROVEN"),
  portal_fact_id: text, physical_account_ref: text.nullable(),
  amount: exactDecimal, currency: text.nullable(), basis: text.nullable(),
}).strict();
// z.union, not discriminatedUnion: the proven row carries a refinement (a ZodEffects), which a discriminated union cannot hold.
export const economicSourceRow = z.union([economicProvenRow, economicLegacyRow]);

/** The comparability keys every row must equal. A reduction is exactly one of these: it can never span cuts, currencies or revisions. */
export const economicExpectation = z.object({
  metric: economicSourceMetric, environment: executionEnvironment, currency: text, basis: text,
  cut: economicCut, valuation_cutoff_ms: ms, window: economicWindow.nullable(),
  revisions: z.object({ economic: opaqueRevision, cashflow: opaqueRevision, valuation: opaqueRevision, ownership: opaqueRevision }).strict(),
  restatement_relation: economicRestatementRelation,
}).strict();

/** The expected economic population for this expectation. `null` (not published) makes the reduction UNAVAILABLE. */
export const economicCensus = z.object({ census_ref: text,
  expected_sources: z.array(economicSourceIdentity).min(1).max(MAX_ECONOMIC_CENSUS_SOURCES) }).strict()
  .refine(c => unique(c.expected_sources.map(s => JSON.stringify([s.namespace, s.source_id]))), "ECONOMIC_CENSUS_DUPLICATE_SOURCE");

/** Which namespaces the caller (an accepted bridge) vouches for. Empty = nothing is trusted = everything is unproven. */
export const economicTrustPolicy = z.object({ policy_ref: text, accepted_namespaces: z.array(text).max(32) }).strict()
  .refine(p => unique(p.accepted_namespaces), "ECONOMIC_TRUST_POLICY_INVALID");

export const economicSourceReductionInput = z.object({
  schema_version: z.literal("portal.execution.manager-economic-source-reduction-input.proposal.v1"),
  expectation: economicExpectation, trust_policy: economicTrustPolicy,
  census: economicCensus.nullable(), rows: z.array(economicSourceRow).max(MAX_ECONOMIC_SOURCE_ROWS),
}).strict();

// ---------------------------------------------------------------------------------------------------------------------------
// Output. Closed codes: a consumer maps them, it never parses prose.
// ---------------------------------------------------------------------------------------------------------------------------
export const ECONOMIC_REDUCTION_STATES = ["COMPLETE", "PARTIAL", "UNAVAILABLE", "REFUSED"] as const;
export const economicFindingCode = z.enum([
  // UNAVAILABLE: the set is not provable at all
  "ECONOMIC_SOURCE_LEGACY_UNPROVEN", "ECONOMIC_SOURCE_ID_NOT_TRUSTED", "ECONOMIC_SOURCE_CENSUS_NOT_PUBLISHED",
  // REFUSED: the set is provably not summable as given
  "REPORT_SOURCE_CONFLICT", "REPORT_SOURCE_OVERLAP", "ECONOMIC_COMPARABILITY_MISMATCH", "ECONOMIC_SOURCE_OUTSIDE_CENSUS",
  "ECONOMIC_SOURCE_INPUT_INVALID",
  // REFUSED: every input is valid but the exact sum does not fit the shared public decimal bound (`exactDecimal`). Never truncated,
  // rounded or widened: the sum is refused with a null value.
  "ECONOMIC_SUM_OVERFLOW",
  // PARTIAL: what is stated is consistent but not the whole expected population
  "ECONOMIC_SOURCE_MISSING", "ECONOMIC_VALUATION_MISSING", "ECONOMIC_OWNERSHIP_MISSING", "ECONOMIC_COST_LAYERS_MISSING",
]);
export const economicComparabilityField = z.enum(["metric", "environment", "currency", "basis", "cut.effective_at_ms",
  "cut.recorded_through_ms", "window", "valuation_cutoff_ms", "economic_revision", "cashflow_revision", "valuation_revision",
  "ownership_revision", "restatement_relation"]);
export const economicFinding = z.object({ code: economicFindingCode, namespace: text.nullable(), source_id: text.nullable(),
  /** The other identity of an overlap, or the compared field of a comparability mismatch, or the first schema issue path. */
  detail: z.string().max(512).nullable() }).strict();
export const economicCountedSource = z.object({ namespace: text, source_id: text, content_digest: digest,
  /** Every Portal fact id that carried this identical content. Listing them proves nothing about identity: it only keeps them auditable. */
  portal_fact_ids: z.array(text).min(1).max(MAX_ECONOMIC_SOURCE_ROWS) }).strict();

export const economicSourceReduction = z.object({
  schema_version: z.literal("portal.execution.manager-economic-source-reduction.proposal.v1"),
  status: z.literal(MANAGER_ECONOMIC_SOURCE_STATUS),
  reducer_revision: z.literal(MANAGER_ECONOMIC_SOURCE_REDUCER_REVISION),
  state: z.enum(ECONOMIC_REDUCTION_STATES),
  /** Non-null iff COMPLETE. A PARTIAL / UNAVAILABLE / REFUSED reduction has NO number: not a subtotal, not zero. */
  value: exactDecimal.nullable(),
  expectation: economicExpectation.nullable(),
  census_ref: text.nullable(),
  /** The sources that were counted (COMPLETE) or are present and consistent (PARTIAL); empty when the proof gate failed. */
  sources: z.array(economicCountedSource).max(MAX_ECONOMIC_SOURCE_ROWS),
  collapsed_duplicate_count: z.number().int().min(0).max(MAX_ECONOMIC_SOURCE_ROWS),
  /** Digest of (expectation, census_ref, the canonical sorted expected census identities, [namespace, source_id, content_digest]):
   * reader and writer must agree on it. The census CONTENT is bound, so an opaque census_ref reused with another population differs. */
  economic_set_digest: digest.nullable(),
  reason_codes: z.array(economicFindingCode).max(16),
  findings: z.array(economicFinding).max(MAX_ECONOMIC_FINDINGS),
  findings_truncated: z.boolean(),
}).strict().superRefine((r, c) => {
  const complete = r.state === "COMPLETE";
  if (complete !== (r.value !== null) || complete && (r.reason_codes.length || r.findings.length || r.economic_set_digest === null ||
    r.expectation === null || r.sources.length === 0) || !complete && r.reason_codes.length === 0)
    c.addIssue({ code: z.ZodIssueCode.custom, message: "ECONOMIC_REDUCTION_INCONSISTENT" });
});

export type EconomicSourceReductionInput = z.infer<typeof economicSourceReductionInput>;
export type EconomicSourceRow = z.infer<typeof economicSourceRow>;
export type EconomicProvenRow = z.infer<typeof economicProvenRow>;
export type EconomicExpectation = z.infer<typeof economicExpectation>;
export type EconomicSourceReduction = z.infer<typeof economicSourceReduction>;
export type EconomicFinding = z.infer<typeof economicFinding>;
export type EconomicFindingCode = z.infer<typeof economicFindingCode>;
export type EconomicComparabilityField = z.infer<typeof economicComparabilityField>;
