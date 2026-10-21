/**
 * BE-P16 (ELP2-05/06, ELP2-REQ-06-002): the bounded Manager series writer, as an optional slot of the existing Manager runtime.
 *
 * It adds no timer, no source call, no route, no ACK and no checkpoint of the source. It rides the one serial tick of
 * `ExecutionManagerRuntime` and the one lease of `ManagerProjectionConsumer`:
 *
 *  - MATERIALIZE (before the commit): `materialize` reads the retained observations (bounded) and builds the revision's
 *    `precomputed_series` from facts alone (`materializeManagerSeries`). It never throws on data: a failure becomes a typed absence
 *    and the financial revision is published without series;
 *  - RECORD (inside the commit): `lifecycle().persistAttached` writes the revision's observations in the SAME lease-fenced
 *    transaction as the revision, behind a SAVEPOINT, so the series writer can refuse but can never fail the financial revision;
 *  - BACKFILL (when the source has nothing new): `lifecycle().idle` replays retained revisions the writer has not seen, a bounded
 *    number per tick, resumable from a keyset cursor after a restart.
 *
 * Idempotence: a revision is recorded once (primary key + digest); a lost ACK or a restart replays the same bytes and records nothing new.
 */
import type { Pool, PoolClient } from "pg";
import type { ManagerConsumerDelivery, ManagerCalculationLifecycle } from "./manager-consumer";
import type { ManagerLeaseScope } from "./manager-lease";
import type { ManagerModelDocument } from "./manager-model.contract";
import { AbsenceLedger, deriveSeriesObservations } from "./manager-series-observation";
import { materializeManagerSeries, validateSeriesConfig, type ManagerSeriesConfig, type MaterializedSeries } from "./manager-series-materializer";
import { ManagerSeriesStore } from "./manager-series.store";

export interface ManagerSeriesInstallation extends ManagerSeriesConfig {
  /** Revisions replayed per idle tick, 1..16. Each is its own bounded transaction. */
  maximum_backfill_revisions: number;
}
const DAY = 86_400_000;
const attached = new WeakMap<object, MaterializedSeries>();

export class ManagerSeriesRuntime {
  readonly store: ManagerSeriesStore;
  private readonly config: ManagerSeriesConfig;
  private readonly backfill: number;
  constructor(pool: Pool, installation: ManagerSeriesInstallation) {
    const { maximum_backfill_revisions, ...config } = installation;
    this.config = validateSeriesConfig(config);
    if (!Number.isSafeInteger(maximum_backfill_revisions) || maximum_backfill_revisions < 1 || maximum_backfill_revisions > 16)
      throw new Error("MANAGER_SERIES_CONFIG_INVALID");
    this.backfill = maximum_backfill_revisions;
    this.store = new ManagerSeriesStore(pool);
  }

  /** Never throws on data or infrastructure (only on cancellation): the worst answer is an empty, explained publication list. */
  async materialize(document: ManagerModelDocument, signal: AbortSignal): Promise<MaterializedSeries> {
    if (signal.aborted) throw signal.reason ?? new Error("MANAGER_SERIES_ABORTED");
    const scope: ManagerLeaseScope = { workspace_id: document.workspace_id, environment: document.environment, profile_id: document.profile_id };
    try {
      const widest = Math.max(...this.config.windows.map(w => ({ "7D": 7, "30D": 30, "90D": 90 })[w]));
      const history = await this.store.history(scope, { floor_ms: Math.max(0, document.as_of_ms - widest * DAY), to_ms: document.as_of_ms,
        exclude_revision: document.revision, maximum_rows: this.config.maximum_history_rows });
      if (signal.aborted) throw signal.reason ?? new Error("MANAGER_SERIES_ABORTED");
      return materializeManagerSeries(document, history, this.config);
    } catch (error) {
      if (signal.aborted) throw signal.reason ?? error;
      const ledger = new AbsenceLedger(); ledger.add("SERIES_MATERIALIZATION_FAILED", null);
      return { publications: [], absences: ledger.list(), current: deriveSeriesObservations(document) };
    }
  }

  /** Binds the materialization to the exact delivery object the consumer will commit. */
  attach(delivery: object, materialized: MaterializedSeries): void { attached.set(delivery, materialized); }

  /** Wraps the (optional) Score/custody lifecycle; the delegate keeps its own deadline, assertion and idle semantics. */
  lifecycle(delegate?: ManagerCalculationLifecycle): ManagerCalculationLifecycle {
    const store = this.store, maximum = this.backfill;
    return {
      attachedDeadline: (delivery: ManagerConsumerDelivery) => delegate?.attachedDeadline(delivery),
      assertAttached: (delivery: ManagerConsumerDelivery) => { delegate?.assertAttached(delivery); },
      persistAttached: async (client: PoolClient, delivery: ManagerConsumerDelivery) => {
        if (delegate) await delegate.persistAttached(client, delivery);
        const item = attached.get(delivery);
        if (!item) return;
        const doc = delivery.document as ManagerModelDocument;
        const scope: ManagerLeaseScope = { workspace_id: doc.workspace_id, environment: doc.environment, profile_id: doc.profile_id };
        await client.query("SAVEPOINT manager_optional_series");
        try {
          // A non-throwing DIGEST_MISMATCH is recorded explicitly (typed error disposition); nothing was written for it.
          await store.recordLive(client, scope, item.current);
          await client.query("RELEASE SAVEPOINT manager_optional_series");
        } catch (error) {
          // The series is optional derivation. A refusal (bound, constraint, statement timeout of its own) rolls back only the series
          // rows and is remembered; the financial revision, its head and its ACK are untouched. A lost lease is NOT swallowed: the
          // deferred fence check still fails the whole COMMIT.
          await client.query("ROLLBACK TO SAVEPOINT manager_optional_series");
          await client.query("RELEASE SAVEPOINT manager_optional_series");
          await store.recordFailure(client, scope, doc.revision, error instanceof Error && /^[A-Z][A-Z0-9_]+$/.test(error.message) ? error.message : "SERIES_RECORD_REFUSED");
        }
      },
      idle: async input => {
        if (delegate) await delegate.idle(input);
        await store.backfill({ ...input, maximum_revisions: maximum });
      },
    };
  }
}
