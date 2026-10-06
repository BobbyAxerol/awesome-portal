/** P21 Release Candidate composer/local-seal authority. */

import { Inject, Injectable } from "@nestjs/common";
import { finalAuditTargetApplicable } from "./final-audit.contract";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import {
  ResearchReleaseCandidateComposeResponseSchema,
  ResearchReleaseCandidatePackResponseSchema,
  ResearchReleaseCandidateSealResponseSchema,
  ResearchReleaseCandidateRunStatusSchema,
  type ResearchReleaseCandidateComposeResponse,
  type ResearchReleaseCandidateDraftPatch,
  type ResearchReleaseCandidatePackResponse,
  type ResearchReleaseCandidateSealResponse,
} from "./release-candidate.contract";
import { ResearchReleaseCandidateError } from "./release-candidate.error";
import {
  releaseCandidateSourceFingerprint,
  ResearchReleaseCandidateRepository,
  type ReleaseCandidateArtifact,
  type ReleaseCandidateDraft,
  type ReleaseCandidatePin,
  type ReleaseCandidatePublicationContext,
  type ReleaseCandidateSource,
  type ReleaseCandidateStoredPack,
} from "./release-candidate.repository";
import { retainedLaneFacts } from "./release-candidate.retained-lane";
import { selectedTrialPresentation } from "./selected-trial-presentation";
import { publishBlockedAction } from "./release-candidate-publish-action";
import { ResearchReportFrozenCoreSchema } from "./report.contract";
import { memoizedResearchJsonDigest } from "./memoized-json-digest";
import { ExactJsonCalculationMemo } from "./exact-json-calculation-memo";
import {importedRetainedBinding} from "./imported-search.read";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PARTIAL" | "NOT_APPLICABLE";
  reason_code: string | null;
};
type ReportVerification = { core: Record<string, unknown> | null; exactSource: boolean; sealed: boolean };
type Field = {
  key: "release_candidate_id" | "alpha_id" | "alpha_version_id" | "alpha_code_digest" | "alpha_entrypoint"
    | "final_audit_run_id" | "final_audit_attempt_id" | "requested_spec_digest" | "effective_spec_digest"
    | "dataset_binding_digest" | "manifest_digest" | "source_transform_digest" | "engine_release_id"
    | "adapter_contract_digest" | "parameter_bundle_digest" | "evidence_revision" | "report_revision";
  label: string;
  value: string | null;
  tone: "ink" | "gold" | "red" | "dim";
  availability: Availability;
};
type PackItem = {
  key: "ALPHA_VERSION_PASSPORT" | "ENGINE_CAPABILITY_BACKEND" | "DATASET_UNIVERSE_SNAPSHOTS" | "METHODOLOGY_CLAIM"
    | "SELECTED_PARAMS_LINEAGE" | "FINAL_AUDIT_REPLAY" | "METRICS_SEMANTICS" | "EXECUTION_ASSUMPTIONS"
    | "ROBUSTNESS_PARAM_STABILITY_REGIME" | "KNOWN_LIMITATIONS_WAIVERS" | "REPRODUCIBILITY_PARITY_CHECKSUMS" | "PROPOSED_USE_RESTRICTIONS";
  n: number;
  item: string;
  status: "COMPLETE" | "DEGRADED" | "INPUT" | "MISSING";
  digest: string | null;
  source: { label: string; href: string | null };
  note: string;
  availability: Availability;
};

const AVAILABLE: Availability = { state: "AVAILABLE", reason_code: null };
const absent = (reasonCode: string): Availability => ({ state: "NOT_PUBLISHED", reason_code: reasonCode });
const partial = (reasonCode: string): Availability => ({ state: "PARTIAL", reason_code: reasonCode });
const notApplicable = (reasonCode: string): Availability => ({ state: "NOT_APPLICABLE", reason_code: reasonCode });
const DIGEST = /^[0-9a-f]{64}$/;

function record(value: unknown): Record<string, unknown> | null {
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function atPath(value: unknown, path: readonly string[]): unknown {
  let current: unknown = value;
  for (const key of path) {
    const item = record(current);
    if (!item || !(key in item)) return null;
    current = item[key];
  }
  return current;
}

function stringAt(value: unknown, path: readonly string[]): string | null {
  const result = atPath(value, path);
  return typeof result === "string" && result.length > 0 && result.length <= 1_024 ? result : null;
}

function digest(value: unknown): string | null {
  return typeof value === "string" && DIGEST.test(value) ? value : null;
}

function digestOf(value: unknown): string {
  return memoizedResearchJsonDigest(value);
}

function field(key: Field["key"], label: string, value: string | null, availability: Availability, tone?: Field["tone"]): Field {
  return { key, label, value, availability, tone: tone ?? (value === null ? "red" : "ink") };
}

function complete(
  key: PackItem["key"], n: number, item: string, source: PackItem["source"], digestValue: string | null, note: string,
): PackItem {
  return { key, n, item, status: "COMPLETE", digest: digestValue, source, note, availability: AVAILABLE };
}

function degraded(
  key: PackItem["key"], n: number, item: string, source: PackItem["source"], digestValue: string | null, note: string,
): PackItem {
  return { key, n, item, status: "DEGRADED", digest: digestValue, source, note, availability: partial("P21_SOURCE_DEGRADED_EVIDENCE") };
}

function input(
  key: PackItem["key"], n: number, item: string, value: string | null, note: string, href: string,
): PackItem {
  return {
    key, n, item, status: "INPUT", digest: value === null ? null : digestOf(value),
    source: { label: "Researcher declaration", href }, note,
    availability: value === null ? absent("P21_RESEARCHER_DECLARATION_REQUIRED") : AVAILABLE,
  };
}

/** W7: a DEGRADED retained-lane row names its own reason (e.g. a claim with no issued certificate). */
function degradedBecause(
  key: PackItem["key"], n: number, item: string, source: PackItem["source"], digestValue: string | null, reason: string, note: string,
): PackItem {
  return { key, n, item, status: "DEGRADED", digest: digestValue, source, note, availability: partial(reason) };
}

/** W7: a Delta WFO run whose retained current source is not sealed yet. */
const RETAINED_NOT_SEALED = "P21_RETAINED_CURRENT_SOURCE_NOT_SEALED";

function missing(
  key: PackItem["key"], n: number, item: string, source: PackItem["source"], reason: string, note: string,
): PackItem {
  return { key, n, item, status: "MISSING", digest: null, source, note, availability: absent(reason) };
}

/**
 * P21 reads local persisted source facts.  It never assumes a child may be
 * reused as a final audit merely because it is a child, and it treats a
 * centroid/composite selection (without a trial ID) as valid only when a
 * persisted selection record names that target kind and parameter digest.
 */
@Injectable()
export class ResearchReleaseCandidateService {
  private readonly reportVerification = new ExactJsonCalculationMemo<ReportVerification>();
  constructor(
    private readonly repository: ResearchReleaseCandidateRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async detail(scope: ResearchScope, runId: string): Promise<ResearchReleaseCandidateComposeResponse> {
    this.requireEnabled();
    const snapshot = await this.repository.readComposition(scope, runId);
    if (!snapshot) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Research run was not found.", 404);
    const { source, draft, latestPack, publicationContext } = snapshot;
    const fingerprint = releaseCandidateSourceFingerprint(source);
    return this.compose(source, draft ?? this.virtualDraft(source, fingerprint), latestPack, publicationContext, fingerprint);
  }

  /** B2: the P22 facts the composer prints — this candidate's intent and the last published candidate of the Alpha. */
  private publicationContext(
    scope: ResearchScope, source: ReleaseCandidateSource, latestPack: ReleaseCandidateStoredPack | null,
  ): Promise<ReleaseCandidatePublicationContext> {
    return this.repository.publicationContext(scope, {
      alphaId: source.alpha.alphaId, releaseCandidateId: latestPack?.releaseCandidateId ?? null,
    });
  }

  async patchDraft(
    scope: ResearchScope,
    runId: string,
    input: ResearchReleaseCandidateDraftPatch,
  ): Promise<ResearchReleaseCandidateComposeResponse> {
    this.requireEnabled();
    const result = await this.repository.patchDraft(scope, runId, {
      expectedRevision: input.expected_revision,
      expectedSourceFingerprint: input.expected_source_fingerprint,
      knownLimitations: input.known_limitations,
      proposedUseRestrictions: input.proposed_use_restrictions,
    });
    const latestPack = await this.repository.latestPack(scope, runId);
    const context = await this.publicationContext(scope, result.source, latestPack);
    return this.compose(result.source, result.draft, latestPack, context);
  }

  async seal(
    scope: ResearchScope,
    runId: string,
    input: { draft_id: string; expected_draft_revision: number; expected_source_fingerprint: string },
  ): Promise<ResearchReleaseCandidateSealResponse> {
    this.requireEnabled();
    const stored = await this.repository.seal(scope, runId, {
      draftId: input.draft_id,
      expectedDraftRevision: input.expected_draft_revision,
      expectedSourceFingerprint: input.expected_source_fingerprint,
    }, (source, draft, releaseCandidateId) => this.sealBuild(source, draft, releaseCandidateId));
    const response = {
      schema_version: "research.release-candidate-local-seal.v1" as const,
      release_candidate_id: stored.releaseCandidateId,
      run_id: stored.runId,
      pack_digest: stored.packDigest,
      sealed_at_utc_ms: stored.sealedAtUtcMs,
      delivery_state: "NOT_DELIVERED" as const,
      approval_state: "NOT_APPROVED" as const,
    };
    const parsed = ResearchReleaseCandidateSealResponseSchema.safeParse(response);
    if (!parsed.success) throw this.unavailable("Local seal response is incompatible.");
    return parsed.data;
  }

  async pack(scope: ResearchScope, releaseCandidateId: string): Promise<ResearchReleaseCandidatePackResponse> {
    this.requireEnabled();
    const stored = await this.repository.readPack(scope, releaseCandidateId);
    if (!stored) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Release Candidate pack was not found.", 404);
    const frozenCore = stored.frozenCore;
    const response = {
      schema_version: "research.release-candidate-pack.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      release_candidate_id: stored.releaseCandidateId,
      run_id: stored.runId,
      display_label: stored.displayLabel ?? null,
      pack_digest: stored.packDigest,
      sealed_at_utc_ms: stored.sealedAtUtcMs,
      frozen_core: frozenCore,
      delivery: this.localSeal(stored, stored.sourceFingerprint),
    };
    const parsed = ResearchReleaseCandidatePackResponseSchema.safeParse(response);
    if (!parsed.success) throw this.unavailable("Stored Release Candidate pack is incompatible.");
    return parsed.data;
  }

  private compose(
    source: ReleaseCandidateSource,
    draft: ReleaseCandidateDraft,
    latestPack: ReleaseCandidateStoredPack | null,
    context: ReleaseCandidatePublicationContext,
    sourceFingerprint = releaseCandidateSourceFingerprint(source),
  ): ResearchReleaseCandidateComposeResponse {
    const report = this.verifyReport(source);
    const { values, pack, sourceIntegrity, selectedDetail, selectedTrialId } = this.lane(source, draft, null, report);
    const missingCount = pack.filter((item) => item.status === "MISSING").length;
    const hasInput = draft.knownLimitations === null || draft.proposedUseRestrictions === null;
    const isScratch = source.alpha.alphaVersionId === null;
    const active = source.alpha.lifecycleState === "ACTIVE";
    const localSeal = this.localSeal(latestPack, sourceFingerprint);
    let sealBlockedReason: string | null = null;
    if (draft.sealed) sealBlockedReason = "P21_ALREADY_SEALED";
    else if (isScratch) sealBlockedReason = "P21_SCRATCH_RUN_UNBOUND";
    else if (!active) sealBlockedReason = "P21_ALPHA_VERSION_NOT_ACTIVE";
    else if (!sourceIntegrity) sealBlockedReason = "P21_REFERENCED_SOURCE_INTEGRITY_FAILED";
    else if (missingCount > 0) sealBlockedReason = "P21_REQUIRED_EVIDENCE_MISSING";
    else if (hasInput) sealBlockedReason = "P21_RESEARCHER_DECLARATIONS_REQUIRED";
    const counts = pack.reduce((result, item) => {
      result[item.status.toLowerCase() as "complete" | "degraded" | "input" | "missing"] += 1;
      return result;
    }, { complete: 0, degraded: 0, input: 0, missing: 0 });
    const fields = values.fields;
    const linkedAudit = source.verifiedAudit && fields.some(item => item.key === "final_audit_run_id"
      && item.value === source.verifiedAudit!.child_run_id) ? source.verifiedAudit : null;
    const publication = this.publicationFacts(fields, localSeal, context);
    // Source trial ids are zero-based; the displayed trial number is one-based.
    // No source publishes a param_set_id; a digest or selection id is not one.
    const trialNumber = selectedTrialId !== null && /^(0|[1-9][0-9]*)$/.test(selectedTrialId)
      ? Number(selectedTrialId) + 1 : null;
    const presentation = selectedTrialPresentation(selectedTrialId, source.wfo?.seal?.profileId ?? "", source.selectedTrialNativeFacts);
    // Legacy numeric selection keeps its existing number; retained lanes must
    // use the native profile-bound mapping also used by Search/Freeze.
    const candidateNumber = source.wfo ? presentation.selected_trial_ordinal : trialNumber;
    const selectedTrialNumber = candidateNumber !== null && Number.isSafeInteger(candidateNumber) && candidateNumber <= 1_000_000
      ? candidateNumber : null;
    const response = {
      schema_version: "research.release-candidate-compose.v1" as const,
      final_audit_applicable: finalAuditTargetApplicable(report.core && "final_audit" in report.core ? report.core.final_audit : undefined),
      ...(linkedAudit ? { linked_final_audit: linkedAudit } : {}),
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      run_id: source.runId,
      display_label: source.displayLabel ?? null,
      state: "DRAFT" as const,
      run_status: ResearchReleaseCandidateRunStatusSchema.safeParse(source.lifecycleStatus).success
        ? source.lifecycleStatus : null,
      report_sealed: report.sealed,
      availability: sourceIntegrity ? AVAILABLE : partial("P21_REFERENCED_SOURCE_INTEGRITY_FAILED"),
      as_of_utc_ms: source.asOfUtcMs,
      source_fingerprint: sourceFingerprint,
      run: {
        id: source.runId,
        attempt: source.attemptId,
        binding: source.alpha.alphaVersionId && source.alpha.alphaId && source.alpha.lifecycleState
          ? { alpha_id: source.alpha.alphaId, alpha_version_id: source.alpha.alphaVersionId, lifecycle_state: source.alpha.lifecycleState }
          : null,
      },
      rail: [
        { key: "alpha", value: source.alpha.alphaId ?? "— unbound / scratch run", detail: source.alpha.name, tone: source.alpha.alphaId ? "ink" : "dim" },
        { key: "alpha_version", value: source.alpha.alphaVersionId ?? "— unbound / scratch run", detail: source.alpha.codeDigest ? `sha256:${source.alpha.codeDigest.slice(0, 12)}` : null, tone: source.alpha.alphaVersionId ? "ink" : "dim" },
        { key: "run", value: source.runId, detail: source.attemptId, tone: "ink" },
        { key: "selected_params", value: values.parameterBundle ?? "— selection not published", detail: selectedDetail, tone: values.parameterBundle ? "ink" : "dim", ...presentation },
        { key: "release_candidate", value: localSeal.release_candidate_id ?? "rc_(draft)", detail: localSeal.state === "SEALED_LOCAL" ? "sealed locally — not delivered" : "assigned on local seal", tone: localSeal.state === "SEALED_LOCAL" ? "green" : "gold" },
      ],
      selected_params: {
        param_set_id: null,
        param_set_id_availability: absent("P21_PARAM_SET_ID_NOT_PUBLISHED"),
        selected_trial_number: selectedTrialNumber,
        selected_trial_number_availability: selectedTrialNumber !== null ? AVAILABLE
          : source.selection.targetKind === "CENTROID" || source.selection.targetKind === "COMPOSITE_POLICY"
            ? notApplicable("P21_TRIAL_ORDINAL_NOT_APPLICABLE") : absent("P21_SELECTED_TRIAL_ORDINAL_NOT_PUBLISHED"),
        selected_trial_number_scope: selectedTrialNumber === null ? null : presentation.selected_trial_ordinal_scope,
        selected_trial_source_id: selectedTrialNumber === null ? null : selectedTrialId,
        selected_trial_study_id: presentation.selected_trial_ordinal_scope === "STUDY_LOCAL"
          ? source.selectedTrialNativeFacts?.study_id ?? null : null,
      },
      taxonomy: publication.taxonomy ?? [
        { what: "code / entrypoint (av_)", state: "UNSET", consequence: "No P22-published predecessor is available, so no code-change or gate conclusion is inferred." },
        { what: "selected strategy params", state: "UNSET", consequence: values.parameterBundle ? "Current exact parameter bundle is pinned, but no predecessor comparison is published." : "Selection provenance is not published." },
        { what: "data contract / dataset snapshot", state: "UNSET", consequence: values.strictDatasetDigest ? "Current dataset binding is pinned, but no predecessor comparison is published." : "Dataset binding identity is unavailable." },
        { what: "target venue / account / capital", state: "UNSET", consequence: "Deployment facts belong to an Execution-side candidate and are never composed here." },
      ],
      published_comparison: publication.comparison,
      certification_axes: {
        methodology_claim: issuedMethodologyAxis(source),
        engine_execution_contract: {
          value: null,
          availability: absent("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED"),
        },
      },
      gate_verdict: localSeal.state === "SEALED_LOCAL" ? {
        title: "local evidence pack already sealed",
        body: localSeal.availability.state === "AVAILABLE"
          ? "The immutable local pack is retained. Publication, delivery and approval remain separate downstream facts."
          : "The immutable local pack retains its original source fingerprint. Current source changes do not rewrite it or authorize resealing its draft.",
      } : publication.verdict ?? {
        title: sealBlockedReason ? "local seal blocked — review evidence" : "local seal ready — downstream publish remains P22",
        body: "P21 creates only a Portal-local immutable evidence pack. It neither computes, approves, delivers, nor starts Paper.",
      },
      draft: {
        draft_id: draft.draftId,
        revision: draft.revision,
        source_fingerprint: draft.sourceFingerprint,
        known_limitations: draft.knownLimitations,
        proposed_use_restrictions: draft.proposedUseRestrictions,
        state: draft.draftId === null ? "VIRTUAL" : "PERSISTED",
        updated_at_utc_ms: draft.updatedAtUtcMs,
      },
      fields,
      yaml: fields,
      pack,
      pack_counts: counts,
      local_seal: localSeal,
      actions: {
        may_edit_draft: !draft.sealed,
        may_seal: sealBlockedReason === null,
        seal_blocked_reason: sealBlockedReason,
        publish: { enabled: publication.publishBlocked === null, blocked_reason: publication.publishBlocked,
          blocked_action: publishBlockedAction(publication.publishBlocked) },
      },
      mirror: null,
      source_absences: {
        alpha_binding: isScratch ? absent("P21_SCRATCH_RUN_UNBOUND") : AVAILABLE,
        methodology_claim: pack[3]!.availability,
        final_audit: pack[5]!.availability,
        approval_mirror: publication.approvalMirror,
        execution_deployment: notApplicable("P21_EXECUTION_DEPLOYMENT_OUT_OF_SCOPE"),
      },
    };
    const parsed = ResearchReleaseCandidateComposeResponseSchema.safeParse(response);
    if (!parsed.success) throw this.unavailable("Release Candidate composer response is incompatible.");
    return parsed.data;
  }

  /**
   * B2 — what P22 has recorded, in P21's words. The publish affordance and the
   * approval-mirror absence follow this candidate's own intent; the taxonomy
   * compares digests with the newest DELIVERED candidate of the same Alpha.
   * Absent a predecessor the P04/WFO wording is unchanged (typed absence).
   */
  private publicationFacts(
    fields: readonly Field[],
    localSeal: ReturnType<ResearchReleaseCandidateService["localSeal"]>,
    context: ReleaseCandidatePublicationContext,
  ) {
    const current = localSeal.state === "SEALED_LOCAL" && context.current?.releaseCandidateId === localSeal.release_candidate_id
      ? context.current : null;
    const delivered = current?.state === "DELIVERED" || localSeal.delivery_state === "DELIVERED";
    const intakeOpen = this.config.FEATURE_RESEARCH_RELEASE_CANDIDATE_PUBLICATION === "true";
    const publishBlocked: string | null = delivered ? "P22_ALREADY_DELIVERED"
      : localSeal.state !== "SEALED_LOCAL" ? "P22_LOCAL_SEAL_REQUIRED"
        : localSeal.availability.state !== "AVAILABLE" ? "P22_CURRENT_SOURCE_CHANGED"
        : current?.state === "REFUSED" ? "P22_PUBLICATION_REFUSED"
          : current === null && !intakeOpen ? "P22_PUBLICATION_INTAKE_DISABLED"
            : null;
    const approvalMirror: Availability = localSeal.state !== "SEALED_LOCAL" ? absent("P22_LOCAL_SEAL_REQUIRED")
      : delivered ? notApplicable("P22_MIRROR_READ_ON_PUBLICATION_ROUTE")
        : current?.state === "PENDING" ? absent("P22_PUBLICATION_PENDING")
          : current?.state === "UNKNOWN" ? absent("P22_PUBLICATION_OUTCOME_UNKNOWN")
            : current?.state === "REFUSED" ? absent("P22_PUBLICATION_REFUSED")
              : absent("P22_NOT_PUBLISHED");
    const predecessor = context.predecessor;
    if (!predecessor) {
      return {
        publishBlocked, approvalMirror, taxonomy: null, verdict: null,
        comparison: { last_release_candidate_id: null, availability: absent("P22_NO_PUBLISHED_PREDECESSOR") },
      };
    }
    const now = (key: Field["key"]) => fields.find((item) => item.key === key)?.value ?? null;
    const compare = (keys: readonly Field["key"][]): "UNCHANGED" | "CHANGED" | "UNSET" => {
      const pairs = keys.map((key) => [now(key), predecessor.fields[key] ?? null] as const);
      if (pairs.some(([mine, theirs]) => mine === null || theirs === null)) return "UNSET";
      return pairs.every(([mine, theirs]) => mine === theirs) ? "UNCHANGED" : "CHANGED";
    };
    const rc = predecessor.releaseCandidateId;
    const row = (what: string, short: string, keys: readonly Field["key"][], changed: string) => {
      const state = compare(keys);
      return {
        what, short, state,
        consequence: state === "UNCHANGED" ? `No gate re-run from this row — equal by digest to ${rc}.`
          : state === "CHANGED" ? changed
            : `Not pinned on both this candidate and ${rc}, so no conclusion is drawn.`,
      };
    };
    const rows = [
      row("code / entrypoint (av_)", "code", ["alpha_code_digest", "alpha_entrypoint"], `R1 + R2 re-run — code or entrypoint differs from ${rc}.`),
      row("selected strategy params", "selected params", ["parameter_bundle_digest"], "R1 + R2 re-run — numerical artifact changed"),
      row("data contract / dataset snapshot", "dataset", ["dataset_binding_digest"], `R1 + R2 re-run — dataset binding differs from ${rc}.`),
    ];
    const changed = rows.filter((item) => item.state === "CHANGED").map((item) => item.short);
    return {
      publishBlocked, approvalMirror,
      taxonomy: [
        ...rows.map(({ what, state, consequence }) => ({ what, state, consequence })),
        { what: "target venue / account / capital", state: "UNSET" as const, consequence: "belongs to deployment candidate → Gate R2, Execution side" },
      ],
      verdict: changed.length === 0 ? null : {
        title: `R1 + R2 must run — ${changed.join(" and ")} changed`,
        body: `Compared by digest with the last published candidate ${rc} (${predecessor.alphaVersionId}). Target venue, account and capital belong to the deployment candidate — Gate R2, Execution side.`,
      },
      comparison: { last_release_candidate_id: rc, availability: AVAILABLE },
    };
  }

  private values(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string | null, report: ReportVerification) {
    const reportCore = report.core;
    const alphaCodeDigest = digest(source.alpha.codeDigest);
    const adapterContractDigest = digest(source.producer.adapterContractDigest);
    const sourceTransform = this.sameDigest(
      stringAt(source.evidence.projection, ["source", "source_transform_digest"]),
      source.currentSource.sourceTransformDigest,
      stringAt(reportCore, ["source_digests", "source_transform_digest"]),
    );
    // `run_producers.manifest_digest` is the preflight (dataset/spec) manifest;
    // `current_source.manifest_digest` is the sealed P05 artifact's own
    // manifest. They are two identities and are never cross-compared (W5c: on
    // a real WFO run they always differ). The retained artifact stays pinned
    // through its CURRENT_SOURCE import digest, and a malformed one is an
    // integrity failure in `sourceIntegrity`.
    const manifest = this.sameDigest(
      source.producer.manifestDigest,
      stringAt(reportCore, ["source_digests", "manifest_digest"]),
    );
    // Nor is `current_source.manifest_digest` a dataset-binding digest.
    const strictDatasetDigest = this.sameDigest(source.datasetBindingDigest, stringAt(reportCore, ["source_digests", "dataset_binding_digest"]));
    const parameterBundle = digest(source.selection.parameterBundleDigest)
      ?? digest(stringAt(source.split.projection, ["source", "protocol", "selection", "parameter_bundle_digest"]));
    const targetSelectionExact = source.targetSelectionId !== null
      && source.selection.selectionId === source.targetSelectionId
      && digest(source.selection.sourceDigest) !== null;
    const finalAudit = source.runKind === "AUDIT" && source.relationshipKind === "AUDIT_OF_SELECTION"
      && source.runState === "READY" && targetSelectionExact;
    const alphaReady = source.alpha.alphaId !== null && source.alpha.alphaVersionId !== null
      && alphaCodeDigest !== null && source.alpha.entrypoint !== null;
    const exactSource = report.exactSource;
    const fields: Field[] = [
      field("release_candidate_id", "Release candidate ID", releaseCandidateId, releaseCandidateId ? AVAILABLE : notApplicable("P21_ASSIGNED_ON_LOCAL_SEAL"), releaseCandidateId ? "ink" : "gold"),
      field("alpha_id", "Alpha ID", source.alpha.alphaId, alphaReady ? AVAILABLE : absent("P21_ALPHA_BINDING_NOT_PUBLISHED")),
      field("alpha_version_id", "Alpha version ID", source.alpha.alphaVersionId, alphaReady ? AVAILABLE : absent("P21_ALPHA_BINDING_NOT_PUBLISHED")),
      field("alpha_code_digest", "Alpha code digest", alphaCodeDigest, alphaReady ? AVAILABLE : absent("P21_ALPHA_PASSPORT_INCOMPLETE")),
      field("alpha_entrypoint", "Alpha entrypoint", source.alpha.entrypoint, alphaReady ? AVAILABLE : absent("P21_ALPHA_PASSPORT_INCOMPLETE")),
      field("final_audit_run_id", "Final audit run ID", finalAudit ? source.runId : null, finalAudit ? AVAILABLE : absent("P21_FINAL_AUDIT_RUN_NOT_PUBLISHED")),
      field("final_audit_attempt_id", "Final audit attempt ID", finalAudit ? source.attemptId : null, finalAudit ? AVAILABLE : absent("P21_FINAL_AUDIT_RUN_NOT_PUBLISHED")),
      field("requested_spec_digest", "Requested spec digest", source.requestSpecDigest, AVAILABLE),
      field("effective_spec_digest", "Effective spec digest", source.effectiveSpecDigest, AVAILABLE),
      field("dataset_binding_digest", "Dataset binding digest", strictDatasetDigest, strictDatasetDigest ? AVAILABLE : absent("P21_DATASET_BINDING_IDENTITY_MISMATCH")),
      field("manifest_digest", "Manifest digest", manifest, manifest ? AVAILABLE : absent("P21_MANIFEST_IDENTITY_MISMATCH")),
      field("source_transform_digest", "Source transform digest", sourceTransform, sourceTransform ? AVAILABLE : absent("P21_SOURCE_TRANSFORM_IDENTITY_MISMATCH")),
      field("engine_release_id", "Engine release", source.engineReleaseId, AVAILABLE),
      field("adapter_contract_digest", "Adapter contract digest", adapterContractDigest, adapterContractDigest ? AVAILABLE : absent("P21_ADAPTER_CONTRACT_NOT_PUBLISHED")),
      field("parameter_bundle_digest", "Parameter bundle digest", parameterBundle, parameterBundle ? AVAILABLE : absent("P21_SELECTION_PARAMETER_BUNDLE_NOT_PUBLISHED")),
      field("evidence_revision", "Evidence revision", source.evidence.revision, source.evidence.revision ? AVAILABLE : absent("P21_EVIDENCE_REVISION_NOT_PUBLISHED")),
      field("report_revision", "Report revision", source.report.reportRevision, source.report.reportRevision ? AVAILABLE : absent("P21_REPORT_REVISION_NOT_PUBLISHED")),
    ];
    return { fields, sourceTransform, manifest, strictDatasetDigest, parameterBundle, finalAudit, alphaReady, alphaCodeDigest, adapterContractDigest, exactSource, reportCore };
  }

  private packItems(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, values: ReturnType<ResearchReleaseCandidateService["values"]>): PackItem[] {
    // Use the served version-bound lineage screen, not an uninstalled Alpha 360° route.
    const alphaHref = source.alpha.alphaId && source.alpha.alphaVersionId
      ? `/research/quantbt/alphas/${encodeURIComponent(source.alpha.alphaId)}/lineage?av=${encodeURIComponent(source.alpha.alphaVersionId)}`
      : null;
    const runHref = `/research/quantbt/runs/${source.runId}`;
    const alphaPassport = values.alphaReady
      ? complete("ALPHA_VERSION_PASSPORT", 1, "Alpha Version passport", { label: "Alpha version lineage", href: alphaHref }, values.alphaCodeDigest, "Exact Alpha version identity is retained.")
      : missing("ALPHA_VERSION_PASSPORT", 1, "Alpha Version passport", { label: "Alpha version lineage", href: alphaHref }, "P21_ALPHA_PASSPORT_INCOMPLETE", "The run has no complete immutable Alpha version passport.");
    const engine = values.adapterContractDigest;
    const engineItem = engine && source.engineReleaseId
      ? complete("ENGINE_CAPABILITY_BACKEND", 2, "Engine/capability/backend", { label: "Engine Atlas", href: "/research/quantbt/atlas" }, engine, "Pinned adapter contract and engine release are retained.")
      : missing("ENGINE_CAPABILITY_BACKEND", 2, "Engine/capability/backend", { label: "Engine Atlas", href: "/research/quantbt/atlas" }, "P21_ADAPTER_CONTRACT_NOT_PUBLISHED", "Engine or adapter identity is incomplete.");
    const data = values.strictDatasetDigest && values.manifest
      ? complete("DATASET_UNIVERSE_SNAPSHOTS", 3, "Dataset & universe snapshots", { label: "Data snapshots", href: `${runHref}/split` }, values.strictDatasetDigest, "Dataset binding and exact manifest identities agree across retained source facts.")
      : missing("DATASET_UNIVERSE_SNAPSHOTS", 3, "Dataset & universe snapshots", { label: "Data snapshots", href: `${runHref}/split` }, "P21_DATASET_BINDING_IDENTITY_MISMATCH", "A required dataset/manifest identity is absent or inconsistent.");
    const issuedMethodology = source.methodology.claimText !== null
      && source.methodology.certificateState === "ISSUED"
      && source.methodology.certificateGrade !== null
      && source.methodology.certificateIssuedAtUtcMs !== null;
    const methodology = issuedMethodology
      ? complete(
        "METHODOLOGY_CLAIM", 4, "Methodology claim", { label: "Evidence Flow", href: `${runHref}/evidence` },
        digestOf({
          text: source.methodology.claimText,
          certificate_state: source.methodology.certificateState,
          grade: source.methodology.certificateGrade,
          issued_at_utc_ms: source.methodology.certificateIssuedAtUtcMs,
        }),
        "Source-issued methodology claim and certificate are retained without a browser-generated interpretation.",
      )
      : missing("METHODOLOGY_CLAIM", 4, "Methodology claim", { label: "Evidence Flow", href: `${runHref}/evidence` }, "P21_METHODOLOGY_CLAIM_NOT_PUBLISHED", "Current retained sources do not publish an issued claim certificate suitable for a release pack.");
    const validSelection = source.selection.selectionId !== null && values.parameterBundle !== null
      && (source.selection.selectedTrialId !== null || source.selection.targetKind === "CENTROID" || source.selection.targetKind === "COMPOSITE_POLICY");
    const selection = validSelection
      ? complete("SELECTED_PARAMS_LINEAGE", 5, "Selected params lineage", { label: "Search & diagnostics", href: `${runHref}/search` }, values.parameterBundle, source.selection.selectedTrialId ? "Selected trial and parameter bundle are retained." : "Persisted centroid/composite selection has no selected trial; its own parameter digest remains the provenance target.")
      : missing("SELECTED_PARAMS_LINEAGE", 5, "Selected params lineage", { label: "Search & diagnostics", href: `${runHref}/search` }, "P21_SELECTION_PARAMETER_BUNDLE_NOT_PUBLISHED", "No persisted selection target can be substituted from a fixed profile or fold-last result.");
    const audit = values.finalAudit && source.evidence.revision && source.split.revision
      ? complete("FINAL_AUDIT_REPLAY", 6, "Final audit replay", { label: "Replay", href: `${runHref}/execute` }, source.evidence.projectionDigest, "Exact READY AUDIT_OF_SELECTION run has retained evidence and chronology revisions.")
      : missing("FINAL_AUDIT_REPLAY", 6, "Final audit replay", { label: "Replay", href: `${runHref}/execute` }, "P21_FINAL_AUDIT_RUN_NOT_PUBLISHED", "A primary/diagnostic/reused child is never promoted into a final audit target.");
    const metrics = source.evidence.revision && source.evidence.projectionDigest && source.evidence.readiness === "COMPLETE"
      ? complete("METRICS_SEMANTICS", 7, "Metrics semantics", { label: "Run report", href: `${runHref}/report` }, source.evidence.projectionDigest, "Immutable evidence projection is complete.")
      : missing("METRICS_SEMANTICS", 7, "Metrics semantics", { label: "Run report", href: `${runHref}/report` }, "P21_METRICS_PROJECTION_NOT_COMPLETE", "Metrics projection is absent or not complete.");
    const executionRoute = stringAt(source.alpha.declaredContract, ["execution", "execution_route"]);
    const execution = executionRoute && values.adapterContractDigest
      ? complete("EXECUTION_ASSUMPTIONS", 8, "Execution assumptions", { label: "Split & chronology", href: `${runHref}/split` }, values.adapterContractDigest, "Declared adapter route is an assumption only; this pack makes no deployment decision.")
      : missing("EXECUTION_ASSUMPTIONS", 8, "Execution assumptions", { label: "Split & chronology", href: `${runHref}/split` }, "P21_EXECUTION_ASSUMPTIONS_NOT_PUBLISHED", "No source-bound execution assumption declaration is available.");
    const robustness = source.evidence.revision
      ? degraded("ROBUSTNESS_PARAM_STABILITY_REGIME", 9, "Robustness/param stability/regime", { label: "Compare", href: source.alpha.alphaId ? `/research/quantbt/alphas/${encodeURIComponent(source.alpha.alphaId)}/compare` : null }, source.evidence.projectionDigest, "Current source publishes bounded evidence but not a complete stability/regime certificate; the degraded state travels unchanged.")
      : missing("ROBUSTNESS_PARAM_STABILITY_REGIME", 9, "Robustness/param stability/regime", { label: "Compare", href: source.alpha.alphaId ? `/research/quantbt/alphas/${encodeURIComponent(source.alpha.alphaId)}/compare` : null }, "P21_EVIDENCE_REVISION_NOT_PUBLISHED", "No retained evidence revision exists to support even a degraded declaration.");
    const limitations = input("KNOWN_LIMITATIONS_WAIVERS", 10, "Known limitations & waivers", draft.knownLimitations, "Researcher-signed declaration; it cannot hide a missing mandatory item.", `${runHref}/release-candidate`);
    const reproducibility = values.manifest && values.sourceTransform && source.report.frozenCoreDigest
      ? complete("REPRODUCIBILITY_PARITY_CHECKSUMS", 11, "Reproducibility/parity checksums", { label: "Freeze & integrity", href: `${runHref}/freeze` }, source.report.frozenCoreDigest, "Retained manifest, transform and sealed Report checksum are all explicitly pinned.")
      : missing("REPRODUCIBILITY_PARITY_CHECKSUMS", 11, "Reproducibility/parity checksums", { label: "Freeze & integrity", href: `${runHref}/freeze` }, "P21_REPRODUCIBILITY_CHECKSUMS_INCOMPLETE", "A required retained checksum is absent or mismatched.");
    const restrictions = input("PROPOSED_USE_RESTRICTIONS", 12, "Proposed use restrictions", draft.proposedUseRestrictions, "Researcher-signed declaration; downstream approval policy belongs to P22.", `${runHref}/release-candidate`);
    return [alphaPassport, engineItem, data, methodology, selection, audit, metrics, execution, robustness, limitations, reproducibility, restrictions];
  }

  private sourceIntegrity(source: ReleaseCandidateSource, values: ReturnType<ResearchReleaseCandidateService["values"]>): boolean {
    if (!values.exactSource || values.manifest === null || values.sourceTransform === null || values.strictDatasetDigest === null) return false;
    if (source.currentSource.manifestDigest !== null && digest(source.currentSource.manifestDigest) === null) return false;
    return !source.artifacts.some((artifact) => artifact.state === "CORRUPT" || artifact.state === "MISSING");
  }

  private sameDigest(...values: Array<string | null>): string | null {
    // A malformed supplied digest is an integrity failure, not an absent
    // optional source.  Silently dropping it could make two remaining copies
    // appear to agree and would weaken the immutable source fence.
    if (values.some((value) => value !== null && digest(value) === null)) return null;
    const present = values.filter((value): value is string => digest(value) !== null);
    if (present.length === 0) return null;
    return present.every((value) => value === present[0]) ? present[0]! : null;
  }

  private localSeal(pack: ReleaseCandidateStoredPack | null, currentFingerprint: string) {
    if (!pack) {
      return { state: "UNSEALED" as const, release_candidate_id: null, pack_digest: null, sealed_at_utc_ms: null, delivery_state: null, approval_state: null, availability: absent("P21_LOCAL_SEAL_NOT_CREATED") };
    }
    const sourceCurrent = pack.sourceFingerprint === currentFingerprint;
    return {
      state: "SEALED_LOCAL" as const,
      release_candidate_id: pack.releaseCandidateId,
      pack_digest: pack.packDigest,
      sealed_at_utc_ms: pack.sealedAtUtcMs,
      delivery_state: pack.deliveryState,
      approval_state: pack.approvalState,
      availability: sourceCurrent ? AVAILABLE : partial("P21_LOCAL_SEAL_REFERENCES_PRIOR_SOURCE_FINGERPRINT"),
    };
  }

  private virtualDraft(source: ReleaseCandidateSource, fingerprint = releaseCandidateSourceFingerprint(source)): ReleaseCandidateDraft {
    return {
      draftId: null,
      revision: 0,
      sourceFingerprint: fingerprint,
      knownLimitations: null,
      proposedUseRestrictions: null,
      updatedAtUtcMs: null,
    };
  }

  private sealBuild(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string) {
    const preview = this.compose(source, draft, null, { current: null, predecessor: null });
    if (!preview.actions.may_seal) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE", "Release Candidate cannot be locally sealed until all required evidence is available.", 422);
    }
    if (draft.knownLimitations === null || draft.proposedUseRestrictions === null) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE", "Release Candidate declarations are required before sealing.", 422);
    }
    const { values, pack } = this.lane(source, draft, releaseCandidateId);
    const linkedAudit = source.verifiedAudit && values.fields.some(item => item.key === "final_audit_run_id"
      && item.value === source.verifiedAudit!.child_run_id) ? source.verifiedAudit : null;
    const frozenCore = {
      fields: values.fields,
      pack,
      source_fingerprint: releaseCandidateSourceFingerprint(source),
      draft: { known_limitations: draft.knownLimitations, proposed_use_restrictions: draft.proposedUseRestrictions },
      ...(linkedAudit ? { linked_final_audit: linkedAudit } : {}),
    };
    const packDigest = digestOf(frozenCore);
    const p04Pins: ReleaseCandidatePin[] = [
      { pinKind: "RUN", sourceRef: source.runId, sourceDigest: source.effectiveSpecDigest },
      { pinKind: "ALPHA_VERSION", sourceRef: source.alpha.alphaVersionId!, sourceDigest: source.alpha.codeDigest },
      { pinKind: "REPORT", sourceRef: source.report.reportRevision!, sourceDigest: source.report.frozenCoreDigest },
      { pinKind: "EVIDENCE", sourceRef: source.evidence.revision!, sourceDigest: source.evidence.projectionDigest },
      { pinKind: "SPLIT", sourceRef: source.split.revision!, sourceDigest: source.split.projectionDigest },
      { pinKind: "SELECTION", sourceRef: source.selection.selectionId!, sourceDigest: source.selection.sourceDigest },
    ];
    const pins: ReleaseCandidatePin[] = [
      ...(source.wfo ? this.retainedPins(source) : p04Pins),
      ...source.currentSource.retainedImportDigest ? [{ pinKind: "CURRENT_SOURCE" as const, sourceRef: `artifact-revision-${source.currentSource.artifactRevision}`, sourceDigest: source.currentSource.retainedImportDigest }] : [],
      ...source.artifacts.filter((artifact) => artifact.state === "SEALED").map((artifact) => ({ pinKind: "ARTIFACT" as const, sourceRef: artifact.artifactId, sourceDigest: artifact.manifestDigest })),
      ...(linkedAudit ? [
        { pinKind:"RUN" as const, sourceRef:linkedAudit.child_run_id, sourceDigest:linkedAudit.result.target_digest },
        { pinKind:"ARTIFACT" as const, sourceRef:linkedAudit.artifact_id, sourceDigest:linkedAudit.manifest_digest },
      ] : []),
    ];
    return { frozenCore, packDigest, pins };
  }

  /**
   * W7 · the lane is the run's execution profile. A P04 run (`wfo === null`)
   * runs exactly the composition it always ran; a Delta WFO run binds every
   * row and field the P04 hubs used to answer to its retained fact.
   */
  private lane(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string | null, report = this.verifyReport(source)) {
    if (!source.wfo) {
      const values = this.values(source, draft, releaseCandidateId, report);
      return {
        values,
        pack: this.packItems(source, draft, values),
        sourceIntegrity: this.sourceIntegrity(source, values),
        selectedDetail: source.selection.targetKind,
        selectedTrialId: source.selection.selectedTrialId,
      };
    }
    const values = this.retainedValues(source, draft, releaseCandidateId, report);
    return {
      values,
      pack: this.retainedPackItems(source, draft, values),
      sourceIntegrity: this.retainedIntegrity(source, values),
      selectedDetail: this.retainedSelectedDetail(source, values.facts.selection?.trialId ?? null),
      selectedTrialId: values.facts.selection?.trialId ?? null,
    };
  }

  // ---- W7 · retained (Delta WFO) lane --------------------------------------

  /**
   * The WFO lane starts from the P04 composition for the rows that are
   * lane-independent (alpha passport, engine, execution assumptions, the two
   * declarations) and replaces every row and field the P04 hubs used to
   * answer with its retained fact. Nothing of the P04 path is changed.
   */
  private retainedValues(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string | null, report: ReportVerification) {
    const base = this.values(source, draft, releaseCandidateId, report);
    const lane = source.wfo!;
    const facts = retainedLaneFacts(lane);
    const reportCore = base.reportCore;
    const retainedReport = reportCore !== null && reportCore.report_source === "RS02_RETAINED_CURRENT_SOURCE";
    const reportDigestAt = (key: string) => (retainedReport ? stringAt(reportCore, ["source_digests", key]) : null);
    const seal = lane.seal;
    // Dataset: the run's P10 producer binding and the retained seal's binding
    // (and the retained report's copy) are one identity.
    const strictDatasetDigest = this.sameDigest(
      source.datasetBindingDigest, lane.producerDatasetBindingDigest, seal?.datasetBindingDigest ?? null, reportDigestAt("dataset_binding_digest"),
    );
    // Manifest: the retained seal's manifest, bound to the SEALED P05 artifact
    // at the same revision, and its retained report copy. The preflight
    // manifest (run_producers) is a different identity and is not compared.
    const retainedManifest = seal ? this.sameDigest(seal.manifestDigest, reportDigestAt("manifest_digest")) : null;
    const manifest = retainedManifest !== null && lane.sealedArtifactId !== null ? retainedManifest : null;
    const sourceTransform = seal ? this.sameDigest(seal.sourceTransformDigest, reportDigestAt("source_transform_digest")) : null;
    const childAudit = facts.ordering;
    const childAuditMatches = childAudit !== null && childAudit.counts.folds > 0
      && childAudit.counts.oos_child_match === childAudit.counts.folds;
    const linkedAudit = source.verifiedAudit?.result.parent_run_id === source.runId
      && source.verifiedAudit.result.parameters_digest === facts.parameterDigest ? source.verifiedAudit : undefined;
    const finalAudit = source.runState === "READY" && facts.replayRetained && facts.parameterDigest !== null
      && (childAuditMatches || linkedAudit !== undefined);
    const capturedEvidenceRevision = stringAt(reportCore, ["source_revisions", "evidence_revision"]);
    // A companion adds a new read representation, not a new immutable source.
    // Reports captured before that companion remain usable only when their
    // original revision is the exact base seal revision AND all five source
    // pins still match. Never adopt an arbitrary historical presentation hash
    // or rewrite the archived report to manufacture current evidence.
    const reportSourcePinsMatch = seal !== null && strictDatasetDigest !== null
      && manifest !== null && sourceTransform !== null
      && ["manifest_digest", "source_transform_digest", "requested_spec_digest", "effective_spec_digest", "dataset_binding_digest"]
        .every(key => digest(reportDigestAt(key)) !== null)
      && this.sameDigest(seal.requestedSpecDigest, source.requestSpecDigest, reportDigestAt("requested_spec_digest")) !== null
      && this.sameDigest(seal.effectiveSpecDigest, source.effectiveSpecDigest, reportDigestAt("effective_spec_digest")) !== null;
    const reportFromLane = retainedReport && report.sealed && reportSourcePinsMatch
      && (capturedEvidenceRevision === facts.evidenceRevision
        || (facts.sealDigest !== null && capturedEvidenceRevision === `rs02_evidence_${facts.sealDigest}`));
    const fields = base.fields.map((item): Field => {
      switch (item.key) {
        case "final_audit_run_id":
          return field(item.key, item.label, finalAudit ? linkedAudit?.child_run_id ?? source.runId : null, finalAudit ? AVAILABLE : absent("P21_FINAL_AUDIT_RUN_NOT_PUBLISHED"));
        case "final_audit_attempt_id":
          return field(item.key, item.label, finalAudit ? linkedAudit?.child_attempt_id ?? source.attemptId : null, finalAudit ? AVAILABLE : absent("P21_FINAL_AUDIT_RUN_NOT_PUBLISHED"));
        case "dataset_binding_digest":
          return field(item.key, item.label, strictDatasetDigest, strictDatasetDigest ? AVAILABLE : absent("P21_DATASET_BINDING_IDENTITY_MISMATCH"));
        case "manifest_digest":
          return field(item.key, item.label, manifest, manifest ? AVAILABLE : absent(seal ? "P21_MANIFEST_IDENTITY_MISMATCH" : RETAINED_NOT_SEALED));
        case "source_transform_digest":
          return field(item.key, item.label, sourceTransform, sourceTransform ? AVAILABLE : absent(seal ? "P21_SOURCE_TRANSFORM_IDENTITY_MISMATCH" : RETAINED_NOT_SEALED));
        case "parameter_bundle_digest":
          return field(item.key, item.label, facts.parameterDigest, facts.parameterDigest ? AVAILABLE : absent("P21_SELECTION_PARAMETER_BUNDLE_NOT_PUBLISHED"));
        case "evidence_revision":
          return field(item.key, item.label, facts.evidenceRevision, facts.evidenceRevision ? AVAILABLE : absent("P21_EVIDENCE_REVISION_NOT_PUBLISHED"));
        default:
          return item;
      }
    });
    return {
      ...base, fields, facts, manifest, sourceTransform, strictDatasetDigest,
      parameterBundle: facts.parameterDigest, finalAudit, reportFromLane, childAudit, linkedAudit,
    };
  }

  private retainedPackItems(
    source: ReleaseCandidateSource,
    draft: ReleaseCandidateDraft,
    values: ReturnType<ResearchReleaseCandidateService["retainedValues"]>,
  ): PackItem[] {
    const base = this.packItems(source, draft, values);
    const lane = source.wfo!;
    const { facts } = values;
    const sealed = lane.seal !== null;
    const at = (index: number) => base[index]!;
    const unsealed = (index: number) => missing(at(index).key, at(index).n, at(index).item, at(index).source, RETAINED_NOT_SEALED, "The run's retained current source is not sealed yet; nothing is composed from the P04 hubs it never had.");

    const data = !sealed ? unsealed(2) : values.strictDatasetDigest && values.manifest
      ? complete(at(2).key, 3, at(2).item, at(2).source, values.strictDatasetDigest, "P10 producer and retained seal dataset bindings agree; the retained manifest names its sealed P05 artifact.")
      : missing(at(2).key, 3, at(2).item, at(2).source, "P21_DATASET_BINDING_IDENTITY_MISMATCH", "The P10 producer / retained seal dataset binding or the retained artifact manifest is absent or inconsistent.");

    const claims = facts.claims;
    const issued = source.methodology.certificateState === "ISSUED" && source.methodology.certificateGrade !== null
      && source.methodology.certificateIssuedAtUtcMs !== null;
    const claimDigest = claims ? digestOf({
      validation_claim: claims.validation_claim ?? null,
      chronological_validation_claim: claims.chronological_validation_claim ?? null,
      causality_claim: claims.causality_claim ?? null,
      oos_used_for_selection: claims.oos_used_for_selection ?? null,
      claim_state: lane.claimState,
      certificate_state: source.methodology.certificateState,
      grade: source.methodology.certificateGrade,
    }) : null;
    const claimLine = claims
      ? `QuantBT claim ${claims.validation_claim ?? "not published"} (${claims.chronological_validation_claim ?? "chronology not published"}; OOS used for selection: ${claims.oos_used_for_selection === null || claims.oos_used_for_selection === undefined ? "not published" : String(claims.oos_used_for_selection)}) is retained`
      : "";
    const methodology = !sealed ? unsealed(3) : claims === null
      ? missing(at(3).key, 4, at(3).item, at(3).source, "P21_RETAINED_CLAIM_FACTS_NOT_PUBLISHED", "The retained seal predates QuantBT's claim facts; no claim is composed.")
      : issued
        ? complete(at(3).key, 4, at(3).item, at(3).source, claimDigest, `${claimLine}; the source-issued methodology certificate travels with it.`)
        : degradedBecause(at(3).key, 4, at(3).item, at(3).source, claimDigest, "P21_METHODOLOGY_CERTIFICATE_NOT_ISSUED",
          `${claimLine}; the release claim is ${lane.claimState ?? "not published"} and no methodology certificate is issued, so the claim ceiling travels unchanged.`);

    const selection = !sealed ? unsealed(4) : facts.selection && facts.parameterDigest
      ? complete(at(4).key, 5, at(4).item, at(4).source, facts.parameterDigest, `Retained selection (${facts.selection.trialId === null ? "source-published synthetic centroid; no Optuna trial" : `trial ${facts.selection.trialId}`}) is the frozen θ*; its parameter digest ${lane.handoffParamsDigest ? "matches the run's hand-off cursor" : "is pinned by the P14 rule"}.`)
      : missing(at(4).key, 5, at(4).item, at(4).source, facts.parameterDigestConflict ? "P21_RETAINED_PARAMETER_DIGEST_MISMATCH" : "P21_SELECTION_PARAMETER_BUNDLE_NOT_PUBLISHED",
        facts.parameterDigestConflict ? "The retained selection and the run's hand-off cursor name different parameter digests." : "The retained seal names no selected trial with parameters.");

    const ordering = values.childAudit;
    const audit = !sealed ? unsealed(5) : values.finalAudit && values.linkedAudit
      ? complete(at(5).key,6,at(5).item,at(5).source,values.linkedAudit.result_digest,
        "Byte-verified linked child evaluated the admitted frozen parameters without optimizer or reselection.")
      : values.finalAudit && ordering
      ? complete(at(5).key, 6, at(5).item, at(5).source, digestOf({
        replay_revision: facts.replayRevision,
        frozen_candidate_id: ordering.frozen_candidate.candidate_id,
        oos_generation_children: ordering.folds.map((fold) => ({ fold_id: fold.fold_id, audit_ordinal: fold.oos_generation_child.audit_ordinal, candidate_id: fold.oos_generation_child.candidate_id })),
      }), `Retained final-account replay (${lane.seal!.tableRows.OBSERVATION} bars) and, for ${ordering.counts.folds}/${ordering.counts.folds} folds, QuantBT's out-of-sample generation child of the frozen θ* (MATCH).`)
      : missing(at(5).key, 6, at(5).item, at(5).source,
        ordering && ordering.counts.oos_child_mismatch > 0 ? "P21_RETAINED_CHILD_AUDIT_MISMATCH" : "P21_FINAL_AUDIT_RUN_NOT_PUBLISHED",
        ordering && ordering.counts.oos_child_mismatch > 0
          ? "A fold's out-of-sample generation child is not the frozen θ*; the run is not an audit of its selection."
          : "The retained replay or a fold's out-of-sample generation child record is absent.");

    const metrics = !sealed ? unsealed(6) : values.reportFromLane && source.report.frozenCoreDigest
      ? complete(at(6).key, 7, at(6).item, at(6).source, source.report.frozenCoreDigest, `Report v2 is sealed from this retained lane (${stringAt(values.reportCore, ["provenance", "metric_registry_version"]) ?? "metric registry not named"}).`)
      : missing(at(6).key, 7, at(6).item, at(6).source, "P21_RETAINED_REPORT_NOT_SEALED", "No report v2 sealed from the current retained evidence revision exists.");

    const robustness = !sealed ? unsealed(8) : facts.evidenceRevision
      ? degraded(at(8).key, 9, at(8).item, at(8).source, facts.sealDigest, "Retained evidence, split and search publish fold verdicts and one global selection, not a stability/regime certificate; the degraded state travels unchanged.")
      : missing(at(8).key, 9, at(8).item, at(8).source, "P21_EVIDENCE_REVISION_NOT_PUBLISHED", "No retained evidence revision exists to support even a degraded declaration.");

    const reproducible = values.manifest && values.sourceTransform && facts.importMatch && lane.partDigests.length > 0 && facts.partsValid;
    const reproducibility = !sealed ? unsealed(10) : reproducible
      ? complete(at(10).key, 11, at(10).item, at(10).source, lane.seal!.retainedImportDigest, `Retained manifest, recomputed import receipt (MATCH), source transform and ${lane.partDigests.length} sealed P05 part digests are pinned.`)
      : missing(at(10).key, 11, at(10).item, at(10).source, "P21_REPRODUCIBILITY_CHECKSUMS_INCOMPLETE", "A retained manifest, import receipt, transform or P05 part checksum is absent or mismatched.");
    const importedBinding=importedRetainedBinding(lane.seal?.profileId??"",lane.runDeclarationInputs);
    const execution=importedBinding && facts.laneConsistent && values.adapterContractDigest===importedBinding.adapterContractDigest
      ? complete(at(7).key,8,at(7).item,at(7).source,importedBinding.profileDigest,
        "The immutable admitted imported profile binds signal_notional execution. This is a research assumption, not an Execution deployment or broker acknowledgement.") : at(7);
    return [at(0), at(1), data, methodology, selection, audit, metrics, execution, robustness, at(9), reproducibility, at(11)];
  }

  /** Every present retained identity must be well-formed and agree with its own authority. */
  private retainedIntegrity(source: ReleaseCandidateSource, values: ReturnType<ResearchReleaseCandidateService["retainedValues"]>): boolean {
    const lane = source.wfo!;
    const { facts } = values;
    if (!values.exactSource || !facts.laneConsistent) return false;
    if (values.strictDatasetDigest === null) return false;
    if (source.artifacts.some((artifact) => artifact.state === "CORRUPT" || artifact.state === "MISSING")) return false;
    const seal = lane.seal;
    if (seal === null) return true;
    return values.manifest !== null && values.sourceTransform !== null
      && seal.requestedSpecDigest === source.requestSpecDigest && seal.effectiveSpecDigest === source.effectiveSpecDigest
      && facts.importMatch && facts.foldsValid && facts.partsValid && !facts.parameterDigestConflict
      && digest(seal.retainedImportDigest) !== null;
  }

  /** Retention pins of a retained-lane seal: each names the retained revision it was composed from. */
  private retainedPins(source: ReleaseCandidateSource): ReleaseCandidatePin[] {
    const facts = retainedLaneFacts(source.wfo as NonNullable<ReleaseCandidateSource["wfo"]>);
    return [
      { pinKind: "RUN", sourceRef: source.runId, sourceDigest: source.effectiveSpecDigest },
      { pinKind: "ALPHA_VERSION", sourceRef: source.alpha.alphaVersionId as string, sourceDigest: source.alpha.codeDigest },
      { pinKind: "REPORT", sourceRef: source.report.reportRevision as string, sourceDigest: source.report.frozenCoreDigest },
      { pinKind: "EVIDENCE", sourceRef: facts.evidenceRevision as string, sourceDigest: facts.sealDigest },
      { pinKind: "SPLIT", sourceRef: facts.splitRevision as string, sourceDigest: facts.sealDigest },
      { pinKind: "SELECTION", sourceRef: facts.searchRevision as string, sourceDigest: facts.parameterDigest },
    ];
  }

  /** A verified seal is a source fact, separate from "matches the current Evidence revision". */
  private verifyReport(source: ReleaseCandidateSource): ReportVerification {
    return this.reportVerification.calculate({ runId: source.runId, report: source.report }, () => {
      const { reportRevision, frozenCoreDigest, frozenCore, sealedAtUtcMs } = source.report;
      const core = record(frozenCore);
      const parsed = ResearchReportFrozenCoreSchema.safeParse(core);
      const digestMatches = core !== null && frozenCoreDigest !== null && digestOf(core) === frozenCoreDigest;
      const sealed = reportRevision !== null && frozenCoreDigest !== null && digest(frozenCoreDigest) !== null
        && reportRevision === `p18r1_${frozenCoreDigest}`
        && sealedAtUtcMs !== null && Number.isSafeInteger(sealedAtUtcMs) && sealedAtUtcMs >= 0
        && digestMatches && parsed.success
        && parsed.data.identity.find((item) => item.key === "run_id")?.value === source.runId;
      return { core, exactSource: reportRevision === null || digestMatches, sealed };
    });
  }

  private retainedSelectedDetail(source: ReleaseCandidateSource, trialId: string | null): string | null {
    if (trialId === null) return null;
    const presentation = selectedTrialPresentation(trialId, source.wfo?.seal?.profileId ?? "", source.selectedTrialNativeFacts);
    if (presentation.selected_trial_ordinal === null) return `retained source ${trialId} · display trial not published`;
    const scope = presentation.selected_trial_ordinal_scope === "STUDY_LOCAL" ? "study-local" : "run-global";
    return `trial ${presentation.selected_trial_ordinal} · source ${trialId} · ${scope}`;
  }

  private requireEnabled(): void {
    if (this.config.FEATURE_RESEARCH_RELEASE_CANDIDATES !== "true") {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", "Release Candidate composer is not enabled.", 503);
    }
  }

  private unavailable(message: string): ResearchReleaseCandidateError {
    return new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_UNAVAILABLE", message, 503);
  }
}

function issuedMethodologyAxis(source: ReleaseCandidateSource): { value: string | null; availability: Availability } {
  if (source.methodology.certificateState === "ISSUED" && source.methodology.certificateGrade !== null) {
    return { value: source.methodology.certificateGrade, availability: AVAILABLE };
  }
  return {
    value: null,
    availability: absent("P21_METHODOLOGY_CERTIFICATION_NOT_PUBLISHED"),
  };
}
