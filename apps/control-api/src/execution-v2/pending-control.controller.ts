/** Isolated correctness implementation; runtime provider remains unqualified. Named existing-recall controls only. */
import { Body, Controller, Get, Header, Inject, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PortalUser } from "../domain";
import { AuthService } from "../auth/auth.service";
import { mutationSecurityDenial, MUTATION_SECURITY_MESSAGE } from "../auth/mutation-security";
import { SessionGuard } from "../facade/session.guard";
import { CommandHttpError } from "./command.error";
import { AccessPolicyError } from "./access.contract";
import { commandKey } from "./command.contract";
import { PendingControlError, pendingControlId, pendingControlIntent, pendingControlQuery,
  pendingControlSubmit } from "./pending-control.contract";
import { PendingControlService } from "./pending-control.service";

type Request = FastifyRequest & { portalUser: PortalUser;
  portalSession: { sessionId: string; csrfSecretHash: string } };
@Controller("/api/v1/execution/pending-recalls")
@UseGuards(SessionGuard)
export class PendingControlController {
  constructor(@Inject(PendingControlService) private readonly service: PendingControlService,
    @Inject(AuthService) private readonly auth: AuthService) {}
  private actor(request: Request) { return { user_id: request.portalUser.userId,
    session_id: request.portalSession.sessionId, session_generation: request.portalUser.sessionVersion }; }
  private parse<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, input: unknown): T {
    const parsed = schema.safeParse(input);
    if (!parsed.success) throw new CommandHttpError("PENDING_CONTROL_INPUT_INVALID", "Check the recall control fields.", 400);
    return parsed.data;
  }
  private security(request: Request, key?: string) {
    const denial = mutationSecurityDenial(request, { csrfSecretHash: request.portalSession.csrfSecretHash,
      allowedOrigin: this.auth.config.PORTAL_PUBLIC_ORIGIN });
    if (denial) throw new CommandHttpError(denial, MUTATION_SECURITY_MESSAGE[denial], 403);
    const header = this.parse(commandKey, request.headers["x-portal-idempotency-key"]);
    if (key !== undefined && header !== key)
      throw new CommandHttpError("PENDING_CONTROL_INPUT_INVALID", "Use the same recall control key.", 400);
  }
  private async call<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      if (error instanceof PendingControlError || error instanceof AccessPolicyError)
        throw new CommandHttpError(error.status === 404 ? "PENDING_CONTROL_NOT_FOUND" : error.code,
          "The recall control is not available. Review the original request before retrying.", error.status);
      throw new CommandHttpError("PENDING_CONTROL_UNAVAILABLE",
        "The recall control service is unavailable. Query the original request before retrying.", 503);
    }
  }
  @Post("/preview") @Header("Cache-Control", "private, no-store")
  async preview(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const intent = this.parse(pendingControlIntent, body);
    this.security(request, intent.business_payload.idempotency_key); reply.code(200);
    return this.call(() => this.service.preview(this.actor(request), intent));
  }
  @Post("") @Header("Cache-Control", "private, no-store")
  async submit(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const submitted = this.parse(pendingControlSubmit, body);
    this.security(request, submitted.intent.business_payload.idempotency_key); reply.code(200);
    return this.call(() => this.service.submit(this.actor(request), submitted.intent, submitted.preview_digest));
  }
  @Get("/:id") @Header("Cache-Control", "private, no-store")
  async status(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const workspace = this.parse(pendingControlQuery, query), command = this.parse(pendingControlId, id);
    return this.call(() => this.service.status(this.actor(request), workspace.workspace_id, command));
  }
  @Post("/:id/reconcile") @Header("Cache-Control", "private, no-store")
  async reconcile(@Req() request: Request, @Param("id") id: string, @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply) {
    const workspace = this.parse(pendingControlQuery, body), command = this.parse(pendingControlId, id);
    this.security(request); reply.code(200);
    return this.call(() => this.service.reconcile(this.actor(request), workspace.workspace_id, command));
  }
}
