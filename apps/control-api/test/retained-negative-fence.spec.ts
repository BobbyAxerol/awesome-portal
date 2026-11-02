import { describe, expect, it } from "vitest";
import { OWN, productReadFixture } from "./elp2-product-read.fixture";
import { ExecutionReadScopeError } from "../src/execution-v2/read-scope";

// Synthetic TEST_ONLY authority and retained data. These tests exercise the
// local boundary, not a commissioned Edge source or native HTTP custody.
const screen = "EXECUTION_PAPER_WORKBENCH_SCREEN";
const changed = { code: "EXECUTION_READ_ACCESS_CHANGED", status: 409 };

function revisionChangesAfterFirstRead(f: ReturnType<typeof productReadFixture>) {
  let calls = 0;
  f.repository.snapshotMetadata.mockImplementation(async () => ++calls === 1
    ? f.snapshot : { ...f.snapshot, projectionEpoch: "TEST_ONLY-new-epoch" });
}

async function scope(f: ReturnType<typeof productReadFixture>) {
  return f.scopes.authorize(f.principal, {
    environment: "paper", profileId: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID!,
  }, {
    action: "alpha.read",
    dataset: { dataset_id: "relation:manager.orders:orders", source_revision: f.snapshot.payloadDigest,
      projection_generation: f.snapshot.projectionEpoch, catalogue_revision: f.snapshot.sourceCatalogueSha256, window: null },
  });
}

describe("retained result and error final fences", () => {
  it("rechecks the original grant before releasing a data-dependent error", async () => {
    const f = productReadFixture(), original = await scope(f);
    await expect(f.scopes.deliver(original, async () => {
      f.context.grants = [];
      f.context.authority_fingerprint = "TEST_ONLY-revoked";
      throw new Error("TEST_ONLY-private-source-refusal");
    })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it("preserves the original rejection unchanged when authority remains valid", async () => {
    const f = productReadFixture(), original = await scope(f);
    const error = new Error("TEST_ONLY-safe-refusal");
    await expect(f.scopes.deliver(original, async () => { throw error; })).rejects.toBe(error);
    await expect(f.scopes.deliver(original, async () => { throw undefined; })).rejects.toBeUndefined();
  });

  it("retains the uniform nested 404 if the same revoke changes the outer fingerprint", async () => {
    const f = productReadFixture(), original = await scope(f);
    await expect(f.scopes.deliver(original, async () => {
      f.context.authority_fingerprint = "TEST_ONLY-changed";
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    })).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it("does not let a held 404 mask an unavailable final authority", async () => {
    const f = productReadFixture(), original = await scope(f);
    await expect(f.scopes.deliver(original, async () => {
      f.access.readPublication.mockRejectedValue(new Error("TEST_ONLY-authority-unavailable"));
      throw new ExecutionReadScopeError("EXECUTION_READ_NOT_AVAILABLE", 404);
    })).rejects.toMatchObject({ code: "EXECUTION_READ_AUTHORITY_UNAVAILABLE", status: 503 });
  });

  it("a retained orders refusal cannot bypass a grant revoked during the stored read", async () => {
    const f = productReadFixture();
    f.snapshot.document.relations["manager.orders:orders"].availability = "UNAVAILABLE";
    f.repository.rawSnapshot.mockImplementation(async () => {
      f.context.grants = [];
      f.context.authority_fingerprint = "TEST_ONLY-revoked-in-source";
      return f.snapshot;
    });
    await expect(f.orders()).rejects.toMatchObject({ code: "EXECUTION_READ_NOT_AVAILABLE", status: 404 });
  });

  it.each(["missing-relation", "unavailable", "not-found", "duplicate", "incomplete"] as const)(
    "does not publish %s from a replaced snapshot", async variant => {
      const f = productReadFixture();
      const relations = f.snapshot.document.relations;
      const relation = relations["manager.deployments:strategy_deployments"];
      if (variant === "missing-relation") delete relations["manager.deployments:strategy_deployments"];
      if (variant === "unavailable") relation.availability = "UNAVAILABLE";
      if (variant === "not-found") relation.items = relation.items.filter(row => row.fields.deployment_id !== OWN.deployment_id);
      if (variant === "duplicate") relation.items.push(structuredClone(relation.items[0]));
      if (variant === "incomplete") relation.items[0].fields.venue = null;
      revisionChangesAfterFirstRead(f);
      await expect(f.product.resolveDeploymentScope(f.principal, "paper", screen, OWN.deployment_id))
        .rejects.toMatchObject(changed);
    },
  );

  it("does not publish a relation-unavailable refusal from a replaced snapshot", async () => {
    const f = productReadFixture();
    f.snapshot.document.relations["manager.orders:orders"].availability = "UNAVAILABLE";
    revisionChangesAfterFirstRead(f);
    await expect(f.orders()).rejects.toMatchObject(changed);
  });
});
