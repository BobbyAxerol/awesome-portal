import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { OperationalCompositionService } from "./operational-composition.service";
import { PortalDerivationError } from "./portal-derivations.service";
import { OperationQueueQuerySchema } from "../operations/contracts";

/** The raw query as an object; the guards below decide what any of it means. */
function asQuery(raw: unknown): Record<string, unknown> {
  return typeof raw === "object" && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

interface CompositionRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const QuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  view: z.enum(["r1", "r2", "live"]).optional(),
}).strict();

/**
 * The two routes that stand in for a paging screen also carry that screen's
 * own filter and cursor, so the principal cannot be parsed strictly here — it
 * would reject the screen's query before the screen's own schema ever saw it.
 * Only `workspace_id` is read; every other key is handed to the builder that
 * owns it (`OperationQueueQuerySchema`, `governanceConditionsQuery`), which is
 * where it is validated. The other five routes keep the strict schema.
 */
const PrincipalOnlySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
}).passthrough();
const RESOURCE_ID = /^[A-Za-z0-9._:@-]{1,191}$/;

@UseGuards(SessionGuard)
@Controller("/api/v1/execution/compositions")
export class OperationalCompositionController {
  constructor(
    @Inject(OperationalCompositionService) private readonly compositions: OperationalCompositionService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/approvals/:approval_id")
  async approval(@Req() request: CompositionRequest, @Param("approval_id") approvalId: string, @Query() raw: unknown) {
    this.assertId(approvalId);
    const principal = await this.principal(request, raw);
    return this.compositions.approval(principal, approvalId, QuerySchema.parse(raw).view ?? "r1");
  }

  @Get("/exit-reviews/:review_id")
  async exitReview(@Req() request: CompositionRequest, @Param("review_id") reviewId: string, @Query() raw: unknown) {
    this.assertId(reviewId);
    return this.compositions.exitReview(await this.principal(request, raw), reviewId);
  }

  /**
   * The register's own filter and cursor come through unchanged, so this route
   * can stand in for the standalone one instead of being fetched beside it.
   * Validation stays where it already lives — `governanceConditionsQuery`
   * rejects anything it does not recognise.
   */
  @Get("/waivers")
  async waivers(@Req() request: CompositionRequest, @Query() raw: unknown) {
    const principal = await this.principal(request, raw, PrincipalOnlySchema);
    return this.compositions.waiversRegister(principal, asQuery(raw));
  }

  /** Same substitution rule; the queue's triage filter and keyset come through. */
  @Get("/operations")
  async operations(@Req() request: CompositionRequest, @Query() raw: unknown) {
    const principal = await this.principal(request, raw, PrincipalOnlySchema);
    const parsed = OperationQueueQuerySchema.safeParse(asQuery(raw));
    if (!parsed.success) {
      throw new PortalDerivationError("EDS05_OPERATION_QUEUE_QUERY_INVALID", 400, "Invalid operation queue query.");
    }
    return this.compositions.operationsQueue(principal, parsed.data as Record<string, unknown>);
  }

  @Get("/incidents/:incident_id")
  async incident(@Req() request: CompositionRequest, @Param("incident_id") incidentId: string, @Query() raw: unknown) {
    this.assertId(incidentId);
    return this.compositions.incidentDetail(await this.principal(request, raw), incidentId);
  }

  @Get("/command-center")
  async commandCenter(@Req() request: CompositionRequest, @Query() raw: unknown) {
    return this.compositions.commandCenterSnapshot(await this.principal(request, raw));
  }

  @Get("/admin-action-drawer")
  async adminActionDrawer(@Req() request: CompositionRequest, @Query() raw: unknown) {
    return this.compositions.adminActionDrawer(await this.principal(request, raw));
  }

  private assertId(value: string): void {
    if (!RESOURCE_ID.test(value)) throw new PortalDerivationError("EDS05_RESOURCE_ID_INVALID", 400, "Invalid resource id.");
  }

  private async principal(request: CompositionRequest, raw: unknown, schema: z.ZodTypeAny = QuerySchema) {
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new PortalDerivationError("EDS05_QUERY_INVALID", 400, "Invalid composition query.");
    // An unqualified read means the projection's own workspace, not the
    // session's personal one (DR-30); membership still decides access.
    const workspaceId = parsed.data.workspace_id
      ?? this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID
      ?? request.portalWorkspaceId;
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
      throw new PortalDerivationError("EDS05_PROJECTION_WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    }
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new PortalDerivationError("WORKSPACE_NOT_FOUND", 404, "Workspace not found.");
    }
    return { user: request.portalUser, session: request.portalSession, workspaceId };
  }
}
