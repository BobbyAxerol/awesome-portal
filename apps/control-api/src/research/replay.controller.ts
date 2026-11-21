/** P17 same-origin, read-only route-aware Replay BFF route. */

import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { ResearchReplayReadQuerySchema, ResearchReplayRunIdSchema } from "./replay.contract";
import { ResearchReplayError } from "./replay.error";
import { ResearchReplayService } from "./replay.service";

interface ReplayRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchReplayController {
  constructor(
    @Inject(ResearchReplayService) private readonly service: ResearchReplayService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":runId/execute/replay")
  async detail(
    @Req() request: ReplayRequest,
    @Res() reply: FastifyReply,
    @Param("runId") rawRunId: string,
    @Query() rawQuery: unknown,
  ) {
    const runId = this.runId(rawRunId);
    const query = this.query(rawQuery);
    const workspaceId = await this.workspace(request, query.workspace_id);
    // Stop waiting in the Research-owned queue when the caller has already
    // gone away.  This never cancels a shared-pool query that is running; the
    // repository's finite statement/acquire budgets still own that boundary.
    const abort = new AbortController();
    const onAborted = () => abort.abort();
    request.raw.once("aborted", onAborted);
    let body: Awaited<ReturnType<ResearchReplayService["detail"]>>;
    try {
      body = await this.service.detail(
        { workspaceId, actorUserId: request.portalUser.userId }, runId, query, abort.signal,
      );
    } finally {
      request.raw.off("aborted", onAborted);
    }
    // Navigation tokens have a short security TTL.  A content revision is
    // useful in the JSON body, but it is not an HTTP representation validator
    // for cursor-bearing responses: a 304 could make a browser reuse an
    // expired next/previous token.  Keep this private, no-store and let the
    // client refetch/recover from the typed cursor expiry instead.
    reply.header("cache-control", "private, no-store");
    return reply.send(body);
  }

  private runId(raw: string): string {
    if (!ResearchReplayRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private query(raw: unknown) {
    const parsed = ResearchReplayReadQuerySchema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private invalid(): never {
    throw new ResearchReplayError("RESEARCH_REPLAY_INVALID", "Invalid Research Replay request.", 400);
  }

  private async workspace(request: ReplayRequest, rawWorkspaceId: string | undefined): Promise<string> {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // Match other Research BFFs: do not disclose a run's existence across
      // a workspace boundary.
      throw new ResearchReplayError("RESEARCH_REPLAY_NOT_FOUND", "Research run was not found.", 404);
    }
    return workspaceId;
  }
}
