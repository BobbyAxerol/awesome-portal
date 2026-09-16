import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";

import { AuthError } from "../auth/auth.service";
import type { PortalUser } from "../domain";
import {
  AccountLifecycleService,
  LifecycleDeniedError,
  LifecycleRequest,
} from "./account-lifecycle.service";
import { OwnerAccessGuard } from "./owner-access.guard";

/**
 * A4-2 · `/api/admin/accounts` — the owner account control plane.
 *
 * This replaces the six `/api/admin/users*` routes, and replacing them rather
 * than adding beside them is the point: the old routes mutated accounts with
 * no expected revision, no idempotency, no step-up and no operation record, so
 * leaving them reachable would leave a way around every control added here.
 *
 * Shape of every mutation: a target, the revision the caller believes is
 * current, an idempotency key, and — for the destructive ones — a step-up
 * performed in this same session. `OwnerAccessGuard` has already required an
 * owner session, an allowed Origin and a valid CSRF pair before any of this
 * runs.
 *
 * `no-store` is on every route, not only the one that returns a credential.
 * The roster carries usernames and account states, which is not something to
 * leave in a shared cache either.
 */

const CreateAccountSchema = z.object({
  username: z.string().min(2).max(64),
  display_name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
});

const UpdateAccountSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
  display_name: z.string().min(1).max(120).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
});

const ActionSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
});

const ActivationSchema = z.object({
  expected_revision: z.number().int().nonnegative(),
  /** Revoke a still-live activation and mint another. Never implicit. */
  reissue: z.boolean().optional(),
});

interface OwnerRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalSession: { sessionId: string };
}

/**
 * Answer with this service's own words, or with none at all.
 *
 * Only a refusal `AccountLifecycleService` composed is echoed. Anything else
 * becomes a fixed sentence and a 500 — a driver `Error` carries connection
 * strings and constraint names, and `error instanceof Error ? error.message`
 * is the guarded branch that leaks them.
 */
export function lifecycleFailure(error: unknown): AuthError {
  if (error instanceof LifecycleDeniedError) {
    return new AuthError(error.reasonCode, error.message, error.status);
  }
  return new AuthError(
    "ACCOUNT_OPERATION_FAILED",
    "The account operation could not be completed.",
    500,
  );
}

@UseGuards(OwnerAccessGuard)
@Controller("/api/admin/accounts")
export class AccountLifecycleController {
  constructor(
    @Inject(AccountLifecycleService)
    private readonly lifecycle: AccountLifecycleService,
  ) {}

  private base(request: OwnerRequest): Pick<
    LifecycleRequest,
    "actor" | "sessionId" | "idempotencyKey" | "requestId"
  > {
    const key = request.headers["x-portal-idempotency-key"];
    if (typeof key !== "string" || key.trim().length === 0) {
      throw new AuthError(
        "IDEMPOTENCY_KEY_REQUIRED",
        "Every account operation needs an x-portal-idempotency-key header.",
        400,
      );
    }
    return {
      actor: request.portalUser,
      sessionId: request.portalSession.sessionId,
      idempotencyKey: key.trim(),
      requestId: (request.headers["x-request-id"] as string | undefined) ?? null,
    };
  }

  // -------------------------------------------------------------- reads

  @Header("Cache-Control", "no-store")
  @Get()
  async roster() {
    return {
      schema_version: "portal.account-roster.v1",
      record_authority: "PORTAL_CONTROL",
      accounts: await this.lifecycle.roster(),
    };
  }

  @Header("Cache-Control", "no-store")
  @Get("/:user_id")
  async detail(@Param("user_id") userId: string) {
    try {
      const { account, history } = await this.lifecycle.detail(userId);
      return {
        schema_version: "portal.account-detail.v1",
        record_authority: "PORTAL_CONTROL",
        account,
        /*
         * The action history is the screen's "what has been done to this
         * account", so it publishes the operation's own words — including the
         * rollback description, which is the one field that tells an owner
         * what undoing it would mean.
         */
        history: history.map((entry) => ({
          operation_id: entry.operationId,
          action: entry.action,
          outcome: entry.outcome,
          reason_code: entry.reasonCode,
          actor_user_id: entry.actorUserId,
          expected_revision: entry.expectedRevision,
          resulting_revision: entry.resultingRevision,
          state_before: entry.stateBefore,
          state_after: entry.stateAfter,
          rollback_description: entry.rollbackDescription,
          step_up_used: entry.stepUpUsed,
          occurred_at: entry.occurredAt.toISOString(),
        })),
      };
    } catch (error) {
      throw lifecycleFailure(error);
    }
  }

  // ------------------------------------------------------------ mutations

  @Header("Cache-Control", "no-store")
  @Post()
  async create(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = CreateAccountSchema.safeParse(body);
    if (!parsed.success) throw new AuthError("INVALID_REQUEST", "Invalid account data.", 422);
    return this.run(request, {
      action: "CREATE_INVITED",
      username: parsed.data.username,
      displayName: parsed.data.display_name,
      role: parsed.data.role,
    });
  }

  @Header("Cache-Control", "no-store")
  @Patch("/:user_id")
  async update(
    @Req() request: OwnerRequest,
    @Param("user_id") userId: string,
    @Body() body: unknown,
  ) {
    const parsed = UpdateAccountSchema.safeParse(body);
    if (!parsed.success) throw new AuthError("INVALID_REQUEST", "Invalid account data.", 422);
    return this.run(request, {
      action: "UPDATE_PROFILE",
      targetUserId: userId,
      expectedRevision: parsed.data.expected_revision,
      displayName: parsed.data.display_name,
      role: parsed.data.role,
    });
  }

  @Header("Cache-Control", "no-store")
  @Post("/:user_id/activation")
  async activation(
    @Req() request: OwnerRequest,
    @Param("user_id") userId: string,
    @Body() body: unknown,
  ) {
    const parsed = ActivationSchema.safeParse(body);
    if (!parsed.success) throw new AuthError("INVALID_REQUEST", "Invalid request.", 422);
    return this.run(request, {
      action: "ISSUE_ACTIVATION",
      targetUserId: userId,
      expectedRevision: parsed.data.expected_revision,
      reissue: parsed.data.reissue,
    });
  }

  @Header("Cache-Control", "no-store")
  @Post("/:user_id/revoke-sessions")
  async revokeSessions(
    @Req() request: OwnerRequest,
    @Param("user_id") userId: string,
    @Body() body: unknown,
  ) {
    return this.simple(request, "REVOKE_SESSIONS", userId, body);
  }

  @Header("Cache-Control", "no-store")
  @Post("/:user_id/disable")
  async disable(
    @Req() request: OwnerRequest,
    @Param("user_id") userId: string,
    @Body() body: unknown,
  ) {
    return this.simple(request, "DISABLE", userId, body);
  }

  @Header("Cache-Control", "no-store")
  @Post("/:user_id/enable")
  async enable(
    @Req() request: OwnerRequest,
    @Param("user_id") userId: string,
    @Body() body: unknown,
  ) {
    return this.simple(request, "ENABLE", userId, body);
  }

  @Header("Cache-Control", "no-store")
  @Post("/:user_id/archive")
  async archive(
    @Req() request: OwnerRequest,
    @Param("user_id") userId: string,
    @Body() body: unknown,
  ) {
    return this.simple(request, "ARCHIVE", userId, body);
  }

  private async simple(
    request: OwnerRequest,
    action: LifecycleRequest["action"],
    userId: string,
    body: unknown,
  ) {
    const parsed = ActionSchema.safeParse(body);
    if (!parsed.success) {
      throw new AuthError(
        "INVALID_REQUEST",
        "This action needs the account revision you are acting on.",
        422,
      );
    }
    return this.run(request, {
      action,
      targetUserId: userId,
      expectedRevision: parsed.data.expected_revision,
    });
  }

  private async run(
    request: OwnerRequest,
    partial: Omit<LifecycleRequest, "actor" | "sessionId" | "idempotencyKey" | "requestId">,
  ) {
    try {
      const result = await this.lifecycle.execute({ ...this.base(request), ...partial });
      return {
        schema_version: "portal.account-operation.v1",
        outcome: result.outcome,
        operation_id: result.operation.operationId,
        account: {
          user_id: result.account.userId,
          username: result.account.username,
          account_revision: result.account.accountRevision,
        },
        rollback_description: result.operation.rollbackDescription,
        /*
         * §20.2 rule 7 · one view, and only on the response that minted it.
         *
         * A REPLAYED outcome never carries this: the idempotency record exists
         * so a retry can be answered truthfully, and re-revealing a credential
         * on every retry would turn "one view" into "as many views as the
         * network felt like". The field is absent rather than null so a client
         * cannot render an empty box where a token was.
         */
        ...(result.activationToken
          ? {
              activation: {
                token: result.activationToken,
                acknowledgement_required: true,
                note: "Shown once. It is stored nowhere and cannot be retrieved again; reissue to replace it.",
              },
            }
          : {}),
      };
    } catch (error) {
      if (error instanceof AuthError) throw error;
      throw lifecycleFailure(error);
    }
  }
}
