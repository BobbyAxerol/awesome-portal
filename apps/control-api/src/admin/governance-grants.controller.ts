import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthError } from "../auth/auth.service";
import type { PortalUser } from "../domain";
import {
  GovernanceGrantsService,
  GrantDeniedError,
} from "./governance-grants.service";
import { OwnerAccessGuard } from "./owner-access.guard";

/**
 * A4-3 · `/api/admin/profile-access` — who may decide what.
 *
 * Owner-only, behind `OwnerAccessGuard`, so an allowed Origin, a valid CSRF
 * pair and the owner anchor are all already proved before anything here runs.
 * Each mutation additionally needs a step-up and an idempotency key, for the
 * same reason an account operation does: this changes somebody's authority.
 *
 * The shape is deliberately a POLICY surface, not an RBAC editor. There is no
 * route that accepts a role name, a route pattern, a SQL fragment or a command
 * string — only a capability from the finite §20.3 namespace, a grantee and an
 * optional workspace.
 */

const GrantSchema = z.object({
  grantee_user_id: z.string().min(1),
  capability: z.string().min(1),
  workspace_id: z.string().min(1).nullable().optional(),
});

const RevokeSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
});

interface OwnerRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalSession: { sessionId: string };
}

function grantFailure(error: unknown): AuthError {
  if (error instanceof GrantDeniedError) {
    return new AuthError(error.reasonCode, error.message, error.status);
  }
  // Anything this service did not compose becomes a fixed sentence: a driver
  // `Error` carries connection strings and constraint names.
  return new AuthError(
    "GRANT_OPERATION_FAILED",
    "The access change could not be completed.",
    500,
  );
}

@UseGuards(OwnerAccessGuard)
@Controller("/api/admin/profile-access")
export class GovernanceGrantsController {
  constructor(
    @Inject(GovernanceGrantsService) private readonly grants: GovernanceGrantsService,
  ) {}

  private idempotencyKey(request: OwnerRequest): string {
    const key = request.headers["x-portal-idempotency-key"];
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new AuthError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Every access change needs an x-portal-idempotency-key header.",
        400,
      );
    }
    return key.trim();
  }

  @Header("Cache-Control", "no-store")
  @Get()
  async policy() {
    return {
      schema_version: "portal.profile-access.v1",
      record_authority: "PORTAL_CONTROL",
      ...(await this.grants.policy()),
    };
  }

  @Header("Cache-Control", "no-store")
  @Get("/activity")
  async activity(@Query("grantee_user_id") granteeUserId?: string) {
    if (!granteeUserId) {
      throw new AuthError("INVALID_REQUEST", "Name the account whose activity you want.", 422);
    }
    const events = await this.grants.activityFor(granteeUserId);
    return {
      schema_version: "portal.profile-access-activity.v1",
      record_authority: "PORTAL_CONTROL",
      /*
       * Refusals are published alongside applied changes. A trail that shows
       * only what worked cannot answer "why does Stan still not have this" —
       * which is the question an owner actually brings to this screen.
       */
      activity: events.map((event) => ({
        event_id: event.eventId,
        action: event.action,
        capability: event.capability,
        outcome: event.outcome,
        reason_code: event.reasonCode,
        actor_user_id: event.actorUserId,
        grant_id: event.grantId,
        state_before: event.stateBefore,
        state_after: event.stateAfter,
        step_up_used: event.stepUpUsed,
        occurred_at: event.occurredAt.toISOString(),
      })),
    };
  }

  @Header("Cache-Control", "no-store")
  @Post()
  async grant(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = GrantSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError("INVALID_REQUEST", "Invalid access change.", 422);
    }
    try {
      const result = await this.grants.execute({
        action: "GRANT",
        actor: request.portalUser,
        sessionId: request.portalSession.sessionId,
        idempotencyKey: this.idempotencyKey(request),
        requestId: (request.headers["x-request-id"] as string | undefined) ?? null,
        granteeUserId: parsed.data.grantee_user_id,
        capability: parsed.data.capability,
        workspaceId: parsed.data.workspace_id ?? null,
      });
      return this.present(result);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw grantFailure(error);
    }
  }

  @Header("Cache-Control", "no-store")
  @Delete("/:grant_id")
  async revoke(
    @Req() request: OwnerRequest,
    @Param("grant_id") grantId: string,
    @Body() body: unknown,
  ) {
    const parsed = RevokeSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError(
        "INVALID_REQUEST",
        "Revoking a grant needs the revision you are acting on.",
        422,
      );
    }
    try {
      const result = await this.grants.execute({
        action: "REVOKE",
        actor: request.portalUser,
        sessionId: request.portalSession.sessionId,
        idempotencyKey: this.idempotencyKey(request),
        requestId: (request.headers["x-request-id"] as string | undefined) ?? null,
        grantId,
        expectedRevision: parsed.data.expected_revision,
      });
      return this.present(result);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw grantFailure(error);
    }
  }

  private present(result: Awaited<ReturnType<GovernanceGrantsService["execute"]>>) {
    return {
      schema_version: "portal.profile-access-change.v1",
      outcome: result.outcome,
      event_id: result.event.eventId,
      grant: result.grant
        ? {
            grant_id: result.grant.grantId,
            grantee_user_id: result.grant.granteeUserId,
            capability: result.grant.capability,
            workspace_id: result.grant.workspaceId,
            state: result.grant.state,
            grant_revision: result.grant.grantRevision,
          }
        : null,
      /*
       * Said on every response, because it is the thing this whole phase is
       * careful about: delegating a Governance capability creates no Trading
       * System command, promotes no capital and changes no source data.
       */
      external_effect: "NONE",
    };
  }
}
