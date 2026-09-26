import { ResearchRunSyncService } from "./facade/run-sync.service";
import { ExecutionDurableMirrorIntegrityController } from "./execution/durable-mirror-integrity.controller";
import { ExecutionLocalReadAuthority } from "./execution/local-read-authority";
import { DynamicModule, Module } from "@nestjs/common";
import { Pool } from "pg";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
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
import { ControlApiConfig } from "./config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL, EXECUTION_DURABLE_MIRROR_WRITER } from "./tokens";
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
import { PaperExitRepository } from "./governance/paper-exit.repository";
import { PaperExitService } from "./governance/paper-exit.service";
import { GovernanceReviewCaptureService } from "./governance/review-capture.service";
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
import { ExecutionProfileRealtimeService } from "./execution/profile-realtime.service";
import { ExecutionProductReadSource } from "./execution/product-read-source";
import { ExecutionProfileHistoryController } from "./execution/profile-history.controller";
import { ExecutionProfileHistoryService } from "./execution/profile-history.service";
import { ExecutionSubjectActivityController } from "./execution/subject-activity.controller";
import { ExecutionSubjectActivityService } from "./execution/subject-activity.service";
import { ExecutionProfileReadAdapterController } from "./execution/profile-read-adapter.controller";
import { ExecutionProfileReadAdapterService } from "./execution/profile-read-adapter.service";
import { LocalQueryAnalyticsService } from "./execution/local-query-analytics.service";
import { CommandCenterController } from "./command-center/command-center.controller";
import { CommandCenterRepository } from "./command-center/command-center.repository";
import { CommandCenterService } from "./command-center/command-center.service";
import { ExecutionOperationsRepository } from "./operations/operations.repository";
import { ExecutionOperationsService } from "./operations/operations.service";
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
import { ScreenBffController } from "./screen-bff/screen-bff.controller";
import { ScreenBffService } from "./screen-bff/screen-bff.service";
import { PaperReadController } from "./paper-read/paper-read.controller";
import { PaperReadService } from "./paper-read/paper-read.service";
import { ProfileReadController } from "./profile-read/profile-read.controller";
import { ProfileReadService } from "./profile-read/profile-read.service";
import { ManagerListsController } from "./manager-lists/manager-lists.controller";
import { ManagerListsRepository } from "./manager-lists/manager-lists.repository";
import { ManagerListsService } from "./manager-lists/manager-lists.service";
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
import { ResearchPreflightSnapshotClient } from "./research/preflight.client";
import { ResearchPreflightService } from "./research/preflight.service";
import { ResearchFoundationController } from "./research/foundation.controller";
import { ResearchFoundationAtlasClient } from "./research/foundation.client";
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
import { ResearchArtifactVerifyClient } from "./research/artifact-verify.client";
import { ResearchArtifactVerifyRepository } from "./research/artifact-verify.repository";
import { ResearchArtifactVerifyService } from "./research/artifact-verify.service";
import { ResearchWhatIfController } from "./research/whatif.controller";
import { ResearchWhatIfRepository } from "./research/whatif.repository";
import { ResearchWhatIfService } from "./research/whatif.service";
import { ResearchReplayController } from "./research/replay.controller";
import { ResearchReplayService } from "./research/replay.service";
import { ResearchCurrentSourceController } from "./research/current-source.controller";
import { ResearchCurrentSourceRepository } from "./research/current-source.repository";
import { ResearchCurrentSourceService } from "./research/current-source.service";
import { ResearchCurrentSourceIngestService } from "./research/current-source-ingest.service";
import { ResearchReportController } from "./research/report.controller";
import { ResearchReportRepository } from "./research/report.repository";
import { ResearchReportService } from "./research/report.service";
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

@Module({})
export class AppModule {
  static register(config: ControlApiConfig, pool: Pool): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
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
        ExecutionContractAuthorityController,
        MaximumDataOperationController,
        ExecutionProfileHistoryController,
        ExecutionSubjectActivityController,
        ExecutionProfileReadAdapterController,
        CommandCenterController,
        IncidentController,
        SandboxCertificationController,
        CanaryController,
        LiveOperationsController,
        ActivationController,
        ScreenBffController,
        PaperReadController,
        ProfileReadController,
        ManagerListsController,
        ExecutionDurableMirrorIntegrityController,
        ResourceReadController,
        PortalDerivationsController,
        OperationalCompositionController,
        ExecutionFinancialChartController,
        ExecutionMarketCandlesController,
        ResearchAlphaImportController,
        ResearchPreflightController,
        ResearchDatasetCatalogController,
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
        ResearchReplayController,
        ResearchCurrentSourceController,
        ResearchReportController,
        ResearchLineageController,
        ResearchCompareController,
        ResearchReleaseCandidateController,
        ResearchReleaseCandidatePublicationController,
        ResearchAlphaVersionPublicationController,
      ],
      providers: [
        ExecutionLocalReadAuthority,
        { provide: CONTROL_API_CONFIG, useValue: config },
        { provide: CONTROL_API_POOL, useValue: pool },
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
          ) => new GovernanceGrantsService(db, auth, ownerAccess),
          inject: [CONTROL_API_POOL, AuthService, OwnerAccessService],
        },
        {
          provide: AccountLifecycleService,
          useFactory: (cfg: ControlApiConfig, db: Pool, auth: AuthService) =>
            new AccountLifecycleService(db, cfg, auth),
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
        // W5a · A10a: explicit byte verification; dark behind its own flag.
        ResearchArtifactVerifyClient,
        ResearchArtifactVerifyRepository,
        ResearchArtifactVerifyService,
        // W5a · A10c: exact-evaluation what-if read + one explicit diagnostic job.
        ResearchWhatIfRepository,
        ResearchWhatIfService,
        ResearchReplayService,
        // RS-02 has no source/runtime side effect at module registration.
        // Its private importer and browser reads remain feature-dark until a
        // separately accepted dev slice supplies sealed current-engine rows.
        ResearchCurrentSourceRepository,
        ResearchCurrentSourceService,
        ResearchCurrentSourceIngestService,
        ResearchReportRepository,
        ResearchReportService,
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
        PaperExitRepository,
        PaperExitService,
        GovernanceReviewCaptureService,
        CommandCenterRepository,
        CommandCenterService,
        ExecutionOperationsRepository,
        ExecutionOperationsService,
        OperationsWorkflowRepository,
        OperationsWorkflowService,
        IncidentRepository,
        IncidentService,
        SandboxCertificationRepository,
        SandboxCertificationService,
        CanaryRepository,
        CanaryService,
        LiveOperationsService,
        ActivationRepository,
        ActivationService,
        ScreenBffService,
        PaperReadService,
        ProfileReadService,
        ManagerListsRepository,
        ManagerListsService,
        ResourceReadService,
        PortalDerivationsService,
        OperationalCompositionService,
        ExecutionSharedReadRepository,
        ExecutionSharedReadCacheMaintenanceWorker,
        MarketContextService,
        ExecutionRuntimeManifestService,
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
          useFactory: (cfg: ControlApiConfig) => ExecutionAnalyticsProxy.create(cfg),
          inject: [CONTROL_API_CONFIG],
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
          useFactory: (auth: AuthService, workspaces: WorkspacesRepository) =>
            new SessionGuard(auth, workspaces),
          inject: [AuthService, WorkspacesRepository],
        },
        AdminGuard,
        OwnerAccessGuard,
        OwnerAccessService,
      ],
    };
  }
}
