/** In-flight DATA sharing only. Every controller still authorizes its caller.
 * Exact SQL/values (including workspace/profile/range/currency) form the key.
 * No result/permission/error survives settlement; transaction readers bypass it.
 */
import type { Pool, QueryResult, QueryResultRow } from "pg";

export class RetainedDataFlights {
  private readonly flights = new Map<string, { read: Promise<QueryResult<QueryResultRow>>; readers: number }>();

  async query<T extends QueryResultRow>(pool: Pool, text: string, values: unknown[]): Promise<QueryResult<T>> {
    const key = JSON.stringify([text, values]);
    const existing = this.flights.get(key);
    if (existing) {
      if (existing.readers >= 64) throw Object.assign(new Error("EXECUTION_POOL_BUSY"), { code: "EXECUTION_POOL_BUSY" });
      existing.readers++;
      try { return await existing.read as QueryResult<T>; } finally { existing.readers--; }
    }
    // Keep the coalescer bounded; distinct requests still use pg's finite
    // pool/queue admission rather than becoming an unbounded second queue.
    if (this.flights.size >= 16) return pool.query<T>(text, values);
    const flight = { read: pool.query<T>(text, values), readers: 1 };
    this.flights.set(key, flight);
    try { return await flight.read; } finally { if (this.flights.get(key) === flight) this.flights.delete(key); }
  }
}
