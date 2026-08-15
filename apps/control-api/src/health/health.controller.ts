import { Controller, Get, Inject } from "@nestjs/common";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";

@Controller("/api/control")
export class HealthController {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  @Get("/healthz")
  health() {
    return { status: "ok", service: "control-api", version: "0.1.0" };
  }

  @Get("/readyz")
  ready() {
    return {
      status: "ready",
      service: "control-api",
      version: "0.1.0",
      auth_mode: this.config.AUTH_MODE,
    };
  }
}
