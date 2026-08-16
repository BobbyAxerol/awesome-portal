import { Pool, PoolClient } from "pg";

let sharedPool: Pool | null = null;

export function buildPool(connectionString: string): Pool {
  if (sharedPool === null || sharedPool.options.connectionString !== connectionString) {
    sharedPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
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
