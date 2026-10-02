import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { ControlApiConfig, querySigningKeys } from "../config";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { KeysetCursorCodec } from "../query";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { constantTimeEqual, sha256 } from "../auth/argon";
import { csrfCookieFrom, CSRF_HEADER, originAllowed } from "../auth/cookies";
import { ResearchMetadataRepository } from "./repository";
import { ResearchFoundationService } from "./foundation.service";
import { projectResearchAlphaVersionDeclaration } from "./alpha-version-declaration";
import { declarationConditions } from "./declaration-conditions";
import { assertDeclaredOptimization } from "./preflight.service";
import { ResearchDatasetIndexClient } from "./dataset-index.client";
import { BarMetadataQuery, DatasetId, DeclarationEstimateRequestSchema, DeclarationEstimateSchema, IndexedCatalogQuery, SymbolPageQuery, SymbolPageSchema } from "./dataset-index.contract";
import { ResearchPreflightError } from "./preflight.error";
import { ResearchDatasetIndexError } from "./dataset-index.error";
interface Request extends FastifyRequest { portalUser: PortalUser; portalWorkspaceId: string; portalSession: {csrfSecretHash: string}; }

@UseGuards(SessionGuard)
@Controller("/api/v1/research/datasets")
export class ResearchDatasetIndexController {
  private readonly cursors: KeysetCursorCodec;
  constructor(@Inject(ResearchDatasetIndexClient) private readonly client: ResearchDatasetIndexClient,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) private readonly config: ControlApiConfig,
    @Inject(ResearchMetadataRepository) private readonly metadataRepository: ResearchMetadataRepository,
    @Inject(ResearchFoundationService) private readonly foundation: ResearchFoundationService) {
    this.cursors = new KeysetCursorCodec({ activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID, keys: querySigningKeys(config), ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS });
  }
  private async scope(request: Request, workspace?: string): Promise<string> {
    const id = workspace ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(id, request.portalUser.userId))) throw this.missing();
    return id;
  }
  private missing() { return new ResearchPreflightError("RESEARCH_PREFLIGHT_NOT_FOUND", "Dataset or workspace not found.", 404); }
  private invalid() { return new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Invalid historical metadata query.", 400); }
  private aligned(timeframe: string, bounds: Array<[string, number]>) {
    const parsed = /^([1-9][0-9]*)(min|m|h|d)$/i.exec(timeframe);
    if (!parsed) throw this.invalid();
    const step = Number(parsed[1]) * ({min:60_000,m:60_000,h:3_600_000,d:86_400_000}[parsed[2].toLowerCase()] ?? 0);
    const failed = bounds.filter(([, value]) => Number.isFinite(value) && value % step !== 0).map(([key]) => key.split("."));
    if (failed.length) throw new ResearchDatasetIndexError({gate:"window_alignment",field_paths:failed});
  }

  @Post("declaration-estimates")
  @HttpCode(200)
  async estimate(@Req() request: Request, @Body() raw: unknown) {
    const header = request.headers[CSRF_HEADER], cookie = csrfCookieFrom(request);
    if (typeof request.headers.origin !== "string" || !originAllowed(request, this.config.PORTAL_PUBLIC_ORIGIN)
      || typeof header !== "string" || !cookie || !constantTimeEqual(header, cookie)
      || !request.portalSession || !constantTimeEqual(sha256(header), request.portalSession.csrfSecretHash))
      throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Declaration request security refused.", 403);
    const parsed = DeclarationEstimateRequestSchema.safeParse(raw);
    if (!parsed.success) throw this.invalid();
    const workspaceId = await this.scope(request, parsed.data.workspace_id), spec = parsed.data.requested_spec;
    const windows = spec.walk_forward ? {walk_forward:spec.walk_forward} : spec.windows ? Object.fromEntries(Object.entries(spec.windows).map(([key, value]) => [`windows.${key}`,value])) : {};
    this.aligned(spec.data.timeframe, Object.entries(windows).flatMap(([key,value]) => [[`${key}.start`,Date.parse(value.start)], [`${key}.end_exclusive`,Date.parse(value.end_exclusive)]] as Array<[string,number]>));
    if (!spec.alpha_binding) throw new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Bind an AlphaVersion to estimate its declaration.", 409);
    const binding = await this.metadataRepository.loadAlphaVersionDataContract({workspaceId, actorUserId: request.portalUser.userId},
      spec.alpha_binding.alpha_id, spec.alpha_binding.alpha_version_id);
    let declaration: ReturnType<typeof projectResearchAlphaVersionDeclaration>;
    try { declaration = projectResearchAlphaVersionDeclaration(binding.declaredContract, binding.entrypoint); }
    catch { throw new ResearchPreflightError("RESEARCH_PREFLIGHT_REJECTED", "AlphaVersion declaration unavailable.", 409); }
    const [metadata, atlas] = await Promise.all([
      this.client.estimate(request.portalUser, spec, declaration.warmup_bars),
      this.foundation.atlas(request.portalUser, {}),
    ]);
    if (atlas.selected_release_kind !== "CURRENT") throw this.invalid();
    const result = declarationConditions(spec, metadata, atlas.portal_admission.profiles, declaration.timeframes);
    let declarationPass = true;
    try { assertDeclaredOptimization(binding, spec); }
    catch (error) { if (!(error instanceof ResearchPreflightError)) throw error; declarationPass = false; }
    result.conditions.push({key:"alpha_parameters", state: declarationPass ? "PASS" : "FAIL",
      reason_code: declarationPass ? null : "ALPHA_OPTIMIZATION_DECLARATION_REFUSED", observed:null,
      required:"Overrides and seed satisfy the bound AlphaVersion declaration"});
    result.ready_for_preflight = result.conditions.every(row => row.state === "PASS");
    return DeclarationEstimateSchema.parse(result);
  }

  @Get("catalog-v2")
  async catalog(@Req() request: Request, @Query() raw: unknown) {
    const query = IndexedCatalogQuery.safeParse(raw);
    if (!query.success) throw this.invalid();
    await this.scope(request, query.data.workspace_id);
    return this.client.catalog(request.portalUser);
  }

  @Get(":dataset_id/symbols")
  async symbols(@Req() request: Request, @Param("dataset_id") datasetId: string, @Query() raw: unknown) {
    const query = SymbolPageQuery.safeParse(raw);
    if (!query.success || !DatasetId.safeParse(datasetId).success) throw this.invalid();
    const workspace = await this.scope(request, query.data.workspace_id);
    const catalog = await this.client.catalog(request.portalUser), dataset = catalog.datasets.find(row => row.dataset_id === datasetId);
    if (!dataset) throw this.missing();
    if (dataset.symbols.truncated) throw new ResearchPreflightError("RESEARCH_PREFLIGHT_UNAVAILABLE", "Symbol metadata exceeds the bounded catalog.", 503);
    // Page identity binds ALL metadata, including namespace listing drift; never
    // re-use a cursor on a changed partial index/catalog under the same source pin.
    const revision = createHash("sha256").update(JSON.stringify(dataset)).digest("hex");
    const resourceId = `research-dataset-symbols:${datasetId}`;
    const fingerprint = createHash("sha256").update(JSON.stringify([revision, query.data.q.toUpperCase(), query.data.kind, query.data.timeframe, query.data.limit])).digest("hex");
    let after: string | undefined;
    if (query.data.cursor) {
      try {
        const [bound] = this.cursors.decode(query.data.cursor, { resourceId, workspaceId: workspace, direction: "after", queryFingerprint: fingerprint, boundarySize: 1 });
        if (typeof bound !== "string") throw this.invalid();
        after = bound;
      } catch { throw this.invalid(); }
    }
    const named = dataset.symbols.items.filter(row => row.symbol.includes(query.data.q.toUpperCase())
      && (!query.data.kind || row.contract_kind === query.data.kind));
    const incompleteFilter = !!query.data.timeframe && named.some(row => !row.coverage_by_timeframe.some(c => c.timeframe === query.data.timeframe));
    const matching = named.filter(row => !query.data.timeframe || row.coverage_by_timeframe.some(c => c.timeframe === query.data.timeframe && c.availability === "AVAILABLE"))
      .sort((a,b) => a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0);
    const remaining = matching.filter(row => !after || row.symbol > after), items = remaining.slice(0, query.data.limit);
    const next = remaining.length > items.length ? this.cursors.encode({ resource_id: resourceId, workspace_id: workspace,
      direction: "after", query_fingerprint: fingerprint, boundary: [items.at(-1)!.symbol] }) : null;
    return SymbolPageSchema.parse({ schema_version: "research.dataset-symbols.v1", dataset_id: datasetId,
      catalog_revision: revision, as_of_utc_ms: catalog.as_of_utc_ms,
      availability: dataset.symbols.state !== "PUBLISHED" ? { state: "NOT_PUBLISHED", reason_code: "HMD_SYMBOL_LIST_NOT_PUBLISHED" }
        : incompleteFilter ? { state: "NOT_PUBLISHED", reason_code: "HMD_TIMEFRAME_FILTER_COVERAGE_PARTIAL" } : { state: "AVAILABLE", reason_code: null },
      items, total: dataset.symbols.state === "PUBLISHED" && !incompleteFilter ? matching.length : null, next_cursor: next });
  }

  @Get(":dataset_id/bar-metadata")
  async metadata(@Req() request: Request, @Param("dataset_id") datasetId: string, @Query() raw: unknown) {
    const query = BarMetadataQuery.safeParse(raw);
    if (!query.success || !DatasetId.safeParse(datasetId).success) throw this.invalid();
    await this.scope(request, query.data.workspace_id);
    this.aligned(query.data.timeframe, [["start_utc_ms",query.data.start_utc_ms],["end_exclusive_utc_ms",query.data.end_exclusive_utc_ms]]);
    const catalog = await this.client.catalog(request.portalUser);
    if (!catalog.datasets.some(row => row.dataset_id === datasetId)) throw this.missing();
    const { workspace_id, ...params } = query.data;
    return this.client.metadata(request.portalUser, { dataset_id: datasetId, ...params });
  }
}
