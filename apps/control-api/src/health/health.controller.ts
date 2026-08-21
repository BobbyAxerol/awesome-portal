import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { Pool } from "pg";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";

@Controller("/api/control")
export class HealthController {
  constructor(
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
  ) {}

  @Get("/healthz")
  health() {
    return { status: "ok", service: "control-api", version: "0.1.0" };
  }

  @Get("/readyz")
  async ready() {
    try {
      await this.pool.query("SELECT 1");
      return {
        status: "ready",
        service: "control-api",
        version: "0.1.0",
        auth_mode: this.config.AUTH_MODE,
        dependencies: { postgres: "ready" },
      };
    } catch {
      throw new ServiceUnavailableException({
        status: "not_ready",
        service: "control-api",
        version: "0.1.0",
        dependencies: { postgres: "unavailable" },
      });
    }
  }
}
