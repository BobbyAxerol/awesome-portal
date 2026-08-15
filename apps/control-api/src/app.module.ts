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

@Module({})
export class AppModule {
  static register(config: ControlApiConfig, pool: Pool): DynamicModule {
    return {
      module: AppModule,
      controllers: [HealthController, AuthController, AdminController],
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
        AdminGuard,
      ],
    };
  }
}
