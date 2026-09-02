import { Controller, Get, HttpException, Inject, Param, Req, UseGuards } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { SessionGuard } from "../facade/session.guard";
import { ProjectionEnvironment } from "./profile-projection.repository";
import {
  ExecutionProfileReadAdapterService,
  ProjectionAdapterError,
} from "./profile-read-adapter.service";

interface AdapterRequest extends FastifyRequest { portalWorkspaceId: string; }

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/adapters")
export class ExecutionProfileReadAdapterController {
  constructor(
    @Inject(ExecutionProfileReadAdapterService) private readonly adapters: ExecutionProfileReadAdapterService,
  ) {}

  @Get("/:environment/:capabilityId")
  async read(
    @Req() request: AdapterRequest,
    @Param("environment") rawEnvironment: string,
    @Param("capabilityId") capabilityId: string,
  ) {
    if (!(["paper", "sandbox", "live"] as const).includes(rawEnvironment as ProjectionEnvironment)) {
      throw new HttpException({ error: { code: "N32_PROFILE_ENVIRONMENT_INVALID" } }, 404);
    }
    try {
      return await this.adapters.read(
        request.portalWorkspaceId, rawEnvironment as ProjectionEnvironment, capabilityId,
      );
    } catch (error) {
      if (error instanceof ProjectionAdapterError) {
        throw new HttpException({ error: { code: error.code } }, error.status);
      }
      throw error;
    }
  }
}
