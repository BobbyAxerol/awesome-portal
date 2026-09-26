# P22 phase report — 2026-09-25

Owner: Codex backend. Branch: `codex/research-ol-p22-p24`. Scope: P22 backend,
generated contracts, capability inventory and evidence only; no frontend,
Execution, Trading System, deployment or runtime flag change.

## Implementation

1. New bounded private GET/CSRF-protected POST for publication state and
   existing R1 mirror; registered in Control API module.
2. Strict Zod/OpenAPI/generated types; P21 local-seal action changes from
   P22-not-commissioned to a typed local-seal affordance. `may_publish` is
   returned by P22 after currentness/source checks.
3. Migrations `1723680000063` and additive OL migration `1723680000070` stores one actor-bound immutable request per RC,
   a recoverable unknown outcome and verified receipt. Narrow role grants
   permit only lifecycle columns and the corresponding P21 delivery row to
   change. No deletion path or token/credential column.
4. Existing Governance create remains the downstream authority. Only an
   internal artifact-pin precondition and internal read/verify helpers were
   added; public Governance schema, decision routes and R1/R2 logic were not
   changed.

## Executed gates

| Gate | Result |
| --- | --- |
| P22 focused service/contract/bridge tests | PASS: 3 files, 20 tests |
| P22 disposable PostgreSQL 16 migration/privilege gate | PASS: 2 tests |
| P21/P22 migrations on isolated PostgreSQL 16, exact disposable container removed | PASS: legacy + OL migration, 2 tests |
| Governance R1 and RunSync regression on isolated PostgreSQL 16 | PASS: 2 files, 35 tests |
| Generated P21/P22 contract tests | PASS: 2 files, 5 tests |
| Capability inventory `r2Ledger.test.ts` | PASS: 22 tests |
| Control API TypeScript build | PASS |

No production DB, approval, QuantBT run, worker, Edge, or Trading System was
mutated by these tests. The disposable PostgreSQL containers were removed by
an exact-name cleanup trap. P22-T01…T14 are covered as backend/unit or
database slices where applicable; they are **not** collectively marked as
real end-to-end acceptance. In particular `P22-T01/T11`, `V11-P22-DR` and
`V11-P22-BR` still require the isolated preview's actual Delta final-audit
run, R1 receipt and real browser S11 path. No sample payload was promoted to
source evidence.

## Handoff and exit state

Claude should regenerate the named P22 client; keep the rich S11 composition,
read GET for `may_publish` and exact `state`, POST only on explicit confirmation,
then reread GET. `UNKNOWN` is not success and must offer bounded manual retry
with the original request key; `DELIVERED` is not `APPROVED`. Render raw R1
status/SLA/conditions only when `approval_read=AVAILABLE`; typed denied or
unavailable leaves the rest of S11 intact. Use the returned approval link; do
not invent an inline R1 decision or start Paper/Execution.

Backend contract/storage gates are complete. Product/phase exit remains
`PENDING_REAL_PREVIEW_AND_BROWSER_RECEIPT`, not `PRODUCT_ACTIVE`.

## Backend repair addendum

The R1 membership check now exists both before replay and inside the
SERIALIZABLE insertion transaction; revocation cannot slip between the P22
intent and R1 write. P22 transient 403/408/429 and serialization conflicts
remain UNKNOWN for the original actor/key. Disposable-PG Governance regression,
P22 migration and targeted service/controller tests pass; see the current
commit's test log. This hardens the backend but does not turn the missing real
final-audit/R1/browser receipt into a PASS.


## Thanhvuong selective-integration review — 2026-09-25

The contributor packet and fixture receipt are imported under `thanhvuong-*.md`
for auditability. The contributor's alternate publication implementation is
**not adopted**: it exposes `publish/reconcile` and `mirror` routes and a
`1723680000056` migration that collides with an existing migration. The current
canonical P22 contract is the two-route, actor-bound implementation above
(`publication` GET + explicit `publish` POST), with the current membership,
transaction and exact-pin guards. No duplicate route, migration, flag or
provider is introduced.

The contributor S11 UI is likewise not copied wholesale. It targets the older
three-route schema and would replace the current P21 composition. The current
rich composition remains authoritative; a future P22 browser slice may adapt
the same visual ideas only after a real preview receipt proves the canonical
two-route contract. This review therefore records `ALREADY_PRESENT` or
`REJECTED_INCOMPATIBLE`, not a silent merge or deletion.
