/**
 * X2 · B4 — CG-P16-02 (the binding down to Stage 4) and CG-P16-03
 * (code-fixed parameters and their hash scope), answered from real sources.
 *
 * HiFi 07 F4 compares four values: the sealed params digest with the params
 * digest the replay used, and the sealed bundle digest with the runtime
 * bundle digest. The server decides each comparison; the screen only prints
 * it. Each lane names the identity rule it compares under, because the two
 * lanes publish different identities:
 *
 *  - RS-02 retained WFO lane (QuantBT child audit, W5b P17-T14):
 *      params  = QuantBT's candidate identity of the sealed θ*
 *                vs the candidate each fold's out-of-sample generation
 *                child actually ran;
 *      bundle  = QuantBT's strategy fingerprint on the frozen candidate's
 *                selection-stage children vs the fingerprint of each fold's
 *                out-of-sample generation child (params are outside it: the
 *                same fingerprint is recorded for every candidate).
 *  - P04 fixed qualification (P14 receipt, A10b registry):
 *      params  = the registered fixed bundle digest vs the bundle digest the
 *                P04 child executed and published in its P14 receipt (the P04
 *                replay is that child's own tape — there is no second run);
 *      bundle  = the registered adapter contract digest vs the adapter digest
 *                the run's immutable producer row was admitted under.
 *
 * A comparison with a missing side is NOT_PUBLISHED with its reason, never a
 * tick; any MISMATCH makes the binding DRIFT (HiFi: "✕ DRIFT — BLOCKED").
 */

import { z } from "zod";

import type { CodeFixedBinding } from "./parameter-binding.registry";
import { QUANTBT_CANDIDATE_IDENTITY_RULE, quantbtCandidateId } from "./fold-ordering";

export const STAGE4_BINDING_RULE = "research.stage4-binding.v1" as const;
export const PARAMETER_AUTHORITY_RULE = "research.parameter-authority.v1" as const;

export const STAGE4_REASONS = {
  childAuditNotRetained: "RS02_SEAL_PREDATES_P17_CHILD_AUDIT",
  noGenerationChild: "QUANTBT_CHILD_AUDIT_HAS_NO_OUT_OF_SAMPLE_GENERATION_RECORD",
  identityNotComputable: "FROZEN_PARAMETERS_NOT_EXACT_NUMERIC_JSON",
  noSelectionStageRecord: "QUANTBT_CHILD_AUDIT_HAS_NO_SELECTION_STAGE_RECORD_FOR_THE_FROZEN_CANDIDATE",
  fingerprintNotPublished: "QUANTBT_CHILD_AUDIT_DID_NOT_PUBLISH_A_STRATEGY_FINGERPRINT",
  noFold: "RS02_SEAL_HAS_NO_RETAINED_FOLD",
  bindingNotRegistered: "P16_HISTORICAL_PARAMETER_BINDING_NOT_REGISTERED",
  p14ReceiptNotPublished: "P16_CURRENT_P04_SOURCE_RECEIPT_NOT_PUBLISHED",
  sealedSideMissing: "STAGE4_SEALED_SIDE_NOT_PUBLISHED",
} as const;

const Reason = z.string().regex(/^[A-Z][A-Z0-9_]{2,159}$/);
const Value = z.string().regex(/^[0-9a-f]{24,64}$/);
const Digest = z.string().regex(/^[0-9a-f]{64}$/);

const Stage4RowSchema = z.object({
  key: z.enum(["SEALED_PARAMS", "REPLAY_PARAMS", "SEALED_BUNDLE", "RUNTIME_BUNDLE"]),
  label: z.enum(["sealed params digest", "params digest used by replay", "sealed bundle digest", "runtime bundle digest"]),
  value: Value.nullable(),
  identity_rule: z.enum([
    QUANTBT_CANDIDATE_IDENTITY_RULE,
    "QUANTBT_STRATEGY_FINGERPRINT_V1",
    "SHA256_CANONICAL_PARAMETER_MAP_V1",
    "P04_ADAPTER_CONTRACT_DIGEST_V1",
    "IMPORTED_SOURCE_AND_ADAPTER_SHA256_V1",
  ]),
  source_key: z.string().regex(/^[a-z][a-z0-9_.-]{2,95}$/),
  /** Per fold, where the replay side is read fold by fold (≤ 256). */
  folds: z.array(z.object({
    fold_id: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,159}$/),
    value: Value.nullable(),
    audit_ordinal: z.number().int().nonnegative().nullable(),
    state: z.enum(["MATCH", "MISMATCH", "NOT_PUBLISHED"]),
    reason_code: Reason.nullable(),
  }).strict()).max(256),
  state: z.enum(["MATCH", "MISMATCH", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
}).strict();

export const Stage4BindingSchema = z.object({
  schema_version: z.literal(STAGE4_BINDING_RULE),
  lane: z.enum(["RS02_RETAINED_CHILD_AUDIT", "P04_FIXED_QUALIFICATION", "IMPORTED_FIXED_QUALIFICATION"]),
  state: z.enum(["BOUND", "DRIFT", "NOT_COMPARED"]),
  reason_code: Reason.nullable(),
  /** sha256 of the sealed θ* canonical map — the P11 fold `params_digest` (the θ* digest S07 T10 copies). */
  sealed_params_sha256: Digest.nullable(),
  rows: z.array(Stage4RowSchema).length(4),
  pairs: z.object({
    params: z.enum(["MATCH", "MISMATCH", "NOT_PUBLISHED"]),
    bundle: z.enum(["MATCH", "MISMATCH", "NOT_PUBLISHED"]),
  }).strict(),
}).strict();

export type Stage4Binding = z.infer<typeof Stage4BindingSchema>;
type Row = z.infer<typeof Stage4RowSchema>;
type FoldValue = Row["folds"][number];

export const ParameterAuthoritySchema = z.object({
  schema_version: z.literal(PARAMETER_AUTHORITY_RULE),
  state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
  reason_code: Reason.nullable(),
  /** Declared (swept or pinned) values: inside the θ (params) digest. */
  declared: z.object({
    hash_scope: z.literal("PARAMS_DIGEST"),
    names: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,63}$/)).max(24),
  }).strict(),
  /** Values the code fixes: outside the θ digest, inside the code → adapter contract digest. */
  code_fixed: z.object({
    state: z.enum(["AVAILABLE", "NOT_PUBLISHED"]),
    reason_code: Reason.nullable(),
    values: z.array(z.object({ name: z.string().min(1).max(64), value: z.string().min(1).max(64) }).strict()).max(32),
    hash_scope: z.enum(["ADAPTER_CONTRACT_DIGEST", "SOURCE_CODE_SHA256"]),
    code_digest: Digest.nullable(),
    specification_digest: Digest.nullable(),
    adapter_contract_digest: Digest.nullable(),
  }).strict(),
}).strict();

export type ParameterAuthority = z.infer<typeof ParameterAuthoritySchema>;

const LABELS: Record<Row["key"], Row["label"]> = {
  SEALED_PARAMS: "sealed params digest",
  REPLAY_PARAMS: "params digest used by replay",
  SEALED_BUNDLE: "sealed bundle digest",
  RUNTIME_BUNDLE: "runtime bundle digest",
};

function row(key: Row["key"], input: Omit<Row, "key" | "label">): Row {
  return { key, label: LABELS[key], ...input };
}

function pairState(left: Row["state"], right: Row["state"]): Row["state"] {
  if (left === "MISMATCH" || right === "MISMATCH") return "MISMATCH";
  if (left === "NOT_PUBLISHED" || right === "NOT_PUBLISHED") return "NOT_PUBLISHED";
  return "MATCH";
}

/** A sealed row carries its pair's outcome (HiFi: a tick on the sealed side, a cross only on the drifted side). */
function settle(sealed: Row, pair: Row["state"]): Row {
  if (sealed.value === null) return sealed;
  return { ...sealed, state: pair === "MISMATCH" ? "MATCH" : pair, reason_code: pair === "NOT_PUBLISHED" ? sealed.reason_code : null };
}

function verdict(params: Row["state"], bundle: Row["state"], reasons: Array<string | null>): Pick<Stage4Binding, "state" | "reason_code"> {
  if (params === "MISMATCH" || bundle === "MISMATCH") return { state: "DRIFT", reason_code: null };
  if (params === "NOT_PUBLISHED" || bundle === "NOT_PUBLISHED") {
    return { state: "NOT_COMPARED", reason_code: reasons.find((reason): reason is string => reason !== null) ?? STAGE4_REASONS.noFold };
  }
  return { state: "BOUND", reason_code: null };
}

/** Fold-by-fold replay side against one sealed value; the row value is the common one when every fold agrees. */
function foldRow(
  key: "REPLAY_PARAMS" | "RUNTIME_BUNDLE",
  rule: Row["identity_rule"],
  sourceKey: string,
  folds: FoldValue[],
  sealed: string | null,
): Row {
  if (folds.length === 0) {
    return row(key, { value: null, identity_rule: rule, source_key: sourceKey, folds, state: "NOT_PUBLISHED", reason_code: STAGE4_REASONS.noFold });
  }
  const compared = folds.map((fold): FoldValue => (fold.value === null
    ? fold
    : sealed === null
      ? { ...fold, state: "NOT_PUBLISHED", reason_code: STAGE4_REASONS.sealedSideMissing }
      : { ...fold, state: fold.value === sealed ? "MATCH" : "MISMATCH", reason_code: null }));
  const values = new Set(compared.map((fold) => fold.value));
  const common = values.size === 1 ? [...values][0] ?? null : null;
  const mismatch = compared.some((fold) => fold.state === "MISMATCH");
  const missing = compared.find((fold) => fold.state === "NOT_PUBLISHED");
  return row(key, {
    value: common,
    identity_rule: rule,
    source_key: sourceKey,
    folds: compared,
    state: mismatch ? "MISMATCH" : missing ? "NOT_PUBLISHED" : "MATCH",
    reason_code: mismatch ? null : missing ? missing.reason_code : null,
  });
}

export interface ChildAuditFold {
  foldId: string;
  records: ReadonlyArray<{
    audit_ordinal: number;
    candidate_id: string | null;
    context: string | null;
    strategy_fingerprint?: string | null;
  }> | undefined;
}

const GENERATION = "out-of-sample generation";
const FINGERPRINT = /^[0-9a-f]{64}$/;

/** RS-02 retained lane: the four F4 values from QuantBT's own child audit. */
export function retainedStage4Binding(
  theta: Readonly<Record<string, string>>,
  sealedParamsSha256: string | null,
  folds: readonly ChildAuditFold[],
  candidateParameterKinds?: import("./parameter-binding.registry").HistoricalProfileBinding["candidateParameterKinds"],
): Stage4Binding {
  const frozen = quantbtCandidateId(theta, candidateParameterKinds);
  const sealedParams = row("SEALED_PARAMS", {
    value: frozen,
    identity_rule: QUANTBT_CANDIDATE_IDENTITY_RULE,
    source_key: "rs02.seal.selection.parameters",
    folds: [],
    state: frozen === null ? "NOT_PUBLISHED" : "MATCH",
    reason_code: frozen === null ? STAGE4_REASONS.identityNotComputable : null,
  });

  const generation = folds.map((fold) => {
    if (fold.records === undefined) return { fold, child: null, reason: STAGE4_REASONS.childAuditNotRetained };
    const children = fold.records.filter((record) => record.context === GENERATION);
    return children.length === 1
      ? { fold, child: children[0]!, reason: null }
      : { fold, child: null, reason: STAGE4_REASONS.noGenerationChild };
  });
  const replayParams = foldRow(
    "REPLAY_PARAMS",
    QUANTBT_CANDIDATE_IDENTITY_RULE,
    "rs02.fold.child_audit.out_of_sample_generation.candidate_id",
    generation.map(({ fold, child, reason }) => {
      const value = child?.candidate_id && /^[0-9a-f]{24}$/.test(child.candidate_id) ? child.candidate_id : null;
      return {
        fold_id: fold.foldId,
        value,
        audit_ordinal: child?.audit_ordinal ?? null,
        state: "NOT_PUBLISHED" as const,
        reason_code: value === null ? reason ?? STAGE4_REASONS.noGenerationChild : null,
      };
    }),
    frozen,
  );

  // Sealed bundle: the fingerprint QuantBT recorded on the frozen candidate's
  // selection-stage children (search and scoring), across every fold.
  const selectionStage = folds.flatMap((fold) => (fold.records ?? []).filter((record) =>
    record.context !== GENERATION && frozen !== null && record.candidate_id === frozen));
  const selectionFingerprints = new Set(selectionStage.map((record) => record.strategy_fingerprint ?? null));
  const anyRetained = folds.some((fold) => fold.records !== undefined);
  const sealedFingerprint = selectionFingerprints.size === 1 ? [...selectionFingerprints][0] ?? null : null;
  const sealedBundle = row("SEALED_BUNDLE", {
    value: sealedFingerprint !== null && FINGERPRINT.test(sealedFingerprint) ? sealedFingerprint : null,
    identity_rule: "QUANTBT_STRATEGY_FINGERPRINT_V1",
    source_key: "rs02.fold.child_audit.selection_stage.strategy_fingerprint",
    folds: [],
    state: selectionFingerprints.size > 1
      ? "MISMATCH"
      : sealedFingerprint !== null && FINGERPRINT.test(sealedFingerprint) ? "MATCH" : "NOT_PUBLISHED",
    reason_code: selectionFingerprints.size > 1
      ? null
      : !anyRetained ? STAGE4_REASONS.childAuditNotRetained
        : frozen === null ? STAGE4_REASONS.identityNotComputable
          : selectionStage.length === 0 ? STAGE4_REASONS.noSelectionStageRecord
            : sealedFingerprint === null || !FINGERPRINT.test(sealedFingerprint) ? STAGE4_REASONS.fingerprintNotPublished : null,
  });
  const runtimeBundle = foldRow(
    "RUNTIME_BUNDLE",
    "QUANTBT_STRATEGY_FINGERPRINT_V1",
    "rs02.fold.child_audit.out_of_sample_generation.strategy_fingerprint",
    generation.map(({ fold, child, reason }) => {
      const value = child?.strategy_fingerprint && FINGERPRINT.test(child.strategy_fingerprint) ? child.strategy_fingerprint : null;
      return {
        fold_id: fold.foldId,
        value,
        audit_ordinal: child?.audit_ordinal ?? null,
        state: "NOT_PUBLISHED" as const,
        reason_code: value === null ? reason ?? STAGE4_REASONS.fingerprintNotPublished : null,
      };
    }),
    sealedBundle.state === "MATCH" ? sealedBundle.value : null,
  );

  const params = pairState(sealedParams.state, replayParams.state);
  const bundle = pairState(sealedBundle.state, runtimeBundle.state);
  return {
    schema_version: STAGE4_BINDING_RULE,
    lane: "RS02_RETAINED_CHILD_AUDIT",
    ...verdict(params, bundle, [sealedParams.reason_code, replayParams.reason_code, sealedBundle.reason_code, runtimeBundle.reason_code]),
    sealed_params_sha256: sealedParamsSha256,
    rows: [settle(sealedParams, params), replayParams, settle(sealedBundle, bundle), runtimeBundle],
    pairs: { params, bundle },
  };
}

/** P04 fixed qualification: the two pairs its registered binding and P14 receipt publish. */
export function fixedStage4Binding(input: {
  expectedBundleDigest: string | null;
  observedBundleDigest: string | null;
  expectedAdapterDigest: string | null;
  observedAdapterDigest: string | null;
  missingReason: string;
  lane?: "P04_FIXED_QUALIFICATION" | "IMPORTED_FIXED_QUALIFICATION";
}): Stage4Binding {
  const side = (key: Row["key"], value: string | null, rule: Row["identity_rule"], sourceKey: string) =>
    row(key, {
      value,
      identity_rule: rule,
      source_key: sourceKey,
      folds: [],
      state: value === null ? "NOT_PUBLISHED" : "MATCH",
      reason_code: value === null ? input.missingReason : null,
    });
  const compare = (sealed: Row, runtime: Row): Row => (runtime.value === null
    ? runtime
    : sealed.value === null
      ? { ...runtime, state: "NOT_PUBLISHED", reason_code: STAGE4_REASONS.sealedSideMissing }
      : { ...runtime, state: sealed.value === runtime.value ? "MATCH" : "MISMATCH", reason_code: null });
  const sealedParams = side("SEALED_PARAMS", input.expectedBundleDigest, "SHA256_CANONICAL_PARAMETER_MAP_V1", "p16.registry.fixed_bundle_digest");
  const replayParams = compare(sealedParams, side("REPLAY_PARAMS", input.observedBundleDigest, "SHA256_CANONICAL_PARAMETER_MAP_V1", "p14.receipt.parameter_bundle_digest"));
  const imported = input.lane === "IMPORTED_FIXED_QUALIFICATION";
  const rule = imported ? "IMPORTED_SOURCE_AND_ADAPTER_SHA256_V1" : "P04_ADAPTER_CONTRACT_DIGEST_V1";
  const sealedBundle = side("SEALED_BUNDLE", input.expectedAdapterDigest, rule, imported ? "p07.version.source_and_adapter_digest" : "p16.registry.adapter_contract_digest");
  const runtimeBundle = compare(sealedBundle, side("RUNTIME_BUNDLE", input.observedAdapterDigest, rule, imported ? "p14.receipt.source_and_adapter_digest" : "p10.run_producer.adapter_contract_digest"));
  const params = pairState(sealedParams.state, replayParams.state);
  const bundle = pairState(sealedBundle.state, runtimeBundle.state);
  return {
    schema_version: STAGE4_BINDING_RULE,
    lane: input.lane ?? "P04_FIXED_QUALIFICATION",
    ...verdict(params, bundle, [sealedParams.reason_code, replayParams.reason_code, sealedBundle.reason_code, runtimeBundle.reason_code]),
    sealed_params_sha256: input.expectedBundleDigest,
    rows: [settle(sealedParams, params), replayParams, settle(sealedBundle, bundle), runtimeBundle],
    pairs: { params, bundle },
  };
}

/** CG-P16-03: which digest each kind of parameter lives in, for one binding. */
export function parameterAuthority(input: {
  names: readonly string[];
  codeFixed: CodeFixedBinding | undefined;
  adapterContractDigest: string | null;
}): ParameterAuthority {
  const fixed = input.codeFixed;
  return {
    schema_version: PARAMETER_AUTHORITY_RULE,
    state: fixed ? "AVAILABLE" : "NOT_PUBLISHED",
    reason_code: fixed ? null : STAGE4_REASONS.bindingNotRegistered,
    declared: { hash_scope: "PARAMS_DIGEST", names: [...input.names] },
    code_fixed: {
      state: fixed?.state ?? "NOT_PUBLISHED",
      reason_code: fixed ? fixed.reasonCode : STAGE4_REASONS.bindingNotRegistered,
      values: fixed ? fixed.values.map((value) => ({ ...value })) : [],
      hash_scope: "ADAPTER_CONTRACT_DIGEST",
      code_digest: fixed?.codeDigest ?? null,
      specification_digest: fixed?.specificationDigest ?? null,
      adapter_contract_digest: input.adapterContractDigest,
    },
  };
}
