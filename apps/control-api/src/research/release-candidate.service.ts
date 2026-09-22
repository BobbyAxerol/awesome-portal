/** P21 Release Candidate composer/local-seal authority. */

import { createHash } from "node:crypto";

import { Inject, Injectable } from "@nestjs/common";

import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import type { ResearchScope } from "./contracts";
import { canonicalResearchJson } from "./preflight.service";
import {
  ResearchReleaseCandidateComposeResponseSchema,
  ResearchReleaseCandidatePackResponseSchema,
  ResearchReleaseCandidateSealResponseSchema,
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
  type ReleaseCandidateSource,
  type ReleaseCandidateStoredPack,
} from "./release-candidate.repository";

type Availability = {
  state: "AVAILABLE" | "NOT_PUBLISHED" | "PARTIAL" | "NOT_APPLICABLE";
  reason_code: string | null;
};
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
  return createHash("sha256").update(canonicalResearchJson(value), "utf8").digest("hex");
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
  key: PackItem["key"], n: number, item: string, value: string | null, note: string,
): PackItem {
  return {
    key, n, item, status: "INPUT", digest: value === null ? null : digestOf(value),
    source: { label: "Researcher declaration", href: null }, note,
    availability: value === null ? absent("P21_RESEARCHER_DECLARATION_REQUIRED") : AVAILABLE,
  };
}

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
  constructor(
    private readonly repository: ResearchReleaseCandidateRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async detail(scope: ResearchScope, runId: string): Promise<ResearchReleaseCandidateComposeResponse> {
    this.requireEnabled();
    const [source, persistedDraft, latestPack] = await Promise.all([
      this.repository.snapshot(scope, runId), this.repository.draft(scope, runId), this.repository.latestPack(scope, runId),
    ]);
    if (!source) throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_FOUND", "Research run was not found.", 404);
    return this.compose(source, persistedDraft ?? this.virtualDraft(source), latestPack);
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
    return this.compose(result.source, result.draft, latestPack);
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
  ): ResearchReleaseCandidateComposeResponse {
    const sourceFingerprint = releaseCandidateSourceFingerprint(source);
    const values = this.values(source, draft, null);
    const pack = this.packItems(source, draft, values);
    const sourceIntegrity = this.sourceIntegrity(source, values);
    const missingCount = pack.filter((item) => item.status === "MISSING").length;
    const hasInput = draft.knownLimitations === null || draft.proposedUseRestrictions === null;
    const isScratch = source.alpha.alphaVersionId === null;
    const active = source.alpha.lifecycleState === "ACTIVE";
    const localSeal = this.localSeal(latestPack, sourceFingerprint);
    let sealBlockedReason: string | null = null;
    if (isScratch) sealBlockedReason = "P21_SCRATCH_RUN_UNBOUND";
    else if (!active) sealBlockedReason = "P21_ALPHA_VERSION_NOT_ACTIVE";
    else if (!sourceIntegrity) sealBlockedReason = "P21_REFERENCED_SOURCE_INTEGRITY_FAILED";
    else if (missingCount > 0) sealBlockedReason = "P21_REQUIRED_EVIDENCE_MISSING";
    else if (hasInput) sealBlockedReason = "P21_RESEARCHER_DECLARATIONS_REQUIRED";
    const counts = pack.reduce((result, item) => {
      result[item.status.toLowerCase() as "complete" | "degraded" | "input" | "missing"] += 1;
      return result;
    }, { complete: 0, degraded: 0, input: 0, missing: 0 });
    const fields = values.fields;
    const response = {
      schema_version: "research.release-candidate-compose.v1" as const,
      read_authority: "PORTAL_PERSISTED_RESEARCH" as const,
      run_id: source.runId,
      state: "DRAFT" as const,
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
        { key: "selected_params", value: values.parameterBundle ?? "— selection not published", detail: source.selection.targetKind, tone: values.parameterBundle ? "ink" : "dim" },
        { key: "release_candidate", value: localSeal.release_candidate_id ?? "rc_(draft)", detail: localSeal.state === "SEALED_LOCAL" ? "sealed locally — not delivered" : "assigned on local seal", tone: localSeal.state === "SEALED_LOCAL" ? "green" : "gold" },
      ],
      taxonomy: [
        { what: "code / entrypoint (av_)", state: "UNSET", consequence: "No P22-published predecessor is available, so no code-change or gate conclusion is inferred." },
        { what: "selected strategy params", state: "UNSET", consequence: values.parameterBundle ? "Current exact parameter bundle is pinned, but no predecessor comparison is published." : "Selection provenance is not published." },
        { what: "data contract / dataset snapshot", state: "UNSET", consequence: values.strictDatasetDigest ? "Current dataset binding is pinned, but no predecessor comparison is published." : "Dataset binding identity is unavailable." },
        { what: "target venue / account / capital", state: "UNSET", consequence: "Deployment facts belong to an Execution-side candidate and are never composed here." },
      ],
      published_comparison: {
        last_release_candidate_id: null,
        availability: absent("P22_PUBLISHED_COMPARISON_NOT_COMMISSIONED"),
      },
      certification_axes: {
        methodology_claim: issuedMethodologyAxis(source),
        engine_execution_contract: {
          value: null,
          availability: absent("P21_ENGINE_EXECUTION_CERTIFICATION_NOT_PUBLISHED"),
        },
      },
      gate_verdict: {
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
        may_edit_draft: true,
        may_seal: sealBlockedReason === null,
        seal_blocked_reason: sealBlockedReason,
        publish: { enabled: false as const, blocked_reason: "P22_PUBLICATION_NOT_COMMISSIONED" as const },
      },
      mirror: null,
      source_absences: {
        alpha_binding: isScratch ? absent("P21_SCRATCH_RUN_UNBOUND") : AVAILABLE,
        methodology_claim: pack[3]!.availability,
        final_audit: pack[5]!.availability,
        approval_mirror: absent("P22_PUBLICATION_NOT_COMMISSIONED"),
        execution_deployment: notApplicable("P21_EXECUTION_DEPLOYMENT_OUT_OF_SCOPE"),
      },
    };
    const parsed = ResearchReleaseCandidateComposeResponseSchema.safeParse(response);
    if (!parsed.success) throw this.unavailable("Release Candidate composer response is incompatible.");
    return parsed.data;
  }

  private values(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string | null) {
    const reportCore = record(source.report.frozenCore);
    const alphaCodeDigest = digest(source.alpha.codeDigest);
    const adapterContractDigest = digest(source.producer.adapterContractDigest);
    const sourceTransform = this.sameDigest(
      stringAt(source.evidence.projection, ["source", "source_transform_digest"]),
      source.currentSource.sourceTransformDigest,
      stringAt(reportCore, ["source_digests", "source_transform_digest"]),
    );
    const manifest = this.sameDigest(
      source.producer.manifestDigest, source.currentSource.manifestDigest,
      stringAt(reportCore, ["source_digests", "manifest_digest"]),
    );
    // `current_source.manifest_digest` is a source artifact identity, not a
    // dataset-binding digest. Do not cross-compare it to dataset binding; it
    // remains a separately pinned relation below.
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
    const exactSource = sourceIntegritySource(source);
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
    const alphaHref = source.alpha.alphaId ? `/research/alphas/${source.alpha.alphaId}` : null;
    const runHref = `/research/quantbt/runs/${source.runId}`;
    const alphaPassport = values.alphaReady
      ? complete("ALPHA_VERSION_PASSPORT", 1, "Alpha Version passport", { label: "Alpha 360°", href: alphaHref }, values.alphaCodeDigest, "Exact Alpha version identity is retained.")
      : missing("ALPHA_VERSION_PASSPORT", 1, "Alpha Version passport", { label: "Alpha 360°", href: alphaHref }, "P21_ALPHA_PASSPORT_INCOMPLETE", "The run has no complete immutable Alpha version passport.");
    const engine = values.adapterContractDigest;
    const engineItem = engine && source.engineReleaseId
      ? complete("ENGINE_CAPABILITY_BACKEND", 2, "Engine/capability/backend", { label: "Engine Atlas", href: "/research/quantbt" }, engine, "Pinned adapter contract and engine release are retained.")
      : missing("ENGINE_CAPABILITY_BACKEND", 2, "Engine/capability/backend", { label: "Engine Atlas", href: "/research/quantbt" }, "P21_ADAPTER_CONTRACT_NOT_PUBLISHED", "Engine or adapter identity is incomplete.");
    const data = values.strictDatasetDigest && values.manifest
      ? complete("DATASET_UNIVERSE_SNAPSHOTS", 3, "Dataset & universe snapshots", { label: "Data snapshots", href: runHref }, values.strictDatasetDigest, "Dataset binding and exact manifest identities agree across retained source facts.")
      : missing("DATASET_UNIVERSE_SNAPSHOTS", 3, "Dataset & universe snapshots", { label: "Data snapshots", href: runHref }, "P21_DATASET_BINDING_IDENTITY_MISMATCH", "A required dataset/manifest identity is absent or inconsistent.");
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
      ? complete("FINAL_AUDIT_REPLAY", 6, "Final audit replay", { label: "Replay", href: `${runHref}/replay` }, source.evidence.projectionDigest, "Exact READY AUDIT_OF_SELECTION run has retained evidence and chronology revisions.")
      : missing("FINAL_AUDIT_REPLAY", 6, "Final audit replay", { label: "Replay", href: `${runHref}/replay` }, "P21_FINAL_AUDIT_RUN_NOT_PUBLISHED", "A primary/diagnostic/reused child is never promoted into a final audit target.");
    const metrics = source.evidence.revision && source.evidence.projectionDigest && source.evidence.readiness === "COMPLETE"
      ? complete("METRICS_SEMANTICS", 7, "Metrics semantics", { label: "Run report", href: `${runHref}/report` }, source.evidence.projectionDigest, "Immutable evidence projection is complete.")
      : missing("METRICS_SEMANTICS", 7, "Metrics semantics", { label: "Run report", href: `${runHref}/report` }, "P21_METRICS_PROJECTION_NOT_COMPLETE", "Metrics projection is absent or not complete.");
    const executionRoute = stringAt(source.alpha.declaredContract, ["execution", "execution_route"]);
    const execution = executionRoute && values.adapterContractDigest
      ? complete("EXECUTION_ASSUMPTIONS", 8, "Execution assumptions", { label: "Split & chronology", href: `${runHref}/split` }, values.adapterContractDigest, "Declared adapter route is an assumption only; this pack makes no deployment decision.")
      : missing("EXECUTION_ASSUMPTIONS", 8, "Execution assumptions", { label: "Split & chronology", href: `${runHref}/split` }, "P21_EXECUTION_ASSUMPTIONS_NOT_PUBLISHED", "No source-bound execution assumption declaration is available.");
    const robustness = source.evidence.revision
      ? degraded("ROBUSTNESS_PARAM_STABILITY_REGIME", 9, "Robustness/param stability/regime", { label: "Compare", href: source.alpha.alphaId ? `/research/alphas/${source.alpha.alphaId}/compare` : null }, source.evidence.projectionDigest, "Current source publishes bounded evidence but not a complete stability/regime certificate; the degraded state travels unchanged.")
      : missing("ROBUSTNESS_PARAM_STABILITY_REGIME", 9, "Robustness/param stability/regime", { label: "Compare", href: source.alpha.alphaId ? `/research/alphas/${source.alpha.alphaId}/compare` : null }, "P21_EVIDENCE_REVISION_NOT_PUBLISHED", "No retained evidence revision exists to support even a degraded declaration.");
    const limitations = input("KNOWN_LIMITATIONS_WAIVERS", 10, "Known limitations & waivers", draft.knownLimitations, "Researcher-signed declaration; it cannot hide a missing mandatory item.");
    const reproducibility = values.manifest && values.sourceTransform && source.report.frozenCoreDigest
      ? complete("REPRODUCIBILITY_PARITY_CHECKSUMS", 11, "Reproducibility/parity checksums", { label: "Freeze & integrity", href: `${runHref}/freeze` }, source.report.frozenCoreDigest, "Retained manifest, transform and sealed Report checksum are all explicitly pinned.")
      : missing("REPRODUCIBILITY_PARITY_CHECKSUMS", 11, "Reproducibility/parity checksums", { label: "Freeze & integrity", href: `${runHref}/freeze` }, "P21_REPRODUCIBILITY_CHECKSUMS_INCOMPLETE", "A required retained checksum is absent or mismatched.");
    const restrictions = input("PROPOSED_USE_RESTRICTIONS", 12, "Proposed use restrictions", draft.proposedUseRestrictions, "Researcher-signed declaration; downstream approval policy belongs to P22.");
    return [alphaPassport, engineItem, data, methodology, selection, audit, metrics, execution, robustness, limitations, reproducibility, restrictions];
  }

  private sourceIntegrity(source: ReleaseCandidateSource, values: ReturnType<ResearchReleaseCandidateService["values"]>): boolean {
    if (!values.exactSource || values.manifest === null || values.sourceTransform === null || values.strictDatasetDigest === null) return false;
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

  private virtualDraft(source: ReleaseCandidateSource): ReleaseCandidateDraft {
    return {
      draftId: null,
      revision: 0,
      sourceFingerprint: releaseCandidateSourceFingerprint(source),
      knownLimitations: null,
      proposedUseRestrictions: null,
      updatedAtUtcMs: null,
    };
  }

  private sealBuild(source: ReleaseCandidateSource, draft: ReleaseCandidateDraft, releaseCandidateId: string) {
    const preview = this.compose(source, draft, null);
    if (!preview.actions.may_seal) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE", "Release Candidate cannot be locally sealed until all required evidence is available.", 422);
    }
    if (draft.knownLimitations === null || draft.proposedUseRestrictions === null) {
      throw new ResearchReleaseCandidateError("RESEARCH_RELEASE_CANDIDATE_NOT_PUBLISHABLE", "Release Candidate declarations are required before sealing.", 422);
    }
    const values = this.values(source, draft, releaseCandidateId);
    const pack = this.packItems(source, draft, values);
    const frozenCore = {
      fields: values.fields,
      pack,
      source_fingerprint: releaseCandidateSourceFingerprint(source),
      draft: { known_limitations: draft.knownLimitations, proposed_use_restrictions: draft.proposedUseRestrictions },
    };
    const packDigest = digestOf(frozenCore);
    const pins: ReleaseCandidatePin[] = [
      { pinKind: "RUN", sourceRef: source.runId, sourceDigest: source.effectiveSpecDigest },
      { pinKind: "ALPHA_VERSION", sourceRef: source.alpha.alphaVersionId!, sourceDigest: source.alpha.codeDigest },
      { pinKind: "REPORT", sourceRef: source.report.reportRevision!, sourceDigest: source.report.frozenCoreDigest },
      { pinKind: "EVIDENCE", sourceRef: source.evidence.revision!, sourceDigest: source.evidence.projectionDigest },
      { pinKind: "SPLIT", sourceRef: source.split.revision!, sourceDigest: source.split.projectionDigest },
      { pinKind: "SELECTION", sourceRef: source.selection.selectionId!, sourceDigest: source.selection.sourceDigest },
      ...source.currentSource.retainedImportDigest ? [{ pinKind: "CURRENT_SOURCE" as const, sourceRef: `artifact-revision-${source.currentSource.artifactRevision}`, sourceDigest: source.currentSource.retainedImportDigest }] : [],
      ...source.artifacts.filter((artifact) => artifact.state === "SEALED").map((artifact) => ({ pinKind: "ARTIFACT" as const, sourceRef: artifact.artifactId, sourceDigest: artifact.manifestDigest })),
    ];
    return { frozenCore, packDigest, pins };
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

function sourceIntegritySource(source: ReleaseCandidateSource): boolean {
  // The Report core itself is an immutable object. A row that advertises a
  // report revision but cannot be parsed is an integrity failure, never a
  // reason to fall back to an older digest or reconstruct a report from UI.
  if (source.report.reportRevision === null) return true;
  const reportCore = record(source.report.frozenCore);
  return reportCore !== null
    && source.report.frozenCoreDigest !== null
    && digestOf(reportCore) === source.report.frozenCoreDigest;
}
