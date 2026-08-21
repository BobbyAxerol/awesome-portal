import { ServiceUnavailableException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { HealthController } from "../src/health/health.controller";
import { testConfig } from "./harness";

describe("control API health contract", () => {
  it("keeps liveness independent from PostgreSQL and proves PostgreSQL readiness", async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] });
    const controller = new HealthController(testConfig({ AUTH_MODE: "dev" }), { query } as never);

    expect(controller.health()).toMatchObject({ status: "ok", service: "control-api" });
    await expect(controller.ready()).resolves.toMatchObject({
      status: "ready",
      dependencies: { postgres: "ready" },
    });
    expect(query).toHaveBeenCalledWith("SELECT 1");
  });

  it("fails readiness closed when PostgreSQL is unavailable", async () => {
    const query = vi.fn().mockRejectedValue(new Error("database unavailable"));
    const controller = new HealthController(testConfig({ AUTH_MODE: "dev" }), { query } as never);

    await expect(controller.ready()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
