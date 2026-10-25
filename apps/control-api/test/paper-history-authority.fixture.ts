/** Explicit legacy/sticky-policy router for source-only Paper tests. The real
 * ExecutionReadScopes mints and revalidates scopes against this synthetic
 * identity adapter. Never a production grant or source qualification proof. */
import type { Pool } from "pg";
import type { ControlApiConfig } from "../src/config";
import type { ExecutionAccessService } from "../src/execution-v2/access.service";
import { ExecutionReadScopes } from "../src/execution-v2/read-scope";

export function paperHistoryTestScopes(config: ControlApiConfig,
  identity: (call: number) => Record<string, unknown> = () => ({})): ExecutionReadScopes {
  let calls = 0;
  const pool = { async query() {
    return { rows: [{ role: "ADMIN", session_version: 1, policy: null, policy_seen: false,
      workspace_exists: true, member: true, owner: false, retained: [], ...identity(++calls) }] };
  } };
  const access = { hasNativeCurrentRelations: () => false, readContext: async () => ({ policy: null }) };
  return new ExecutionReadScopes(pool as unknown as Pool, access as unknown as ExecutionAccessService, config);
}
