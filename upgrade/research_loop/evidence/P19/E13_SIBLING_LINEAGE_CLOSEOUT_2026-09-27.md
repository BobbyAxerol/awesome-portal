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
