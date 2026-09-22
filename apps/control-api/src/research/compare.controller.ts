/** P20 same-origin, bounded Compare BFF. */

import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchCompareAlphaIdSchema, ResearchCompareQuerySchema } from "./compare.contract";
import { ResearchCompareError } from "./compare.error";
import { ResearchCompareService } from "./compare.service";

interface CompareRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
}

/**
 * A browser can ask for one Alpha and one named Compare mode only. It cannot
 * supply a relation, raw series, source cursor, engine invocation, claim,
 * ranking/promotion input or cross-workspace ID through this route.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/alphas")
export class ResearchCompareController {
  constructor(
    private readonly service: ResearchCompareService,
    private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":alphaId/compare")
  async detail(
    @Req() request: CompareRequest,
    @Res() reply: FastifyReply,
    @Param("alphaId") alphaId: string,
    @Query() rawQuery: unknown,
  ) {
    if (!ResearchCompareAlphaIdSchema.safeParse(alphaId).success) this.invalid();
    const query = ResearchCompareQuerySchema.safeParse(rawQuery);
    if (!query.success) this.invalid();
    const workspaceId = await this.workspace(request, query.data.workspace_id);
    const response = await this.service.detail(
      { workspaceId, actorUserId: request.portalUser.userId },
      alphaId,
      { ...query.data, workspace_id: workspaceId },
    );
    reply.header("etag", response.etag);
    // The server-side cache is content-addressed and scope-bound. Browser
    // caching is deliberately disabled so a deep-linked pair cannot retain a
    // prior user's response across an account/session change.
    reply.header("cache-control", "private, no-store");
    const candidate = request.headers["if-none-match"];
    if (!Array.isArray(candidate) && candidate === response.etag) return reply.code(304).send();
    return reply.send(response);
  }

  private invalid(): never {
    throw new ResearchCompareError("RESEARCH_COMPARE_INVALID", "Invalid Research Compare request.", 400);
  }

  private async workspace(request: CompareRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // Do not turn this reader into a workspace/Alpha/run existence oracle.
      throw new ResearchCompareError("RESEARCH_COMPARE_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return workspaceId;
  }
}
