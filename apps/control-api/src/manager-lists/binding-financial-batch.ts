import { createHash } from "node:crypto";
import { z } from "zod";
import type { PostgresSnapshotReader } from "../query";
import type { BindingItem, BindingRow, ManagerListEnvironment } from "./contracts";
import type { BindingFigures } from "./binding-figures";
import { mapBindingFigures } from "./binding-figures";
import type { ProjectionSnapshot } from "./manager-lists.repository";
import type { ManagerPage } from "../paper-read/manager-records";

/** Internal optional source port. Never exposed as a browser selector. The
 * adapter MUST read its owning projection using this lent RR transaction;
 * neither per-account requests nor a newer independently fetched cut qualify. */
export const BINDING_FINANCIAL_BATCH_SOURCE = Symbol("BINDING_FINANCIAL_BATCH_SOURCE");
/** Separate owning ingress. It runs BEFORE the replacement transaction and
 * must bind its qualified facts to the exact original refresh, not make one
 * request per account or read a newer independently selected source cut. */
export const BINDING_FINANCIAL_REFRESH_SOURCE = Symbol("BINDING_FINANCIAL_REFRESH_SOURCE");
const digest = (value: unknown) => `sha256:${createHash("sha256").update(JSON.stringify(value)).digest("hex")}`;
const identity = z.object({ binding_id: z.string().min(1).max(191), account_id: z.string().min(1).max(191),
  venue: z.string().min(1).max(191) }).strict();
const coverage = z.enum(["COMPLETE", "PARTIAL", "UNKNOWN"]);
const at = z.string().datetime({ offset: true });
const amount = z.object({ currency: z.string().min(1).max(191).refine(value => value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value)),
  value: z.string().max(128).regex(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$(?![\s\S])/), observed_at: at, coverage }).strict();
const amounts = z.array(amount).min(1).max(8).refine(values => new Set(values.map(value => value.currency)).size === values.length);
const figures = z.object({ native_equity: amounts.nullable().optional(), virtual_used: amounts.nullable().optional(),
  virtual_headroom: amounts.nullable().optional(), sleeve_count: z.object({ count: z.number().int().nonnegative().safe(),
    observed_at: at, coverage }).strict().nullable().optional() }).strict();
const financialRow = identity.extend({ figures });
const batch = z.object({ schema_version: z.literal("portal.internal.binding-financial-batch.v1"),
  request_digest: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  source_snapshot_ref: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  authority: z.literal("TRADING_SYSTEM"), source_ref: z.string().min(1).max(512),
  coverage, rows: z.array(financialRow).max(200) }).strict();
const refreshPrincipal = z.object({ user_id: z.string().min(1).max(191), session_id: z.string().min(1).max(191),
  session_generation: z.number().int().nonnegative().safe() }).strict();
const refreshBatch = batch.extend({ schema_version: z.literal("portal.internal.binding-financial-refresh.v1"),
  qualification: z.literal("SOURCE_VERIFIED"), population: z.literal("ORIGINAL_REFRESH_BINDINGS"),
  workspace_id: z.string().min(1).max(191), environment: z.enum(["paper", "sandbox", "live"]),
  principal: refreshPrincipal, source_as_of: at, rows: z.array(financialRow).max(2000) }).strict();

export interface BindingFinancialBatchRequest {
  readonly workspace_id: string;
  readonly environment: ManagerListEnvironment;
  readonly principal: Readonly<{ user_id: string; session_id: string; session_generation: number }>;
  readonly source_snapshot_ref: string;
  readonly source_as_of: string | null;
  readonly projection_refreshed_at: string;
  readonly request_digest: string;
  readonly bindings: readonly Readonly<z.infer<typeof identity>>[];
}
export interface BindingFinancialBatchSource {
  read(request: BindingFinancialBatchRequest, snapshot: PostgresSnapshotReader<BindingRow>): Promise<unknown | undefined>;
}
export interface BindingFinancialRefreshPage {
  readonly relation: "accounts" | "venue_accounts" | "broker_account_sync_effective";
  readonly page_index: number;
  readonly input_cursor: string | null;
  readonly page: Readonly<ManagerPage>;
}
export interface BindingFinancialRefreshRequest {
  readonly workspace_id: string;
  readonly environment: ManagerListEnvironment;
  readonly principal: BindingFinancialBatchRequest["principal"];
  /** This is the digest of the exact composite refresh, not a claim that
   * independently read relations were one atomic TS transaction. The owning
   * adapter must provide that qualification before publishing any figures. */
  readonly source_snapshot_ref: string;
  readonly source_as_of: string;
  readonly original_pages: readonly BindingFinancialRefreshPage[];
  readonly bindings: BindingFinancialBatchRequest["bindings"];
  readonly request_digest: string;
}
export interface BindingFinancialRefreshSource {
  /** Adapter owns its bounded transport/query resources and must cancel them
   * on this signal; late results can never enter the replacement transaction. */
  read(request: BindingFinancialRefreshRequest, signal: AbortSignal): Promise<unknown | undefined>;
}
export class BindingFinancialBatchError extends Error {
  readonly code = "BR72_BINDING_FINANCIAL_BATCH_INVALID";
  readonly status = 503;
  constructor() { super("The authorized account figures are not available."); }
}

/** Author the source binding from the SAME transaction's metadata and page,
 * not an earlier refresh result. Session is part of the request identity, never
 * a grant and never a cache key permitting reuse by another principal. */
export function bindingFinancialRequest(input: { workspaceId: string; environment: ManagerListEnvironment;
  userId: string; sessionId: string; sessionGeneration: number; snapshot: ProjectionSnapshot;
  rows: readonly Pick<BindingItem, "binding_id" | "account_id" | "venue">[] }): BindingFinancialBatchRequest {
  const bindings = input.rows.map(row => identity.parse({ binding_id: row.binding_id, account_id: row.account_id, venue: row.venue }))
    .sort((a, b) => a.binding_id < b.binding_id ? -1 : a.binding_id > b.binding_id ? 1 : 0);
  if (bindings.length > 200 || new Set(bindings.map(row => row.binding_id)).size !== bindings.length) throw new BindingFinancialBatchError();
  const scope = { workspace_id: input.workspaceId, environment: input.environment,
    principal: { user_id: input.userId, session_id: input.sessionId, session_generation: input.sessionGeneration },
    source_snapshot_ref: digest({ source_as_of: input.snapshot.sourceAsOf?.toISOString() ?? null,
      refreshed_at: input.snapshot.refreshedAt?.toISOString() ?? null, completeness: input.snapshot.sourceCompleteness,
      row_count: input.snapshot.rowCount, summary: input.snapshot.summary }),
    source_as_of: input.snapshot.sourceAsOf?.toISOString() ?? null,
    projection_refreshed_at: input.snapshot.refreshedAt.toISOString(), bindings };
  return Object.freeze({ ...scope, principal: Object.freeze(scope.principal),
    bindings: Object.freeze(bindings.map(row => Object.freeze(row))), request_digest: digest(scope) });
}

/** No conversion, no inferred equity, no addition across currencies. A
 * partial batch leaves missing bindings absent; COMPLETE must name every
 * requested binding, even if all its owning figures are explicit nulls. */
export function mapBindingFinancialBatch(request: BindingFinancialBatchRequest, raw: unknown): ReadonlyMap<string, BindingFigures> {
  const parsed = batch.safeParse(raw);
  if (!parsed.success) throw new BindingFinancialBatchError();
  // The page and its figures must not advertise observations from after the
  // selected source cut. The refresh ingress already enforces this; apply the
  // same fence when a batch is read directly from a retained snapshot.
  if (request.source_as_of !== null) validateObservationCut(parsed.data.rows, request.source_as_of);
  return financialRows(request, parsed.data);
}

function validateObservationCut(rows: readonly z.infer<typeof financialRow>[], sourceAsOf: string): void {
  const cutoff = Date.parse(sourceAsOf);
  if (!at.safeParse(sourceAsOf).success || !Number.isFinite(cutoff)) throw new BindingFinancialBatchError();
  // Date.parse truncates fractional seconds beyond milliseconds. Compare the
  // remaining digits when the instants have the same millisecond, including
  // equivalent UTC-offset representations. Never round an observation back
  // onto the selected snapshot cut.
  const submillisecond = (value: string) => (value.match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/u)?.[1] ?? "")
    .slice(3).replace(/0+$/u, "");
  const cutoffTail = submillisecond(sourceAsOf);
  const afterCut = (value: string): boolean => {
    const instant = Date.parse(value);
    if (!Number.isFinite(instant)) throw new BindingFinancialBatchError();
    if (instant !== cutoff) return instant > cutoff;
    const tail = submillisecond(value);
    for (let n = 0; n < Math.max(tail.length, cutoffTail.length); n++) {
      const digit = tail[n] ?? "0", limit = cutoffTail[n] ?? "0";
      if (digit !== limit) return digit > limit;
    }
    return false;
  };
  for (const row of rows) {
    for (const entries of [row.figures.native_equity, row.figures.virtual_used, row.figures.virtual_headroom])
      if (entries?.some(entry => afterCut(entry.observed_at))) throw new BindingFinancialBatchError();
    if (row.figures.sleeve_count && afterCut(row.figures.sleeve_count.observed_at))
      throw new BindingFinancialBatchError();
  }
}

function financialRows(request: Pick<BindingFinancialBatchRequest, "request_digest" | "source_snapshot_ref" | "bindings">,
  value: z.infer<typeof batch> | z.infer<typeof refreshBatch>): ReadonlyMap<string, BindingFigures> {
  if (value.request_digest !== request.request_digest || value.source_snapshot_ref !== request.source_snapshot_ref)
    throw new BindingFinancialBatchError();
  const wanted = new Map(request.bindings.map(row => [row.binding_id, row]));
  const result = new Map<string, BindingFigures>();
  for (const row of value.rows) {
    const selected = wanted.get(row.binding_id);
    if (!selected || selected.account_id !== row.account_id || selected.venue !== row.venue || result.has(row.binding_id))
      throw new BindingFinancialBatchError();
    const mapped = mapBindingFigures(row.figures);
    // Batch coverage describes requested identities; each figure retains its
    // OWN owning population's coverage. One absent sibling never downgrades a
    // fully sourced account or upgrades an incomplete amount.
    result.set(row.binding_id, mapped ?? {});
  }
  if (value.coverage === "COMPLETE" && result.size !== wanted.size) throw new BindingFinancialBatchError();
  return result;
}

/** One bounded original refresh census, detached before any owning adapter
 * awaits. Original cursor chains and per-page projection pins are included,
 * so a merely equal oldest timestamp cannot substitute another source read. */
export function bindingFinancialRefreshRequest(input: { workspaceId: string; environment: ManagerListEnvironment;
  userId: string; sessionId: string; sessionGeneration: number; sourceAsOf: Date;
  pages: readonly BindingFinancialRefreshPage[];
  rows: readonly Pick<BindingItem, "binding_id" | "account_id" | "venue">[] }): BindingFinancialRefreshRequest {
  try {
    const bindings = input.rows.map(row => identity.parse(row)).sort((a, b) => a.binding_id < b.binding_id ? -1 : a.binding_id > b.binding_id ? 1 : 0);
    if (!bindings.length || bindings.length > 2000 || new Set(bindings.map(row => row.binding_id)).size !== bindings.length ||
      !input.workspaceId || input.workspaceId.length > 191 || !["paper", "sandbox", "live"].includes(input.environment) ||
      input.pages.length < 3 || input.pages.length > 30) throw new BindingFinancialBatchError();
    const principal = refreshPrincipal.parse({ user_id: input.userId, session_id: input.sessionId, session_generation: input.sessionGeneration });
    const relations = ["accounts", "venue_accounts", "broker_account_sync_effective"] as const;
    const sourceAsOf = input.sourceAsOf.toISOString(), pages = structuredClone([...input.pages])
      .sort((a, b) => relations.indexOf(a.relation) - relations.indexOf(b.relation) || a.page_index - b.page_index);
    for (const relation of relations) {
      const chain = pages.filter(page => page.relation === relation).sort((a, b) => a.page_index - b.page_index);
      if (!chain.length || chain.length > 10) throw new BindingFinancialBatchError();
      for (let n = 0; n < chain.length; n++) {
        const current = chain[n];
        if (current.page_index !== n || current.input_cursor !== (n === 0 ? null : chain[n - 1].page.nextCursor) ||
          !Array.isArray(current.page.items) || current.page.items.length > 200 ||
          !current.page.asOf || !at.safeParse(current.page.asOf).success || Date.parse(current.page.asOf) < Date.parse(sourceAsOf) ||
          (n === chain.length - 1 ? current.page.nextCursor !== null : !current.page.nextCursor)) throw new BindingFinancialBatchError();
      }
    }
    if (pages.some(page => !relations.includes(page.relation)) ||
      Math.min(...pages.map(page => Date.parse(page.page.asOf!))) !== Date.parse(sourceAsOf)) throw new BindingFinancialBatchError();
    const sourceSnapshotRef = digest({ source_as_of: sourceAsOf, original_pages: pages });
    const scope = { workspace_id: input.workspaceId, environment: input.environment, principal, source_snapshot_ref: sourceSnapshotRef,
      source_as_of: sourceAsOf, original_pages: pages, bindings };
    const result = { ...scope, request_digest: digest(scope) };
    const freeze = (value: unknown): void => { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } };
    freeze(result); return result;
  } catch { throw new BindingFinancialBatchError(); }
}

/** Owning refresh is one batch OUTSIDE local RR. No provider, no usable source
 * cut or no bindings means absence; no invented family or balance inference.
 * A malformed qualified answer fails before replaceBindings begins. */
export async function readBindingFinancialRefresh(source: BindingFinancialRefreshSource | undefined,
  request: BindingFinancialRefreshRequest, options: { timeout_ms: number }): Promise<ReadonlyMap<string, BindingFigures> | undefined> {
  if (!source || request.bindings.length === 0) return undefined;
  const controller = new AbortController();
  let timeout: ReturnType<typeof setTimeout> | undefined, abort: (() => void) | undefined;
  try {
    if (!Number.isSafeInteger(options.timeout_ms) || options.timeout_ms < 250 || options.timeout_ms > 30000)
      throw new BindingFinancialBatchError();
    const expired = new Promise<never>((_resolve, reject) => {
      abort = () => reject(new BindingFinancialBatchError());
      controller.signal.addEventListener("abort", abort, { once: true });
    });
    timeout = setTimeout(() => controller.abort(), options.timeout_ms);
    timeout.unref();
    const raw = await Promise.race([source.read(request, controller.signal), expired]);
    if (raw === undefined) return undefined;
    const parsed = refreshBatch.safeParse(raw);
    if (!parsed.success) throw new BindingFinancialBatchError();
    const value = parsed.data;
    if (value.workspace_id !== request.workspace_id || value.environment !== request.environment ||
      digest(value.principal) !== digest(request.principal) || value.source_as_of !== request.source_as_of)
      throw new BindingFinancialBatchError();
    validateObservationCut(value.rows, request.source_as_of);
    return financialRows(request, value);
  } catch { throw new BindingFinancialBatchError(); }
  finally { if (timeout) clearTimeout(timeout); if (abort) controller.signal.removeEventListener("abort", abort); }
}

/** Concrete local adapter for the ALREADY delivered optional list_figures
 * column. All identities and owning figure provenance ride on the ORIGINAL
 * keyset batch, in the page's own RR snapshot; no redundant second query.
 * It neither queries wallet balances
 * nor computes headroom/equity from raw cash. A deployment with no retained
 * owning figures simply returns undefined. No new table/migration is needed. */
export function createRetainedBindingFinancialBatchSource(): BindingFinancialBatchSource {
  return Object.freeze({ async read(request: BindingFinancialBatchRequest, snapshot: PostgresSnapshotReader<BindingRow>) {
    if (request.bindings.length === 0) return undefined;
    const rows = snapshot.rows;
    if (rows.length !== request.bindings.length || new Set(rows.map(row => row.binding_id)).size !== rows.length)
      throw new BindingFinancialBatchError();
    const available: Array<z.infer<typeof identity> & { figures: unknown }> = [];
    for (const row of rows) {
      const expected = request.bindings.find(value => value.binding_id === row.binding_id);
      if (!expected || expected.account_id !== row.account_id || expected.venue !== row.venue ||
          row.scope_id !== `${request.workspace_id}:${request.environment}` ||
          !(row.projection_refreshed_at instanceof Date) ||
          row.projection_refreshed_at.toISOString() !== request.projection_refreshed_at ||
          (row.source_as_of === null ? null : row.source_as_of instanceof Date ? row.source_as_of.toISOString() : undefined) !== request.source_as_of)
        throw new BindingFinancialBatchError();
      if (row.list_figures !== null && row.list_figures !== undefined) available.push({ binding_id: row.binding_id,
        account_id: row.account_id, venue: row.venue, figures: row.list_figures });
    }
    if (!available.length) return undefined;
    return { schema_version: "portal.internal.binding-financial-batch.v1", request_digest: request.request_digest,
      source_snapshot_ref: request.source_snapshot_ref, authority: "TRADING_SYSTEM",
      source_ref: "portal-projection:execution_binding_projection.list_figures",
      coverage: available.length === request.bindings.length ? "COMPLETE" : "PARTIAL", rows: available };
  } });
}

/** Runtime adapter, invoked once per page inside RR. Undefined means no
 * qualified owning family, never zero; errors stay errors, not stale fallback. */
export async function readBindingFinancialBatch(source: BindingFinancialBatchSource | undefined,
  request: BindingFinancialBatchRequest, snapshot: PostgresSnapshotReader<BindingRow>): Promise<ReadonlyMap<string, BindingFigures> | undefined> {
  if (!source || request.bindings.length === 0) return undefined;
  try {
    const raw = await source.read(request, snapshot);
    return raw === undefined ? undefined : mapBindingFinancialBatch(request, raw);
  } catch { throw new BindingFinancialBatchError(); }
}
