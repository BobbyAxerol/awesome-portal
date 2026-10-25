import { z } from "zod";
import type { ResourceEnvironment, ResourceReadPrincipal } from "../resource-read/resource-read.service";
import { scopedResourceResponseSchemas, scopedResourceRowSchemas } from "../resource-read/scoped-resource.contract";
import { accessText } from "./access.contract";
import { accessDigest } from "./access-digest";
import type { CurrentViewCoreComposition } from "./current-view-composition";
import type { CurrentViewSelection } from "./current-view-authority";
import type { SelectedCurrentViewEdgeRead } from "./current-view-edge-client";
import { utcMilliseconds } from "./foundation.contract";
import { ExecutionReadScopeError } from "./read-scope";
import { managerCurrentMetadataDigest, managerCurrentSelectionCatalogue, qualifyManagerCurrentMetadata,
  type ManagerCurrentCommissioning, type ManagerCurrentMetadata } from "./manager-current-publication";
import type { ExecutionReadPublicationRequest } from "./read-publication";

export interface ManagerCurrentAccountsOptions {
  request: ExecutionReadPublicationRequest;
  commissioning: ManagerCurrentCommissioning;
  source: (request: ExecutionReadPublicationRequest) => Promise<unknown | null>;
  core: Pick<CurrentViewCoreComposition, "read" | "deliver">;
  now?: () => number;
}
const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/u);
const pageSchema = z.object({ schema_version: z.literal("portal.execution.manager-current.v1"),
  projection_generation: accessText, source_continuity_epoch: accessText,
  source_read_at_ms: utcMilliseconds, produced_at_ms: utcMilliseconds,
  availability: z.literal("AVAILABLE"), source_basis: z.literal("MANAGER_COMMITTED_POLL_BOUNDED_SNAPSHOT"),
  history_capability: z.literal("UNAVAILABLE"), coverage: z.literal("CURRENT_PAGE_ONLY"),
  count_status: z.literal("COMPLETE_AUTHORIZED_SELECTION"),
  rows: z.array(z.object({ entity_id: accessText, revision: digest,
    payload: z.record(z.unknown()) }).strict()).length(1), next_cursor: z.null(), resume_cursor: z.null(),
}).strict();
const decimal = z.string().max(128).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/u);
const tagged = z.object({ kind: z.enum(["NULL", "TEXT", "DECIMAL", "TIMESTAMP"]), value: z.unknown() }).strict();
const aliases = ["deployments", "accounts", "account_balances", "margin_balances", "account_sync", "broker_sync",
  "venue_accounts", "portfolios", "portfolio_allocations", "positions", "sessions", "orders", "fills", "performance",
  "account_equity", "reconciliation", "strategies"] as const;
type Row = Record<string, string | null>;
type Selection = ReturnType<typeof managerCurrentSelectionCatalogue>[number];
const refuse = (code: ConstructorParameters<typeof ExecutionReadScopeError>[0] = "EXECUTION_READ_PUBLICATION_NOT_QUALIFIED", status = 503): never => {
  throw new ExecutionReadScopeError(code, status);
};

function decode(field: string, input: unknown): string | null {
  const scalar = tagged.parse(input);
  if (scalar.kind === "NULL") {
    if (scalar.value !== null || field === "account_id" || field === "currency") return refuse();
    return null;
  }
  const expected = ["total", "free", "locked"].includes(field) ? "DECIMAL" :
    ["created_at", "updated_at"].includes(field) ? "TIMESTAMP" : "TEXT";
  if (scalar.kind !== expected) return refuse();
  if (expected === "DECIMAL") return decimal.parse(scalar.value);
  const text = accessText.parse(scalar.value);
  if (expected === "TIMESTAMP") {
    const at = Date.parse(text);
    // Date.parse normalizes February 30 and 24:00 into a different day.
    // Preserve valid source nanoseconds as text, but never repair bad dates.
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/u.test(text) ||
      !Number.isFinite(at) || new Date(at).toISOString().slice(0, 19) !== text.slice(0, 19)) return refuse();
  }
  return text;
}

function selected(metadata: ManagerCurrentMetadata, source: Selection,
  fields: readonly string[] = source.fields): CurrentViewSelection {
  return { resource_ref: source.resource_ref, binding: { environment: "paper", profileId: metadata.scope.profile_id },
    read_requirement: { action: "business.read_all", resource: source.resource,
      dataset: structuredClone(metadata.binding), requireWholePopulation: true }, fields: [...fields] };
}

/** Account360 only. No binding ID, native-domain entitlement, financial
 * total, margin, broker status, historical series or missing relation is
 * fabricated from the three stored CURRENT source grains. Ordinary whole
 * business authority is still required for these tupleless source selections. */
export class ManagerCurrentAccounts {
  private readonly request: ExecutionReadPublicationRequest;
  private readonly commissioning: ManagerCurrentCommissioning;
  private readonly source: ManagerCurrentAccountsOptions["source"];
  private readonly core: ManagerCurrentAccountsOptions["core"];
  private readonly now: () => number;
  constructor(options: ManagerCurrentAccountsOptions) {
    this.request = structuredClone(options.request); this.commissioning = options.commissioning;
    this.source = options.source; this.core = options.core; this.now = options.now ?? Date.now;
  }
  private async metadata(): Promise<ManagerCurrentMetadata> {
    let input: unknown;
    try { input = await this.source(structuredClone(this.request)); }
    catch { return refuse(); }
    if (input === null) return refuse();
    return qualifyManagerCurrentMetadata(input, this.request, { commissioning: this.commissioning, nowMs: this.now() });
  }
  async read(principal: ResourceReadPrincipal, resourceId: string, environment?: ResourceEnvironment): Promise<Record<string, unknown>> {
    const actor = structuredClone(principal), accountId = accessText.parse(resourceId);
    if (actor.workspaceId !== this.request.workspace_id || this.request.environment !== "paper" || environment && environment !== "paper")
      return refuse("EXECUTION_READ_NOT_AVAILABLE", 404);
    const metadata = await this.metadata(), catalogue = managerCurrentSelectionCatalogue(metadata);
    const relevant = catalogue.filter(selection => selection.grain !== "relation.account_policies" &&
      selection.entities.some(entity => entity.account_id === accountId));
    const identities = relevant.filter(selection => selection.grain === "manager.account")
      .flatMap(selection => selection.entities.filter(entity => entity.account_id === accountId));
    if (identities.length !== 1) return refuse("EXECUTION_READ_NOT_AVAILABLE", 404);
    const fields = [...new Set(relevant.flatMap(selection => selection.fields))].sort();
    const baseSelection = selected(metadata, relevant[0]!, fields), outer = { ...baseSelection,
      read_requirement: { ...baseSelection.read_requirement, resource: { kind: "ACCOUNT" as const, id: accountId } } };
    return this.core.deliver(actor, outer, "CURRENT", async () => {
      const rows: Record<"accounts" | "account_balances", Row[]> = { accounts: [], account_balances: [] };
      let truncated = false;
      for (const selection of relevant) {
        const alias = selection.grain === "manager.account" ? "accounts" : "account_balances";
        for (const entity of selection.entities.filter(candidate => candidate.account_id === accountId)) {
          if (rows[alias].length >= 200) { truncated = true; continue; }
          const input: SelectedCurrentViewEdgeRead = { authority: selected(metadata, selection),
            resource: selection.resource_ref, query: { limit: 1, max_bytes: 65_536, entity_id: entity.entity_id } };
          const response = await this.core.read(actor, input, "CURRENT");
          try {
            if (response.status !== 200 || response.body.byteLength > 65_536) return refuse();
            const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(response.body));
            if (!Buffer.from(JSON.stringify(parsed), "utf8").equals(response.body)) return refuse();
            const page = pageSchema.parse(parsed), row = page.rows[0]!;
            if (page.projection_generation !== metadata.binding.projection_generation ||
              page.source_continuity_epoch !== metadata.binding.source_revision || page.source_read_at_ms !== metadata.source_read_at_ms ||
              page.produced_at_ms < page.source_read_at_ms || page.produced_at_ms > this.now() || row.entity_id !== entity.entity_id ||
              row.revision !== entity.payload_digest || accessDigest(Object.keys(row.payload).sort()) !== accessDigest([...selection.source_fields].sort()))
              return refuse();
            const values = Object.fromEntries(selection.source_fields.map(field => [field, decode(field, row.payload[field])])) as Row;
            if (values.account_id !== accountId || values.account_id !== entity.account_id) return refuse();
            const projected = scopedResourceRowSchemas[alias].parse({ profile_environment: "paper", ...values });
            rows[alias].push(projected);
          } catch { return refuse(); }
        }
      }
      if (new Set(rows.account_balances.map(row => row.currency)).size !== rows.account_balances.length) return refuse();
      const confirmed = await this.metadata();
      if (managerCurrentMetadataDigest(confirmed) !== managerCurrentMetadataDigest(metadata)) return refuse("EXECUTION_READ_ACCESS_CHANGED", 409);
      return this.response(actor, accountId, environment, metadata, rows, truncated);
    });
  }
  private response(principal: ResourceReadPrincipal, accountId: string, environment: ResourceEnvironment | undefined,
    metadata: ManagerCurrentMetadata, rows: Record<"accounts" | "account_balances", Row[]>, truncated: boolean): Record<string, unknown> {
    const readAt = utcMilliseconds.parse(this.now()), absent = "MANAGER_CURRENT_RELATION_NOT_PUBLISHED";
    const dataRows = Object.fromEntries(aliases.map(alias => [alias, alias === "accounts" || alias === "account_balances" ? rows[alias] : []]));
    const panels = Object.fromEntries(aliases.map(alias => {
      const published = alias === "accounts" || alias === "account_balances", values = dataRows[alias]!, count = values.length;
      return [alias, { state: !published ? "UNAVAILABLE" : truncated && alias === "account_balances" ? "PARTIAL" : count ? "READY" : "EMPTY",
        data: published ? { rows: values } : null,
        clocks: { event_time_ms: null, source_published_at_ms: null, received_at_ms: null, ingested_at_ms: null,
          processed_at_ms: null, as_of_ms: null, read_at_ms: readAt },
        coverage: { from_ms: null, to_ms: null, source_total: null, filtered_total: null, returned_count: count,
          truncated: alias === "account_balances" && truncated, downsampled: false, has_more: alias === "account_balances" && truncated,
          next_cursor: null, gaps: [] },
        // The closed Account360 contract describes these two (unavailable)
        // panel families as historical. Empty coverage + UNAVAILABLE does not
        // turn the CURRENT source into a history capability.
        source_history_semantics: ["performance", "account_equity"].includes(alias) ?
          "RETAINED_RANGE_OR_CURRENT_WINDOW" : "CURRENT_STATE_ONLY", formula: null,
        reason_code: !published ? absent : truncated && alias === "account_balances" ? "MANAGER_CURRENT_RESOURCE_ROW_BOUND" : null,
        retryable: false }];
    }));
    const capabilities = aliases.map(alias => ({ capability_id: `resource.account.${alias}`,
      state: !["accounts", "account_balances"].includes(alias) ? "UNAVAILABLE" : truncated && alias === "account_balances" ? "PARTIAL" : dataRows[alias]!.length ? "AVAILABLE" : "EMPTY",
      relations: [], reason_code: !["accounts", "account_balances"].includes(alias) ? absent :
        truncated && alias === "account_balances" ? "MANAGER_CURRENT_RESOURCE_ROW_BOUND" : null, retryable: false }));
    const balanceAvailable = rows.account_balances.some(row => [row.total, row.free, row.locked].some(value => typeof value === "string"));
    const unavailableMetric = { state: "UNAVAILABLE", reason_code: absent };
    const profileCoverage = { paper: { profile_id: metadata.scope.profile_id, state: "FOUND", reason_code: null,
      projection_epoch: null, projection_sequence: null, source_as_of: null } };
    return scopedResourceResponseSchemas.ACCOUNT.parse({ schema_version: "execution.account-resource.v2", record_authority: "PORTAL_CONTROL",
      source_authority: "TRADING_SYSTEM", delivery_profile: metadata.scope.profile_id, workspace_id: principal.workspaceId,
      requested_environment: environment ?? "all", selected_environment: "paper", resource: { kind: "ACCOUNT", id: accountId },
      read_at_ms: readAt, read_at: new Date(readAt).toISOString(), as_of_ms: null, as_of: null,
      state: "partial", freshness: "UNKNOWN", completeness: "PARTIAL",
      projection: [{ environment: "paper", epoch: null, sequence: null,
        payload_digest: accessDigest({ account_id: accountId, rows }), last_successful_refresh_at: null }],
      capabilities, panels, unavailable_branches: capabilities.filter(capability => !["AVAILABLE", "EMPTY"].includes(capability.state))
        .map(({ relations: _relations, ...branch }) => branch),
      actor: { user_id: principal.user.userId, username: principal.user.username, roles: [principal.user.role] },
      visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", totals_scope: "VISIBLE_ROWS_ONLY", is_full_portfolio: false,
      read_scope: [{ environment: "paper", policy_revision: null }],
      data: { ...dataRows, account: { kind: "ACCOUNT", id: accountId, account_id: accountId,
        visibility: "SCOPED", coverage: "AUTHORIZED_ONLY", financial_summary: { state: "UNAVAILABLE", reason_code: "SCOPED_RAW_FACTS_ONLY_NO_IMPLIED_TOTALS" },
        ...(rows.accounts[0]?.base_currency !== undefined ? { base_currency: rows.accounts[0].base_currency } : {}),
        deployments: [], portfolios: [], metrics_availability: {
          account_balance: balanceAvailable ? { state: truncated ? "PARTIAL" : "AVAILABLE", reason_code: truncated ? "MANAGER_CURRENT_RESOURCE_ROW_BOUND" : null } : unavailableMetric,
          current_position_pnl: unavailableMetric, equity_series: unavailableMetric } }, profile_coverage: profileCoverage } });
  }
}
