import { Controller, Get, Inject, Param, Req, UseGuards, Header, Query } from "@nestjs/common";
import { FastifyRequest } from "fastify";
import { SessionGuard } from "../facade/session.guard";
import { ProjectionEnvironment } from "./profile-projection.repository";
import { ExecutionLocalReadAuthority, ExecutionReadRequest } from "./local-read-authority";
import {
  ExecutionProfileReadAdapterService,
  ProjectionAdapterError,
} from "./profile-read-adapter.service";

interface AdapterRequest extends FastifyRequest, ExecutionReadRequest {}

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/adapters")
export class ExecutionProfileReadAdapterController {
  constructor(
    @Inject(ExecutionProfileReadAdapterService) private readonly adapters: ExecutionProfileReadAdapterService,
    @Inject(ExecutionLocalReadAuthority) private readonly readAuthority: ExecutionLocalReadAuthority,
  ) {}

  @Get("/:environment/:capabilityId")
  @Header("Deprecation", "true")
  @Header("Link", '</api/v1/execution/screens/contracts>; rel="successor-version"')
  async read(
    @Req() request: AdapterRequest,
    @Param("environment") rawEnvironment: string,
    @Param("capabilityId") capabilityId: string,
    @Query() query: Record<string, unknown>,
  ) {
    if (!(["paper", "sandbox", "live"] as const).includes(rawEnvironment as ProjectionEnvironment)) {
      throw new ProjectionAdapterError("N32_PROFILE_ENVIRONMENT_INVALID", 404);
    }
    const principal = await this.readAuthority.authorize(request, rawEnvironment as ProjectionEnvironment);
    if (Object.keys(query).length) throw new ProjectionAdapterError("N32_QUERY_NOT_SUPPORTED", 400);
    return this.adapters.read(principal.workspaceId, rawEnvironment as ProjectionEnvironment, capabilityId);
  }
}
