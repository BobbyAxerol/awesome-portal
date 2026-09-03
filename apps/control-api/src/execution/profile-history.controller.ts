import { Controller, Get, HttpException, Inject, Param, Query, UseGuards } from "@nestjs/common";
import { SessionGuard } from "../facade/session.guard";
import { ExecutionProfileHistoryService, HistoryReadError } from "./profile-history.service";
import { ProjectionEnvironment } from "./profile-projection.repository";

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/history")
export class ExecutionProfileHistoryController {
  constructor(
    @Inject(ExecutionProfileHistoryService) private readonly history: ExecutionProfileHistoryService,
  ) {}

  @Get("/:environment/:relationKey")
  async read(
    @Param("environment") rawEnvironment: string,
    @Param("relationKey") relationKey: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (!(["paper", "sandbox", "live"] as const).includes(rawEnvironment as ProjectionEnvironment)) {
      throw new HttpException({ error: { code: "N33_PROFILE_ENVIRONMENT_INVALID" } }, 404);
    }
    try {
      return await this.history.read(rawEnvironment as ProjectionEnvironment, relationKey, query);
    } catch (error) {
      if (error instanceof HistoryReadError) {
        throw new HttpException({ error: { code: error.code } }, error.status);
      }
      throw error;
    }
  }
}
