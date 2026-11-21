# ELP2-04 — finite bracket capture and independently scoped legs

## Entry and source boundary — 2026-10-17

Bobby's existing02–10backend assignment. Main integration remains
`/home/bobby/portal-research`, `docs/research-loop-plan`, baseline
`322e23472c391f80d929436da050227f53c5068d`; clean source/index after the
previous coherent normal hook. Primary integrated independently reviewed
private B04/B04-CAPTURE drafts only after its source pin released. No frontend,
source/command/Live activation, migration, runtime restart, remote push or
dev/main/release/deploy. Changes are APPLIED/UNCOMMITTED; tests below NOT_RUN.

The generated Manager registry already declares `managerOrderBracketsPageV1`
and `managerOrderBracketLegsPageV1`. Their existence is not a qualified actual
source publication. This fixes Portal capture/reader implementation debt;
paired provider/source acceptance remains UNKNOWN, not declared absent.

## Implementation and compatibility

- Two static current-only catalogue bindings: exact aliases
  `manager.current.order-brackets:order_brackets` and
  `manager.current.order-bracket-legs:order_bracket_legs`.
- Parent captures only group/account/strategy/session/mode/timestamps. Child
  captures its private FK and the finite existing public field subset. No
  custody, diagnostics, trigger, order type, arbitrary selector or new grant.
- Bracket-only lineage pass uses post-filter accepted parents from the SAME
  cycle, never raw foreign-account IDs or a previous retained census. Duplicate
  parents are unresolved. Missing, capped, unavailable or UNKNOWN parent cannot
  yield an empty COMPLETE child. Existing source clocks/freshness stay intact.
- Exact declared PK aliases prevent every captured row becoming a fake
  `EDS06_CURRENT_ENTITY_KEY_MISSING`. No new history eligibility or SQL table.
- Named `order-bracket-legs` uses explicit `account.read`; standalone bracket
  reader retains its existing `alpha.read` purpose. Child and parent dataset
  authorizations are independent. Original parent must pass before merging;
  a child cannot narrow a shared-account parent into an owned Alpha. Null
  strategy is valid account grain, not an instruction to infer a session.
- Full parent duplicates are censused before visibility. Hidden/missing/
  ambiguous/contradictory links uniformly omit, without a count oracle.
  Inherited fields require both current field scopes; IDs remain context-bound
  HMACs. Parent publication revision participates in cursor/currentness checks.

Existing named-page OpenAPI/generated type remains unchanged, as documented
in [finite adapters](finite-retained-aliases.md). Decimals preserve strings,
timestamps are UTC milliseconds; zero/null remain distinct. Legacy readers
retain their original broad shape and do not acquire the V2 parent dependency.
No public type or arbitrary business-field vocabulary is introduced here.

**Held compound-source fence remains OPEN.** Same-cycle local commit and
sequential parent/child revalidation do not prove one held upstream epoch.
Do not call this implementation actual-source/current-authority acceptance.

## Bounds and planned validation

Unchanged drain:10 logical pages x200rows per relation. The two bindings may
add at most20sequential logical calls/4,000rows per enabled profile per refresh;
adaptive proxy size reduction can add transport attempts. This is a defensive
upper bound, NOT measured QPS/bytes or approved production capacity. Existing
1MiB response cap/pacing/admission/cache/recovery apply. Continuation at cap
is PARTIAL, never full history. No timer/concurrency/activation added.

Grouped affected cell:4CPU/4GiB/8GiB transient, one job, no parallel build/load/
browser/HK measurement. New reader suite has34expanded synthetic-fixture cases;
capture suite11cases uses actual disposablePG/worker/decoder/lineage/snapshot/
mirror with SYNTHETIC source envelopes. Include existing profile-lineage,
profile-projection, durable mirror and reader regressions, APIbuild and scoped
restore. No actual TLS/source provider or commissioning proof is implied.

All new results are NOT_RUN at this entry; append actual terminal receipt.
Normal hook remains mandatory; no repeated unchanged contracts for docs alone.

## Exit, rollback and handoff

04still OPEN for other purpose-specific readers, actual source/field policy and
held compound fence. Rollback only these bindings/PK aliases/narrow lineage and
finite reader, preserving snapshots, grants, identity, audit and source history.
Clean only owned test resources and preserve failed receipts.

Claude UXM NOT_STARTED_BY_OWNER_DIRECTION; AWAITING_CONSUMER_REVIEW. Future
consumer may use the existing named page, retaining PARTIAL/STALE/source gap
copy. This does not publish full order lifecycle/SL/TP. No UI change requested
in this private implementation slice. Backend next: remaining finite parents
and technical/reference/audit contracts, independently of actual source gate.
