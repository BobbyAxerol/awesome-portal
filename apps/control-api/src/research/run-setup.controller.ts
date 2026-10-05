import { Body, Controller, Get, HttpCode, Inject, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import type { ControlApiConfig } from "../config";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchDatasetIndexClient } from "./dataset-index.client";
import { ResearchFoundationService } from "./foundation.service";
import { ResearchMetadataRepository } from "./repository";
import { ResearchPreflightError } from "./preflight.error";
import { RunSetupContextSchema, WindowSuggestionRequestSchema, WindowSuggestionSchema, type RunSetupContext } from "./run-setup.contract";
import { runSetupOptions } from "./run-setup";

interface Request extends FastifyRequest {
  portalUser: PortalUser; portalWorkspaceId: string; portalSession: { csrfSecretHash: string };
}
/** Read-only setup: no child, token, source scan, artifact or job is created. */
@UseGuards(SessionGuard)
@Controller("/api/v1/research/runs")
export class ResearchRunSetupController {
  constructor(@Inject(ResearchMetadataRepository) private readonly repository: ResearchMetadataRepository,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(ResearchFoundationService) private readonly foundation: ResearchFoundationService,
    @Inject(ResearchDatasetIndexClient) private readonly client: ResearchDatasetIndexClient,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig) {}

  @Get("setup-options")
  async options(@Req() request: Request, @Query() raw: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const parsed = RunSetupContextSchema.safeParse(raw);
    if (!parsed.success) throw this.error("Invalid run setup context.", 400);
    reply.header("cache-control", "private, no-store");
    return this.load(request, parsed.data);
  }

  @Post("window-suggestions")
  @HttpCode(200)
  async suggest(@Req() request: Request, @Body() raw: unknown, @Res({ passthrough: true }) reply: FastifyReply) {
    const header = request.headers[CSRF_HEADER], cookie = csrfCookieFrom(request);
    if (typeof request.headers.origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)
      || typeof header !== "string" || !cookie || !constantTimeEqual(header, cookie)
      || !request.portalSession || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash))
      throw this.error("Window suggestion request security refused.", 403);
    const parsed = WindowSuggestionRequestSchema.safeParse(raw);
    if (!parsed.success) throw this.error("Invalid window suggestion request.", 400);
    const { profile_id, options_revision, start_utc_ms, end_exclusive_utc_ms, frequency, window_mode,
      train_window, initial_train_bars, ...context } = parsed.data;
    const options = await this.load(request, context);
    if (options.source_revision !== options_revision) throw this.error("Run setup changed. Reload setup options before applying a suggestion.", 409);
    const profile = options.profiles.find(row => row.profile_id === profile_id);
    if (!profile || profile.state !== "ENABLED") throw this.error(`Run setup is not enabled: ${profile?.reason_code ?? "PROFILE_NOT_FOUND"}.`, 409);
    if (profile.protocol === "three_window_decay" && [frequency, window_mode, train_window, initial_train_bars].some(value => value !== undefined))
      throw this.error("Advanced preferences do not apply to Three Window.", 400);
    const chosenFrequency = frequency ?? "weekly", chosenMode = window_mode ?? "expanding";
    if (profile.protocol === "advanced" && (!profile.frequencies.includes(chosenFrequency) || !profile.window_modes.includes(chosenMode)
      || (chosenMode === "rolling") !== (train_window !== undefined))) throw this.error("Frequency, window mode or training width is outside the selected profile.", 400);
    const metadata = await this.client.suggest(request.portalUser, {
      dataset_id: context.dataset_id, symbol: context.symbol, timeframe: context.timeframe,
      protocol: profile.protocol, warmup_bars: options.warmup_bars,
      max_span_days: profile.max_span_days, expected_catalog_revision: options.catalog_revision,
      ...(start_utc_ms === undefined ? {} : { start_utc_ms, end_exclusive_utc_ms }),
      ...(profile.protocol !== "advanced" ? {} : { frequency: chosenFrequency, window_mode: chosenMode,
        ...(train_window === undefined ? {} : { train_window }), ...(initial_train_bars === undefined ? {} : { initial_train_bars }) }),
    });
    reply.header("cache-control", "private, no-store");
    return WindowSuggestionSchema.parse({ schema_version: "research.window-suggestion.v1", context: options.context,
      profile_id, options_revision, scope: "EDITABLE_HEURISTIC_NOT_PREFLIGHT_OR_RUN_AUTHORIZATION",
      policy: "INDEXED_BAR_SPLIT_70_20_10_OR_HALF_INITIAL_IS_V1", metadata,
      fold_authority: "EXISTING_DECLARATION_ESTIMATE_AND_P08_PLANNER", preflight_required: true });
  }

  private async load(request: Request, context: RunSetupContext) {
    const workspace_id = context.workspace_id ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(workspace_id, request.portalUser.userId))) throw this.error("Workspace or AlphaVersion not found.", 404);
    const version = await this.repository.loadRunAdapterEligibility({workspaceId: workspace_id, actorUserId: request.portalUser.userId}, context.alpha_id, context.alpha_version_id);
    if (!version) throw this.error("Workspace or AlphaVersion not found.", 404);
    const [atlas, catalog] = await Promise.all([this.foundation.atlas(request.portalUser, {}), this.client.catalog(request.portalUser)]);
    if (atlas.selected_release_kind !== "CURRENT") throw this.error("Current release facts are unavailable.", 503);
    const guards = atlas.atlas.current_release.walk_forward_options?.temporal_guards;
    try {
      return runSetupOptions(request.portalUser, this.config, version, {...context, workspace_id}, atlas.portal_admission,
        catalog, guards ? {label_horizon_bars: guards.release_default, purge_bars: guards.release_default, embargo_bars: guards.release_default} : null);
    } catch { throw this.error("AlphaVersion setup declaration is unavailable.", 503); }
  }
  private error(message: string, status: 400 | 403 | 404 | 409 | 503) {
    return new ResearchPreflightError(status === 404 ? "RESEARCH_PREFLIGHT_NOT_FOUND" : status === 503 ? "RESEARCH_PREFLIGHT_UNAVAILABLE"
      : status === 409 ? "RESEARCH_PREFLIGHT_REJECTED" : "RESEARCH_PREFLIGHT_INVALID", message, status);
  }
}
