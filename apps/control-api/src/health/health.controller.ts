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
    return {
      status: "ok",
      service: "control-api",
      version: "0.1.0",
      /*
       * Which source this build came from.
       *
       * dev-portal builds from a working tree, not from a git ref, so "it is
       * on branch X" is a guess unless the running process says otherwise.
       * Today that guess was wrong in a way nobody could see: the deploy
       * printed "image match" for both containers, which only compares the
       * running container to the `:dev` tag and says nothing about whether
       * that tag was rebuilt from the current source.
       *
       * `unknown` is the honest default when the deploy did not stamp one —
       * never a made-up commit, and never silence.
       */
      build_commit: process.env.PORTAL_BUILD_COMMIT ?? "unknown",
      /** `true` when the tree had uncommitted changes at build time. */
      build_dirty: process.env.PORTAL_BUILD_DIRTY === "true",
    };
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
