# Six approved backend support packages — execution order

Bobby approved all six packages on 23 October. Implementation lane:
`/home/bobby/portal-fixture-support`, `chore/complete-fixture-review-20261023`.
Claude owns components/design. No runtime/remote push or production changes.
Implement/accept packages in numbered order; disjoint preparation is permitted.
The existing frozen integration gate is not restarted for this work.

| Package | Work and acceptance | Current state |
| --- | --- | --- |
| 1 Linked fixtures | BFF uses shared synthetic facts; same IDs across tables/detail/charts; exact financial endpoints; contract and navigation tests | IN_PROGRESS; helper delivery already accepted by Claude at c7471e516/c059d9844; BFF wiring still required |
| 2 Fleet timing | Exact lifecycle fact binding; entered-at/days agree with as-of; ambiguous/missing transitions remain explicit; schema/producer tests | Preparing fact helper and contract impact, not published |
| 3 Visit digest | User/workspace baseline, snapshot revision, explicit seen transition, typed changes and safe links; authorization/isolation/replay tests plus populated fixture | QUEUED |
| 4 Accounts | Authorized same-snapshot counts and list figures projection; reuse published DTO; no per-row read amplification; query/permission tests | QUEUED |
| 5 Contributors | Authorized alpha attribution and bounded group continuation beyond 200; full-population aggregate semantics; no sum of returns/scores; pagination/security tests | QUEUED |
| 6 Names/finance | Authorized portfolio label joins; exact grain/unit/source binding for financial DTO/fixtures; no wallet-equity substitution or cross-currency sums | QUEUED |

Each closeout must name code SHA, changed paths, tests actually run, contract
generation impact, remaining real-source inputs and Claude consumer action.
Helpers alone do not close a served route; a fixture test is not a browser receipt.
Conversely, real Edge readiness does not block rich positive fixture acceptance.

## Entry observations

- Claude latest observed source `c059d9844` already contains the two positive
  fixture helpers and handoff; avoid re-delivery as new work.
- BFF `review-manager.ts` still injects SOURCE_GAP into populated series. Its
  existing per-subject NAV/PnL/Return endpoints tie to dataset figures; integration
  must preserve those ties rather than indiscriminately replace all four views.
- Manager timing fields exist, but policy advertises missing transition facts.
  Correct the fact adapter and publication policy together, not only fixture nulls.
- Accounts list figures mapper explicitly documents an absent projection column.
  Existing optional DTO/mapper is not evidence that the list serves figures.
- Contributors producer rejects more than 200 groups; continuation is not present.
- Current-human/Edge qualification remains a separate ongoing obligation; no
  command/Live activation follows from development scenario support.

## First implementation checkpoint

Package1: BFF populated/layout-stress now serves complete series without an
artificial missing midpoint. NAV/Drawdown share the positive helper walk; final
table endpoints are preserved. Dedicated producer-Zod tests **4/4 PASS** at
240/1440 points, including unchanged explicit EMPTY/UNAVAILABLE scenarios.
Full graph remains IN_PROGRESS: capital-statement NAV and allocation-based return
have different economic bases. Do not replace the latter with a zero-flow return
and call them reconciled. PnL/Return retain their published bases for now.

Package2: exact alpha/version/portfolio/environment/source-revision transition
helper and **11/11 focused tests PASS**. Half-open intervals, duplicates, competing
entries and invalid/future timestamps tested. Served policy/schema remains unchanged
until model/query-options/fixture wiring and generated schema publication are done.
This helper is not yet mounted on the Manager producer.

Intermediate commits use campaign §10.10c focused gates; no second normal hook,
DB, Docker, migration or runtime change. Tests created no retained resources.
Packages3–6 are still QUEUED, not DELIVERED. No six-package completion claim.
