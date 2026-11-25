import "reflect-metadata";
import { Pool } from "pg";
import { loadConfig } from "../config";
import { parseGrantEnvironments, provisionDefaultExecutionGrant } from "../execution/default-execution-grants";

/** Usage: execution-default-grant grant|renew <username> <paper,sandbox,live>   |   revoke <username>
 * Environments are mandatory and explicit. Runs against DATABASE_URL (Core) only; prints no secret. */
async function main() {
  const [operation, username, environments] = process.argv.slice(2), cfg = loadConfig();
  const core = new Pool({ connectionString: cfg.DATABASE_URL, max: 1 });
  try {
    if ((operation === "grant" || operation === "renew") && username)
      console.log(JSON.stringify(await provisionDefaultExecutionGrant(core, cfg, { username, environments: parseGrantEnvironments(environments) })));
    else if (operation === "revoke" && username)
      console.log(JSON.stringify(await provisionDefaultExecutionGrant(core, cfg, { username, revoke: true })));
    else throw new Error("USAGE_execution-default-grant_grant_renew_revoke");
  } finally { await core.end(); }
}
void main().catch(error => { console.error(JSON.stringify({ error: /^[A-Z0-9_-]+$/i.test(error.message) ? error.message : "DR30_OPERATION_FAILED" })); process.exitCode = 1; });
