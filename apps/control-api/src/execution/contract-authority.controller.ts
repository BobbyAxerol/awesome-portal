import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ExecutionContractAuthorityService } from "./contract-authority.service";

const ContractAuthorityQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
}).strict();

export class ExecutionContractAuthorityHttpError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

interface ContractAuthorityRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/contract-authority")
export class ExecutionContractAuthorityController {
  constructor(
    @Inject(ExecutionContractAuthorityService) private readonly service: ExecutionContractAuthorityService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get()
  async authority(@Req() request: ContractAuthorityRequest, @Query() rawQuery: unknown) {
    const query = ContractAuthorityQuerySchema.safeParse(rawQuery);
    if (!query.success) {
      throw new ExecutionContractAuthorityHttpError("EDS02_CONTRACT_AUTHORITY_QUERY_INVALID", "Invalid query.", 400);
    }
    const workspaceId = query.data.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new ExecutionContractAuthorityHttpError("WORKSPACE_NOT_FOUND", "Workspace not found.", 404);
    }
    return this.service.authority(request.portalUser, workspaceId);
  }
}
