import { Body, CanActivate, Controller, Delete, Get, Header, Inject, Injectable, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { Pool } from "pg";

import { AuthError } from "../auth/auth.service";
import type { PortalUser } from "../domain";
import type { ControlApiConfig } from "../config";
import { CONTROL_API_CONFIG, CONTROL_API_POOL } from "../tokens";
import { defaultWorkspaceGrantsEnabled, EXECUTION_ENVIRONMENTS } from "../execution/default-execution-workspace";
import { listDefaultExecutionGrants, listGrantCandidates, MAX_GRANT_TERM_DAYS, parseGrantEnvironments, provisionDefaultExecutionGrant } from "../execution/default-execution-grants";
import { AccountLifecycleService } from "./account-lifecycle.service";
import { OwnerAccessGuard } from "./owner-access.guard";

/** `/api/admin/execution-grants` — owner-only HTTP face of the DR-30 default execution grants.
 * It calls the SAME `provisionDefaultExecutionGrant` the `execution-default-grant` CLI calls (no second implementation), so
 * validation, the owner/workspace checks and the DR30_DEFAULT_EXECUTION_GRANT_* audit rows are identical. The flag guard runs
 * first: with FEATURE_EXECUTION_DEFAULT_WORKSPACE_GRANTS off (or no projection workspace) every route is a plain 404.
 * Mutations additionally need Origin+CSRF and the owner anchor (OwnerAccessGuard), an active step-up, and an idempotency key.
 * The operations are state-setting, so a replay is a no-op rather than a second effect. The effect is immediate: the read
 * path evaluates the row on every request. */
@Injectable()
export class DefaultGrantsFlagGuard implements CanActivate {
  constructor(@Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}
  canActivate(): boolean {
    if (!defaultWorkspaceGrantsEnabled(this.config)) throw new NotFoundException();
    return true;
  }
}

const Environments = z.array(z.enum(EXECUTION_ENVIRONMENTS as unknown as [string, ...string[]])).min(1).max(EXECUTION_ENVIRONMENTS.length);
const Term = z.number().int().min(1).max(MAX_GRANT_TERM_DAYS).optional();
const GrantSchema = z.object({ username: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/), environments: Environments, term_days: Term }).strict();
const RenewSchema = z.object({ environments: Environments, term_days: Term }).strict();
const UsernameParam = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/);

interface OwnerRequest extends FastifyRequest { portalUser: PortalUser; portalSession: { sessionId: string } }

const REFUSALS: Record<string, [string, string, number]> = {
  DR30_ENVIRONMENTS_REQUIRED_EXPLICIT: ["ENVIRONMENTS_REQUIRED", "Choose at least one environment explicitly.", 422],
  DR30_TERM_OUT_OF_RANGE: ["TERM_OUT_OF_RANGE", `The term must be between 1 and ${MAX_GRANT_TERM_DAYS} days.`, 422],
  DR30_ACTIVE_OWNER_AND_VIEWER_REQUIRED: ["ACCOUNT_NOT_ELIGIBLE", "That account does not exist, is not active, or has not finished activation.", 404],
  DR30_OWNER_NEEDS_NO_GRANT: ["OWNER_NEEDS_NO_GRANT", "The owner already has access and needs no grant.", 422],
  DR30_OWNER_WORKSPACE_REQUIRED: ["EXECUTION_WORKSPACE_NOT_OWNED", "The execution workspace is not owned by the active owner.", 409],
  DR30_GRANT_REFUSED: ["GRANT_REFUSED", "This grant cannot be issued.", 422],
};
function failure(error: unknown): AuthError {
  if (error instanceof AuthError) return error;
  const known = error instanceof Error ? REFUSALS[error.message] : undefined;
  if (known) return new AuthError(known[0], known[1], known[2]);
  return new AuthError("EXECUTION_GRANT_OPERATION_FAILED", "The access change could not be completed.", 500);
}

@UseGuards(DefaultGrantsFlagGuard, OwnerAccessGuard)
@Controller("/api/admin/execution-grants")
export class ExecutionDefaultGrantsController {
  constructor(
    @Inject(CONTROL_API_POOL) private readonly pool: Pool,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(AccountLifecycleService) private readonly lifecycle: AccountLifecycleService,
  ) {}

  private async mutationPreconditions(request: OwnerRequest) {
    const key = request.headers["x-portal-idempotency-key"];
    if (typeof key !== "string" || !/^[A-Za-z0-9._:-]{8,128}$/.test(key.trim()))
      throw new AuthError("IDEMPOTENCY_KEY_REQUIRED", "Every access change needs an x-portal-idempotency-key header.", 400);
    if (!(await this.lifecycle.stepUpExpiry(request.portalSession.sessionId)))
      throw new AuthError("STEP_UP_REQUIRED", "Re-enter your password to confirm this action.", 403);
  }

  private present(result: Awaited<ReturnType<typeof provisionDefaultExecutionGrant>>) {
    return {
      schema_version: "portal.execution-default-grant-change.v1", record_authority: "PORTAL_CONTROL",
      outcome: result.changed ? ("kind" in result ? result.kind : "APPLIED") : "NO_CHANGE",
      workspace_id: result.workspace_id, user_id: result.viewer_id,
      environments: "environments" in result ? result.environments : [], scope: result.scope, writes: false, membership_changes: 0,
    };
  }

  @Header("Cache-Control", "no-store")
  @Get()
  async list() {
    try {
      const [grants, candidates] = await Promise.all([listDefaultExecutionGrants(this.pool, this.config), listGrantCandidates(this.pool)]);
      return { schema_version: "portal.execution-default-grants.v1", record_authority: "PORTAL_CONTROL", scope: "DEFAULT_EXECUTION_READ_ONLY",
        workspace_id: this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID, max_term_days: MAX_GRANT_TERM_DAYS,
        environments: [...EXECUTION_ENVIRONMENTS], grants, candidates };
    } catch (error) { throw failure(error); }
  }

  @Header("Cache-Control", "no-store")
  @Post()
  async grant(@Req() request: OwnerRequest, @Body() body: unknown) {
    const parsed = GrantSchema.safeParse(body);
    if (!parsed.success) throw new AuthError("INVALID_REQUEST", "Invalid access change.", 422);
    await this.mutationPreconditions(request);
    try {
      const existing = (await listDefaultExecutionGrants(this.pool, this.config, parsed.data.username)).find(row => row.status === "ACTIVE");
      if (existing) throw new AuthError("GRANT_ALREADY_ACTIVE", "This account already has an active grant. Renew it instead.", 409);
      return this.present(await provisionDefaultExecutionGrant(this.pool, this.config,
        { username: parsed.data.username, environments: parseGrantEnvironments(parsed.data.environments.join(",")), termDays: parsed.data.term_days }));
    } catch (error) { throw failure(error); }
  }

  @Header("Cache-Control", "no-store")
  @Post("/:username/renew")
  async renew(@Req() request: OwnerRequest, @Param("username") username: string, @Body() body: unknown) {
    const name = UsernameParam.safeParse(username), parsed = RenewSchema.safeParse(body);
    if (!name.success || !parsed.success) throw new AuthError("INVALID_REQUEST", "Invalid access change.", 422);
    await this.mutationPreconditions(request);
    try {
      const existing = (await listDefaultExecutionGrants(this.pool, this.config, name.data)).find(row => row.status === "ACTIVE");
      if (!existing) throw new AuthError("GRANT_NOT_ACTIVE", "This account has no active grant to renew. Issue a new one.", 404);
      return this.present(await provisionDefaultExecutionGrant(this.pool, this.config,
        { username: name.data, environments: parseGrantEnvironments(parsed.data.environments.join(",")), termDays: parsed.data.term_days }));
    } catch (error) { throw failure(error); }
  }

  @Header("Cache-Control", "no-store")
  @Delete("/:username")
  async revoke(@Req() request: OwnerRequest, @Param("username") username: string) {
    const name = UsernameParam.safeParse(username);
    if (!name.success) throw new AuthError("INVALID_REQUEST", "Invalid access change.", 422);
    await this.mutationPreconditions(request);
    try { return this.present(await provisionDefaultExecutionGrant(this.pool, this.config, { username: name.data, revoke: true })); }
    catch (error) { throw failure(error); }
  }
}
