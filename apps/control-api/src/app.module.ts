import { ResearchRunSyncService } from "./facade/run-sync.service";
import { DynamicModule, Module } from "@nestjs/common";
import { Pool } from "pg";
import { AuthController } from "./auth/auth.controller";
import { AuthService } from "./auth/auth.service";
import { Argon2CredentialService } from "./auth/argon";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { AdminGuard } from "./admin/rbac.guard";
import { HealthController } from "./health/health.controller";
import { ControlApiConfig } from "./config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "./tokens";
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
import { ExecutionRealtimeController } from "./execution/realtime.controller";
import { ExecutionRealtimeProxy } from "./execution/realtime.proxy";
import { ExecutionAnalyticsController } from "./execution/analytics.controller";
import { ExecutionAnalyticsProxy } from "./execution/analytics.proxy";
import { ExecutionCurrentSourceController } from "./execution/current-source.controller";
import { ExecutionCurrentSourceProxy } from "./execution/current-source.proxy";
import { ExecutionRuntimeManifestController } from "./execution/runtime-manifest.controller";
import { ExecutionRuntimeManifestService } from "./execution/runtime-manifest.service";
import { ExecutionContractAuthorityController } from "./execution/contract-authority.controller";
import { ExecutionContractAuthorityService } from "./execution/contract-authority.service";
import { MaximumDataOperationController } from "./execution/maximum-data-operation.controller";
import { MaximumDataOperationService } from "./execution/maximum-data-operation.service";
import { MaximumDataContinuationRepository } from "./execution/maximum-data-continuation.repository";
import { ExecutionSharedReadRepository } from "./execution/shared-read.repository";
import { ExecutionProfileProjectionRepository } from "./execution/profile-projection.repository";
import { ExecutionProfileProjectionWorker } from "./execution/profile-projection.worker";
import { ExecutionProfileRealtimeService } from "./execution/profile-realtime.service";
import { ExecutionProductReadSource } from "./execution/product-read-source";
import { ExecutionProfileHistoryController } from "./execution/profile-history.controller";
import { ExecutionProfileHistoryService } from "./execution/profile-history.service";
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

@Module({})
export class AppModule {
  static register(config: ControlApiConfig, pool: Pool): DynamicModule {
    return {
      module: AppModule,
      controllers: [
        HealthController,
        AuthController,
        AdminController,
        FacadeController,
        PlanningFacadeController,
        GovernanceController,
        ExecutionRealtimeController,
        ExecutionAnalyticsController,
        ExecutionCurrentSourceController,
        ExecutionRuntimeManifestController,
        ExecutionContractAuthorityController,
        MaximumDataOperationController,
        ExecutionProfileHistoryController,
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
        ResourceReadController,
      ],
      providers: [
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
          provide: AdminService,
          useFactory: (cfg: ControlApiConfig, db: Pool, auth: AuthService) =>
            new AdminService(db, cfg, auth),
          inject: [CONTROL_API_CONFIG, CONTROL_API_POOL, AuthService],
        },
        WorkspacesRepository,
        RunsRepository,
        OutboxRepository,
        ProductAuditRepository,
        GovernanceRepository,
        ResearchRunSyncService,
        GovernanceService,
        PaperExitRepository,
        PaperExitService,
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
        ExecutionSharedReadRepository,
        ExecutionRuntimeManifestService,
        ExecutionContractAuthorityService,
        MaximumDataContinuationRepository,
        MaximumDataOperationService,
        ExecutionProfileProjectionRepository,
        ExecutionProfileProjectionWorker,
        ExecutionProfileRealtimeService,
        ExecutionProductReadSource,
        ExecutionProfileHistoryService,
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
      ],
    };
  }
}
