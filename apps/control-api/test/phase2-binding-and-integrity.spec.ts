/**
 * PHASE 2 (round 2) · the route that could never answer, and the finding
 * nobody could see.
 *
 * 2A: every binding the source publishes carries an `@`, and the analytics
 * identifier grammar has none, so `/broker-bindings/{id}/exposure` has never
 * served a binding that exists — not intermittently, never. There are two
 * gates on that path and both had to move: the proxy's own check and the
 * delegated-resource pattern.
 *
 * 2B: the mirror records a gap when a relation did not arrive and a conflict
 * when a row arrived twice differently, and until now nothing read either.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ExecutionDurableMirrorRepository } from "../src/execution/durable-mirror.repository";
import {
  AnalyticsProxyError,
  bindingExposureResource,
  parseBindingId,
} from "../src/execution/analytics.proxy";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";

const workspaceId = "ws_phase2";
const profileId = "PAPER_BINANCE_USDM";
const environment = "paper" as const;

/** Shapes taken from the 43 bindings dev publishes, not invented. */
const PUBLISHED = [
  "paper-binance-dynamic_grid_long_short_1h@BINANCE",
  "paper-binance-deep_momentum_prod_yearly_monthly_1d@BINANCE",
  "paper-binance-regressionportfolioA001_1d@BINANCE",
  "sandbox-binance-vol_breakout_sl_tp_0011h@BINANCE",
  "paper-dnse-vnmomo@PAPER_DNSE_VNM",
  "sandbox-okx-carry@OKX",
];

const config = testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "true",
});

/** Same config with the mirror switched off, for the disabled-state check. */
const mirrorOffConfig = testConfig({
  FEATURE_EXECUTION_EDGE: "true",
  EXECUTION_EDGE_PRIVATE_KEY_FILE: "/run/secrets/test/delegation.pem",
  EXECUTION_EDGE_CA_FILE: "/run/secrets/test/ca.crt",
  EXECUTION_EDGE_CLIENT_CERT_FILE: "/run/secrets/test/client.crt",
  EXECUTION_EDGE_CLIENT_KEY_FILE: "/run/secrets/test/client.key",
  FEATURE_EXECUTION_CURRENT_SOURCE_PAPER: "true",
  EXECUTION_EDGE_PAPER_ORIGIN: "https://paper-edge.internal",
  EXECUTION_EDGE_PAPER_PROFILE_ID: profileId,
  EXECUTION_EDGE_PAPER_AUDIENCE: "portal-execution-edge-paper",
  FEATURE_EXECUTION_LOCAL_PROJECTION: "true",
  EXECUTION_LOCAL_PROJECTION_WORKSPACE_ID: workspaceId,
  EXECUTION_LOCAL_PROJECTION_POLL_INTERVAL_MS: "15000",
  EXECUTION_LOCAL_PROJECTION_LEASE_TTL_MS: "120000",
  FEATURE_EXECUTION_DURABLE_MIRROR: "false",
});

let pool: Pool;
let mirror: ExecutionDurableMirrorRepository;

beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  mirror = new ExecutionDurableMirrorRepository(config, pool);
});
afterAll(async () => { await pool.end(); });
beforeEach(async () => { await truncateAll(pool); });

describe("2A · a binding id parses on its own grammar", () => {
  it("accepts every shape the source actually publishes", () => {
    for (const id of PUBLISHED) expect(parseBindingId(id), id).toBe(id);
  });

  it("refuses everything that could change what a path or a resource means", () => {
    const refused = [
      "",                                     // nothing
      "no-at-sign-at-all",                    // the delimiter the grammar requires
      "two@at@signs",                         // ambiguous split
      "a/b@BINANCE",                          // path separator
      "a\\b@BINANCE",                         // the other path separator
      "../../etc/passwd@BINANCE",             // traversal
      "a..b@BINANCE",                         // traversal, spelled inside a legal charset
      "a%40b@BINANCE",                        // already encoded once
      "a%2540b@BINANCE",                      // encoded twice
      "a b@BINANCE",                          // whitespace
      "a\tb@BINANCE",                         // control character
      "a\nb@BINANCE",                         // header split
      "a@binance",                            // venue must be upper case
      "a@",                                   // no venue
      "@BINANCE",                             // no local part
      "-leading-hyphen@BINANCE",              // must start alphanumeric
      `${"x".repeat(130)}@BINANCE`,           // over the bound
    ];
    for (const id of refused) {
      expect(() => parseBindingId(id), JSON.stringify(id)).toThrowError(AnalyticsProxyError);
      try { parseBindingId(id); } catch (error) {
        expect((error as AnalyticsProxyError).code, JSON.stringify(id)).toBe("ANALYTICS_IDENTIFIER_INVALID");
        expect((error as AnalyticsProxyError).status, JSON.stringify(id)).toBe(400);
      }
    }
  });

  it("builds a delegated resource the delegation layer will actually issue", async () => {
    // The second gate. A resource the proxy is happy with but the issuer
    // refuses is the same dead route with a different error.
    const { isDelegatableResource } = await import("../src/execution/delegation");
    for (const id of PUBLISHED) {
      expect(isDelegatableResource(bindingExposureResource(parseBindingId(id))), id).toBe(true);
    }
  });

  it("does not widen the identifier grammar for any other subject", async () => {
    const { isDelegatableResource } = await import("../src/execution/delegation");
    // Deployment, alpha and portfolio ids were never asked to carry an `@`.
    expect(isDelegatableResource("execution:screen:alpha-360:a@BINANCE")).toBe(false);
    expect(isDelegatableResource("execution:screen:portfolio-360:a@BINANCE")).toBe(false);
    expect(isDelegatableResource("execution:screen:account-broker-360:a/b@BINANCE")).toBe(false);
  });
});

describe("2B · mirror integrity states, and what it refuses to publish", () => {
  it("is UNAVAILABLE with a reason when nothing has ever been measured", async () => {
    const integrity = await mirror.integrity({ workspaceId, environment, profileId });
    expect(integrity.state).toBe("UNAVAILABLE");
    expect(integrity.reason_code).toBe("EDS06_MIRROR_NEVER_MEASURED");
    // Null, not zero: a zero would claim a clean mirror that was never read.
    expect(integrity.total_findings).toBeNull();
    expect(integrity.gap_findings).toBeNull();
    expect(integrity.conflict_findings).toBeNull();
  });

  it("is UNAVAILABLE when the mirror is switched off, never EMPTY", async () => {
    const off = new ExecutionDurableMirrorRepository(mirrorOffConfig, pool);
    const integrity = await off.integrity({ workspaceId, environment, profileId });
    expect(integrity.state).toBe("UNAVAILABLE");
    expect(integrity.reason_code).toBe("EDS06_MIRROR_DISABLED");
    expect(integrity.total_findings).toBeNull();
  });

  it("is READY with zero findings only once a revision exists to have counted", async () => {
    await seedCurrentRevision(pool);
    const integrity = await mirror.integrity({ workspaceId, environment, profileId });
    expect(integrity.state).toBe("READY");
    expect(integrity.total_findings).toBe(0);
    expect(integrity.measured_revision).not.toBeNull();
    expect(integrity.reason_code).toBeNull();
  });

  it("is PARTIAL and aggregates by relation and reason once anything is recorded", async () => {
    await seedCurrentRevision(pool);
    await seedGap(pool, "manager.order:orders", "EDS06_RELATION_MISSING");
    await seedGap(pool, "manager.order:orders", "EDS06_RELATION_MISSING");
    // The conflicts table constrains its reason to exactly this one code.
    await seedConflict(pool, "manager.fill:fills", "EDS06_EXACT_RANGE_DIGEST_CONFLICT");
    const integrity = await mirror.integrity({ workspaceId, environment, profileId });
    expect(integrity.state).toBe("PARTIAL");
    expect(integrity.reason_code).toBe("EDS06_MIRROR_INTEGRITY_FINDINGS");
    expect(integrity.gap_findings).toBe(1);       // one relation+reason line
    expect(integrity.conflict_findings).toBe(1);
    expect(integrity.total_findings).toBe(3);     // two gaps, one conflict
    const gap = integrity.findings.find((finding) => finding.kind === "GAP");
    expect(gap?.relation_key).toBe("manager.order:orders");
    expect(gap?.findings).toBe(2);
  });

  it("never publishes a forensic value", async () => {
    await seedCurrentRevision(pool);
    await seedGap(pool, "manager.order:orders", "EDS06_RELATION_MISSING");
    // The conflicts table constrains its reason to exactly this one code.
    await seedConflict(pool, "manager.fill:fills", "EDS06_EXACT_RANGE_DIGEST_CONFLICT");
    const body = JSON.stringify(await mirror.integrity({ workspaceId, environment, profileId }));
    // The seeded row identities and digests must not appear anywhere.
    for (const secret of ["ord-4711", "row-8822", "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc", "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"]) {
      expect(body, secret).not.toContain(secret);
    }
    for (const field of ["entity_key", "row_id", "existing_digest", "incoming_digest", "cursor"]) {
      expect(body, field).not.toContain(field);
    }
  });
});

async function seedCurrentRevision(target: Pool): Promise<void> {
  await target.query(
    `INSERT INTO execution_durable_mirror_batches
       (batch_id,workspace_id,environment,profile_id,source_contract_revision,source_epoch,
        source_cursor_digest,source_as_of,received_at,completeness,projection_epoch,
        projection_sequence,payload_digest,read_model_revision,relation_count,state,created_at)
     VALUES ($1,$2,$3,$4,'rev-1','epoch-1','sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',now(),now(),'COMPLETE',$5,
             1,'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',$6,1,'COMMITTED',now())`,
    ["11111111-1111-4111-8111-111111111111", workspaceId, environment, profileId,
      "22222222-2222-4222-8222-222222222222", "33333333-3333-4333-8333-333333333333"],
  );
  await target.query(
    `INSERT INTO execution_durable_mirror_revisions
       (read_model_revision,batch_id,workspace_id,environment,profile_id,projection_epoch,
        projection_sequence,payload_digest,state,is_current,created_at)
     VALUES ($1,$2,$3,$4,$5,$6,1,'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','COMMITTED',true,now())`,
    ["33333333-3333-4333-8333-333333333333", "11111111-1111-4111-8111-111111111111",
      workspaceId, environment, profileId, "22222222-2222-4222-8222-222222222222"],
  );
}

async function seedGap(target: Pool, relationKey: string, reasonCode: string): Promise<void> {
  await target.query(
    `INSERT INTO execution_durable_mirror_gaps
       (gap_id,batch_id,workspace_id,environment,profile_id,relation_key,entity_key,reason_code,detected_at)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'ord-4711',$6,now())`,
    ["11111111-1111-4111-8111-111111111111", workspaceId, environment, profileId, relationKey, reasonCode],
  );
}

async function seedConflict(target: Pool, relationKey: string, reasonCode: string): Promise<void> {
  await target.query(
    `INSERT INTO execution_durable_mirror_conflicts
       (conflict_id,batch_id,workspace_id,environment,profile_id,relation_key,row_id,
        existing_digest,incoming_digest,reason_code,detected_at)
     VALUES (gen_random_uuid(),$1,$2,$3,$4,$5,'row-8822','sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',$6,now())`,
    ["11111111-1111-4111-8111-111111111111", workspaceId, environment, profileId, relationKey, reasonCode],
  );
}
