/** Private P11 source callback.  It is not a browser or façade route. */

import { Body, Controller, HttpCode, Inject, Post, Req } from "@nestjs/common";
import { FastifyRequest } from "fastify";

import { PrincipalService } from "../auth/principal";
import { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchProgressIngressSchema } from "./progress.contract";
import { ResearchProgressError } from "./progress.error";
import { ResearchProgressService } from "./progress.service";

@Controller("/internal/research/progress")
export class ResearchProgressIngressController {
  constructor(
    @Inject(ResearchProgressService) private readonly service: ResearchProgressService,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Post("events")
  @HttpCode(202)
  async ingest(@Req() request: FastifyRequest, @Body() body: unknown) {
    this.assertWorkerPrincipal(request);
    const parsed = ResearchProgressIngressSchema.safeParse(body);
    if (!parsed.success) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_INVALID", "Research progress source payload is invalid.", 400);
    }
    return this.service.ingest(parsed.data);
  }

  private assertWorkerPrincipal(request: FastifyRequest): void {
    const secret = this.config.INTERNAL_PRINCIPAL_SECRET;
    const raw = request.headers["x-portal-principal"];
    if (!secret) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_UNAVAILABLE", "Research progress ingress is not configured.", 503);
    }
    if (Array.isArray(raw) || typeof raw !== "string") {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Research progress source is not authorized.", 403);
    }
    const principal = new PrincipalService(secret).verify(raw);
    if (
      !principal || principal.principalId !== "research-progress-worker"
      || principal.username !== "research-progress-worker"
      || principal.role !== "ADMIN" || principal.mustChangePassword
      || !principal.authnMethods.includes("research_progress_writer")
    ) {
      throw new ResearchProgressError("RESEARCH_PROGRESS_FORBIDDEN", "Research progress source is not authorized.", 403);
    }
  }
}
