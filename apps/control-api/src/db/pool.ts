import { Pool, PoolClient } from "pg";
import { Logger } from "@nestjs/common";

let sharedPool: Pool | null = null;

export function buildPool(connectionString: string): Pool {
  if (sharedPool === null || sharedPool.options.connectionString !== connectionString) {
    sharedPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    });
    // pg discards a disconnected idle client before emitting this event.
    // Without a listener, EventEmitter terminates the entire API during a
    // DB restart. Do not log Error.message/client/config: they can carry DSNs.
    const logger = new Logger("PostgreSQLPool");
    let lastWarningAt = -Infinity;
    sharedPool.on("error", (error: Error & { code?: string }) => {
      const now = Date.now();
      if (now - lastWarningAt < 30_000) return;
      lastWarningAt = now;
      const code = typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
        ? error.code : "CONNECTION_ERROR";
      logger.warn(JSON.stringify({ event: "DATABASE_IDLE_CONNECTION_LOST", code }));
    });
  }
  return sharedPool;
}

export function getPool(): Pool {
  if (sharedPool === null) {
    throw new Error("database pool is not initialized");
  }
  return sharedPool;
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
