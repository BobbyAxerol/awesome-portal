/** RS-02 same-origin named read routes for sealed current-source artifacts. */

import { Controller, Get, Inject, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";

import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import {
  ResearchCurrentSourceEvidenceSeriesQuerySchema,
  ResearchCurrentSourcePageQuerySchema,
  ResearchCurrentSourceReadQuerySchema,
  ResearchCurrentSourceRunIdSchema,
  ResearchCurrentSourceSearchQuerySchema,
  ResearchCurrentSourceTransitionsQuerySchema,
} from "./current-source.contract";
import { ResearchCurrentSourceError } from "./current-source.error";
import { ResearchCurrentSourceService } from "./current-source.service";
import { sendRevalidatable } from "./etag";

interface CurrentSourceRequest extends FastifyRequest {
  portalUser: { userId: string };
  portalWorkspaceId: string;
}

@UseGuards(SessionGuard)
@Controller("/api/v1/quantbt/runs")
export class ResearchCurrentSourceController {
  constructor(
    @Inject(ResearchCurrentSourceService) private readonly service: ResearchCurrentSourceService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
  ) {}

  @Get(":runId/current-source/evidence")
  async evidence(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourceReadQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    return this.conditional(reply, request, await this.abortable(request, (signal) => this.service.evidence(scope, runId, signal)));
  }

  @Get(":runId/current-source/evidence/series")
  async evidenceSeries(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourceEvidenceSeriesQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    return this.conditional(reply, request, await this.abortable(request, (signal) => this.service.evidenceSeries(scope, runId, query.kind, signal)));
  }

  @Get(":runId/current-source/split")
  async split(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourceReadQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    return this.conditional(reply, request, await this.abortable(request, (signal) => this.service.split(scope, runId, signal)));
  }

  @Get(":runId/current-source/search")
  async search(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourceSearchQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    // Search carries renewable relation-bound cursors. Do not let an ETag 304
    // reuse a stale cursor payload across a browser session.
    reply.header("cache-control", "private, no-store");
    return reply.send(await this.abortable(request, (signal) => this.service.search(scope, runId, query, signal)));
  }

  @Get(":runId/current-source/freeze")
  async freeze(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourceReadQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    return this.conditional(reply, request, await this.abortable(request, (signal) => this.service.freeze(scope, runId, signal)));
  }

  @Get(":runId/current-source/replay")
  async replay(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourcePageQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    // Cursor-bearing pages must not get a 304 that reuses a possibly expired
    // token. A full refetch remains cheap/bounded and is the correct renewal.
    reply.header("cache-control", "private, no-store");
    return reply.send(await this.abortable(request, (signal) => this.service.replay(scope, runId, query, signal)));
  }

  /** W5b (P17): the close-target transition ledger, keyset over the original bar ordinal. */
  @Get(":runId/current-source/replay/transitions")
  async replayTransitions(@Req() request: CurrentSourceRequest, @Res() reply: FastifyReply, @Param("runId") rawRunId: string, @Query() rawQuery: unknown) {
    const runId = this.runId(rawRunId);
    const query = this.parse(ResearchCurrentSourceTransitionsQuerySchema, rawQuery);
    const scope = await this.scope(request, query.workspace_id);
    reply.header("cache-control", "private, no-store");
    return reply.send(await this.abortable(request, (signal) => this.service.replayTransitions(scope, runId, query, signal)));
  }

  private runId(raw: string): string {
    if (!ResearchCurrentSourceRunIdSchema.safeParse(raw).success) this.invalid();
    return raw;
  }

  private parse<T>(schema: { safeParse(value: unknown): { success: true; data: T } | { success: false } }, raw: unknown): T {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) this.invalid();
    return parsed.data;
  }

  private async scope(request: CurrentSourceRequest, rawWorkspaceId: string | undefined) {
    const workspaceId = rawWorkspaceId ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      // Same external behavior as the other Research BFFs: no run disclosure
      // across a workspace boundary.
      throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_NOT_FOUND", "Research workspace was not found.", 404);
    }
    return { workspaceId, actorUserId: request.portalUser.userId };
  }

  private async abortable<T>(request: FastifyRequest, work: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const abort = new AbortController();
    const onAborted = () => abort.abort();
    request.raw.once("aborted", onAborted);
    try {
      return await work(abort.signal);
    } finally {
      request.raw.off("aborted", onAborted);
    }
  }

  /** RF-05 CG-P13-13: the same weak If-None-Match + private/no-cache rule as split/search/evidence. */
  private conditional(reply: FastifyReply, request: FastifyRequest, body: { etag: string }) {
    return sendRevalidatable(reply, request, body);
  }

  private invalid(): never {
    throw new ResearchCurrentSourceError("RESEARCH_CURRENT_SOURCE_INVALID", "Invalid retained current-source request.", 400);
  }
}
