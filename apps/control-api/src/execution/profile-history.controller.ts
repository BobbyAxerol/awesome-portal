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
    await this.readAuthority.authorize(request, rawEnvironment as ProjectionEnvironment);
    return this.history.read(rawEnvironment as ProjectionEnvironment, relationKey, query);
  }
}
