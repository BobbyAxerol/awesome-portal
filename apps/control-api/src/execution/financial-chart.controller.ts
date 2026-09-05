import { Controller, Get, Inject, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { z } from "zod";
import { ControlApiConfig } from "../config";
import type { AuthSession, PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import {
  EDS07_DECISION_KINDS,
  EDS07_FINANCIAL_METRICS,
  ExecutionFinancialChartService,
  FinancialChartError,
} from "./financial-chart.service";

interface FinancialChartRequest extends FastifyRequest {
  portalUser: PortalUser;
  portalWorkspaceId: string;
  portalSession: AuthSession;
}

const SUBJECT_ID = /^[A-Za-z0-9._:@-]{1,191}$/;
const UTC_MS = z.coerce.number().int().safe().min(-8_640_000_000_000_000).max(8_640_000_000_000_000);
const BooleanQuery = z.preprocess(
  (value) => value === "true" || value === true ? true : value === "false" || value === false ? false : value,
  z.boolean(),
);

const ChartQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  environment: z.enum(["paper", "sandbox", "live"]),
  subject_kind: z.enum(["alpha", "deployment", "account", "portfolio"]),
  subject_id: z.string().regex(SUBJECT_ID),
  metric: z.enum(EDS07_FINANCIAL_METRICS).default("equity"),
  from_ms: UTC_MS.optional(),
  to_ms: UTC_MS.optional(),
  viewport_px: z.coerce.number().int().min(256).max(2048).default(960),
  include_benchmark: BooleanQuery.default(false),
}).strict().superRefine((value, context) => {
  if (value.from_ms !== undefined && value.to_ms !== undefined && value.from_ms > value.to_ms) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to_ms"], message: "to_ms must not precede from_ms" });
  }
});

const DecisionQuerySchema = z.object({
  workspace_id: z.string().trim().min(1).max(96).optional(),
  environment: z.enum(["paper", "sandbox", "live"]),
  subject_kind: z.enum(["alpha", "deployment", "account", "portfolio"]),
  subject_id: z.string().regex(SUBJECT_ID),
  decision_kind: z.enum(EDS07_DECISION_KINDS),
  from_ms: UTC_MS.optional(),
  to_ms: UTC_MS.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  after: z.string().regex(/^fqc1\.[0-9a-f-]{36}$/).max(64).optional(),
}).strict().superRefine((value, context) => {
  if (value.from_ms !== undefined && value.to_ms !== undefined && value.from_ms > value.to_ms) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["to_ms"], message: "to_ms must not precede from_ms" });
  }
});

/**
 * Named, same-origin consumer endpoints.  Query syntax intentionally has no
 * `relation`, source cursor, Edge endpoint, JWT or certificate input.
 */
@UseGuards(SessionGuard)
@Controller("/api/v1/execution/views")
export class ExecutionFinancialChartController {
  constructor(
    @Inject(ExecutionFinancialChartService) private readonly charts: ExecutionFinancialChartService,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
  ) {}

  @Get("/equity-chart")
  async chart(@Req() request: FinancialChartRequest, @Query() raw: unknown) {
    const query = ChartQuerySchema.safeParse(raw);
    if (!query.success) throw new FinancialChartError("EDS07_CHART_QUERY_INVALID", 400);
    const workspaceId = await this.authorizeWorkspace(request, query.data.workspace_id);
    return this.charts.chart(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      {
        environment: query.data.environment,
        subject: { kind: query.data.subject_kind, id: query.data.subject_id },
        metric: query.data.metric,
        fromMs: query.data.from_ms ?? null,
        toMs: query.data.to_ms ?? null,
        viewportPx: query.data.viewport_px,
        includeBenchmark: query.data.include_benchmark,
      },
    );
  }

  @Get("/risk-decisions")
  async decisions(@Req() request: FinancialChartRequest, @Query() raw: unknown) {
    const query = DecisionQuerySchema.safeParse(raw);
    if (!query.success) throw new FinancialChartError("EDS07_DECISION_QUERY_INVALID", 400);
    const workspaceId = await this.authorizeWorkspace(request, query.data.workspace_id);
    return this.charts.decisionRecords(
      { user: request.portalUser, session: request.portalSession, workspaceId },
      {
        environment: query.data.environment,
        subject: { kind: query.data.subject_kind, id: query.data.subject_id },
        decisionKind: query.data.decision_kind,
        fromMs: query.data.from_ms ?? null,
        toMs: query.data.to_ms ?? null,
        limit: query.data.limit,
        after: query.data.after ?? null,
      },
    );
  }

  private async authorizeWorkspace(request: FinancialChartRequest, requestedWorkspace: string | undefined): Promise<string> {
    const workspaceId = requestedWorkspace ?? request.portalWorkspaceId;
    // A caller cannot use membership in one workspace to relabel the lone
    // accepted execution mirror owned by another workspace.
    if (workspaceId !== this.config.EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID) {
      throw new FinancialChartError("EDS07_PROJECTION_WORKSPACE_NOT_FOUND", 404);
    }
    if (!(await this.workspaces.isMember(workspaceId, request.portalUser.userId))) {
      throw new FinancialChartError("WORKSPACE_NOT_FOUND", 404);
    }
    return workspaceId;
  }
}
