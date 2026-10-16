import { Controller, Get, Inject, Param, Query, Req, UseGuards, Header } from "@nestjs/common";
import { ExecutionLocalReadAuthority, ExecutionReadRequest } from "./local-read-authority";
import { SessionGuard } from "../facade/session.guard";
import { ExecutionProfileHistoryService, HistoryReadError } from "./profile-history.service";
import { ProjectionEnvironment } from "./profile-projection.repository";

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/history")
export class ExecutionProfileHistoryController {
  constructor(
    @Inject(ExecutionProfileHistoryService) private readonly history: ExecutionProfileHistoryService,
    @Inject(ExecutionLocalReadAuthority) private readonly readAuthority: ExecutionLocalReadAuthority,
  ) {}

  @Get("/:environment/:relationKey")
  @Header("Cache-Control", "private, no-store")
  @Header("Deprecation", "true")
  @Header("Link", '</api/v1/execution/views/equity-chart>; rel="successor-version"')
  async read(
    @Req() request: ExecutionReadRequest,
    @Param("environment") rawEnvironment: string,
    @Param("relationKey") relationKey: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (!(["paper", "sandbox", "live"] as const).includes(rawEnvironment as ProjectionEnvironment)) {
      throw new HistoryReadError("N33_PROFILE_ENVIRONMENT_INVALID", 404);
    }
    if (query.workspace_id !== undefined && typeof query.workspace_id !== "string")
      throw new HistoryReadError("N33_HISTORY_QUERY_INVALID", 400);
    const principal = await this.readAuthority.authorize(request, rawEnvironment as ProjectionEnvironment,
      query.workspace_id as string | undefined);
    const { workspace_id: _workspace, ...parameters } = query;
    return this.history.readAuthorized(principal, rawEnvironment as ProjectionEnvironment, relationKey, parameters);
  }
}
