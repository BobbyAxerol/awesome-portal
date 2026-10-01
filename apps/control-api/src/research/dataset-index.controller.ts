import { Controller, Get, Inject, Param, Query, Req, UseGuards } from "@nestjs/common";
import type { FastifyRequest } from "fastify";
import { createHash } from "node:crypto";
import { ControlApiConfig, querySigningKeys } from "../config";
import type { PortalUser } from "../domain";
import { SessionGuard } from "../facade/session.guard";
import { KeysetCursorCodec } from "../query";
import { WorkspacesRepository } from "../repos/workspaces";
import { CONTROL_API_CONFIG } from "../tokens";
import { ResearchDatasetIndexClient } from "./dataset-index.client";
import { BarMetadataQuery, DatasetId, IndexedCatalogQuery, SymbolPageQuery, SymbolPageSchema } from "./dataset-index.contract";
import { ResearchPreflightError } from "./preflight.error";
interface Request extends FastifyRequest { portalUser: PortalUser; portalWorkspaceId: string; }

@UseGuards(SessionGuard)
@Controller("/api/v1/research/datasets")
export class ResearchDatasetIndexController {
  private readonly cursors: KeysetCursorCodec;
  constructor(@Inject(ResearchDatasetIndexClient) private readonly client: ResearchDatasetIndexClient,
    @Inject(WorkspacesRepository) private readonly workspaces: WorkspacesRepository,
    @Inject(CONTROL_API_CONFIG) config: ControlApiConfig) {
    this.cursors = new KeysetCursorCodec({ activeKeyId: config.QUERY_CURSOR_ACTIVE_KEY_ID, keys: querySigningKeys(config), ttlSeconds: config.QUERY_CURSOR_TTL_SECONDS });
  }
  private async scope(request: Request, workspace?: string): Promise<string> {
    const id = workspace ?? request.portalWorkspaceId;
    if (!(await this.workspaces.isMember(id, request.portalUser.userId))) throw this.missing();
    return id;
  }
  private missing() { return new ResearchPreflightError("RESEARCH_PREFLIGHT_NOT_FOUND", "Dataset or workspace not found.", 404); }
  private invalid() { return new ResearchPreflightError("RESEARCH_PREFLIGHT_INVALID", "Invalid historical metadata query.", 400); }

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
    const catalog = await this.client.catalog(request.portalUser);
    if (!catalog.datasets.some(row => row.dataset_id === datasetId)) throw this.missing();
    const { workspace_id, ...params } = query.data;
    return this.client.metadata(request.portalUser, { dataset_id: datasetId, ...params });
  }
}
