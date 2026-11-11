import { Controller, Get, Header, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import type { AuthSession, PortalUser } from "../domain";
import { ExecutionReadScopeError } from "../execution-v2/read-scope";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";

interface Request extends FastifyRequest { portalUser: PortalUser; portalSession: AuthSession; portalWorkspaceId: string; }

const text = z.string().min(1).max(256).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/);
const id = z.string().min(1).max(191).regex(/^[A-Za-z0-9._:-]+$(?![\s\S])/);
const workspaceOnly = z.object({ workspace_id: text.optional() }).strict();
const controlsQuery = z.object({ workspace_id: text.optional(), scope_type: text.optional(), scope_id: text.optional() }).strict();
const lifecycleQuery = z.object({ workspace_id: text.optional(), environment: z.enum(["paper", "sandbox", "live"]).optional() }).strict();
const blotterQuery = z.object({ workspace_id: text.optional(), environment: z.enum(["paper", "sandbox", "live"]).optional(), deployment_id: text.optional() }).strict();
const subjectQuery = z.object({ workspace_id: text.optional(), subject_type: text.optional(), subject_id: text.optional() }).strict();
const readinessQuery = z.object({ workspace_id: text.optional(), environment: z.enum(["paper", "sandbox", "live"]).optional() }).strict();
const SEARCH_KINDS = ["alpha", "portfolio", "account", "operation", "incident", "approval"] as const;
const searchKinds = z.enum(SEARCH_KINDS);
const searchQuery = z.object({
  q: z.string().min(1).max(128).regex(/^[^\u0000-\u001f\u007f]+$(?![\s\S])/),
  kinds: z.string().regex(/^(?:alpha|portfolio|account|operation|incident|approval)(?:,(?:alpha|portfolio|account|operation|incident|approval))*$/).optional(),
  limit: z.string().regex(/^[0-9]{1,2}$/).optional(),
  workspace_id: text.optional(),
}).strict();
const costQuery = z.object({ workspace_id: text.optional(), subject_type: text.optional(), subject_id: text.optional(), window: text.optional() }).strict();
/** The contracts' own subject kinds (execution-cost-events, -grants, -limits, -recovery-events, -report-snapshots all publish this enum). */
const subjectKind = z.enum(["ALPHA", "PORTFOLIO", "ACCOUNT", "DEPLOYMENT", "OPERATION", "INCIDENT", "APPROVAL"]);

/**
 * Typed absence for twelve contract-published reads that have no Portal producer yet (execution-controls, execution-alpha-lifecycle,
 * execution-incident-children, execution-portfolio-members, plus execution-blotter-summary, execution-cost-events, execution-grants,
 * execution-limits, execution-recovery-events, execution-report-snapshots, and since 11 Nov execution-alpha-readiness and execution-entity-search; each contract says "CONTRACT ONLY: no producer exists yet ... every screen
 * keeps its typed absence"). The body is the contract's own no-source answer: the envelope and the echoed ids, every section OMITTED,
 * which the contract defines as "no owning source". Nothing here reads a database or an Edge, mints a section, or states a count, a
 * state or a zero (the one stated value is the search groups' own typed `NOT_COMMISSIONED`, which says no source answers and is not a zero). Only a session with Execution read access to the workspace gets the answer; every other caller gets the same typed
 * 404 as a read that is not available. UNMOUNTED by default (see AppModule `typedAbsence`).
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution")
export class TypedAbsenceController {
  constructor(@Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository) {}

  @Get("/controls") @Header("Cache-Control", "private, no-store")
  async controls(@Req() request: Request, @Query() raw: unknown) {
    const query = controlsQuery.safeParse(raw);
    if (!query.success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.controls.v1", workspaceId, {});
  }

  @Get("/alphas/:alpha_id/lifecycle") @Header("Cache-Control", "private, no-store")
  async lifecycle(@Req() request: Request, @Param("alpha_id") alphaId: string, @Query() raw: unknown) {
    const query = lifecycleQuery.safeParse(raw);
    // AlphaLifecycleProblem publishes only EXECUTION_READ_NOT_AVAILABLE and EXECUTION_READ_CURRENT_ONLY (no query-invalid code, although
    // the 400 response names this schema), so an unreadable id or query is answered with the published 404, never an off-contract code.
    if (!query.success || !id.safeParse(alphaId).success) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    const workspaceId = await this.authorize(request, query.data.workspace_id, query.data.environment);
    return envelope("portal.execution.alpha-lifecycle.v1", workspaceId, { alpha_id: alphaId });
  }

  @Get("/operations/incidents/:incident_id/children") @Header("Cache-Control", "private, no-store")
  async incidentChildren(@Req() request: Request, @Param("incident_id") incidentId: string, @Query() raw: unknown) {
    const query = workspaceOnly.safeParse(raw);
    if (!query.success || !id.safeParse(incidentId).success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.incident-children.v1", workspaceId, { incident_id: incidentId });
  }

  @Get("/portfolios/:portfolio_id/members") @Header("Cache-Control", "private, no-store")
  async portfolioMembers(@Req() request: Request, @Param("portfolio_id") portfolioId: string, @Query() raw: unknown) {
    const query = workspaceOnly.safeParse(raw);
    if (!query.success || !id.safeParse(portfolioId).success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.portfolio-members.v1", workspaceId, { portfolio_id: portfolioId });
  }

  // The six reads below require a scope the body must name (the environment, or the subject): the body states only what the request itself
  // named and the Portal validated. A request that names none cannot be answered by any published shape, so it gets the published 404.

  @Get("/blotter/summary") @Header("Cache-Control", "private, no-store")
  async blotterSummary(@Req() request: Request, @Query() raw: unknown) {
    const query = blotterQuery.safeParse(raw);
    if (!query.success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id, query.data.environment);
    if (query.data.environment === undefined) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    // status_buckets and funnel stay omitted ("no owning source"): no bucket, no count and no zero is stated.
    return envelope("portal.execution.blotter-summary.v1", workspaceId, { environment: query.data.environment });
  }

  @Get("/cost-events") @Header("Cache-Control", "private, no-store")
  async costEvents(@Req() request: Request, @Query() raw: unknown) {
    return this.subjectRead("portal.execution.cost-events.v1", request, costQuery.safeParse(raw));
  }

  @Get("/grants") @Header("Cache-Control", "private, no-store")
  async grants(@Req() request: Request, @Query() raw: unknown) {
    return this.subjectRead("portal.execution.grants.v1", request, subjectQuery.safeParse(raw));
  }

  @Get("/limits") @Header("Cache-Control", "private, no-store")
  async limits(@Req() request: Request, @Query() raw: unknown) {
    return this.subjectRead("portal.execution.limits.v1", request, subjectQuery.safeParse(raw));
  }

  @Get("/recovery-events") @Header("Cache-Control", "private, no-store")
  async recoveryEvents(@Req() request: Request, @Query() raw: unknown) {
    return this.subjectRead("portal.execution.recovery-events.v1", request, subjectQuery.safeParse(raw));
  }

  @Get("/reports") @Header("Cache-Control", "private, no-store")
  async reports(@Req() request: Request, @Query() raw: unknown) {
    return this.subjectRead("portal.execution.report-snapshots.v1", request, subjectQuery.safeParse(raw));
  }

  /**
   * GAP-9. The contract's `items` is a section: omitted = "no owning source" (no alpha is listed, no `{met,total}` and no archive state is stated, and an
   * empty list would claim "no alpha"). The environment is echoed because the body must name what it is about; a request that names none is the 404.
   */
  @Get("/readiness") @Header("Cache-Control", "private, no-store")
  async readiness(@Req() request: Request, @Query() raw: unknown) {
    const query = readinessQuery.safeParse(raw);
    if (!query.success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id, query.data.environment);
    if (query.data.environment === undefined) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    return envelope("portal.execution.alpha-readiness.v1", workspaceId, { environment: query.data.environment });
  }

  /**
   * FE-023 command-bar search. No index exists, so every asked kind answers `NOT_COMMISSIONED` (total null, no rows): that is not "no match", and the bar
   * asks the kind's own list read instead. The query is echoed only when valid; an unreadable workspace gets the same 404 as every other read.
   */
  @Get("/search") @Header("Cache-Control", "private, no-store")
  async search(@Req() request: Request, @Query() raw: unknown) {
    const query = searchQuery.safeParse(raw);
    if (!query.success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const kinds = query.data.kinds === undefined ? [...SEARCH_KINDS] : query.data.kinds.split(",").map((kind) => searchKinds.parse(kind));
    const limit = query.data.limit === undefined ? 8 : Number(query.data.limit);
    if (new Set(kinds).size !== kinds.length || limit < 1 || limit > 50) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    return envelope("portal.execution.entity-search.v1", workspaceId, {
      query: { q: query.data.q, kinds, limit },
      groups: kinds.map((kind) => ({ kind, total_matched: null, rows: [] as never[], state: "NOT_COMMISSIONED" as const })),
    });
  }

  /** A subject read: the subject is echoed only when both halves are valid; every list/total section stays omitted. */
  private async subjectRead(schemaVersion: string, request: Request,
    query: { success: true; data: { workspace_id?: string; subject_type?: string; subject_id?: string } } | { success: false }) {
    if (!query.success) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const type = query.data.subject_type === undefined ? undefined : subjectKind.safeParse(query.data.subject_type);
    const subjectId = query.data.subject_id === undefined ? undefined : id.safeParse(query.data.subject_id);
    if (type?.success === false || subjectId?.success === false) throw new ExecutionReadScopeError("EXECUTION_READ_QUERY_INVALID", 400);
    const workspaceId = await this.authorize(request, query.data.workspace_id);
    if (type === undefined || subjectId === undefined) throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    return envelope(schemaVersion, workspaceId, { subject: { type: type.data, id: subjectId.data } });
  }

  /** The caller's own workspace unless a named one is readable; the same 404 for every refusal, so existence is never confirmed. */
  private async authorize(request: Request, named: string | undefined, environment?: string): Promise<string> {
    const workspaceId = named ?? request.portalWorkspaceId;
    if (!await this.workspaces.canReadExecution(workspaceId, request.portalUser.userId, environment))
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    return workspaceId;
  }
}

/** The contracts' required fields only; every optional section stays omitted ("no owning source"). */
function envelope(schemaVersion: string, workspaceId: string, ids: Record<string, unknown>) {
  return { schema_version: schemaVersion, workspace_id: workspaceId, ...ids, record_authority: "PORTAL_PROJECTION" as const, read_at_ms: Date.now() };
}
