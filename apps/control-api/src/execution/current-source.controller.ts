import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { z } from "zod";
import { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import {
  CurrentSourceEnvironment,
  CurrentSourceProxyError,
  ExecutionCurrentSourceProxy,
} from "./current-source.proxy";

interface CurrentSourceRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const EnvironmentSchema = z.enum(["paper", "sandbox", "live", "canary"]);
const PageQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().min(1).max(4096).optional(),
}).strict();

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/current-source")
export class ExecutionCurrentSourceController {
  constructor(
    @Inject(ExecutionCurrentSourceProxy)
    private readonly proxy: ExecutionCurrentSourceProxy,
  ) {}

  @Get("/:environment/screens/:screenId")
  screen(
    @Req() request: CurrentSourceRequest,
    @Param("environment") rawEnvironment: string,
    @Param("screenId") screenId: string,
  ) {
    const environment = this.environment(rawEnvironment);
    return this.invoke(() => this.proxy.screen(principal(request), environment, screenId));
  }

  @Get("/:environment/screens/:screenId/sources/:sourceId/relations/:relation")
  relation(
    @Req() request: CurrentSourceRequest,
    @Param("environment") rawEnvironment: string,
    @Param("screenId") screenId: string,
    @Param("sourceId") sourceId: string,
    @Param("relation") relation: string,
    @Query() rawQuery: unknown,
  ) {
    const environment = this.environment(rawEnvironment);
    const query = PageQuerySchema.safeParse(rawQuery);
    if (!query.success) {
      throw new CurrentSourceProxyError("N13B_PAGE_INVALID", 400);
    }
    return this.invoke(() =>
      this.proxy.relation(
        principal(request),
        environment,
        screenId,
        sourceId,
        relation,
        query.data,
      ),
    );
  }

  private environment(value: string): CurrentSourceEnvironment {
    const parsed = EnvironmentSchema.safeParse(value);
    if (!parsed.success) {
      throw new CurrentSourceProxyError("N13B_ENVIRONMENT_INVALID", 400);
    }
    return parsed.data;
  }

  private async invoke(operation: () => Promise<unknown>): Promise<unknown> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof CurrentSourceProxyError) throw error;
      throw new CurrentSourceProxyError("N13B_UPSTREAM_UNAVAILABLE", 502);
    }
  }
}

function principal(request: CurrentSourceRequest) {
  return {
    user: request.portalUser,
    session: request.portalSession,
    workspaceId: request.portalWorkspaceId,
  };
}
