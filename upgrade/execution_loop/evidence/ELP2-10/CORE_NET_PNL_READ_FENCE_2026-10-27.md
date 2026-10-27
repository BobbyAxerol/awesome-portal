# Core NET_PNL read fence — 27 October 2026

## Scope and behavior

Source-level follow-through for `CORE_FINANCIAL_FALLBACK_REVIEW_2026-10-27.md`.
Manager's actual single-environment, native and ALL service paths now require
an installed, current economic source mapping before publishing a NET_PNL
amount. If mapping is absent, the dataset row/group/statement uses the
existing `ECONOMIC_SOURCE_MAPPING_NOT_PUBLISHED` typed reason, rather than
legacy addition. Other metrics, including NAV, retain their prior behavior.

The actual Manager series service similarly withholds NET_PNL even when a
legacy series is already retained, returning the existing typed
`SOURCE_NOT_QUALIFIED` state after the authorization check; it does not mutate
or delete historical source, proofs, or series. With an installed mapping the
existing source/calculation-revision and `isCurrent` fences remain in force.
Owner-source publication/census is still required; a single row or equal amount
does not prove non-overlap. The unchanged pure query functions retain their
fixture/testing default; product services explicitly enable the fence.

Fleet and Fleet ALL cursor fingerprints include a versioned fence indicator,
so an old cursor cannot silently resume against changed ordering/availability.
No new public schema or visual change was introduced. Existing UI fixture
scenarios remain valid for presentation; API-connected consumers must handle
the existing typed absence rather than turn it into zero. Claude should verify
the rendered absence and availability on the installed candidate once ready.

## Verification and limitations

Focused one-worker Vitest on the final source: `manager-economic-source-runtime`,
`be-p4-manager-series`, `elp206-manager-service`, `fe-cat-3-manager-all`:
**4 files / 166 tests PASS**, including authorized Fleet service, row/group,
mapping-installed positive, old single-environment and ALL row/group cursor
refusal, series service, NAV unchanged and retained input unchanged. Tests use
synthetic source and trust, not a real Edge source or a browser receipt. The
earlier four-suite runs are not separate new coverage claims. Control API
`tsc --noEmit -p tsconfig.build.json` on the final source **PASS**; an earlier
TypeScript check interrupted after a concurrent source edit is not a PASS.

This intermediate slice uses the campaign §10.10c focused backend gate; a full
normal hook remains required on the final frozen integration SHA. No UI,
business DB, deployment, Edge runtime, dev/main/stable, push, command or Live
state was changed. Prior untracked Edge documents are untouched.

## Remaining handoff

- Core/Edge: qualify the real financial carrier, source-owned economic
  identity, leaves, cost census, cut and revision; then exercise both dataset
  and series on the same installed mapping and test revoke and recovery.
- Claude: consume the already typed absence in approved components, do not
  infer a zero or derive ownership from a displayed account. Fixture-only rich
  scenario remains independent; record real API and browser evidence separately.
- ELP2-10 remains open; this change does not close READ/STREAM, gateway,
  Calendar, calibration, coexistence/G2 or release/browser acceptance.

## Follow-through: unrelated metric must not block the requested series

The service previously rejected the entire document when *any* retained
series had an incompatible economic calculation revision. A stale NET_PNL
publication could therefore make an otherwise independently valid NAV request
fail, even though the NET_PNL publication was not in that response. The
revision fence now considers publications for the requested metric; it still
refuses that metric if its revision is incompatible, and still checks mapper
revocation before and after the scoped read. This is not a source proof or a
change to historical data, external contract, UI, or economic methodology.

Focused synthetic tests exercise both an absent and an installed mapping,
including unrelated stale NET_PNL, valid NAV, requested stale NET_PNL refusal,
revocation and unchanged retained input. The fence remains conservative within
the requested metric; this change does not claim per-subject isolation or
connected-source acceptance. Claude can use the existing reader; no new field
or component request is introduced.

Focused Vitest: `be-p4-manager-series` and
`manager-economic-source-runtime`, **2 files / 122 tests PASS**. Control API
`tsc --noEmit -p tsconfig.build.json`, execution tracking reconciliation and
`git diff --check` PASS. This is a separate
intermediate focused gate under §10.10c; the final frozen integration SHA
still requires the normal full hook. These counts overlap the earlier 166-test
run and must not be added to it.
