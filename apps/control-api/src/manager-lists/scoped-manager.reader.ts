import { ControlApiConfig, querySigningKeys } from "../config";
import { accessDigest } from "../execution-v2/access-policy";
import { projectionRowVisible } from "../execution-v2/read-projection";
import { ExecutionReadScopeError, ExecutionReadScopes, scopeAllowsField, scopeReadPopulation, scopeResources,
  type AuthorizedExecutionReadScope, type ReadScopePrincipal } from "../execution-v2/read-scope";
import { ExecutionProfileProjectionRepository, type ProfileProjectionSnapshot, type ProjectionEnvironment } from "../execution/profile-projection.repository";
import { KeysetCursorCodec } from "../query/cursor";
import { type AlphaFleetQuery, type BindingsQuery, type PortfolioListQuery, MANAGER_LIST_ENVIRONMENTS } from "./contracts";
import { managerScopedFactsSchema, scopedManagerResponseSchema, type ScopedManagerItem } from "./scoped-manager.contract";

type Surface = "ALPHA_FLEET" | "PORTFOLIOS" | "BINDINGS" | "BINDING_DETAIL";
type Query = AlphaFleetQuery | BindingsQuery | PortfolioListQuery;
type Facts = Record<string, unknown>;
type Branch = { scope: AuthorizedExecutionReadScope; snapshot: ProfileProjectionSnapshot | null; missingSnapshot: boolean };
function fail(code: "EXECUTION_READ_NOT_AVAILABLE" | "EXECUTION_READ_AUTHORITY_UNAVAILABLE" | "EXECUTION_READ_ACCESS_CHANGED" |
  "EXECUTION_READ_FIELD_POLICY_PENDING" | "EXECUTION_READ_SCOPE_LIMIT", status: number): never {
  throw new ExecutionReadScopeError(code, status);
}
const resourceKey = (item: ScopedManagerItem) => JSON.stringify([item.environment, item.identity.alpha_id ?? null,
  item.identity.alpha_version_id ?? null, item.identity.portfolio_id ?? null, item.identity.binding_id ?? null]);
const decimals = new Set(["allocation", "balance_total", "balance_free", "balance_locked", "realized_pnl", "unrealized_pnl", "net_pnl", "exposure"]);
const decimal = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$(?![\s\S])/;

/** Reads the committed raw profile document, never the legacy pre-aggregated
 * Manager tables. Each environment mints its own authority before rows can
 * influence joins, filtering, order, totals or cursors. No refresh/cache write.
 */
export class ScopedManagerReader {
  constructor(private readonly repository: ExecutionProfileProjectionRepository,
    private readonly scopes: ExecutionReadScopes, private readonly config: ControlApiConfig) {}

  async read(principal: ReadScopePrincipal, surface: Surface, query: Query,
    legacy: () => Promise<unknown>, bindingId?: string): Promise<unknown> {
    const environments = query.environment === "all" ? MANAGER_LIST_ENVIRONMENTS : [query.environment];
    const branches: Branch[] = [];
    const dispositions: Array<{ environment: ProjectionEnvironment; state: "PARTIAL" | "DENIED" | "UNAVAILABLE"; reason_code: string | null }> = [];
    for (const environment of environments) {
      try {
      const profileId = this.profile(environment);
      const metadata = await this.repository.snapshotMetadata(principal.workspaceId, environment, profileId);
      const scope = await this.scopes.authorize(principal, { environment, profileId }, {
        action: surface === "ALPHA_FLEET" ? "alpha.read" : surface === "PORTFOLIOS" ? "portfolio.read_restricted" : "binding.read",
        ...(bindingId ? { resource: { kind: "BINDING" as const, id: bindingId } } : {}),
        dataset: { dataset_id: `manager:${surface}`, source_revision: metadata?.payloadDigest ?? "SNAPSHOT_NOT_RECORDED",
          projection_generation: metadata?.projectionEpoch ?? "PROJECTION_NOT_RECORDED",
          catalogue_revision: metadata?.sourceCatalogueSha256 ?? null, window: null },
      });
      const missingSnapshot = scope.mode === "SCOPED_V2" && !metadata;
      if (missingSnapshot && query.environment !== "all") fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
      // Check source presence only after authorization. Retain this scope in
      // the final fences even when its missing source contributes no rows.
      branches.push({ scope, snapshot: null, missingSnapshot });
      dispositions.push({ environment, state: missingSnapshot ? "UNAVAILABLE" : "PARTIAL",
        reason_code: missingSnapshot ? "SCOPED_PROFILE_SNAPSHOT_NOT_RECORDED" : "AUTHORIZED_RETAINED_FACTS" });
      } catch (error) {
        if (query.environment !== "all" || !(error instanceof ExecutionReadScopeError) || error.status === 409) throw error;
        dispositions.push({ environment, state: error.status === 403 || error.status === 404 ? "DENIED" : "UNAVAILABLE", reason_code: error.code });
      }
    }
    if (!branches.length) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
    if (branches.every(branch => branch.scope.mode === "LEGACY_COMPATIBILITY")) {
      // Legacy global composition is never used after dropping a profile.
      if (branches.length !== environments.length) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
      if (surface === "PORTFOLIOS" && ("after" in query && query.after || "before" in query && query.before || "limit" in query && query.limit !== undefined))
        fail("EXECUTION_READ_NOT_AVAILABLE", 400);
      return this.fenced(branches, legacy);
    }
    if (branches.some(branch => branch.scope.mode !== "SCOPED_V2")) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
    this.validateQuery(branches.filter(branch => !branch.missingSnapshot), query);
    return this.fenced(branches, async () => {
      let items: ScopedManagerItem[] = [];
      for (const branch of branches) {
        if (branch.missingSnapshot) continue;
        const { scope } = branch;
        const client = await this.repository.pool.connect();
        try {
          await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
          await client.query("SET LOCAL statement_timeout='5000ms'");
          // An explicit transaction client avoids the retained compatibility
          // snapshot augmentation and its combined/derived revision identity.
          const snapshot = await this.repository.snapshot(principal.workspaceId, scope.environment, scope.profileId, client);
          if (!snapshot) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
          const binding = scopeReadPopulation(scope).binding!;
          if (snapshot.payloadDigest !== binding.source_revision || snapshot.projectionEpoch !== binding.projection_generation ||
            snapshot.sourceCatalogueSha256 !== binding.catalogue_revision) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
          if (snapshot.document.workspace_id !== principal.workspaceId || snapshot.document.environment !== scope.environment ||
            snapshot.document.profile_id !== scope.profileId) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
          branch.snapshot = snapshot;
          await client.query("COMMIT");
        } catch (error) { await client.query("ROLLBACK"); throw error; }
        finally { client.release(); }
        items.push(...composeManagerItems(scope, branch.snapshot!, surface, bindingId));
      }
      items = this.filtered(items, query);
      const sort = "sort" in query && query.sort ? query.sort : "name:asc";
      const [field, direction] = sort.split(":");
      const value = (item: ScopedManagerItem) => String((item.identity as Facts)[field === "alpha_label" ? "name" : field] ?? "");
      items.sort((a, b) => (value(a).localeCompare(value(b)) * (direction === "desc" ? -1 : 1)) || resourceKey(a).localeCompare(resourceKey(b)));
      const limit = "limit" in query && typeof query.limit === "number" ? query.limit : 100;
      const codec = new KeysetCursorCodec({ activeKeyId: this.config.QUERY_CURSOR_ACTIVE_KEY_ID,
        keys: querySigningKeys(this.config), ttlSeconds: this.config.QUERY_CURSOR_TTL_SECONDS });
      const fingerprint = accessDigest({ scopes: branches.map(branch => branch.scope.fingerprint),
        query: { ...query, after: undefined, before: undefined }, dispositions, surface, bindingId: bindingId ?? null });
      const resourceId = `manager-scoped:${surface}`;
      let start = 0;
      let end: number | undefined;
      const token = ("after" in query ? query.after : undefined)
        ?? ("before" in query ? query.before : undefined);
      const backwards = "before" in query && Boolean(query.before);
      if (token) {
        const [boundary] = codec.decode(token, { resourceId, workspaceId: principal.workspaceId,
          direction: backwards ? "before" : "after", queryFingerprint: fingerprint, boundarySize: 1 });
        const index = items.findIndex(item => resourceKey(item) === boundary);
        if (index < 0) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
        start = backwards ? Math.max(0, index - limit) : index + 1;
        if (backwards) end = index;
      }
      const page: ScopedManagerItem[] = [];
      let bytes = 16_384;
      const candidates = items.slice(start, end ?? start + limit);
      for (const item of backwards ? candidates.reverse() : candidates) {
        const size = Buffer.byteLength(JSON.stringify(item));
        if (bytes + size > 1024 * 1024) break;
        page.push(item); bytes += size;
      }
      if (backwards) { page.reverse(); start = end! - page.length; }
      if (items.length > start && !page.length) fail("EXECUTION_READ_SCOPE_LIMIT", 503);
      const cursor = (item: ScopedManagerItem, direction: "after" | "before") => codec.encode({
        resource_id: resourceId, workspace_id: principal.workspaceId, direction, query_fingerprint: fingerprint,
        boundary: [resourceKey(item)],
      });
      for (const branch of branches) {
        const current = await this.repository.snapshotMetadata(principal.workspaceId, branch.scope.environment, branch.scope.profileId);
        if (branch.missingSnapshot) {
          // Do not silently accept a source appearing in the middle of the
          // response, or a scope revoked while the available profiles load.
          if (current) fail("EXECUTION_READ_ACCESS_CHANGED", 409);
          continue;
        }
        if (!current || current.payloadDigest !== branch.snapshot!.payloadDigest ||
          current.projectionEpoch !== branch.snapshot!.projectionEpoch || current.sourceCatalogueSha256 !== branch.snapshot!.sourceCatalogueSha256)
          fail("EXECUTION_READ_ACCESS_CHANGED", 409);
      }
      if (surface === "BINDING_DETAIL" && !items.length) fail("EXECUTION_READ_NOT_AVAILABLE", 404);
      const validated = scopedManagerResponseSchema.safeParse({ schema_version: "portal.execution.manager-scoped.v1", surface,
        workspace_id: principal.workspaceId, environment: query.environment, record_authority: "PORTAL_PROJECTION",
        source_authority: "TRADING_SYSTEM", read_at_ms: Date.now(),
        read_scope: { visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totals_scope: "VISIBLE_ROWS_ONLY",
          policy_revisions: [...new Set(branches.map(branch => branch.scope.policyRevision!))] },
        completeness: "PARTIAL", reason_code: "RETAINED_CURRENT_PAGE_NOT_TOTAL_HISTORY",
        profile_dispositions: dispositions,
        page: { visible_count: items.length, returned_count: page.length, limit, maximum_response_bytes: 1048576,
          has_more: start + page.length < items.length, next_cursor: start + page.length < items.length && page.length ? cursor(page.at(-1)!, "after") : null,
          previous_cursor: start > 0 && page.length ? cursor(page[0], "before") : null }, items: page });
      if (!validated.success) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
      return validated.data;
    });
  }

  private async fenced<T>(branches: Branch[], read: () => Promise<T>, index = 0): Promise<T> {
    return index === branches.length ? read() : this.scopes.deliver(branches[index].scope, () => this.fenced(branches, read, index + 1));
  }
  private profile(environment: ProjectionEnvironment): string {
    const id = environment === "paper" ? this.config.EXECUTION_EDGE_PAPER_PROFILE_ID : environment === "sandbox" ?
      this.config.EXECUTION_EDGE_SANDBOX_PROFILE_ID : this.config.EXECUTION_EDGE_LIVE_PROFILE_ID;
    if (!id) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    return id;
  }
  private validateQuery(branches: Branch[], query: Query) {
    const mappings = { search: "name", stage: "stage", venue: "venue", state: "state", owner: "owner", health: "health" };
    for (const [queryField, field] of Object.entries(mappings)) {
      if (queryField in query && query[queryField as keyof Query] !== undefined &&
        (field === "owner" || field === "health" || branches.some(branch => !scopeAllowsField(branch.scope, field))))
        fail("EXECUTION_READ_NOT_AVAILABLE", 400);
    }
    if ("sort" in query && query.sort) {
      const match = /^(name|alpha_label|alpha_id|portfolio_id|binding_id|state|stage|venue):(asc|desc)$/.exec(query.sort);
      if (!match || branches.some(branch => !scopeAllowsField(branch.scope, match[1] === "alpha_label" ? "name" : match[1])))
        fail("EXECUTION_READ_NOT_AVAILABLE", 400);
    }
  }
  private filtered(items: ScopedManagerItem[], query: Query) {
    return items.filter(item => {
      if ("search" in query && query.search && !String(item.identity.name ?? "").toLocaleLowerCase().includes(query.search.toLocaleLowerCase())) return false;
      for (const field of ["stage", "state", "venue"] as const) {
        if (field in query && (query as Record<string, unknown>)[field] !== undefined &&
          item.identity[field] !== (query as Record<string, unknown>)[field]) return false;
      }
      return true;
    });
  }
}

/** Exported for boundary tests. The branded scope remains mandatory. Labels
 * use discovery authority; all financial grains must pass the stricter whole-
 * grain predicate. No global metadata/count/rejected-peer count is published.
 */
export function composeManagerItems(scope: AuthorizedExecutionReadScope, snapshot: ProfileProjectionSnapshot,
  surface: Surface, bindingId?: string): ScopedManagerItem[] {
  const population = scopeReadPopulation(scope), resources = scopeResources(scope);
  const kind = surface === "ALPHA_FLEET" ? "ALPHA" : surface === "PORTFOLIOS" ? "PORTFOLIO" : "BINDING";
  const idField = kind === "ALPHA" ? "alpha_id" : kind === "PORTFOLIO" ? "portfolio_id" : "binding_id";
  if (!scopeAllowsField(scope, idField)) fail("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
  const relationCache = new Map<string, Facts[]>();
  const rows = (relation: string): Facts[] => {
    const cached = relationCache.get(relation); if (cached) return cached;
    const values = Object.values(snapshot.document.relations)
      .filter(value => value.relation === relation && value.availability === "AVAILABLE")
      .flatMap(value => value.items.filter(row => row.lineage.workspace_id === scope.workspaceId && row.lineage.profile_id === scope.profileId).map(row => row.fields));
    if (values.length > 2_000) fail("EXECUTION_READ_SCOPE_LIMIT", 503);
    relationCache.set(relation, values); return values;
  };
  const visibility = new WeakMap<object, boolean>();
  const visibleRow = (row: Facts) => {
    const cached = visibility.get(row); if (cached !== undefined) return cached;
    const allowed = projectionRowVisible(scope, row); visibility.set(row, allowed); return allowed;
  };
  const strategies = new Map(population.strategyPairs.map(pair => [pair.strategy_id, pair.alpha_id]));
  const identities: Facts[] = kind === "ALPHA" ? rows("strategies").flatMap<Facts>(row => {
    if (row.strategy_id != null) {
      const alpha = typeof row.strategy_id === "string" ? strategies.get(row.strategy_id) : undefined;
      if (!alpha || row.alpha_id != null && row.alpha_id !== alpha) return [];
      return [{ ...row, alpha_id: alpha }];
    }
    return [row];
  }) :
    kind === "PORTFOLIO" ? rows("portfolios") : rows("venue_accounts");
  const visible = resources.filter(resource => resource.kind === kind && (!bindingId || resource.id === bindingId))
    .flatMap<{ resource: typeof resources[number]; alphaVersion: string | null; portfolio: string | null }>(resource => {
      if (kind !== "ALPHA") return [{ resource, alphaVersion: null, portfolio: null }];
      const groups = [...new Map(population.allowedTuples.filter(tuple => tuple.alpha_id === resource.id)
        .map(tuple => [JSON.stringify([tuple.alpha_version_id, tuple.portfolio_id]), tuple])).values()];
      return groups.length ? groups.map(tuple => ({ resource, alphaVersion: tuple.alpha_version_id, portfolio: tuple.portfolio_id })) :
        [{ resource, alphaVersion: null, portfolio: null }];
    });
  const result: ScopedManagerItem[] = [];
  for (const { resource, alphaVersion, portfolio } of visible) {
    const source = identities.find(row => row[idField] === resource.id);
    // Identity discovery is a qualified resource fact, not a synthetic label.
    if (kind === "ALPHA" && alphaVersion && (!scopeAllowsField(scope, "alpha_version_id") || !scopeAllowsField(scope, "portfolio_id")))
      fail("EXECUTION_READ_FIELD_POLICY_PENDING", 503);
    const identity = publish(scope, { [idField]: resource.id,
      ...(alphaVersion ? { alpha_version_id: alphaVersion, portfolio_id: portfolio } : {}),
      ...(source ? { name: source.name ?? source.label, state: source.state, stage: source.stage,
        venue: source.venue, base_currency: source.base_currency, updated_at: source.updated_at } : {}) });
    const bindingAccounts = new Set(population.bindingPairs.filter(pair => pair.binding_id === resource.id).map(pair => pair.account_id));
    const tuples = population.allowedTuples.filter(tuple => kind === "ALPHA" ? tuple.alpha_id === resource.id &&
      (!alphaVersion || tuple.alpha_version_id === alphaVersion && tuple.portfolio_id === portfolio) :
      kind === "PORTFOLIO" ? tuple.portfolio_id === resource.id : bindingAccounts.has(tuple.account_id));
    const instances = tuples.map(tuple => publish(scope, tuple));
    const tupleKey = (tuple: typeof population.allowedTuples[number]) => JSON.stringify(tuple);
    const groupKeys = new Set(tuples.map(tupleKey));
    const rowMatches = (row: Facts, tuple: typeof population.allowedTuples[number]) =>
      ["alpha_id", "alpha_version_id", "portfolio_id", "deployment_id", "account_id"].every(key => row[key] == null || row[key] === tuple[key as keyof typeof tuple]) &&
      (row.strategy_id == null || strategies.get(String(row.strategy_id)) === tuple.alpha_id);
    // Visibility and attribution are separate: even an all-business reader may
    // not attribute a physical/shared-account total to each child portfolio.
    const matches = (row: Facts) => visibleRow(row) && tuples.some(tuple => rowMatches(row, tuple)) &&
      population.populationTuples.filter(tuple => rowMatches(row, tuple)).every(tuple => groupKeys.has(tupleKey(tuple)));
    const financial: ScopedManagerItem["financial_facts"] = [];
    for (const [relation, factKind, mapping] of [
      ["portfolio_allocations", "ALLOCATION", { allocation: "allocated_capital" }],
      ["account_balances", "INTERNAL_ACCOUNT_BALANCE", { balance_total: "total", balance_free: "free", balance_locked: "locked" }],
      ["positions", "POSITION_PNL", { realized_pnl: "realized_pnl", unrealized_pnl: "unrealized_pnl", exposure: "notional" }],
    ] as const) {
      const seen = new Set<string>();
      for (const row of rows(relation).filter(matches)) {
        const mapped: Facts = { ...row };
        for (const [target, sourceKey] of Object.entries(mapping)) mapped[target] = row[sourceKey];
        const facts = publish(scope, mapped), key = JSON.stringify(row);
        if (!Object.keys(facts).some(field => decimals.has(field)) || seen.has(key)) continue;
        seen.add(key); financial.push({ kind: factKind, facts });
      }
    }
    const full = scope.wholePopulation || (kind !== "BINDING" && projectionRowVisible(scope, { [idField]: resource.id }));
    result.push({ environment: scope.environment, identity, instances, financial_facts: financial,
      financial_totals: financialTotals(financial), is_full_resource: full,
      financial_availability: { state: financial.length ? "PARTIAL" : "NOT_PUBLISHED",
        reason_code: financial.length ? "AUTHORIZED_RETAINED_FACTS" : "SCOPED_FINANCIAL_GRAIN_OR_FIELDS_UNAVAILABLE" } });
  }
  return result;
}

function financialTotals(facts: ScopedManagerItem["financial_facts"]): ScopedManagerItem["financial_totals"] {
  const currencies = new Map<string, ScopedManagerItem["financial_facts"]>();
  for (const fact of facts) {
    if (!fact.facts.currency) continue; // Unknown currencies never enter a common amount bucket.
    const group = currencies.get(fact.facts.currency) ?? []; group.push(fact); currencies.set(fact.facts.currency, group);
  }
  return [...currencies].sort(([a], [b]) => a.localeCompare(b)).map(([currency, rows]) => {
    const output: Record<string, string | null> = { currency };
    for (const field of decimals) {
      const relevant = rows.filter(row => Object.hasOwn(row.facts, field));
      if (!relevant.length) continue;
      const values = relevant.map(row => row.facts[field as keyof typeof row.facts]);
      output[field] = values.some(value => value === null) ? null : exactSum(values as string[]);
    }
    const validated = managerScopedFactsSchema.safeParse(output);
    if (!validated.success) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
    return validated.data;
  });
}

function exactSum(values: string[]): string {
  const scale = Math.max(...values.map(value => (value.split(".")[1] ?? "").length));
  const total = values.reduce((sum, value) => {
    const negative = value.startsWith("-"), [whole, fraction = ""] = (negative ? value.slice(1) : value).split(".");
    return sum + BigInt(whole + fraction.padEnd(scale, "0")) * (negative ? -1n : 1n);
  }, 0n);
  const raw = (total < 0n ? -total : total).toString().padStart(scale + 1, "0");
  return `${total < 0n ? "-" : ""}${scale ? `${raw.slice(0, -scale)}.${raw.slice(-scale)}` : raw}`;
}

function publish(scope: AuthorizedExecutionReadScope, row: Facts) {
  const output: Facts = {};
  for (const key of Object.keys(managerScopedFactsSchema.shape)) {
    const sourceKey = key === "updated_at_ms" ? "updated_at" : key;
    if (!scopeAllowsField(scope, sourceKey) || row[sourceKey] === undefined) continue;
    const value = row[sourceKey];
    if (key === "updated_at_ms") {
      output[key] = value === null ? null : typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : NaN;
    } else if (decimals.has(key)) {
      if (value !== null && (typeof value !== "string" || !decimal.test(value))) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
      output[key] = value;
    } else output[key] = value;
  }
  const parsed = managerScopedFactsSchema.safeParse(output);
  if (!parsed.success) fail("EXECUTION_READ_AUTHORITY_UNAVAILABLE", 503);
  return parsed.data;
}
