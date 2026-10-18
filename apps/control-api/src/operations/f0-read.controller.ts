import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { CommandHttpError, commandHttpCall } from "../execution-v2/command.error";
import { f0ReadId, f0ReadQuery } from "./f0-read.contract";
import { ExecutionF0ReadService } from "./f0-read.service";

type Request = FastifyRequest & { portalUser: PortalUser; portalSession: { sessionId: string } };

/** Explicit F0 family: shared op_ prefix is not family or read authority. */
@Controller("/api/v1/execution/operations/f0")
@UseGuards(SessionGuard)
export class ExecutionF0ReadController {
  constructor(@Inject(ExecutionF0ReadService) private readonly service: ExecutionF0ReadService) {}

  @Get("/:operation_id") @Header("Cache-Control", "private, no-store")
  async get(@Req() request: Request, @Param("operation_id") rawId: string, @Query() rawQuery: unknown) {
    const id = f0ReadId.safeParse(rawId), query = f0ReadQuery.safeParse(rawQuery);
    if (!id.success || !query.success)
      throw new CommandHttpError("COMMAND_INPUT_INVALID", "Check the operation fields.", 400);
    const actor = { user_id: request.portalUser.userId, session_id: request.portalSession.sessionId,
      session_generation: request.portalUser.sessionVersion };
    return commandHttpCall(() => this.service.read(actor, query.data.workspace_id, id.data));
  }
}
