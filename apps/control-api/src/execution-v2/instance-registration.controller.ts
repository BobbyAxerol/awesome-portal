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
import { InstanceRegistrationError, instanceRegistrationId, instanceRegistrationIntent,
  instanceRegistrationQuery, instanceRegistrationSubmit } from "./instance-registration.contract";
import { InstanceRegistrationService } from "./instance-registration.service";

type Request = FastifyRequest & { portalUser: PortalUser;
  portalSession: { sessionId: string; csrfSecretHash: string } };

/** One named registry family. Never accepts caller authority, source URL or generic commands. */
@Controller("/api/v1/execution/instance-registrations")
@UseGuards(SessionGuard)
export class InstanceRegistrationController {
  constructor(@Inject(InstanceRegistrationService) private readonly service: InstanceRegistrationService,
    @Inject(AuthService) private readonly auth: AuthService) {}
  private actor(request: Request) { return { user_id: request.portalUser.userId,
    session_id: request.portalSession.sessionId, session_generation: request.portalUser.sessionVersion }; }
  private parse<T>(schema: z.ZodType<T, z.ZodTypeDef, any>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw new CommandHttpError("REGISTRATION_INPUT_INVALID", "Check the registration fields.", 400);
    return parsed.data;
  }
  private security(request: Request, key?: string) {
    const denial = mutationSecurityDenial(request, { csrfSecretHash: request.portalSession.csrfSecretHash,
      allowedOrigin: this.auth.config.PORTAL_PUBLIC_ORIGIN });
    if (denial) throw new CommandHttpError(denial, MUTATION_SECURITY_MESSAGE[denial], 403);
    const header = this.parse(commandKey, request.headers["x-portal-idempotency-key"]);
    if (key !== undefined && header !== key)
      throw new CommandHttpError("REGISTRATION_INPUT_INVALID", "Use the same registration key.", 400);
  }
  private async call<T>(run: () => Promise<T>): Promise<T> {
    try { return await run(); }
    catch (error) {
      if (error instanceof InstanceRegistrationError || error instanceof AccessPolicyError)
        throw new CommandHttpError(error.status === 404 ? "REGISTRATION_NOT_FOUND" : error.code,
          "The registration is not available. Review the original request before retrying.", error.status);
      throw new CommandHttpError("REGISTRATION_UNAVAILABLE",
        "The registration service is unavailable. Query the original request before retrying.", 503);
    }
  }
  @Post("/preview") @Header("Cache-Control", "private, no-store")
  async preview(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const intent = this.parse(instanceRegistrationIntent, body);
    this.security(request, intent.business_payload.idempotency_key); reply.code(200);
    return this.call(() => this.service.preview(this.actor(request), intent));
  }
  @Post("") @Header("Cache-Control", "private, no-store")
  async submit(@Req() request: Request, @Body() body: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const submitted = this.parse(instanceRegistrationSubmit, body);
    this.security(request, submitted.intent.business_payload.idempotency_key); reply.code(200);
    return this.call(() => this.service.submit(this.actor(request), submitted.intent, submitted.preview_digest));
  }
  @Get("/:id") @Header("Cache-Control", "private, no-store")
  async status(@Req() request: Request, @Param("id") id: string, @Query() query: unknown) {
    const workspace = this.parse(instanceRegistrationQuery, query), command = this.parse(instanceRegistrationId, id);
    return this.call(() => this.service.status(this.actor(request), workspace.workspace_id, command));
  }
  @Post("/:id/reconcile") @Header("Cache-Control", "private, no-store")
  async reconcile(@Req() request: Request, @Param("id") id: string, @Body() body: unknown,
    @Res({ passthrough: true }) reply: FastifyReply) {
    const workspace = this.parse(instanceRegistrationQuery, body), command = this.parse(instanceRegistrationId, id);
    this.security(request); reply.code(200);
    return this.call(() => this.service.reconcile(this.actor(request), workspace.workspace_id, command));
  }
}
