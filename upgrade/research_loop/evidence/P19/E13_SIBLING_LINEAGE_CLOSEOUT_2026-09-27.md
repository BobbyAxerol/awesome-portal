# E13 — real sibling lineage backend closeout

Date: 2026-09-27  
Verdict: **BACKEND CLOSED · product browser receipt remains frontend-owned**

## What was verified

E13 was not missing another lineage table or another read DTO. The product
writer already accepts the typed P10 `lineage` request and persists one real
child attempt with:

- `intent_kind=CLONE_FOR_EXPERIMENT`;
- `relation_kind=SIBLING_OF`;
- the exact parent attempt in `parent_attempt_id`;
- the originating what-if cell in the immutable reason;
- its own preflight token, requested-spec digest, run and attempt.

The writer never rewrites the frozen parent. PostgreSQL rejects a
`SIBLING_OF` row after its parent is removed, so the reader cannot receive an
orphan edge. P19 consumes the persisted edge and computes semantic diff from
the two immutable specs; it does not infer lineage from timestamps, current
AlphaVersion state, labels or display order.

## Product-path receipt

`apps/control-api/test/research-w5a-migration.spec.ts` executes the real
`ResearchRunCreateService` against fresh PostgreSQL:

1. creates the parent through admission;
2. stores a separate sibling preflight manifest;
3. creates the child using `lineage.relation=SIBLING_OF` and cell `x6y4`;
4. proves child run and spec digest differ from the parent;
5. reads the persisted attempt and verifies the exact parent edge/reason;
6. proves the parent snapshot is byte-for-byte unchanged;
7. proves the database constraint refuses an orphan sibling.

The repository-wide commit gate on 2026-09-27 also ran the P19 contract,
service, controller, fixture and PostgreSQL suites. Relevant results:

- `research-w5a-migration.spec.ts`: 4/4 pass;
- `research-lineage.w6b.spec.ts`: 12/12 pass;
- `research-lineage.service.spec.ts`: 8/8 pass;
- `research-lineage-migration.spec.ts`: 3/3 pass;
- generated contract suite: 191/191 pass;
- full Control API: 1,220 pass, 1 expected opt-in skip.

## Boundary and remaining owner

No runtime flag, preview container, source, QuantBT job or frontend file was
changed. Backend E13 is closed. Claude/OL-23 owns only the browser receipt that
shows the already-persisted sibling as a nested S10 node with diff-vs-parent;
absence of that visual receipt must not reopen the writer or duplicate its
authority.

## Real product-path addendum — 2026-09-27

The earlier PostgreSQL service test above did **not** by itself prove the complete
E13 goal. The isolated E17 cell now supplies a real public-API three-node graph:

- root: `rrun_1084d207e57bba4127c8e8b0cf77dc8e`;
- CLONE_OF child: `rrun_80df739a29f127db1e5d6514a4a548d4`;
- second CLONE_OF child: `rrun_dcb29c9c1614d5b960a5eeda8aaf9b01`.

All three are COMPLETED/READY. Both children persist parent
`ratt_1084d207e57bba4127c8e8b0cf77dc8e`; the second changes seed 7→8, and
GET lineage returns the exact server semantic diff. No timestamp/version inference.
These are two structural siblings sharing an explicit parent, not diagnostic
SIBLING_OF cells or a manufactured worker retry. Full E13 is still open because
REPRODUCE_EXISTING remains typed refused. See the [E17 machine receipt](../P10/e17-backend-acceptance.v1.json)
for private-byte hashes and exact read statuses. Earlier closeout wording is
superseded by this requirement-level state, not erased.
