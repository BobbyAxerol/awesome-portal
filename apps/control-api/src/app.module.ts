import { ResearchRunSyncService } from "./facade/run-sync.service";
import { ExecutionDurableMirrorIntegrityController } from "./execution/durable-mirror-integrity.controller";
import { ExecutionLocalReadAuthority } from "./execution/local-read-authority";
import { ExecutionRetainedReviewController } from "./execution/retained-review.controller";
import { DynamicModule, Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Pool } from "pg";
import { AuthController } from "./auth/auth.controller";
import { ProfileController } from "./auth/profile.controller";
import { OwnProfileProjection } from "./auth/profile-projection";
import { ExecutionAccessController } from "./execution-v2/access.controller";
import { ExecutionAccessService } from "./execution-v2/access.service";
import { ExecutionCommandService } from "./execution-v2/command.service";
import { ExecutionCommandController } from "./execution-v2/command.controller";
import type { CommandTrust } from "./execution-v2/command-trust";
import { InstanceRegistrationController } from "./execution-v2/instance-registration.controller";
import { InstanceRegistrationService } from "./execution-v2/instance-registration.service";
import type { InstanceRegistrationTrust } from "./execution-v2/instance-registration.trust";
import { PendingControlController } from "./execution-v2/pending-control.controller";
import { PendingControlService } from "./execution-v2/pending-control.service";
import type { PendingControlTrust } from "./execution-v2/pending-control.trust";
import type { AccessTrustProvider } from "./execution-v2/access-trust";
import { ExecutionManagerRuntime, type ManagerRuntimeInstallation } from "./execution-v2/manager-runtime";
import type { CurrentHumanMutations } from "./execution-v2/current-human-mutations";
import { C2P7CandidateNoStoreGuard, C2P7EmergencyCandidateController,
  C2P7ReviewCandidateController } from "./execution-v2/c2-p7-review-candidate.controller";
import { C2P7EmergencyReviewCandidateService, C2P7ReviewCandidateService } from "./execution-v2/c2-p7-review-candidate.service";
import { composeNativeCore,nativeCoreManagerReadConsumer } from "./execution-v2/native-core-composition";
import { createNativeCacheObserver } from "./execution-v2/native-cache-observation";
import { NativeManagerReadConsumer } from "./execution-v2/native-manager-consumer";
import { nativeResearchReview } from "./execution/native-review-profile";
import { ScopedReplayCursorCodec } from "./execution-v2/scoped-replay-cursor";
import type { ScopedReplayLimits } from "./execution-v2/realtime";
import { ExecutionReadScopes } from "./execution-v2/read-scope";
import { AuthService } from "./auth/auth.service";
import { StreamRevocationRuntime } from "./auth/stream-revocation-runtime";
import { BINDING_FINANCIAL_BATCH_SOURCE, BINDING_FINANCIAL_REFRESH_SOURCE, createRetainedBindingFinancialBatchSource,
  type BindingFinancialBatchSource, type BindingFinancialRefreshSource } from "./manager-lists/binding-financial-batch";
import { OPERATIONAL_QUEUE_HEALTH_SOURCE, type OperationalQueueHealthSource } from "./operations/operational-health-source";
import { Argon2CredentialService } from "./auth/argon";
import { AdminService } from "./admin/admin.service";
import { AdminGuard } from "./admin/rbac.guard";
import { OwnerAccessController } from "./admin/owner-access.controller";
import { AccountLifecycleController } from "./admin/account-lifecycle.controller";
import { OwnerStepUpController } from "./admin/owner-step-up.controller";
import { GovernanceGrantsController } from "./admin/governance-grants.controller";
import { GovernanceGrantsService } from "./admin/governance-grants.service";
import { AccountLifecycleService } from "./admin/account-lifecycle.service";
import { OwnerAccessGuard } from "./admin/owner-access.guard";
import { OwnerAccessService } from "./auth/owner-access.service";
import { HealthController } from "./health/health.controller";
import { ControlApiConfig,querySigningKeys } from "./config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL, EXECUTION_DATA_POOL, EXECUTION_DURABLE_MIRROR_WRITER } from "./tokens";
import { buildExecutionPool } from "./db/pool";
import { FacadeController } from "./facade/facade.controller";
import { PlanningFacadeController } from "./facade/planning.controller";
import { PortalProxyService } from "./facade/proxy.service";
import { SessionGuard } from "./facade/session.guard";
import { WorkspacesRepository } from "./repos/workspaces";
import { RunsRepository } from "./repos/runs";
import { OutboxRepository, ProductAuditRepository } from "./repos/outbox";
import { GovernanceController } from "./governance/governance.controller";
import { GovernanceRepository } from "./governance/governance.repository";
import { GovernanceService } from "./governance/governance.service";
import { PositiveParentRepository } from "./governance/positive-parent.repository";
import { PositiveParentReads } from "./governance/positive-parent.service";
import { FollowingParentRepository } from "./governance/following-parent.repository";
import { FollowingParentReads } from "./governance/following-parent.service";
import { LiveParentRepository } from "./governance/live-parent.repository";
import { ApprovalEvidenceController } from "./approval-evidence/approval-evidence.controller";
import { SourceNotCommissionedApprovalEvidencePort } from "./approval-evidence/approval-evidence.dark";
import { APPROVAL_EVIDENCE_PORT } from "./approval-evidence/approval-evidence.port";
import { ApprovalEvidenceReads } from "./approval-evidence/approval-evidence.service";
import { GovernanceApprovalVisibility } from "./approval-evidence/approval-evidence.visibility";
import { EquityProjectionSourceController } from "./equity-projection/equity-projection-source.controller";
import { SourceNotCommissionedPort } from "./equity-projection/equity-projection-source.dark";
import { EQUITY_PROJECTION_SOURCE_PORT } from "./equity-projection/equity-projection-source.port";
import { EquityProjectionSourceReads } from "./equity-projection/equity-projection-source.service";
import { LiveParentReads } from "./governance/live-parent.service";
import { PaperExitRepository } from "./governance/paper-exit.repository";
import { PaperExitService } from "./governance/paper-exit.service";
import { GovernanceReviewCaptureService } from "./governance/review-capture.service";
import { StageActionEligibilityService } from "./governance/stage-action-eligibility.service";
import { ExecutionRealtimeController } from "./execution/realtime.controller";
import { ExecutionRealtimeProxy } from "./execution/realtime.proxy";
import { ExecutionAnalyticsController } from "./execution/analytics.controller";
import { ExecutionAnalyticsProxy } from "./execution/analytics.proxy";
import { ExecutionCurrentSourceController } from "./execution/current-source.controller";
import { ExecutionCurrentSourceProxy } from "./execution/current-source.proxy";
import { MarketContextController } from "./execution/market-context.controller";
import { MarketContextService } from "./execution/market-context.service";
import { ExecutionRuntimeManifestController } from "./execution/runtime-manifest.controller";
import { ExecutionRuntimeManifestService } from "./execution/runtime-manifest.service";
import { ExecutionScopedRuntimeManifestController } from "./execution/scoped-runtime-manifest.controller";
import { ExecutionScopedRuntimeManifestService } from "./execution/scoped-runtime-manifest.service";
import { ExecutionServiceHeartbeatsController } from "./execution/service-heartbeats.controller";
import { ExecutionServiceHeartbeatsService } from "./execution/service-heartbeats.service";
import { ExecutionContractAuthorityController } from "./execution/contract-authority.controller";
import { ExecutionContractAuthorityService } from "./execution/contract-authority.service";
import { MaximumDataOperationController } from "./execution/maximum-data-operation.controller";
import { MaximumDataOperationService } from "./execution/maximum-data-operation.service";
import { Portfolio360LocalService } from "./execution/portfolio360-local.service";
import { MaximumDataContinuationRepository } from "./execution/maximum-data-continuation.repository";
import { ExecutionSharedReadRepository } from "./execution/shared-read.repository";
import { ExecutionSharedReadCacheMaintenanceWorker } from "./execution/shared-read-cache-maintenance";
import { ExecutionProfileProjectionRepository } from "./execution/profile-projection.repository";
import { ExecutionDurableMirrorRepository } from "./execution/durable-mirror.repository";
import { ExecutionDurableFinancialRepository } from "./execution/durable-financial.repository";
import { ExecutionFinancialQueryCursorRepository } from "./execution/financial-query-cursor.repository";
import { ExecutionFinancialChartService } from "./execution/financial-chart.service";
import { ExecutionFinancialChartController } from "./execution/financial-chart.controller";
import { AuthoritativeEventLedgerRepository } from "./execution/authoritative-event-ledger.repository";
import { ExecutionMarketCandlesController } from "./execution/market-candles.controller";
import { ExecutionMarketCandlesService } from "./execution/market-candles.service";
import { ExecutionProfileProjectionWorker } from "./execution/profile-projection.worker";
import { ExecutionProfileRealtimeService, NATIVE_MANAGER_REALTIME_COORDINATOR } from "./execution/profile-realtime.service";
import { ExecutionProductReadSource } from "./execution/product-read-source";
import { ExecutionProfileHistoryController } from "./execution/profile-history.controller";
import { ExecutionProfileHistoryService } from "./execution/profile-history.service";
import { ExecutionSubjectActivityController } from "./execution/subject-activity.controller";
import { ExecutionSubjectActivityService } from "./execution/subject-activity.service";
import { ExecutionProfileReadAdapterController } from "./execution/profile-read-adapter.controller";
import { ExecutionProfileReadAdapterService } from "./execution/profile-read-adapter.service";
import { LocalQueryAnalyticsService } from "./execution/local-query-analytics.service";
import { CommandCenterController } from "./command-center/command-center.controller";
import { VisitDigestController } from "./command-center/visit-digest.controller";
import { VisitDigestService } from "./command-center/visit-digest.service";
import { VisitDigestStore } from "./command-center/visit-digest.store";
import { CommandCenterRepository } from "./command-center/command-center.repository";
import { CommandCenterService } from "./command-center/command-center.service";
import { ExecutionOperationsRepository } from "./operations/operations.repository";
import { ExecutionOperationsService } from "./operations/operations.service";
import { ExecutionF0ReadController } from "./operations/f0-read.controller";
import { ExecutionF0ReadService } from "./operations/f0-read.service";
import { OperationalReadRepository } from "./operations/operational-read.repository";
import { OperationalReadService } from "./operations/operational-read.service";
import { OperationsWorkflowRepository } from "./operations/workflow.repository";
import { OperationsWorkflowService } from "./operations/workflow.service";
import { IncidentController } from "./operations/incident.controller";
import { IncidentRepository } from "./operations/incident.repository";
import { IncidentService } from "./operations/incident.service";
import { SandboxCertificationController } from "./sandbox/sandbox-certification.controller";
import { SandboxCertificationRepository } from "./sandbox/sandbox-certification.repository";
import { SandboxCertificationService } from "./sandbox/sandbox-certification.service";
import { CanaryController } from "./canary/canary.controller";
import { CanaryRepository } from "./canary/canary.repository";
import { CanaryService } from "./canary/canary.service";
import { LiveOperationsController } from "./live/live-operations.controller";
import { LiveOperationsService } from "./live/live-operations.service";
import { ActivationController } from "./activation/activation.controller";
import { ActivationRepository } from "./activation/activation.repository";
import { ActivationService } from "./activation/activation.service";
import { CurrentActivationRepository } from "./activation/current-activation.repository";
import { CurrentActivationReads } from "./activation/current-activation.service";
import { ScreenBffController } from "./screen-bff/screen-bff.controller";
import { ScreenBffService } from "./screen-bff/screen-bff.service";
import { PaperReadController } from "./paper-read/paper-read.controller";
import { PaperReadService } from "./paper-read/paper-read.service";
import { PAPER_VENUE_CALENDAR_SOURCE, type PaperVenueCalendarSource } from "./execution/venue-calendar-source";
import { ProfileReadController } from "./profile-read/profile-read.controller";
import { ProfileReadService } from "./profile-read/profile-read.service";
import { ManagerListsController } from "./manager-lists/manager-lists.controller";
import { ManagerListsRepository } from "./manager-lists/manager-lists.repository";
import { ManagerListsService } from "./manager-lists/manager-lists.service";
import { ManagerModelController } from "./execution-v2/manager-model.controller";
import { SiblingSourceDarkController } from "./execution-v2/sibling-source-dark.controller";
import { ManagerModelService } from "./execution-v2/manager-model.service";
import { ManagerScoreRevisionController } from "./execution-v2/manager-score-revision.controller";
import { ManagerScoreRevisionService } from "./execution-v2/manager-score-revision.service";
import { ManagerSeriesController } from "./execution-v2/manager-series.controller";
import { ManagerSeriesService } from "./execution-v2/manager-series.service";
import { AlphaFleetRealtimeController } from "./execution-v2/alpha-fleet-realtime.controller";
import { AlphaFleetRealtimeService } from "./execution-v2/alpha-fleet-realtime.service";
import { ResourceReadController } from "./resource-read/resource-read.controller";
import { ResourceReadService } from "./resource-read/resource-read.service";
import { PortalDerivationsController } from "./execution/portal-derivations.controller";
import { PortalDerivationsService } from "./execution/portal-derivations.service";
import { OperationalCompositionController } from "./execution/operational-composition.controller";
import { OperationalCompositionService } from "./execution/operational-composition.service";
import { ResearchMetadataRepository } from "./research/repository";
import { ResearchSchedulerOutboxService } from "./research/scheduler-outbox.service";
import { ResearchAlphaImportController } from "./research/alpha-import.controller";
import { ResearchAlphaImportService } from "./research/alpha-import.service";
import { ResearchAlphaAnalysisClient } from "./research/alpha-analysis.client";
import { ResearchPreflightController } from "./research/preflight.controller";
import { ResearchDatasetCatalogController } from "./research/dataset-catalog.controller";
import { ResearchDatasetCatalogClient } from "./research/dataset-catalog.client";
import { ResearchDatasetIndexClient } from "./research/dataset-index.client";
import { ResearchDatasetIndexController } from "./research/dataset-index.controller";
import { ResearchRunSetupController } from "./research/run-setup.controller";
import { ResearchPreflightSnapshotClient } from "./research/preflight.client";
import { ResearchPreflightService } from "./research/preflight.service";
import { ResearchFoundationController } from "./research/foundation.controller";
import { ResearchFoundationAtlasClient } from "./research/foundation.client";
import { ResearchMethodologyClaimsService } from "./research/methodology-claims";
import { ResearchFoundationService } from "./research/foundation.service";
import { ResearchRunAdmissionService } from "./research/run-admission.service";
import { ResearchRunCreateController } from "./research/run-create.controller";
import { ResearchRunCreateService } from "./research/run-create.service";
import { ResearchP04DeltaBindingController } from "./research/p04-delta-binding.controller";
import { ResearchP04DeltaBindingService } from "./research/p04-delta-binding.service";
import { ResearchProgressController } from "./research/progress.controller";
import { ResearchProgressIngressController } from "./research/progress-ingress.controller";
import { ResearchProgressService } from "./research/progress.service";
import { ResearchProgressRepository } from "./research/progress.repository";
import { ResearchProgressFanout } from "./research/progress.fanout";
import { ResearchProgressPortalClient } from "./research/progress.portal-client";
import { ResearchRunLibraryController } from "./research/run-library.controller";
import { ResearchRunLibraryRepository } from "./research/run-library.repository";
import { ResearchRunLibraryService } from "./research/run-library.service";
import { ResearchEvidenceController } from "./research/evidence.controller";
import { ResearchEvidenceRepository } from "./research/evidence.repository";
import { ResearchEvidenceService } from "./research/evidence.service";
import { ResearchSplitController } from "./research/split.controller";
import { ResearchSplitRepository } from "./research/split.repository";
import { ResearchSplitService } from "./research/split.service";
import { ResearchSearchController } from "./research/search.controller";
import { ResearchSearchService } from "./research/search.service";
import { ResearchFreezeController } from "./research/freeze.controller";
import { ResearchFreezeService } from "./research/freeze.service";
import { ResearchUtilityVerifyAdmissionService } from "./research/utility-verify-admission.service";
import { ResearchArtifactVerifyClient } from "./research/artifact-verify.client";
import { ResearchArtifactVerifyRepository } from "./research/artifact-verify.repository";
import { ResearchArtifactVerifyService } from "./research/artifact-verify.service";
import { ResearchWhatIfController } from "./research/whatif.controller";
import { ResearchWhatIfRepository } from "./research/whatif.repository";
import { ResearchWhatIfService } from "./research/whatif.service";
import { ResearchFinalAuditController } from "./research/final-audit.controller";
import { ResearchFinalAuditClient } from "./research/final-audit.client";
import { ResearchFinalAuditRepository } from "./research/final-audit.repository";
import { ResearchFinalAuditService } from "./research/final-audit.service";
import { ResearchReplayController } from "./research/replay.controller";
import { ResearchReplayService } from "./research/replay.service";
import { ResearchCurrentSourceController } from "./research/current-source.controller";
import { ResearchCurrentSourceRepository } from "./research/current-source.repository";
import { ResearchCurrentSourceService } from "./research/current-source.service";
import { ResearchCurrentSourceIngestService } from "./research/current-source-ingest.service";
import { ResearchChildAuditCompanionController } from "./research/child-audit-companion.controller";
import { ResearchChildAuditCompanionRepository } from "./research/child-audit-companion.repository";
import { ResearchChildAuditCompanionService } from "./research/child-audit-companion.service";
import { ResearchChildAuditCompanionIngestService } from "./research/child-audit-companion.ingest";
import { ResearchFixedReplayCompanionController } from "./research/fixed-replay-companion.controller";
import { ResearchFixedReplayCompanionRepository } from "./research/fixed-replay-companion.repository";
import { ResearchFixedReplayCompanionService } from "./research/fixed-replay-companion.service";
import { ResearchFixedReplayCompanionIngestService } from "./research/fixed-replay-companion.ingest";
import { ResearchWindowExecutionController } from "./research/window-execution.controller";
import { ResearchWindowExecutionRepository } from "./research/window-execution.repository";
import { ResearchWindowExecutionService } from "./research/window-execution.service";
import { ResearchReportController } from "./research/report.controller";
import { ResearchReportRepository } from "./research/report.repository";
import { ResearchReportService } from "./research/report.service";
import { ResearchNativeReadRepository } from "./research/native-read.repository";
import { ResearchNativeReadService } from "./research/native-read.service";
import { ResearchLineageController } from "./research/lineage.controller";
import { ResearchLineageRepository } from "./research/lineage.repository";
import { ResearchLineageService } from "./research/lineage.service";
import { ResearchCompareController } from "./research/compare.controller";
import { ResearchCompareRepository } from "./research/compare.repository";
import { ResearchCompareService } from "./research/compare.service";
import { ResearchReleaseCandidateController } from "./research/release-candidate.controller";
import { ResearchReleaseCandidateRepository } from "./research/release-candidate.repository";
import { ResearchReleaseCandidateService } from "./research/release-candidate.service";
import { ResearchAlphaVersionPublicationController } from "./research/alpha-version-publication.controller";
import { ResearchReleaseCandidatePublicationController } from "./research/release-candidate-publication.controller";
import { ResearchReleaseCandidatePublicationRepository } from "./research/release-candidate-publication.repository";
import { ResearchReleaseCandidatePublicationService } from "./research/release-candidate-publication.service";
import { P22PublicationBridgeService } from "./research/p22-publication-bridge.service";
import { CurrentHumanWorkspaceProvisioner } from "./execution-v2/current-human-workspace";
import { CurrentViewCoreComposition } from "./execution-v2/current-view-composition";
import type { PreparedCurrentViewRuntime } from "./execution-v2/current-view-runtime";
import { withManagerCurrentPublications } from "./execution-v2/manager-current-publication";
import { ManagerCurrentAccounts } from "./execution-v2/manager-current-accounts";
import { FinancialSourceComposition } from "./execution-v2/financial-source-composition";
import type { PreparedFinancialSourceApplication } from "./execution-v2/financial-source-bootstrap";
import { NativeCurrentAccountScopes, type PreparedNativeCurrentApplication } from "./execution-v2/native-current-runtime";
import { CommandStatusComposition } from "./execution-v2/command-status-composition";
import type { PreparedCommandStatusApplication } from "./execution-v2/command-status-bootstrap";
import { NativeRootReceiptProvider } from "./execution-v2/native-root-provider";
import type { PreparedNativeRootApplication } from "./execution-v2/native-root-runtime";
import { unqualifiedCommandTrust } from "./execution-v2/command-trust";

/** Internal composition seam, never populated from request headers/body or
 * runtime environment flags. TEST_ONLY authority cannot enter a non-test app. */
export interface ControlApiDependencies {
  /** Owning server composition only; never sourced from a browser selector. */
  bindingFinancialBatch?: BindingFinancialBatchSource;
  bindingFinancialRefresh?: BindingFinancialRefreshSource;
  operationalQueueHealth?: OperationalQueueHealthSource;
  /** Explicit authenticated Edge calendar composition, never a direct DL URL. */
  paperVenueCalendar?: PaperVenueCalendarSource;
  /** Pure/test constructors default off; actual applications default on. */
  streamRevocationHints?: boolean;
  /** Explicit owner-only/hash-pinned private Research listener. Absent keeps
   * the deployed default unchanged; never populated from a public request. */
  currentViewRuntime?: PreparedCurrentViewRuntime;
  /** Constructed by private bootstrap only, registered in the SAME coordinator
   * before Nest starts. No configuration flag alone creates an identity. */
  financialSource?: PreparedFinancialSourceApplication;
  /** Exact finite account provider; never replaces mutation/ordinary readers. */
  nativeCurrent?: PreparedNativeCurrentApplication;
  /** Independent current-requester STATUS; never mounts command SUBMIT. */
  commandStatus?:PreparedCommandStatusApplication;
  /** R-C: source-dark. Absent (the default and production) leaves the route UNMOUNTED. The only accepted value mounts the producer over the
   * SOURCE_NOT_COMMISSIONED port, so every body is typed absence. There is no other port implementation and no config flag. */
  equityProjectionSource?: "SOURCE_DARK";
  /** WP-K approval evidence: source-dark. Absent (the default and production) leaves the route UNMOUNTED. The only accepted value mounts the
   * producer over the source-not-commissioned port (every section omitted), deny-all field authority. No other port, no config flag. */
  approvalEvidence?: "SOURCE_DARK";
  /** Independent ROOT original/held COMMIT, same pool/coordinator as writers. */
  nativeRoot?:PreparedNativeRootApplication;
  executionCommandTrust?: CommandTrust;
  executionInstanceRegistrationTrust?: InstanceRegistrationTrust;
  executionPendingControlTrust?: PendingControlTrust;
  executionAccessTrust?: AccessTrustProvider;
  allowTestOnlyExecutionAccess?: boolean;
  executionManagerRuntime?: ManagerRuntimeInstallation;
  /** Explicit private candidate composition, never an environment switch or
   * browser input. It must share the candidate's bounded Core pool. */
  currentHumanMutations?: CurrentHumanMutations;
  /** Explicit Research-only owner review candidates, constructed by trusted
   * bootstrap. No ENV/request switch creates one and they are not P7 authority. */
  c2P7ReviewCandidate?: C2P7ReviewCandidateService;
  c2P7EmergencyCandidate?: C2P7EmergencyReviewCandidateService;
  /** Genuine private composition only; never reconstructed from HTTP or ENV. */
  nativeManagerRead?: Awaited<ReturnType<typeof composeNativeCore>>;
  /** Private explicit connected budget only; no automatic runtime/source commissioning. */
  nativeManagerRealtimeLimits?: ScopedReplayLimits;
  /** Operator-only observation, selected by a hash-pinned private Research
   * manifest. No public flags, route or authority; absent means no file I/O. */
  nativeManagerCacheObservation?: Readonly<{ directory: string }>;
}

@Module({})
export class AppModule implements OnApplicationShutdown {
  constructor(@Inject("EXECUTION_POOL_LIFECYCLE") private readonly executionPoolLifecycle: {
    closeOwnedPool(): Promise<void>;
  }) {}

  /** Nest invokes the module class AFTER all same-module provider shutdown
   * hooks have fulfilled. A peer provider failure must skip this finalizer. */
  onApplicationShutdown(): Promise<void> { return this.executionPoolLifecycle.closeOwnedPool(); }

  static register(config: ControlApiConfig, pool: Pool, executionPool?: Pool,
    dependencies: ControlApiDependencies = {}): DynamicModule {
    const p7Review = dependencies.c2P7ReviewCandidate, p7Emergency = dependencies.c2P7EmergencyCandidate;
    const p7Workspace = config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID;
    if ((p7Review || p7Emergency) && (!nativeResearchReview(config) || !p7Workspace ||
      (p7Review && (Object.getPrototypeOf(p7Review)!==C2P7ReviewCandidateService.prototype ||
        !C2P7ReviewCandidateService.prototype.usesInstallation.call(p7Review,pool,p7Workspace))) ||
      (p7Emergency && (Object.getPrototypeOf(p7Emergency)!==C2P7EmergencyReviewCandidateService.prototype ||
        !C2P7EmergencyReviewCandidateService.prototype.usesInstallation.call(p7Emergency,pool,p7Workspace)))))
      throw new Error("C2_P7_RESEARCH_COMPOSITION_REQUIRED");
    if (nativeResearchReview(config) && (!dependencies.nativeManagerRead || !dependencies.nativeManagerRealtimeLimits ||
      !dependencies.currentHumanMutations || !dependencies.executionAccessTrust))
      throw new Error("NATIVE_RESEARCH_REVIEW_COMPOSITION_REQUIRED");
    if (dependencies.nativeManagerRealtimeLimits !== undefined && dependencies.nativeManagerRead === undefined)
      throw new Error("NATIVE_MANAGER_REALTIME_COMPOSITION_REQUIRED");
    if (dependencies.nativeManagerCacheObservation !== undefined &&
      (!nativeResearchReview(config) || !dependencies.nativeManagerRead))
      throw new Error("NATIVE_CACHE_OBSERVATION_RESEARCH_COMPOSITION_REQUIRED");
    const nativeRealtimeLimits = dependencies.nativeManagerRealtimeLimits === undefined
      ? undefined : Object.freeze({...dependencies.nativeManagerRealtimeLimits});
    if (dependencies.allowTestOnlyExecutionAccess && config.NODE_ENV !== "test")
      throw new Error("TEST_ONLY Execution authority requires an isolated test application.");
    if (dependencies.currentHumanMutations && !dependencies.currentHumanMutations.usesPool(pool))
      throw new Error("CURRENT_HUMAN_MUTATION_CORE_POOL_REQUIRED");
    if(dependencies.financialSource&&(!dependencies.nativeManagerRead||!dependencies.currentHumanMutations?.hasReverseRecoveryParticipant(dependencies.financialSource.participant)))
      throw new Error("FINANCIAL_SOURCE_SHARED_NATIVE_COMPOSITION_REQUIRED");
    if(dependencies.nativeCurrent&&(!nativeResearchReview(config)||!dependencies.nativeManagerRead||
      !dependencies.nativeCurrent.provider.usesPool(pool)||
      !dependencies.currentHumanMutations?.hasCurrentReadRecoveryParticipant(dependencies.nativeCurrent.provider)))
      throw new Error("NATIVE_CURRENT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    if(dependencies.commandStatus&&(!nativeResearchReview(config)||!dependencies.nativeManagerRead||
      !dependencies.commandStatus.composition.usesPool(pool)||
      !dependencies.currentHumanMutations?.hasReverseRecoveryParticipant(dependencies.commandStatus.participant)))
      throw new Error("COMMAND_STATUS_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    if(dependencies.nativeRoot&&(!nativeResearchReview(config)||!dependencies.nativeManagerRead||
      !(dependencies.nativeRoot.provider instanceof NativeRootReceiptProvider)||!dependencies.nativeRoot.provider.usesPool(pool)||
      !dependencies.currentHumanMutations?.hasRootRecoveryParticipant(dependencies.nativeRoot.provider)))
      throw new Error("NATIVE_ROOT_SHARED_RESEARCH_COMPOSITION_REQUIRED");
    const ownsExecutionPool = !executionPool && !!config.EXECUTION_DATABASE_URL;
    if (dependencies.executionManagerRuntime && (executionPool === pool || !executionPool && !config.EXECUTION_DATABASE_URL))
      throw new Error("MANAGER_RUNTIME_EXECUTION_POOL_REQUIRED");
    const domainPool = executionPool ?? (config.EXECUTION_DATABASE_URL ? buildExecutionPool(config) : pool);
    let executionPoolClose: Promise<void> | undefined;
    const executionPoolLifecycle = Object.freeze({closeOwnedPool: (): Promise<void> => {
      if (!ownsExecutionPool) return Promise.resolve();
      // Publish ownership before invoking pg, including a synchronous throw.
      return executionPoolClose ??= Promise.resolve().then(() => domainPool.end());
    }});
    const managerRuntime = new ExecutionManagerRuntime(domainPool,dependencies.executionManagerRuntime);
    const existingAccessTrust = managerRuntime.accessTrust(dependencies.executionAccessTrust);
    const managerCurrent = dependencies.currentViewRuntime?.managerCurrent;
    if (managerCurrent && !existingAccessTrust) throw new Error("MANAGER_CURRENT_IDENTITY_TRUST_REQUIRED");
    const accessTrust = managerCurrent
      ? withManagerCurrentPublications(existingAccessTrust!, managerCurrent.source, { commissioning: managerCurrent.commissioning })
      : existingAccessTrust;
    const nativeManagerRead = dependencies.nativeManagerRead;
    // Check the effective provider actually injected into ExecutionAccessService,
    // not only a raw input which an installed ManagerRuntime may wrap.
    const nativeManagerAuthority = Object.freeze({executionAccessTrust:accessTrust,
      currentHumanMutations:dependencies.currentHumanMutations});
    const workspaceProvisioner = dependencies.currentHumanMutations
      ? new CurrentHumanWorkspaceProvisioner(pool, dependencies.currentHumanMutations) : undefined;
    return {
      module: AppModule,
      controllers: [
        ...(p7Review ? [C2P7ReviewCandidateController] : []),
        ...(p7Emergency ? [C2P7EmergencyCandidateController] : []),
        ExecutionRetainedReviewController,
        HealthController,
        AuthController,
        ProfileController,
        ExecutionAccessController,
        ExecutionCommandController,
        InstanceRegistrationController,
        PendingControlController,
        ExecutionF0ReadController,
        // A4-2 retired the six /api/admin/users* routes. They mutated
        // accounts with no expected revision, no idempotency, no step-up and
        // no operation record, so leaving them mounted beside the control
        // plane would leave a way around every control it adds.
        AccountLifecycleController,
        OwnerStepUpController,
        GovernanceGrantsController,
        OwnerAccessController,
        FacadeController,
        PlanningFacadeController,
        GovernanceController,
        ExecutionRealtimeController,
        ExecutionAnalyticsController,
        ExecutionCurrentSourceController,
        MarketContextController,
        ExecutionRuntimeManifestController,
        ExecutionScopedRuntimeManifestController,
        ExecutionServiceHeartbeatsController,
        ExecutionContractAuthorityController,
        MaximumDataOperationController,
        ExecutionProfileHistoryController,
        ExecutionSubjectActivityController,
        ExecutionProfileReadAdapterController,
        CommandCenterController,
        VisitDigestController,
        IncidentController,
        SandboxCertificationController,
        CanaryController,
        LiveOperationsController,
        ...(dependencies.equityProjectionSource === "SOURCE_DARK" ? [EquityProjectionSourceController] : []),
        ...(dependencies.approvalEvidence === "SOURCE_DARK" ? [ApprovalEvidenceController] : []),
        ActivationController,
        ScreenBffController,
        PaperReadController,
        ProfileReadController,
        ManagerListsController,
        ManagerModelController,
        SiblingSourceDarkController,
        ManagerScoreRevisionController,
        ManagerSeriesController,
        AlphaFleetRealtimeController,
        ExecutionDurableMirrorIntegrityController,
        ResourceReadController,
        PortalDerivationsController,
        OperationalCompositionController,
        ExecutionFinancialChartController,
        ExecutionMarketCandlesController,
        ResearchAlphaImportController,
        ResearchPreflightController,
        ResearchDatasetCatalogController,
        ResearchDatasetIndexController,
        ResearchRunSetupController,
        ResearchFoundationController,
        ResearchRunCreateController,
        ResearchP04DeltaBindingController,
        ResearchProgressController,
        ResearchProgressIngressController,
        ResearchRunLibraryController,
        ResearchEvidenceController,
        ResearchSplitController,
        ResearchSearchController,
        ResearchFreezeController,
        ResearchWhatIfController,
        ResearchFinalAuditController,
        ResearchReplayController,
        ResearchCurrentSourceController,
        ResearchChildAuditCompanionController,
        ResearchFixedReplayCompanionController,
        ResearchWindowExecutionController,
        ResearchReportController,
        ResearchLineageController,
        ResearchCompareController,
        ResearchReleaseCandidateController,
        ResearchReleaseCandidatePublicationController,
        ResearchAlphaVersionPublicationController,
      ],
      providers: [
        ...((p7Review || p7Emergency) ? [C2P7CandidateNoStoreGuard] : []),
        ...(p7Review ? [{ provide: C2P7ReviewCandidateService, useValue: p7Review }] : []),
        ...(p7Emergency ? [{ provide: C2P7EmergencyReviewCandidateService, useValue: p7Emergency }] : []),
        { provide: BINDING_FINANCIAL_BATCH_SOURCE, useValue: dependencies.bindingFinancialBatch ?? createRetainedBindingFinancialBatchSource() },
        ...(dependencies.bindingFinancialRefresh ? [{ provide: BINDING_FINANCIAL_REFRESH_SOURCE, useValue: dependencies.bindingFinancialRefresh }] : []),
        ...(dependencies.operationalQueueHealth ? [{ provide: OPERATIONAL_QUEUE_HEALTH_SOURCE, useValue: dependencies.operationalQueueHealth }] : []),
        ...(dependencies.paperVenueCalendar ? [{ provide: PAPER_VENUE_CALENDAR_SOURCE, useValue: dependencies.paperVenueCalendar }] : []),
        { provide: StreamRevocationRuntime, useFactory: (db: Pool, auth: AuthService) =>
          new StreamRevocationRuntime(db, auth, dependencies.streamRevocationHints ?? config.NODE_ENV !== "test"),
          inject: [CONTROL_API_POOL, AuthService] },
        { provide: ExecutionManagerRuntime, useValue: managerRuntime },
        ExecutionLocalReadAuthority,
        { provide: CONTROL_API_CONFIG, useValue: config },
        { provide: CONTROL_API_POOL, useValue: pool },
        { provide: EXECUTION_DATA_POOL, useValue: domainPool },
        { provide: "EXECUTION_POOL_LIFECYCLE", useValue: executionPoolLifecycle },
        {
          provide: AuthService,
          useFactory: (cfg: ControlApiConfig, db: Pool) =>
            new AuthService(
              db,
              cfg,
              new Argon2CredentialService({
                memoryKib: cfg.ARGON2_MEMORY_KIB,
                iterations: cfg.ARGON2_ITERATIONS,
                parallelism: cfg.ARGON2_PARALLELISM,
              }),
              dependencies.currentHumanMutations,
            ),
          inject: [CONTROL_API_CONFIG, CONTROL_API_POOL],
        },
        {
          // Retained as an internal service: bootstrap and the test harness
          // create and activate accounts through it. It no longer has an HTTP
          // surface of its own.
          provide: AdminService,
          useFactory: (cfg: ControlApiConfig, db: Pool, auth: AuthService) =>
            new AdminService(db, cfg, auth),
          inject: [CONTROL_API_CONFIG, CONTROL_API_POOL, AuthService],
        },
        {
          provide: GovernanceGrantsService,
          useFactory: (
            db: Pool,
            auth: AuthService,
            ownerAccess: OwnerAccessService,
          ) => new GovernanceGrantsService(db, auth, ownerAccess, dependencies.currentHumanMutations),
          inject: [CONTROL_API_POOL, AuthService, OwnerAccessService],
        },
        {
          provide: OwnProfileProjection,
          useFactory: (auth: AuthService, owner: OwnerAccessService, workspaces: WorkspacesRepository) =>
            new OwnProfileProjection(auth, owner, workspaces, accessTrust),
          inject: [AuthService, OwnerAccessService, WorkspacesRepository],
        },
        {
          provide: ExecutionAccessService,
          useFactory: (db:Pool,auth:AuthService)=>new ExecutionAccessService(db,auth,
            accessTrust, dependencies.allowTestOnlyExecutionAccess === true, dependencies.currentHumanMutations),
          inject: [CONTROL_API_POOL,AuthService],
        },
        {
          // Identity/policy stay in Core even when Execution data is isolated.
          provide: ExecutionReadScopes,
          useFactory: (db:Pool,access:ExecutionAccessService,cfg:ControlApiConfig)=>new ExecutionReadScopes(db,access,cfg),
          inject: [CONTROL_API_POOL,ExecutionAccessService,CONTROL_API_CONFIG],
        },
        ...(dependencies.nativeCurrent?[{
          provide:NativeCurrentAccountScopes,
          useFactory:(auth:AuthService)=>{
            if(!accessTrust)throw new Error("NATIVE_CURRENT_IDENTITY_TRUST_REQUIRED");
            const prepared=dependencies.nativeCurrent!,scopes=prepared.createScopes(auth,accessTrust,config);
            return Object.assign(scopes,{beforeApplicationShutdown:()=>prepared.shutdown()});
          },
          inject:[AuthService],
        }]:[]),
        ...(dependencies.commandStatus?[{
          provide:CommandStatusComposition,
          useFactory:()=>{
            const prepared=dependencies.commandStatus!,composition=prepared.composition;
            return Object.assign(composition,{onModuleInit:()=>composition.start(prepared.listeners),
              beforeApplicationShutdown:()=>composition.shutdown()});
          },
        }]:[]),
        ...(dependencies.nativeRoot?[{
          provide:NativeRootReceiptProvider,
          useFactory:()=>{
            const prepared=dependencies.nativeRoot!;
            // No init/ISSUE/intake hook. This exact provider rejects new work,
            // joins holders and physical transport before pool disposal.
            return Object.assign(prepared.provider,{beforeApplicationShutdown:()=>prepared.shutdown()});
          },
        }]:[]),
        ...(dependencies.financialSource?[{
          provide:FinancialSourceComposition,
          useFactory:()=>{
            const prepared=dependencies.financialSource!,composition=prepared.composition;
            return Object.assign(composition,{
              onModuleInit:()=>composition.start(prepared.listeners),
              beforeApplicationShutdown:()=>composition.shutdown(),
            });
          },
        }]:[]),
        ...(dependencies.currentViewRuntime ? [{
          provide: CurrentViewCoreComposition,
          useFactory: (auth: AuthService, scopes: ExecutionReadScopes, finite?: NativeCurrentAccountScopes) => {
            const runtime = dependencies.currentViewRuntime!;
            let composition: CurrentViewCoreComposition;
            try { composition = new CurrentViewCoreComposition(auth, finite?.scopes ?? scopes, runtime.config); }
            finally {
              // Constructors retain private copies; erase loader-owned PEM
              // bytes on success AND error, without logging their contents.
              for (const tls of [runtime.config.transport.tls, runtime.config.edge.tls])
                for (const bytes of [tls.key, tls.cert, tls.ca]) if (Buffer.isBuffer(bytes)) bytes.fill(0);
            }
            // This provider owns only its listener and original contexts. It
            // must drain BEFORE the module's owned Execution pool finalizer.
            return Object.assign(composition, {
              onModuleInit: () => composition.start(runtime.listener),
              beforeApplicationShutdown: () => composition.shutdown(),
            });
          },
          inject: [AuthService, ExecutionReadScopes, { token: NativeCurrentAccountScopes, optional: true }],
        }] : []),
        ...(managerCurrent ? [{
          provide: ManagerCurrentAccounts,
          useFactory: (core: CurrentViewCoreComposition) => new ManagerCurrentAccounts({ ...managerCurrent, core }),
          inject: [CurrentViewCoreComposition],
        }] : []),
        {
          provide: ExecutionCommandService,
          useFactory: (db:Pool,access:ExecutionAccessService,cfg:ControlApiConfig)=>new ExecutionCommandService(db,access,
            dependencies.commandStatus?dependencies.commandStatus.composition.statusTrust(access,
              dependencies.executionCommandTrust??unqualifiedCommandTrust,dependencies.currentHumanMutations!):dependencies.executionCommandTrust,
            dependencies.allowTestOnlyExecutionAccess===true,
            {activeKeyId:cfg.QUERY_CURSOR_ACTIVE_KEY_ID,keys:querySigningKeys(cfg),ttlSeconds:cfg.QUERY_CURSOR_TTL_SECONDS}),
          inject:[CONTROL_API_POOL,ExecutionAccessService,CONTROL_API_CONFIG],
        },
        {
          provide: InstanceRegistrationService,
          useFactory: (db:Pool,access:ExecutionAccessService)=>new InstanceRegistrationService(db,access,
            dependencies.executionInstanceRegistrationTrust,dependencies.allowTestOnlyExecutionAccess===true),
          inject:[CONTROL_API_POOL,ExecutionAccessService],
        },
        {
          provide: PendingControlService,
          useFactory: (db:Pool,access:ExecutionAccessService)=>new PendingControlService(db,access,
            dependencies.executionPendingControlTrust,dependencies.allowTestOnlyExecutionAccess===true),
          inject:[CONTROL_API_POOL,ExecutionAccessService],
        },
        {
          provide: AccountLifecycleService,
          useFactory: (cfg: ControlApiConfig, db: Pool, auth: AuthService) =>
            new AccountLifecycleService(db, cfg, auth, dependencies.currentHumanMutations),
          inject: [CONTROL_API_CONFIG, CONTROL_API_POOL, AuthService],
        },
        WorkspacesRepository,
        // P03 is an internal, transaction-scoped metadata boundary.  It
        // mounts no new HTTP route or worker; later Research phases opt into
        // it deliberately rather than gaining accidental authority.
        ResearchMetadataRepository,
        ResearchAlphaAnalysisClient,
        ResearchAlphaImportService,
        ResearchPreflightSnapshotClient,
        ResearchDatasetCatalogClient,
        ResearchDatasetIndexClient,
        ResearchPreflightService,
        ResearchRunAdmissionService,
        ResearchRunCreateService,
        ResearchP04DeltaBindingService,
        ResearchProgressRepository,
        ResearchProgressFanout,
        ResearchProgressPortalClient,
        ResearchProgressService,
        ResearchRunLibraryRepository,
        ResearchRunLibraryService,
        ResearchEvidenceRepository,
        ResearchEvidenceService,
        ResearchSplitRepository,
        ResearchSplitService,
        ResearchSearchService,
        ResearchFreezeService,
        ResearchUtilityVerifyAdmissionService,
        // W5a · A10a: explicit byte verification; dark behind its own flag.
        ResearchArtifactVerifyClient,
        ResearchArtifactVerifyRepository,
        ResearchArtifactVerifyService,
        // W5a · A10c: exact-evaluation what-if read + one explicit diagnostic job.
        ResearchWhatIfRepository,
        ResearchWhatIfService,
        ResearchFinalAuditClient,
        ResearchFinalAuditRepository,
        ResearchFinalAuditService,
        ResearchReplayService,
        // RS-02 has no source/runtime side effect at module registration.
        // Its private importer and browser reads remain feature-dark until a
        // separately accepted dev slice supplies sealed current-engine rows.
        ResearchCurrentSourceRepository,
        ResearchCurrentSourceService,
        ResearchCurrentSourceIngestService,
        ResearchChildAuditCompanionRepository,
        ResearchChildAuditCompanionService,
        ResearchChildAuditCompanionIngestService,
        ResearchFixedReplayCompanionRepository,
        ResearchFixedReplayCompanionService,
        ResearchFixedReplayCompanionIngestService,
        ResearchWindowExecutionRepository,
        ResearchWindowExecutionService,
        ResearchReportRepository,
        ResearchReportService,
        ResearchNativeReadRepository,
        ResearchNativeReadService,
        ResearchLineageRepository,
        ResearchLineageService,
        ResearchCompareRepository,
        ResearchCompareService,
        ResearchReleaseCandidateRepository,
        ResearchReleaseCandidateService,
        P22PublicationBridgeService,
        ResearchReleaseCandidatePublicationRepository,
        ResearchReleaseCandidatePublicationService,
        ResearchFoundationAtlasClient,
        ResearchMethodologyClaimsService,
        ResearchFoundationService,
        // P06 owns only transactional outbox ordering. It does not connect to
        // NATS, schedule a child or mount a route at bootstrap; P10 supplies
        // the named producer and deployment-bound transport adapter.
        ResearchSchedulerOutboxService,
        RunsRepository,
        OutboxRepository,
        ProductAuditRepository,
        GovernanceRepository,
        ResearchRunSyncService,
        GovernanceService,
        PositiveParentRepository,
        PositiveParentReads,
        FollowingParentRepository,
        FollowingParentReads,
        LiveParentRepository,
        LiveParentReads,
        ...(dependencies.equityProjectionSource === "SOURCE_DARK" ? [
          { provide: EQUITY_PROJECTION_SOURCE_PORT, useClass: SourceNotCommissionedPort }, EquityProjectionSourceReads] : []),
        ...(dependencies.approvalEvidence === "SOURCE_DARK" ? [
          { provide: APPROVAL_EVIDENCE_PORT, useClass: SourceNotCommissionedApprovalEvidencePort }, GovernanceApprovalVisibility, ApprovalEvidenceReads] : []),
        PaperExitRepository,
        PaperExitService,
        GovernanceReviewCaptureService,
        StageActionEligibilityService,
        CommandCenterRepository,
        CommandCenterService,
        VisitDigestService,
        VisitDigestStore,
        ExecutionOperationsRepository,
        ExecutionOperationsService,
        {provide:ExecutionF0ReadService,useFactory:(repo:ExecutionOperationsRepository,access:ExecutionAccessService,cfg:ControlApiConfig)=>{
          const keys=querySigningKeys(cfg);
          return new ExecutionF0ReadService(repo,access,Object.keys(keys).length?{
            activeKeyId:cfg.QUERY_CURSOR_ACTIVE_KEY_ID,keys,ttlSeconds:cfg.QUERY_CURSOR_TTL_SECONDS}:undefined);
        },inject:[ExecutionOperationsRepository,ExecutionAccessService,CONTROL_API_CONFIG]},
        OperationsWorkflowRepository,
        OperationsWorkflowService,
        OperationalReadRepository,
        OperationalReadService,
        IncidentRepository,
        IncidentService,
        SandboxCertificationRepository,
        SandboxCertificationService,
        CanaryRepository,
        CanaryService,
        LiveOperationsService,
        ActivationRepository,
        ActivationService,
        CurrentActivationRepository,
        CurrentActivationReads,
        ScreenBffService,
        PaperReadService,
        ProfileReadService,
        ManagerListsRepository,
        ManagerListsService,
        ManagerModelService,
        ManagerScoreRevisionService,
        ManagerSeriesService,
        AlphaFleetRealtimeService,
        ResourceReadService,
        PortalDerivationsService,
        OperationalCompositionService,
        ExecutionSharedReadRepository,
        ExecutionSharedReadCacheMaintenanceWorker,
        MarketContextService,
        ExecutionRuntimeManifestService,
        ExecutionScopedRuntimeManifestService,
        ExecutionServiceHeartbeatsService,
        ExecutionContractAuthorityService,
        MaximumDataContinuationRepository,
        MaximumDataOperationService,
        Portfolio360LocalService,
        ExecutionDurableMirrorRepository,
        ExecutionDurableFinancialRepository,
        ExecutionFinancialQueryCursorRepository,
        ExecutionFinancialChartService,
        // R5 is a dormant, server-only durable receiver.  Registering its
        // repository creates no source transport, route, worker, or feature
        // activation; a later accepted Manager/Edge cutover is required.
        AuthoritativeEventLedgerRepository,
        ExecutionMarketCandlesService,
        { provide: EXECUTION_DURABLE_MIRROR_WRITER, useExisting: ExecutionDurableMirrorRepository },
        ExecutionProfileProjectionRepository,
        ExecutionProfileProjectionWorker,
        ...(nativeManagerRead !== undefined ? [{
          provide: NativeManagerReadConsumer,
          useFactory: (operations:MaximumDataOperationService,scopes:ExecutionReadScopes,
            repository:ExecutionProfileProjectionRepository,cfg:ControlApiConfig) => nativeCoreManagerReadConsumer(
            nativeManagerRead,pool,operations,nativeManagerAuthority,nativeRealtimeLimits === undefined ? undefined : {
              scopes,repository,limits:nativeRealtimeLimits,
              codec:new ScopedReplayCursorCodec(cfg.QUERY_CURSOR_ACTIVE_KEY_ID,querySigningKeys(cfg),
                Math.min(300_000,cfg.QUERY_CURSOR_TTL_SECONDS*1000)),
            },dependencies.nativeManagerCacheObservation === undefined ? undefined :
              () => createNativeCacheObserver(dependencies.nativeManagerCacheObservation!.directory)),
          inject: [MaximumDataOperationService,ExecutionReadScopes,ExecutionProfileProjectionRepository,CONTROL_API_CONFIG],
        },{provide:NATIVE_MANAGER_REALTIME_COORDINATOR,useExisting:NativeManagerReadConsumer}] : []),
        ExecutionProfileRealtimeService,
        ExecutionProductReadSource,
        ExecutionProfileHistoryService,
        ExecutionSubjectActivityService,
        ExecutionProfileReadAdapterService,
        LocalQueryAnalyticsService,
        {
          provide: ExecutionRealtimeProxy,
          useFactory: (cfg: ControlApiConfig) => ExecutionRealtimeProxy.create(cfg),
          inject: [CONTROL_API_CONFIG],
        },
        {
          provide: ExecutionAnalyticsProxy,
          useFactory: (cfg: ControlApiConfig, scopes: ExecutionReadScopes) => ExecutionAnalyticsProxy.create(cfg, scopes),
          inject: [CONTROL_API_CONFIG, ExecutionReadScopes],
        },
        {
          provide: ExecutionCurrentSourceProxy,
          useFactory: (cfg: ControlApiConfig, sharedReads: ExecutionSharedReadRepository) =>
            ExecutionCurrentSourceProxy.create(cfg, sharedReads),
          inject: [CONTROL_API_CONFIG, ExecutionSharedReadRepository],
        },
        {
          provide: PortalProxyService,
          useFactory: (
            cfg: ControlApiConfig,
            db: Pool,
            outbox: OutboxRepository,
            audit: ProductAuditRepository,
            runs: RunsRepository,
            workspaces: WorkspacesRepository,
          ) => new PortalProxyService(cfg, outbox, audit, runs, workspaces),
          inject: [
            CONTROL_API_CONFIG,
            CONTROL_API_POOL,
            OutboxRepository,
            ProductAuditRepository,
            RunsRepository,
            WorkspacesRepository,
          ],
        },
        {
          provide: SessionGuard,
          useFactory: (auth: AuthService, workspaces: WorkspacesRepository, config: ControlApiConfig,
            finite?: NativeCurrentAccountScopes, status?: CommandStatusComposition, accounts?: ManagerCurrentAccounts) =>
            new SessionGuard(auth, workspaces, config, workspaceProvisioner, finite, status, accounts),
          // Explicit factories do not receive constructor @Optional injections
          // automatically. Forward the installed PRIVATE compositions; absent
          // providers leave every corresponding routing ceiling closed.
          inject: [AuthService, WorkspacesRepository, CONTROL_API_CONFIG,
            { token: NativeCurrentAccountScopes, optional: true },
            { token: CommandStatusComposition, optional: true },
            { token: ManagerCurrentAccounts, optional: true }],
        },
        AdminGuard,
        OwnerAccessGuard,
        OwnerAccessService,
      ],
    };
  }
}
