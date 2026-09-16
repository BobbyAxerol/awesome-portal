import { Body, Controller, Get, Header, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthError } from "../auth/auth.service";
import type { PortalUser } from "../domain";
import { AccountLifecycleService } from "./account-lifecycle.service";
import { lifecycleFailure } from "./account-lifecycle.controller";
import { OwnerAccessGuard } from "./owner-access.guard";

const StepUpSchema = z.object({
  password: z.string().min(1).max(256),
});

interface OwnerRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalSession: { sessionId: string };
}

/**
 * A4-2 · owner step-up, on its own path.
 *
 * Separate from `/accounts` because it acts on the SESSION rather than on an
 * account: it is the owner proving, again, that they are present — not a
 * change to anybody's record.
 */
@UseGuards(OwnerAccessGuard)
@Controller("/api/admin/step-up")
export class OwnerStepUpController {
  constructor(
    @Inject(AccountLifecycleService)
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  @Header("Cache-Control", "no-store")
  @Get()
  async status(@Req() request: OwnerRequest) {
    const expiresAt = await this.lifecycle.stepUpExpiry(request.portalSession.sessionId);
    return {
      schema_version: "portal.owner-step-up.v1",
      // Three states, not a boolean: the UI must be able to say "expired at
      // 14:02" rather than silently presenting the password prompt again as if
      // nothing had been done.
      state: expiresAt ? "ACTIVE" : "REQUIRED",
      expires_at: expiresAt?.toISOString() ?? null,
    };
  }

  @Header("Cache-Control", "no-store")
  @Post()
  async grant(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = StepUpSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Enter your password.", 422);
    }
    try {
      const { expiresAt } = await this.lifecycle.stepUp({
        actor: request.portalUser,
        sessionId: request.portalSession.sessionId,
        password: parsed.data.password,
      });
      return {
        schema_version: "portal.owner-step-up.v1",
        state: "ACTIVE",
        expires_at: expiresAt.toISOString(),
      };
    } catch (error) {
      throw lifecycleFailure(error);
    }
  }
}
