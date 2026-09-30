import { Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";

import { ControlApiConfig } from "../config";
import { PortalUser } from "../domain";
import { newUlid } from "../id";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  researchAlphaImportAttestation,
  type ResearchAlphaActivateResponse,
  type ResearchAlphaAnalysis,
  type ResearchAlphaImportGateRow,
  type ResearchAlphaImportGatesResponse,
  type ResearchAlphaImportParseResponse,
  type ResearchAlphaImportRegisterResponse,
  type ResearchAlphaRegistryEntry,
} from "./alpha-import.contract";
import {
  projectResearchAlphaVersionDeclaration,
  ResearchAlphaVersionDeclarationError,
} from "./alpha-version-declaration";
import { ResearchAlphaAnalysisClient } from "./alpha-analysis.client";
import { ResearchAlphaImportError } from "./alpha-import.error";
import { type ResearchScope, ResearchMetadataError } from "./contracts";
import { ResearchMetadataRepository } from "./repository";
import { researchRunVersionPrecheck } from "./version-admission";
import {
  IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
  IMPORTED_ALPHA_ADAPTER_ID,
} from "./imported-alpha.profile";

const STATIC_SCAN_DISCLOSURE = "Static scan — runtime causality is proven per run at Stage 3/4." as const;
const SKIPPED_MESSAGE = "SKIPPED because a prior gate failed; no provisional registration is available.";
const GATE_NAMES = [
  "contract-complete",
  "entrypoint-importable",
  "digest-unique",
  "parameter-space-sane",
  "determinism-declared",
  "data-contract-known",
  "no-lookahead-static-scan",
] as const;

/**
 * This is deliberately the exact predicate enforced by `activate`, not a UI
 * hint derived from object lifecycle. The controller proves workspace
 * membership before either read or mutation reaches this service.
 */
export function mayActivateResearchAlpha(user: Pick<PortalUser, "role">): boolean {
  return user.role === "ADMIN";
}

@Injectable()
export class ResearchAlphaImportService {
  constructor(
    private readonly repository: ResearchMetadataRepository,
    private readonly analyzer: ResearchAlphaAnalysisClient,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  async parse(
    user: PortalUser,
    scope: ResearchScope,
    input: { originalFilename: string; sourceText: string; expectedSourceDigest?: string },
    requestId: string,
  ): Promise<ResearchAlphaImportParseResponse> {
    this.assertSourceSize(input.sourceText);
    if (input.expectedSourceDigest !== undefined &&
        input.expectedSourceDigest !== createHash("sha256").update(Buffer.from(input.sourceText, "utf8")).digest("hex")) {
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_DIGEST_MISMATCH",
        "Submitted source bytes do not match the declared SHA-256 digest; reselect the exact file before parsing.",
        409,
      );
    }
    // Keep temporary single-file custody bounded even if a UI repeatedly
    // re-parses drafts. Only expired, unbound rows owned by this actor move.
    await this.repository.cleanupExpiredUnboundAlphaImportSources(
      scope,
      Math.min(8, this.config.RESEARCH_ALPHA_IMPORT_MAXIMUM_ACTIVE_SOURCES_PER_ACTOR),
    );
    const analysis = await this.analyzer.analyze(user, { ...input, requestId });
    this.assertExactAnalysis(input.sourceText, analysis);
    const expiresAt = new Date(Date.now() + this.config.RESEARCH_ALPHA_IMPORT_TTL_SECONDS * 1_000);
    const source = await this.repository.storeAlphaImportSource(scope, {
      sourceFileRef: newUlid("rasrc"),
      originalFilename: input.originalFilename,
      sourceBytes: Buffer.from(input.sourceText, "utf8"),
      sourceDigest: analysis.source_digest,
      analysisDigest: analysis.analysis_digest,
      declaredContract: analysis.declared_contract,
      parsedMirror: analysis.mirror,
      expiresAt,
      maximumActiveSources: this.config.RESEARCH_ALPHA_IMPORT_MAXIMUM_ACTIVE_SOURCES_PER_ACTOR,
    });
    return {
      schema_version: "research.alpha-source.v1",
      source_file_ref: source.sourceFileRef,
      source_digest: source.sourceDigest,
      analysis_digest: source.analysisDigest,
      parse_ok: analysis.parse_ok,
      expires_at_utc_ms: source.expiresAt.getTime(),
      mirror: analysis.mirror,
    };
  }

  async gates(
    user: PortalUser,
    scope: ResearchScope,
    sourceFileRef: string,
    requestId: string,
  ): Promise<ResearchAlphaImportGatesResponse> {
    const source = await this.repository.loadAlphaImportSource(scope, sourceFileRef);
    const analysis = await this.analyzeStoredSource(user, source, requestId);
    const gates = await this.runOrderedGates(scope, analysis);
    const allPass = gates.every((gate) => gate.state === "PASS");
    const expiresAt = new Date(Math.min(
      source.expiresAt.getTime(),
      Date.now() + this.config.RESEARCH_ALPHA_IMPORT_TTL_SECONDS * 1_000,
    ));
    const receiptId = newUlid("rgate");
    await this.repository.recordAlphaImportGates(scope, {
      importSessionId: receiptId,
      sourceFileRef: source.sourceFileRef,
      sourceDigest: source.sourceDigest,
      sourceAnalysisDigest: source.analysisDigest,
      gateResults: {
        schema_version: "research.alpha-import-gates.v1",
        all_pass: allPass,
        gates,
        static_scan_disclosure: STATIC_SCAN_DISCLOSURE,
      },
      expiresAt,
    });
    return {
      schema_version: "research.alpha-import-gates.v1",
      gate_receipt_id: receiptId,
      source_file_ref: source.sourceFileRef,
      source_digest: source.sourceDigest,
      analysis_digest: source.analysisDigest,
      gates,
      all_pass: allPass,
      expires_at_utc_ms: expiresAt.getTime(),
      static_scan_disclosure: STATIC_SCAN_DISCLOSURE,
    };
  }

  async register(
    user: PortalUser,
    scope: ResearchScope,
    input: { sourceFileRef: string; alphaId: string; gateReceiptId?: string },
    requestId: string,
  ): Promise<ResearchAlphaImportRegisterResponse> {
    const source = await this.repository.loadAlphaImportSource(scope, input.sourceFileRef);
    // Re-run the private parser before durable registration. Immutable DB
    // bytes make TOCTOU impossible after this comparison; a stale or changed
    // parser result has to repeat parse/gates rather than bind a false receipt.
    const analysis = await this.analyzeStoredSource(user, source, requestId);
    if (!analysis.parse_ok || !analysis.gate_facts.contract_complete ||
        !analysis.gate_facts.entrypoint_restricted_definition_load ||
        !analysis.gate_facts.parameter_space_sane || !analysis.gate_facts.determinism_declared ||
        !analysis.gate_facts.data_contract_known || !analysis.gate_facts.no_lookahead_static_scan) {
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
        "The exact source no longer satisfies the required parser facts; parse and run the gates again.",
        409,
      );
    }
    const version = analysis.declared_contract.version;
    const entrypoint = analysis.declared_contract.entrypoint;
    if (typeof version !== "string" || typeof entrypoint !== "string") {
      throw new ResearchAlphaImportError("RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED", "Research Alpha analysis omitted its required contract identity.", 502);
    }
    const versionLabel = `av_${version.replaceAll(".", "_")}`;
    const alphaVersionId = `av_${input.alphaId.replaceAll("-", "_")}_${version.replaceAll(".", "_")}`;
    const registration = await this.repository.registerImportedAlphaVersion(scope, {
      alphaId: input.alphaId,
      name: input.alphaId,
      executionSubjectId: `research:${scope.workspaceId}:${input.alphaId}`,
      alphaVersionId,
      versionLabel,
      sourceFileRef: source.sourceFileRef,
      sourceDigest: source.sourceDigest,
      analysisDigest: source.analysisDigest,
      gateReceiptId: input.gateReceiptId,
      entrypoint,
      // Server-owned E17 binding permits evidence execution while DRAFT;
      // publication still requires the independent ACTIVE lifecycle.
      dependencyRef: "research.alpha-source.v1:restricted-definition",
      declaredContract: analysis.declared_contract,
    }, {
      adapterId: IMPORTED_ALPHA_ADAPTER_ID,
      adapterContractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    });
    return {
      schema_version: "research.alpha-registration.v1",
      alpha_id: registration.alphaId,
      alpha_version_id: registration.alphaVersionId,
      version_label: versionLabel,
      source_digest: registration.sourceDigest,
      lifecycle_state: "DRAFT",
      supersedes: registration.supersedes,
      alpha_revision: registration.alphaRevision,
      replayed: registration.replayed,
      may_activate: mayActivateResearchAlpha(user),
      may_activate_reason: mayActivateResearchAlpha(user) ? null : "ROLE_NOT_ADMIN",
      import_attestation: researchAlphaImportAttestation(registration.sourceDigest),
    };
  }

  async activate(
    user: PortalUser,
    scope: ResearchScope,
    input: { alphaVersionId: string; expectedAlphaRevision: number },
  ): Promise<ResearchAlphaActivateResponse> {
    if (!mayActivateResearchAlpha(user)) {
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_ACTIVATION_FORBIDDEN",
        "Only a Research workspace administrator may activate an AlphaVersion.",
        403,
      );
    }
    const activation = await this.repository.activateImportedAlphaVersion(scope, input, {
      adapterId: IMPORTED_ALPHA_ADAPTER_ID,
      adapterContractDigest: IMPORTED_ALPHA_ADAPTER_CONTRACT_DIGEST,
    });
    return {
      schema_version: "research.alpha-activation.v1",
      alpha_id: activation.alphaId,
      alpha_version_id: activation.alphaVersionId,
      lifecycle_state: "ACTIVE",
      superseded_alpha_version_id: activation.supersededAlphaVersionId,
      alpha_revision: activation.alphaRevision,
      replayed: activation.replayed,
    };
  }

  async list(
    user: PortalUser,
    scope: ResearchScope,
    alphaId?: string,
  ): Promise<readonly ResearchAlphaRegistryEntry[]> {
    const rows = await this.repository.listImportedAlphaVersions(scope, alphaId);
    try {
      return rows.map((row) => {
        const runAdmission = researchRunVersionPrecheck(user, this.config, {
          alphaId: row.alphaId,
          alphaVersionId: row.alphaVersionId,
          lifecycleState: row.lifecycleState,
          declaredContract: row.declaredContract,
          entrypoint: row.entrypoint,
          sourceDigest: row.isImported ? row.sourceDigest : null,
          binding: row.binding,
        });
        return {
          alpha_id: row.alphaId,
          alpha_version_id: row.alphaVersionId,
          display_name: row.displayName,
          strategy_id: row.alphaId,
          source_digest: row.sourceDigest,
          supersedes: row.supersedes,
          supersedes_state: row.supersedesRecorded ? "RECORDED" : "HISTORICAL_NOT_RECORDED",
          version_label: row.versionLabel,
          lifecycle_state: row.lifecycleState,
          entrypoint: row.entrypoint,
          declaration: projectResearchAlphaVersionDeclaration(row.declaredContract, row.entrypoint),
          source_digest_prefix: row.sourceDigestPrefix,
          alpha_revision: row.alphaRevision,
          registered_at_utc_ms: row.registeredAt.getTime(),
          may_activate: mayActivateResearchAlpha(user) && row.isImported &&
            (row.lifecycleState === "DRAFT" || (row.lifecycleState === "ACTIVE" && row.isCurrentActive)),
          may_activate_reason: !mayActivateResearchAlpha(user) ? "ROLE_NOT_ADMIN"
            : !row.isImported ? "VERSION_NOT_IMPORTED"
            : row.lifecycleState === "DRAFT" || (row.lifecycleState === "ACTIVE" && row.isCurrentActive)
              ? null
              : "VERSION_NOT_ACTIVATABLE",
          import_attestation: researchAlphaImportAttestation(row.sourceDigest),
          run_admission: { may_create_run: runAdmission.may_create_run, code: runAdmission.code },
        };
      });
    } catch (error) {
      if (error instanceof ResearchAlphaVersionDeclarationError) {
        throw new ResearchAlphaImportError(
          "RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED",
          "An immutable Alpha declaration is incompatible with the published safe registry contract.",
          502,
        );
      }
      throw error;
    }
  }

  private async analyzeStoredSource(
    user: PortalUser,
    source: { originalFilename: string; sourceBytes: Buffer; sourceDigest: string; analysisDigest: string },
    requestId: string,
  ): Promise<ResearchAlphaAnalysis> {
    const sourceText = source.sourceBytes.toString("utf8");
    const analysis = await this.analyzer.analyze(user, {
      originalFilename: source.originalFilename,
      sourceText,
      requestId,
    });
    this.assertExactAnalysis(sourceText, analysis);
    if (analysis.source_digest !== source.sourceDigest || analysis.analysis_digest !== source.analysisDigest) {
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
        "The source parser result changed; parse and gate the exact bytes again.",
        409,
      );
    }
    return analysis;
  }

  private async runOrderedGates(
    scope: ResearchScope,
    analysis: ResearchAlphaAnalysis,
  ): Promise<ResearchAlphaImportGateRow[]> {
    const gates: ResearchAlphaImportGateRow[] = [];
    let failed = false;
    const add = async (
      n: ResearchAlphaImportGateRow["n"],
      stateAndMessage: () => Promise<{ pass: boolean; message: string }>,
    ): Promise<void> => {
      const name = GATE_NAMES[n - 1];
      if (failed) {
        gates.push({ n, name, state: "SKIPPED", message: SKIPPED_MESSAGE, ms: 0, timing_source: null, analyser_us: null });
        return;
      }
      const started = performance.now();
      const outcome = await stateAndMessage();
      const localMs = performance.now() - started;
      // CG-P07-04: a parser gate's time is the analyser's own measurement of
      // that check (gate 1 includes the parse); gate 3 is timed here.
      const analyserUs = ANALYSER_TIMING_KEYS[n - 1]
        .reduce<number | null>((sum, key) => {
          const value = analysis.gate_timings_us?.[key];
          return typeof value === "number" ? (sum ?? 0) + value : sum;
        }, null);
      // `ms` stays the contract's whole milliseconds; `analyser_us` keeps precision.
      const ms = Math.max(0, Math.round(analyserUs === null ? localMs : analyserUs / 1000));
      const quarantineCodes = ["QUARANTINED_CONTRACT", "QUARANTINED_ENTRYPOINT", "QUARANTINED_DIGEST_ALREADY_REGISTERED", "QUARANTINED_PARAMETER_SPACE", "QUARANTINED_DETERMINISM", "QUARANTINED_DATA_CONTRACT", "QUARANTINED_LOOKAHEAD"] as const;
      gates.push({
        n, name, state: outcome.pass ? "PASS" : "FAIL", message: outcome.message, ms,
        timing_source: analyserUs === null ? "CONTROL_API" : "ANALYSER",
        analyser_us: analyserUs,
        ...(!outcome.pass ? { quarantine_code: quarantineCodes[n - 1] } : {}),
      });
      if (!outcome.pass) failed = true;
    };
    await add(1, async () => ({ pass: analysis.parse_ok && analysis.gate_facts.contract_complete, message: analysis.gate_facts.contract_message }));
    await add(2, async () => ({ pass: analysis.gate_facts.entrypoint_restricted_definition_load, message: analysis.gate_facts.entrypoint_message }));
    await add(3, async () => {
      const existing = await this.repository.findImportedAlphaDigestClaim(scope, analysis.source_digest);
      return existing
        ? { pass: false, message: `identical artifact already registered as ${existing} — re-registering is forbidden; bump the code, not the label.` }
        : { pass: true, message: "Source digest is not registered in this workspace." };
    });
    await add(4, async () => ({ pass: analysis.gate_facts.parameter_space_sane, message: analysis.gate_facts.parameter_message }));
    await add(5, async () => ({ pass: analysis.gate_facts.determinism_declared, message: analysis.gate_facts.determinism_message }));
    await add(6, async () => ({ pass: analysis.gate_facts.data_contract_known, message: analysis.gate_facts.data_contract_message }));
    await add(7, async () => ({ pass: analysis.gate_facts.no_lookahead_static_scan, message: analysis.gate_facts.no_lookahead_message }));
    return gates;
  }

  private assertSourceSize(sourceText: string): void {
    if (Buffer.byteLength(sourceText, "utf8") > 256 * 1024) {
      throw new ResearchAlphaImportError("RESEARCH_ALPHA_IMPORT_INVALID", "Source exceeds the 256 KiB single-file limit.", 400);
    }
  }

  private assertExactAnalysis(sourceText: string, analysis: ResearchAlphaAnalysis): void {
    const digest = createHash("sha256").update(Buffer.from(sourceText, "utf8")).digest("hex");
    if (analysis.source_digest !== digest) {
      throw new ResearchAlphaImportError(
        "RESEARCH_ALPHA_IMPORT_ANALYSIS_REJECTED",
        "Research Alpha analysis did not attest to the submitted source bytes.",
        502,
      );
    }
  }
}

/** Convert only known repository errors into the bounded P07 HTTP vocabulary. */
/** CG-P07-04: analyser check names per gate, in gate order (gate 3 has none). */
const ANALYSER_TIMING_KEYS: readonly (readonly string[])[] = [
  ["parse", "contract_complete"],
  ["entrypoint_restricted_definition_load"],
  [],
  ["parameter_space_sane"],
  ["determinism_declared"],
  ["data_contract_known"],
  ["no_lookahead_static_scan"],
];

export function asResearchAlphaImportError(error: unknown): never {
  if (error instanceof ResearchAlphaImportError) throw error;
  if (error instanceof ResearchMetadataError) {
    const mapped = {
      RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND: "RESEARCH_ALPHA_IMPORT_SOURCE_NOT_FOUND",
      RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED: "RESEARCH_ALPHA_IMPORT_SOURCE_EXPIRED",
      RESEARCH_ALPHA_IMPORT_GATES_REQUIRED: "RESEARCH_ALPHA_IMPORT_GATES_REQUIRED",
      RESEARCH_ALPHA_IMPORT_GATES_FAILED: "RESEARCH_ALPHA_IMPORT_GATES_FAILED",
      RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED: "RESEARCH_ALPHA_IMPORT_DIGEST_ALREADY_REGISTERED",
      RESEARCH_IMMUTABLE_ALPHA_VERSION_CONFLICT: "RESEARCH_ALPHA_IMPORT_VERSION_CONFLICT",
      RESEARCH_ADMISSION_SATURATED: "RESEARCH_ALPHA_IMPORT_ADMISSION_SATURATED",
      RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT: "RESEARCH_ALPHA_IMPORT_ACTIVATION_CONFLICT",
    } as const;
    const code = mapped[error.code as keyof typeof mapped];
    if (code) throw new ResearchAlphaImportError(code, error.message, error.status);
  }
  throw error;
}
