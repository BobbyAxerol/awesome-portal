/** Transport/shutdown failures only. Never classify invalid SQL, corrupt
 * contracts or arbitrary error text as a transient store outage. */
export function isReadStoreUnavailable(error: unknown): boolean {
  const code=typeof error==="object"&&error!==null&&"code" in error?String(error.code):"";
  return /^(?:08[0-9A-Z]{3}|57P0[123]|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN)$/.test(code) ||
    error instanceof Error && [
      "Connection terminated unexpectedly", "Connection terminated",
      // pg-pool wraps its transport cause when connectionTimeoutMillis fires.
      "Connection terminated due to connection timeout", "timeout exceeded when trying to connect",
      "Client has encountered a connection error and is not queryable", "Client was closed and is not queryable",
    ].includes(error.message);
}
