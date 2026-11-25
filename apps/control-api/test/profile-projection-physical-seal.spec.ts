import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Pool } from "pg";
import { buildPool } from "../src/db/pool";
import { ExecutionProfileProjectionRepository } from "../src/execution/profile-projection.repository";
import { ExecutionProfileProjectionWorker } from "../src/execution/profile-projection.worker";
import { MAXIMUM_DATA_INTAKE_V1 } from "../src/execution/maximum-data-intake";
import { migrateTestDatabase, testConfig, truncateAll } from "./harness";
import { EDGE_SEAL } from "./edge-seal-fixture";

const workspaceId = "ws_physical_seal";
const otherWorkspaceId = "ws_physical_seal_other";
const profileId = "PAPER_BINANCE_USDM";
const LEGACY = MAXIMUM_DATA_INTAKE_V1.returnPack.catalogueDigest;
const STRATEGIES = "manager.strategies:strategies";

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
});

let pool: Pool;
let repository: ExecutionProfileProjectionRepository;
beforeAll(async () => {
  await migrateTestDatabase(config.DATABASE_URL);
  pool = buildPool(config.DATABASE_URL);
  repository = new ExecutionProfileProjectionRepository(pool);
});
beforeEach(async () => truncateAll(pool));
afterAll(async () => pool.end());

interface Edge {
  /** undefined = the Edge sends no seal; a string = the seal it answers with. */
  seal?: string;
  strategyIds?: string[];
  /** Serve a continuation cursor for strategies on every page, claiming COMPLETE. */
  endlessCursor?: boolean;
  /** Overrides the seal only for one relation. */
  sealFor?: Record<string, string>;
}

function edge(state: Edge) {
  return {
    relationForProjection: async (_w: string, environment: string, _s: string, _src: string, relation: string) => {
      const source: Record<string, unknown> = {
        authority: "EXECUTION_CELL", profile_id: profileId, availability: "AVAILABLE", freshness: "FRESH",
        completeness: "COMPLETE", as_of: "2026-11-24T10:00:00.000Z",
        data: { relation: { schema: "public", relation }, items: [] as unknown[], next_cursor: null as string | null },
      };
      const seal = state.sealFor?.[relation] ?? state.seal;
      if (seal !== undefined) source.catalogue_sha256 = seal;
      const data = source.data as { items: unknown[]; next_cursor: string | null };
      if (relation === "strategies") {
        data.items = (state.strategyIds ?? []).map((id) => ({
          relation: { schema: "public", relation }, record_key: "opaque",
          fields: { strategy_id: { kind: "TEXT", value: id }, name: { kind: "TEXT", value: `Alpha ${id}` } },
        }));
        if (state.endlessCursor) data.next_cursor = `cursor-${Math.random()}`;
      }
      return { schema_version: "portal.execution.current-source-bff.v2", source_environment: environment, profile_id: profileId, source };
    },
  };
}

async function cycle(state: Edge): Promise<void> {
  const worker = new ExecutionProfileProjectionWorker(config, edge(state) as never, repository);
  try { await worker.runOnce(); } finally { await worker.onApplicationShutdown(); }
}
const head = async () => repository.snapshot(workspaceId, "paper", profileId);

describe("profile projection records the physical seal the Edge answered with", () => {
  it("stamps exactly the served seal on the document, relations, rows, epoch, snapshot row and journal - not the legacy constant", async () => {
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1"] });
    const snapshot = await head();
    expect(snapshot).not.toBeNull();
    expect(snapshot!.sourceCatalogueSha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
    expect(snapshot!.sourceEpoch).toContain(EDGE_SEAL.PAPER_BINANCE_USDM);
    expect(snapshot!.document.source_catalogue_sha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
    for (const relation of Object.values(snapshot!.document.relations)) {
      expect(relation.source_catalogue_sha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
      expect(relation.items.every((row) => row.lineage.source_catalogue_sha256 === EDGE_SEAL.PAPER_BINANCE_USDM)).toBe(true);
    }
    expect(snapshot!.document.relations[STRATEGIES]?.items).toHaveLength(1);
    // The legacy October digest appears nowhere in the committed head.
    expect(JSON.stringify(snapshot!.document)).not.toContain(LEGACY);
    expect(snapshot!.sourceEpoch).not.toContain(LEGACY);
    const [entry] = await repository.journalAfter(workspaceId, "paper", profileId, snapshot!.projectionEpoch, 0, 1);
    expect(entry!.sourceCatalogueSha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
  });

  it("records the legacy digest only when the Edge itself served it (allow-list keeps accepting it)", async () => {
    await cycle({ seal: LEGACY });
    const snapshot = await head();
    expect(snapshot!.sourceCatalogueSha256).toBe(LEGACY);
    expect(snapshot!.document.source_catalogue_sha256).toBe(LEGACY);
  });

  it("rejects an absent seal: no snapshot, no constant stamped, typed deferral reason", async () => {
    await cycle({ strategyIds: ["s1"] });
    expect(await head()).toBeNull();
    const health = await repository.refreshHealth(workspaceId, "paper", profileId);
    expect(health.state).toBe("RECOVERING");
    expect(health.reasonCode).toBe("N31_SOURCE_CATALOGUE_SEAL_ABSENT");
  });

  it("rejects a mismatching seal with a typed reason and leaves the committed head byte-identical", async () => {
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1"] });
    const before = await head();
    for (const [served, reason] of [
      [EDGE_SEAL.PAPER_OKX_SWAP, "N31_SOURCE_CATALOGUE_SEAL_MISMATCH"],
      [EDGE_SEAL.SANDBOX_BINANCE_USDM, "N31_SOURCE_CATALOGUE_SEAL_MISMATCH"],
      [`sha256:${"b".repeat(64)}`, "N31_SOURCE_CATALOGUE_SEAL_MISMATCH"],
    ] as const) {
      await pool.query("DELETE FROM execution_profile_projection_refresh_health");
      await cycle({ seal: served, strategyIds: ["changed-by-a-rejected-cycle"] });
      const after = await head();
      expect(after!.payloadDigest).toBe(before!.payloadDigest);
      expect(after!.projectionEpoch).toBe(before!.projectionEpoch);
      expect(after!.projectionSequence).toBe(before!.projectionSequence);
      expect(after!.sourceCatalogueSha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
      const health = await repository.refreshHealth(workspaceId, "paper", profileId);
      expect(health.state).toBe("RECOVERING");
      expect(health.reasonCode).toBe(reason);
    }
  });

  it("rejects relations answered under two different seals in one cycle", async () => {
    await cycle({
      seal: EDGE_SEAL.PAPER_BINANCE_USDM,
      sealFor: { strategies: EDGE_SEAL.PAPER_BINANCE_USDM_PREVIOUS },
      strategyIds: ["s1"],
    });
    expect(await head()).toBeNull();
    const health = await repository.refreshHealth(workspaceId, "paper", profileId);
    expect(health.reasonCode).toBe("N31_SOURCE_CATALOGUE_SEAL_INCONSISTENT");
  });

  it("changed head: new payload advances the sequence in the same epoch; a rotated allowed seal starts a new epoch under that seal", async () => {
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM_PREVIOUS, strategyIds: ["s1"] });
    const first = await head();
    expect(first!.sourceCatalogueSha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM_PREVIOUS);
    expect(first!.projectionSequence).toBe(1);

    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM_PREVIOUS, strategyIds: ["s1", "s2"] });
    const second = await head();
    expect(second!.projectionEpoch).toBe(first!.projectionEpoch);
    expect(second!.projectionSequence).toBe(2);
    expect(second!.payloadDigest).not.toBe(first!.payloadDigest);

    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1", "s2"] });
    const third = await head();
    expect(third!.projectionEpoch).not.toBe(second!.projectionEpoch);
    expect(third!.projectionSequence).toBe(1);
    expect(third!.sourceCatalogueSha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
    expect(third!.document.source_catalogue_sha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
    expect(third!.sourceEpoch).toContain(EDGE_SEAL.PAPER_BINANCE_USDM);
  });

  it("unchanged answers keep the exact head (no sequence churn) and the same seal", async () => {
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1"] });
    const first = await head();
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1"] });
    const again = await head();
    expect(again!.projectionEpoch).toBe(first!.projectionEpoch);
    expect(again!.projectionSequence).toBe(first!.projectionSequence);
    expect(again!.payloadDigest).toBe(first!.payloadDigest);
  });

  it("workspace/profile isolation: the committed head is visible only under its own workspace and profile", async () => {
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1"] });
    expect(await head()).not.toBeNull();
    expect(await repository.snapshot(otherWorkspaceId, "paper", profileId)).toBeNull();
    expect(await repository.snapshot(workspaceId, "paper", "PAPER_OKX_SWAP")).toBeNull();
    expect(await repository.snapshot(workspaceId, "sandbox", profileId)).toBeNull();
    // A rejected cycle for this profile cannot create a head anywhere else either.
    await truncateAll(pool);
    await cycle({ seal: EDGE_SEAL.PAPER_OKX_SWAP });
    for (const [w, p] of [[workspaceId, profileId], [otherWorkspaceId, profileId], [workspaceId, "PAPER_OKX_SWAP"]] as const) {
      expect(await repository.snapshot(w, "paper", p)).toBeNull();
    }
  });

  it("partial pages: a relation still carrying a cursor after the page budget is PARTIAL even if every page claims COMPLETE", async () => {
    await cycle({ seal: EDGE_SEAL.PAPER_BINANCE_USDM, strategyIds: ["s1"], endlessCursor: true });
    const snapshot = await head();
    expect(snapshot!.completeness).toBe("PARTIAL");
    const relation = snapshot!.document.relations[STRATEGIES];
    expect(relation?.completeness).toBe("PARTIAL");
    expect(relation?.reason_code).toBe("SOURCE_PARTIAL");
    expect(snapshot!.sourceCatalogueSha256).toBe(EDGE_SEAL.PAPER_BINANCE_USDM);
  });
});
