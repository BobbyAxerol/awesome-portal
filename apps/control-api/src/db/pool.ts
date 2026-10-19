import { Pool, PoolClient } from "pg";
import { Logger } from "@nestjs/common";
import type { ControlApiConfig } from "../config";

let sharedPool: Pool | null = null;
const corePools = new Map<string, Pool>();
const corePoolProfiles = new WeakMap<Pool,string>();

/** Explicit private installation bounds; never mutate a live cached pool. */
export interface CorePoolProfile {
  max:number; connectionTimeoutMillis:number; statement_timeout:number;
  query_timeout:number; idle_in_transaction_session_timeout:number;
}
function reviewedCorePoolProfile(input:CorePoolProfile):CorePoolProfile {
  const profile={max:input.max,connectionTimeoutMillis:input.connectionTimeoutMillis,
    statement_timeout:input.statement_timeout,query_timeout:input.query_timeout,
    idle_in_transaction_session_timeout:input.idle_in_transaction_session_timeout};
  if(!Number.isSafeInteger(profile.max)||profile.max<1||profile.max>10||
    [profile.connectionTimeoutMillis,profile.statement_timeout,profile.query_timeout,
      profile.idle_in_transaction_session_timeout].some(n=>!Number.isSafeInteger(n)||n<1||n>60000)||
    profile.query_timeout<=profile.statement_timeout)
    throw new Error("CURRENT_HUMAN_CORE_POOL_PROFILE_INVALID");
  return Object.freeze(profile);
}

export function buildPool(connectionString: string, input?:CorePoolProfile): Pool {
  const profile=input===undefined?undefined:reviewedCorePoolProfile(input);
  const fingerprint=profile===undefined?"LEGACY":JSON.stringify(profile);
  const existing = corePools.get(connectionString);
  if (existing && !(existing as Pool & {ending:boolean;ended:boolean}).ending &&
      !(existing as Pool & {ended:boolean}).ended) {
    if(profile!==undefined&&corePoolProfiles.get(existing)!==fingerprint)
      throw new Error("CURRENT_HUMAN_CORE_POOL_PROFILE_MISMATCH");
    sharedPool = existing; return existing;
  }
  {
    sharedPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
      ...profile,
    });
    corePools.set(connectionString, sharedPool);
    corePoolProfiles.set(sharedPool,fingerprint);
    const pool = sharedPool, originalEnd = pool.end.bind(pool);
    pool.end = ((callback?: () => void) => {
      if (corePools.get(connectionString) === pool) corePools.delete(connectionString);
      return callback ? originalEnd(callback) : originalEnd();
    }) as Pool["end"];
    // pg discards a disconnected idle client before emitting this event.
    // Without a listener, EventEmitter terminates the entire API during a
    // DB restart. Do not log Error.message/client/config: they can carry DSNs.
    const logger = new Logger("PostgreSQLPool");
    let lastWarningAt = -Infinity;
    const warnConnectionLoss = (event: string, error: Error & { code?: string }) => {
      const now = Date.now();
      if (now - lastWarningAt < 30_000) return;
      lastWarningAt = now;
      const code = typeof error.code === "string" && /^[A-Z0-9]{5}$/.test(error.code)
        ? error.code : "CONNECTION_ERROR";
      logger.warn(JSON.stringify({ event, code }));
    };
    sharedPool.on("error", (error: Error & { code?: string }) =>
      warnConnectionLoss("DATABASE_IDLE_CONNECTION_LOST", error));
    // pg's pool handler is removed while a client is checked out. A server
    // idle-in-transaction termination can otherwise crash the process before
    // COMMIT rejects. The query still rejects normally; pg destroys the broken
    // client on release. Never swallow query errors or relax transaction bounds.
    sharedPool.on("connect", (client: PoolClient) => {
      client.on("error", (error: Error & { code?: string }) =>
        warnConnectionLoss("DATABASE_BORROWED_CONNECTION_LOST", error));
    });
  }
  return sharedPool;
}

/** No singleton replacement: a domain pool never becomes the identity pool. */
export function buildExecutionPool(config: ControlApiConfig): Pool {
  if (!config.EXECUTION_DATABASE_URL) throw new Error("EXECUTION_DATABASE_URL_REQUIRED");
  const pool = new Pool({ connectionString: config.EXECUTION_DATABASE_URL,
    max: config.EXECUTION_DATABASE_POOL_MAX, idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 2_000, statement_timeout: 5_000, query_timeout: 6_000,
    idle_in_transaction_session_timeout: 5_000, application_name: "portal-execution-data" });
  const originalConnect = pool.connect.bind(pool);
  // pg.query uses the callback form; repositories use the Promise form.
  // Bound both paths before entering pg's queue, not after a client arrives.
  pool.connect = ((callback?: (error: Error | undefined, client: PoolClient | undefined, release: (destroy?: boolean) => void) => void) => {
    if (pool.totalCount >= config.EXECUTION_DATABASE_POOL_MAX &&
        pool.idleCount === 0 && pool.waitingCount >= config.EXECUTION_DATABASE_POOL_QUEUE_MAX) {
      const error = Object.assign(new Error("EXECUTION_POOL_BUSY"), { code: "EXECUTION_POOL_BUSY" });
      if (callback) { queueMicrotask(() => callback(error, undefined, () => {})); return; }
      return Promise.reject(error);
    }
    return callback ? originalConnect(callback) : originalConnect();
  }) as Pool["connect"];
  const logger = new Logger("ExecutionDataPool");
  let lastWarningAt = -Infinity;
  const warn = (error: Error & { code?: string }) => {
    if (Date.now() - lastWarningAt < 30_000) return;
    lastWarningAt = Date.now();
    logger.warn(JSON.stringify({ event: "EXECUTION_DATABASE_CONNECTION_LOST",
      code: /^[A-Z0-9]{5}$/.test(error.code ?? "") ? error.code : "CONNECTION_ERROR" }));
  };
  pool.on("error", warn);
  pool.on("connect", (client: PoolClient) => client.on("error", warn));
  return pool;
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
  let discardClient = false;
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch { discardClient = true; }
    throw error;
  } finally {
    if(discardClient) client.release(true);
    else client.release();
  }
}
