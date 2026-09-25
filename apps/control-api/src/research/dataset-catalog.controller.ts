import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";

import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchDatasetCatalogClient } from "./dataset-catalog.client";
import { ResearchDatasetCatalogQuerySchema, type ResearchDatasetCatalog } from "./dataset-catalog.contract";
import { ResearchPreflightError } from "./preflight.error";

interface DatasetCatalogRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

/** CG-P08-04 · same-origin, read-only research dataset catalog (Screen 02 data step). */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/datasets")
export class ResearchDatasetCatalogController {
  constructor(
    @Inject(ResearchDatasetCatalogClient) private readonly client: ResearchDatasetCatalogClient,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get()
  async list(@Req() request: DatasetCatalogRequest, @Query() rawQuery: unknown): Promise<ResearchDatasetCatalog> {
    const query = ResearchDatasetCatalogQuerySchema.safeParse(rawQuery);
    if (!query.success) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Invalid research dataset catalog request.", 400);
    }
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_NOT_FOUND", "Workspace not found.", 404);
    }
    return this.client.read(request.portalUser);
  }
}
