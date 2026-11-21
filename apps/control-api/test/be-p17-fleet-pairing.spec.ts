/**
 * BE-P17 / CR-01: the Fleet realtime baseline PAIRS with the real named Fleet read.
 *
 * One cross-service proof. REAL `ManagerModelService` (`GET /manager/fleet`), REAL `AlphaFleetRealtimeService` with its REAL
 * `ScopesFleetAuthority`, REAL `ExecutionReadScopes`, REAL access evaluation and REAL `ScopedReplayHub` cursor codec. Only the I/O edges
 * are doubles (the access context and publication readers, the identity SQL row, the Manager revision store), as in
 * `elp206-manager-service.spec.ts`. No database, no Docker, TEST_ONLY throughout: it qualifies no production publication or grant.
 *
 * What it pins (the review's focused gate):
 *   - same source document + same actor/session/workspace/environment through BOTH services: `named_snapshot.lineage_revision` is
 *     byte-equal to `lineage.revision` of the named read (it used to be the raw head revision, so real responses never paired);
 *   - a different session, actor, grant or visible resource is a different string;
 *   - a head change between the two reads is a different string (stale);
 *   - READ alone (business.read_all without stream.subscribe) still pairs, but never offers a stream.
 */
import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { evaluateAccess, type AccessEvaluationContext } from "../src/execution-v2/access-policy";
import { AccessPolicyError, type ScopedAccessGrant } from "../src/execution-v2/access.contract";
import { AlphaFleetRealtimeService, type FleetStreamSink } from "../src/execution-v2/alpha-fleet-realtime.service";
import type { FleetHead, FleetRevisionLog } from "../src/execution-v2/alpha-fleet-realtime.source";
import { ManagerModelService } from "../src/execution-v2/manager-model.service";
import { managerLineageRevision } from "../src/execution-v2/manager-model";
import type { ReadScopePrincipal } from "../src/execution-v2/read-scope";
import { BUSINESS_READ_FIELDS } from "../src/execution-v2/read-fields";
import { EXECUTION_PUBLICATION_CATALOGUE } from "../src/execution-v2/publication-source.generated";
import { ScopedReplayCursorCodec } from "../src/execution-v2/scoped-replay-cursor";
import { productReadFixture, PEER } from "./elp2-product-read.fixture";

const NOW = 1_800_000_000_000, TTL = 300_000;
const head = (n: number): FleetHead => ({ revision: `TEST_ONLY:r${n}`, source_epoch: "TEST_ONLY:epoch", source_sequence: String(n),
  projection_generation: "TEST_ONLY:g1", payload_digest: "sha256:" + "0".repeat(64), catalogue_digest: EXECUTION_PUBLICATION_CATALOGUE.source_catalogue_digest });

const services: AlphaFleetRealtimeService[] = [];
afterEach(async () => { for (const s of services.splice(0)) await s.onApplicationShutdown(); });

function world() {
  const f: any = productReadFixture({ full: true, fields: [...BUSINESS_READ_FIELDS] });
  const state = { head: head(1) };
  // The Manager store: one head, one SOURCE_VERIFIED document per revision. Both services read THIS, never separate copies.
  const model = new ManagerModelService({} as Pool, f.scopes, f.config);
  const repository = (model as any).repository;
  const document = (revision: string) => ({ schema_version: "portal.execution.manager-model-input.v1", workspace_id: f.principal.workspaceId, environment: "paper",
    profile_id: f.config.EXECUTION_EDGE_PAPER_PROFILE_ID, qualification: "SOURCE_VERIFIED", family_id: "alpha_fleet_overview", revision, supersedes_revision: null,
    source_epoch: state.head.source_epoch, source_sequence: state.head.source_sequence, projection_generation: state.head.projection_generation,
    catalogue_digest: state.head.catalogue_digest, source_set_digest: state.head.payload_digest, as_of_ms: 1000, recorded_through_ms: 1100,
    facts_through_ms: 1000, observed_at_ms: 1200, source_quality: { completeness: "COMPLETE", freshness: "FRESH", reasons: [] }, members: [], facts: [] });
  vi.spyOn(repository, "head").mockImplementation(async () => state.head);
  vi.spyOn(repository, "document").mockImplementation((async (_w: string, _e: string, _p: string, revision: string) => document(revision)) as never);
  const log: FleetRevisionLog = { head: async () => state.head, revisionQualification: async () => "SOURCE_VERIFIED", revisionMetadataAfter: async () => [] };
  // Only the I/O edge of the delivery boundary is a double: whether stream.subscribe is allowed NOW is the REAL access evaluation.
  (f.access as any).realtimeDeliveryBoundary = vi.fn(async (_actor: unknown, _workspace: string, expected: AccessEvaluationContext, resource: never, env: never, write: () => unknown) => {
    if (!evaluateAccess({ ...expected, now_ms: NOW }, "stream.subscribe", resource, env).allowed) throw new AccessPolicyError("ACCESS_DENIED");
    return write();
  });
  const codec = new ScopedReplayCursorCodec("t1", { t1: "TEST_ONLY-never-a-runtime-key-".repeat(3) }, TTL, () => NOW);
  const realtime = new AlphaFleetRealtimeService(null as never, f.scopes, f.config, { log, codec, pollMs: 60_000, replayWindowMs: TTL, now: () => NOW });
  services.push(realtime);
  const streamGrant = (): ScopedAccessGrant => ({ ...f.context.grants[0], grant_id: "TEST_ONLY-stream.subscribe", action: "stream.subscribe" });
  const query = { environment: "paper" };
  return { f, state, model, realtime, streamGrant, query,
    pair: async (principal: ReadScopePrincipal = f.principal) => ({ barrier: await realtime.snapshot(principal, query), fleet: await model.read(principal, "FLEET", query) }) };
}
type World = ReturnType<typeof world>;

/** The same human, the same workspace and grants, as another session (a different session id is a different scope). */
const otherSession = (w: World): ReadScopePrincipal => ({ ...w.f.principal, session: { ...w.f.principal.session, sessionId: "TEST_ONLY-other-session" } });
/** A different actor: every grant and the access context are re-subjected to that user, so only the identity differs. */
function asOtherActor(w: World): ReadScopePrincipal {
  const id = "TEST_ONLY-other-actor", { user, session } = w.f.principal;
  const context = w.f.context;
  w.f.access.readContext.mockImplementation(async (actor: { user_id: string }) => actor.user_id === id ? { ...context, principal_id: id,
    grants: context.grants.map((g: ScopedAccessGrant) => ({ ...g, subject_user_id: id })), active_principals: new Set([...context.active_principals, id]) } : context);
  w.f.access.confirmReadContext.mockImplementation(async (actor: { user_id: string }) => actor.user_id === id ? { ...context, principal_id: id,
    grants: context.grants.map((g: ScopedAccessGrant) => ({ ...g, subject_user_id: id })), active_principals: new Set([...context.active_principals, id]) } : context);
  return { ...w.f.principal, user: { ...user, userId: id }, session: { ...session, userId: id, sessionId: "TEST_ONLY-other-actor-session" } };
}

describe("CR-01 the Fleet baseline pairs with the real named Fleet read (real services, doubled I/O edges)", () => {
  it("same source document + same actor/session/workspace/environment: the barrier names the read's own lineage.revision", async () => {
    const w = world(); w.f.context.grants.push(w.streamGrant());
    const { barrier, fleet } = await w.pair();
    expect(barrier.stream.state).toBe("AVAILABLE");
    expect(barrier.named_snapshot.lineage_revision).toBe(fleet.lineage.revision);
    // The raw head is still what cursors and ordinals count; it is not the pairing identity and is not what the read returns.
    expect(barrier.baseline.revision).toBe("TEST_ONLY:r1");
    expect(barrier.named_snapshot.lineage_revision).not.toBe(barrier.baseline.revision);
    expect(fleet.lineage.revision).not.toBe(barrier.baseline.revision);
    // Pairing is a pure function of (named read scope, head): repeated reads agree, and it is the exported derivation.
    const again = await w.pair();
    expect(again.barrier.named_snapshot.lineage_revision).toBe(barrier.named_snapshot.lineage_revision);
    expect(again.fleet.lineage.revision).toBe(fleet.lineage.revision);
    expect(managerLineageRevision("sha256:" + "0".repeat(64), "TEST_ONLY:r1")).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it("a different session, actor, grant or visible resource does not pair", async () => {
    const w = world(); w.f.context.grants.push(w.streamGrant());
    const mine = await w.pair();
    // The barrier is read as one principal and the named read by another: never equal.
    const foreignRead = (await w.model.read(otherSession(w), "FLEET", w.query)).lineage.revision;
    expect(foreignRead).not.toBe(mine.barrier.named_snapshot.lineage_revision);
    expect((await w.realtime.snapshot(otherSession(w), w.query)).named_snapshot.lineage_revision).toBe(foreignRead); // and each pairs with ITS OWN read
    const actor = asOtherActor(w);
    const theirs = await w.pair(actor);
    expect(theirs.barrier.named_snapshot.lineage_revision).toBe(theirs.fleet.lineage.revision);
    expect(theirs.barrier.named_snapshot.lineage_revision).not.toBe(mine.barrier.named_snapshot.lineage_revision);
    // A grant change moves the identity (another grant means another authority proof) ...
    const base = mine.fleet.lineage.revision;
    w.f.context.grants.push({ ...w.f.context.grants[0], grant_id: "TEST_ONLY-second-root", revision: "TEST_ONLY-grant-r2" });
    const granted = await w.pair();
    expect(granted.barrier.named_snapshot.lineage_revision).toBe(granted.fleet.lineage.revision);
    expect(granted.fleet.lineage.revision).not.toBe(base);
    // ... and so does a change in the visible resources (a peer deployment leaves the published population).
    const publish = w.f.access.readPublication.getMockImplementation()!;
    w.f.access.readPublication.mockImplementation(async (request: never) => {
      const full = await publish(request) as any;
      const peer = (x: { kind?: string; id?: string; alpha_id?: string; deployment_id?: string }) =>
        x.alpha_id === PEER.alpha_id || x.deployment_id === PEER.deployment_id ||
        (x.kind === "ALPHA" && x.id === PEER.alpha_id) || (x.kind === "ALPHA_VERSION" && x.id === PEER.alpha_version_id) || (x.kind === "DEPLOYMENT" && x.id === PEER.deployment_id);
      return { ...full, resources: full.resources.filter((x: never) => !peer(x)), tuples: full.tuples.filter((x: never) => !peer(x)),
        current_linkage: { ...full.current_linkage, pairs: full.current_linkage.pairs.filter((x: never) => !peer(x)) },
        strategy_lineage: { ...full.strategy_lineage, pairs: full.strategy_lineage.pairs.filter((x: never) => !peer(x)) } };
    });
    const narrowed = await w.pair();
    expect(narrowed.barrier.named_snapshot.lineage_revision).toBe(narrowed.fleet.lineage.revision);
    expect(narrowed.fleet.lineage.revision).not.toBe(granted.fleet.lineage.revision);
  });

  it("a head change between the two reads stays stale", async () => {
    const w = world(); w.f.context.grants.push(w.streamGrant());
    const barrier = await w.realtime.snapshot(w.f.principal, w.query);
    w.state.head = head(2);
    const fleet = await w.model.read(w.f.principal, "FLEET", w.query);
    expect(fleet.lineage.revision).not.toBe(barrier.named_snapshot.lineage_revision);
    // Re-reading the barrier at the new head pairs again, and names the new raw head.
    const next = await w.realtime.snapshot(w.f.principal, w.query);
    expect(next.baseline.revision).toBe("TEST_ONLY:r2");
    expect(next.named_snapshot.lineage_revision).toBe(fleet.lineage.revision);
  });

  it("READ alone pairs but never enables STREAM; the stream grant is the only difference", async () => {
    const w = world(); // business.read_all on the root, NO stream.subscribe
    const read = await w.pair();
    expect(read.barrier.named_snapshot.lineage_revision).toBe(read.fleet.lineage.revision);
    expect(read.barrier.stream).toEqual({ state: "UNAVAILABLE", reason_code: "STREAM_AUTHORITY_NOT_GRANTED", resume_cursor: null });
    w.f.context.grants.push(w.streamGrant());
    const granted = await w.pair();
    expect(granted.barrier.stream.state).toBe("AVAILABLE");
    // The stream grant changes the authority proof the named read is bound to as well, and the pairing follows the read.
    expect(granted.barrier.named_snapshot.lineage_revision).toBe(granted.fleet.lineage.revision);
    // A cursor cannot outlive the grant: with stream.subscribe gone, an open delivers a terminal frame and no notice.
    const cursor = (granted.barrier.stream as { resume_cursor: string }).resume_cursor;
    w.f.context.grants.pop();
    const chunks: string[] = []; let ended = false;
    const sink: FleetStreamSink = { write: c => { chunks.push(c); return true; }, end: () => { ended = true; }, onClose: () => undefined, closed: () => ended };
    await w.realtime.openStream(w.f.principal, { ...w.query, cursor }, undefined, () => sink);
    await w.realtime.settle();
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.join("")).toMatch(/"terminal":true/);
    expect(chunks.join("")).not.toMatch(/event: (revalidate|heartbeat)/);
  });
});
