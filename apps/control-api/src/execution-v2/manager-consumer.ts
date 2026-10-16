import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { ManagerProjectionLeases, type ManagerLeaseScope, type ManagerProjectionLease } from "./manager-lease";
import { managerModelDocument, type ManagerModelDocument } from "./manager-model.contract";
import { ManagerModelRepository, prepareManagerProjection, persistManagerProjection,
  type ManagerModelHead, type PreparedManagerProjection } from "./manager-model.store";
import { datasetPublication, type DatasetPublication } from "./publication.contract";
import { publicationCommissioningCurrent, publicationCommissioningDeadline,
  type PublicationCommissioning, type PublicationContinuity } from "./publication-adapter";

const scopeSchema = z.object({ workspace_id: z.string().min(1).max(256),
  environment: z.enum(["paper", "sandbox", "live"]), profile_id: z.string().min(1).max(256) }).strict();
const boundsSchema = z.object({
  maximum_documents_per_tick: z.number().int().min(1).max(32),
  maximum_document_bytes: z.number().int().min(1).max(8 * 1024 * 1024),
  maximum_document_rows: z.number().int().min(1).max(30_000),
  maximum_tick_ms: z.number().int().min(1).max(300_000),
  source_timeout_ms: z.number().int().min(1).max(60_000),
  transaction_timeout_ms: z.number().int().min(1).max(60_000),
  lease_ttl_ms: z.number().int().min(1).max(300_000),
}).strict();
export type ManagerConsumerBounds = Readonly<z.infer<typeof boundsSchema>>;
export interface ManagerConsumerDelivery {
  document: unknown;
  publication: DatasetPublication;
  expectedContinuity?: PublicationContinuity;
  rebuild?: { expected_revision: string; receipt_ref: string };
}
export interface ManagerConsumerReceipt {
  scope: ManagerLeaseScope;
  revision: string;
  digest: string;
  source_epoch: string;
  source_sequence: string;
  projection_generation: string;
  publication_revision: string;
}
/** Private installed provider, not browser/config-supplied callbacks. Each
 * source method MUST settle after AbortSignal cancellation, with finite I/O
 * timeouts of its own. We await cancellation rather than abandon a live fetch
 * and start another one. Qualification remains independently commissioned. */
export interface ManagerProjectionSource {
  read(input: { scope: ManagerLeaseScope; head: ManagerModelHead | null;
    maximum_bytes: number; maximum_rows: number; signal: AbortSignal }): Promise<ManagerConsumerDelivery | null>;
  recheck(input: { scope: ManagerLeaseScope; document: ManagerModelDocument;
    publication: DatasetPublication; signal: AbortSignal }): Promise<{ assertCurrent?: () => void }>;
  acknowledge(receipt: ManagerConsumerReceipt, signal: AbortSignal): Promise<void>;
}
export interface ManagerConsumerTick {
  state: "IDLE" | "LEASE_BUSY" | "COMMITTED" | "BATCH_LIMIT" | "TIME_LIMIT";
  committed: number;
  acknowledged: number;
  last_receipt: ManagerConsumerReceipt | null;
}

/** Explicit, finite, pull-driven background primitive. It creates no timer,
 * source endpoint, pool, default cadence or implicit activation. One shared
 * tick promise bounds duplicate callers; DB lease fences separate replicas. */
export class ManagerProjectionConsumer {
  private readonly scope: ManagerLeaseScope;
  private readonly bounds: ManagerConsumerBounds;
  private readonly holder: string;
  private readonly leases: ManagerProjectionLeases;
  private readonly repository: ManagerModelRepository;
  private lease: ManagerProjectionLease | null = null;
  private flight: Promise<ManagerConsumerTick> | null = null;
  private cancellation: AbortController | null = null;
  private stopping = false;

  constructor(private readonly options: { pool: Pool; source: ManagerProjectionSource; scope: ManagerLeaseScope;
    bounds: ManagerConsumerBounds; holder_id?: string; commissioning?: PublicationCommissioning;
    allowTestOnly?: boolean; now?: () => number }) {
    this.scope = Object.freeze(scopeSchema.parse(options.scope));
    this.bounds = Object.freeze(boundsSchema.parse(options.bounds));
    this.options = Object.freeze({ ...options });
    if (this.bounds.source_timeout_ms > this.bounds.maximum_tick_ms ||
        this.bounds.transaction_timeout_ms > this.bounds.maximum_tick_ms)
      throw new Error("MANAGER_CONSUMER_LIMIT_INVALID");
    this.holder = z.string().uuid().parse(options.holder_id ?? randomUUID());
    this.leases = new ManagerProjectionLeases(options.pool);
    this.repository = new ManagerModelRepository(options.pool);
  }

  tick(): Promise<ManagerConsumerTick> {
    if (this.stopping) return Promise.reject(new Error("MANAGER_CONSUMER_STOPPED"));
    if (this.flight) return this.flight;
    const cancellation = new AbortController(); this.cancellation = cancellation;
    const flight = this.run(cancellation);
    this.flight = flight;
    void flight.finally(() => {
      if (this.flight === flight) { this.flight = null; this.cancellation = null; }
    }).catch(() => undefined);
    return flight;
  }

  /** Stop is permanent for this instance. Await source cancellation/transaction
   * cleanup before releasing ownership; never release while it can still write. */
  async stop(): Promise<void> {
    this.stopping = true; this.cancellation?.abort(new Error("MANAGER_CONSUMER_STOPPED"));
    if (this.flight) await this.flight.catch(() => undefined);
    await this.release();
  }

  private async release() {
    const owned = this.lease; this.lease = null;
    if (owned) await this.leases.release(owned);
  }

  private async own() {
    if (this.lease && await this.leases.renew(this.lease, this.bounds.lease_ttl_ms)) return true;
    this.lease = await this.leases.acquire(this.scope, this.holder, this.bounds.lease_ttl_ms);
    return this.lease !== null;
  }

  private check(signal: AbortSignal) {
    if (signal.aborted) throw signal.reason ?? new Error("MANAGER_CONSUMER_STOPPED");
  }

  private async sourceCall<T>(cancellation: AbortController, timeoutMs: number,
    fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
    this.check(cancellation.signal);
    const timer = setTimeout(() => cancellation.abort(new Error("MANAGER_SOURCE_TIMEOUT")), timeoutMs);
    try { const result = await fn(cancellation.signal); this.check(cancellation.signal); return result; }
    finally { clearTimeout(timer); }
  }

  private async run(cancellation: AbortController): Promise<ManagerConsumerTick> {
    const started = performance.now(), result: ManagerConsumerTick = {
      state: "IDLE", committed: 0, acknowledged: 0, last_receipt: null,
    };
    const remaining = () => Math.max(0, Math.floor(this.bounds.maximum_tick_ms - (performance.now() - started)));
    try {
      this.checkCommissioning();
      if (!await this.own()) return { ...result, state: "LEASE_BUSY" };
      for (let i = 0; i < this.bounds.maximum_documents_per_tick; i++) {
        this.checkCommissioning();
        this.check(cancellation.signal);
        if (!remaining()) return { ...result, state: "TIME_LIMIT" };
        if (!this.lease || !await this.leases.renew(this.lease, this.bounds.lease_ttl_ms))
          throw new Error("MANAGER_LEASE_LOST");
        const head = await this.repository.head(this.scope.workspace_id, this.scope.environment, this.scope.profile_id);
        const delivery = await this.sourceCall(cancellation, Math.min(this.bounds.source_timeout_ms, remaining()),
          signal => this.options.source.read({ scope: { ...this.scope }, head: head && { ...head },
            maximum_bytes: this.bounds.maximum_document_bytes, maximum_rows: this.bounds.maximum_document_rows, signal }));
        if (delivery === null) return result;
        if (Buffer.byteLength(JSON.stringify(delivery)) > this.bounds.maximum_document_bytes)
          throw new Error("MANAGER_PROJECTION_LIMIT");
        const document = managerModelDocument.parse(delivery.document), publication = datasetPublication.parse(delivery.publication);
        if (document.members.length + document.facts.length > this.bounds.maximum_document_rows)
          throw new Error("MANAGER_PROJECTION_LIMIT");
        if (document.workspace_id !== this.scope.workspace_id || document.environment !== this.scope.environment ||
            document.profile_id !== this.scope.profile_id) throw new Error("MANAGER_CONSUMER_SCOPE_MISMATCH");
        const nowMs = this.options.now?.() ?? Date.now();
        const prepared = prepareManagerProjection(document, publication, { nowMs,
          allowTestOnly: this.options.allowTestOnly === true, commissioning: this.options.commissioning,
          expectedContinuity: delivery.expectedContinuity, rebuild: delivery.rebuild, lease: this.lease });
        const current = await this.sourceCall(cancellation, Math.min(this.bounds.source_timeout_ms, Math.max(1, remaining())),
          signal => this.options.source.recheck({ scope: { ...this.scope }, document: prepared.document,
            publication: structuredClone(publication), signal }));
        this.check(cancellation.signal);
        if (!remaining()) return { ...result, state: "TIME_LIMIT" };
        // The database caps expiry to this absolute timestamp atomically. A
        // clock sample followed by relative renewal could overshoot publication
        // expiry by the inter-query latency. Deferred validation fences COMMIT.
        const notAfter = document.qualification === "SOURCE_VERIFIED" ?
          Math.min(publication.expires_at_ms, this.options.commissioning ? publicationCommissioningDeadline(this.options.commissioning) : 0) :
          publication.expires_at_ms;
        if (!await this.leases.renew(this.lease, this.bounds.lease_ttl_ms, notAfter))
          throw new Error("MANAGER_LEASE_LOST");
        const assertCurrent = () => {
          if (document.qualification === "SOURCE_VERIFIED" && !publicationCommissioningCurrent(this.options.commissioning,
            this.scope, Date.now())) throw new Error("MANAGER_COMMISSIONING_EXPIRED");
          return current.assertCurrent?.();
        };
        const committed = await this.commit(prepared, assertCurrent, cancellation.signal,
          Math.max(1, Math.min(this.bounds.transaction_timeout_ms, remaining())), started + this.bounds.maximum_tick_ms);
        result.committed++; result.state = "COMMITTED";
        const receipt: ManagerConsumerReceipt = { scope: { ...this.scope }, revision: committed.revision,
          digest: committed.digest, source_epoch: document.source_epoch, source_sequence: document.source_sequence,
          projection_generation: document.projection_generation, publication_revision: publication.authority.publication_revision };
        result.last_receipt = receipt;
        // Connection released before this callback. ACK is a durable Portal
        // projection receipt, not an invented TS event/retention acknowledgement.
        await this.sourceCall(cancellation, Math.min(this.bounds.source_timeout_ms, Math.max(1, remaining())),
          signal => this.options.source.acknowledge(structuredClone(receipt), signal));
        result.acknowledged++;
      }
      return { ...result, state: "BATCH_LIMIT" };
    } catch (error) {
      // Keep immutable committed revisions on failure/ACK loss; duplicate-current
      // retry may acknowledge their exact digest. Release never deletes tokens.
      await this.release().catch(() => undefined); throw error;
    }
  }

  private checkCommissioning() {
    if(this.options.commissioning && !publicationCommissioningCurrent(this.options.commissioning,this.scope,Date.now()))
      throw new Error("MANAGER_COMMISSIONING_EXPIRED");
  }

  private async commit(input: PreparedManagerProjection, assertCurrent: (() => void) | undefined,
    signal: AbortSignal, timeoutMs: number, tickDeadlineMs: number) {
    const deadline = Math.min(tickDeadlineMs, performance.now() + timeoutMs);
    const client: PoolClient = await this.options.pool.connect(); let committed = false;
    try {
      if (performance.now() >= deadline) throw new Error("MANAGER_TRANSACTION_TIMEOUT");
      this.check(signal); await client.query("BEGIN");
      await client.query("SELECT set_config('statement_timeout',$1,true),set_config('lock_timeout',$1,true)", [`${timeoutMs}ms`]);
      const result = await persistManagerProjection(client, input);
      this.check(signal);
      const fenceResult: unknown = assertCurrent?.();
      if (fenceResult !== undefined) {
        // A mistakenly async callback is not a synchronous source fence. Do
        // not await network while holding the projection transaction open.
        if (fenceResult instanceof Promise) void fenceResult.catch(() => undefined);
        throw new Error("MANAGER_SOURCE_FENCE_MUST_BE_SYNCHRONOUS");
      }
      this.check(signal);
      if (performance.now() >= deadline) throw new Error("MANAGER_TRANSACTION_TIMEOUT");
      await client.query("COMMIT"); committed = true; return result;
    } catch (error) { if (!committed) await client.query("ROLLBACK").catch(() => undefined); throw error; }
    finally { client.release(); }
  }
}
