import type { BeforeApplicationShutdown, OnModuleInit } from "@nestjs/common";
import { Pool } from "pg";
import type { AuthService } from "./auth.service";
import { PgStreamRevocationBridge } from "./stream-revocation-pg";

/** Private Core database only: one LISTEN socket, one bounded NOTIFY socket.
 * Advisory hints accelerate the existing current-policy fences; losing this
 * bus neither grants reads nor makes revoke depend on delivery of a message.
 * This lifecycle owns its pool and closes it before app/database teardown. */
export class StreamRevocationRuntime implements OnModuleInit, BeforeApplicationShutdown {
  private readonly pool: Pool | undefined;
  private readonly bridge: PgStreamRevocationBridge | undefined;
  private closed: Promise<void> | undefined;
  constructor(source: Pool, auth: AuthService, enabled: boolean) {
    if (!enabled) return;
    this.pool = new Pool({ ...source.options, max: 2, min: 0, idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 1_000, query_timeout: 1_000, statement_timeout: 1_000,
      application_name: "portal-auth-revocation-hints" });
    this.pool.on("error", () => { /* best effort only; no credentials in logs */ });
    this.bridge = new PgStreamRevocationBridge(this.pool, auth.streamHints);
  }
  async onModuleInit(): Promise<void> { await this.bridge?.start(); }
  beforeApplicationShutdown(): Promise<void> {
    return this.closed ??= (async () => { await this.bridge?.close(); await this.pool?.end(); })();
  }
}
