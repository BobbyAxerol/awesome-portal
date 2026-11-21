# P01 closeout — Baseline, source inventory and protected boundaries

**State:** `TECHNICALLY_COMPLETE` for the approved P01 source/discovery scope.
**Branch:** `docs/research-loop-plan` (shared Research Loop branch).
**Source capture baseline:** `a402f7b95d4429804f7f51e76540ed2ed3c81828`.
**Implementation owner:** Codex, backend/source-inventory slice.

## Delivered

- Frozen-source baseline covering all **15/15** hi-fi HTML files and **15/15**
  paired screen specs, with SHA-256 values, source line counts, routes, source
  test identifiers and browser lane status.
- **73** field records, **194** action records and **56** explicit
  `PROTOTYPE_ONLY` controls. Every source record includes a source locator.
- Static inventory of **180** literal controller routes; no exact static
  method/path collision exists in the current parsed source. The test harness
  also injects a duplicate route and proves that it reports both owners.
- Redacted static configuration inventory: **39** Control API migration sources
  and **279** feature-flag names, with source hashes only. It makes no deployed
  schema, configuration-value or credential claim.
- Delta RSI identity/specification/current eight parameters, protected kernel
  checksum, Portal adapter/registry, current engine pin (`1.0.8`) and
  historical-reader contract. P01 makes no claim that `1.1.1` is installed or
  that a numeric run was performed.
- Protected surface and Research allowlist. The strategy kernel is verified
  unchanged; Execution Edge and deployment runtime stay out of mutation scope.
- Local-only resource snapshot with a source for every measurement. Deployed
  flags/schema/allocation, Research deployment mount, cgroup limit and reader
  snapshot authorization are explicitly recorded as unknown rather than
  inferred.
- Initial source/conflict decision register, scenario denominator, browser
  discovery lane, source-vs-browser coverage and a bounded Claude handoff.

## Tests and evidence

| Gate | Command / check | Result |
| --- | --- | --- |
| P01-T01 | `node …/p01-baseline.mjs --verify` archive/hash denominator | PASS — 15 HTML + 15 specs |
| P01-T02 | `node …/p01-baseline.mjs --self-test` protected copy mutation | PASS |
| P01-T03 | synthetic credential negative + evidence secret scan | PASS |
| P01-T04 | actual static route inventory + injected duplicate owner test | PASS |
| P01-T05 | measured/unknown schema validation | PASS |
| P01-T06 | 00–14 locator and missing-source negative test | PASS |
| P01-T07 | timer/synthetic controls classified `PROTOTYPE_ONLY` | PASS |
| P01-T08 | lane separation report checks | PASS |
| P01 capture fence | clean tracked/untracked source roots before inventory | PASS |
| V11-P01-DR | Delta source/spec/reader manifest only | PASS — no invented compute |
| V11-P01-BR | Playwright config/ports/build flags read | PASS — `DISCOVERY_ONLY`, not UI acceptance |
| V11-P01-GX | protected SHA, secret scan, no runtime mutation and cleanup decision | PASS |

Syntax and hygiene checks also passed: `node --check`, `bash -n` and `git diff
--check`.

The existing `apps/portal/scripts/test_backend.sh` was invoked once and stopped
before collection because this worktree has no `apps/portal/.venv/bin/python`.
P01 does not install an environment merely to make a source inventory appear
green. An import-free AST parse of all 57 Portal backend Python files passed;
the missing lockfile-aligned pytest environment is `P01-GAP-07` and an explicit
P02 prerequisite, not a substituted backend-suite PASS.

## P01 findings versus debt

There is **no known unresolved implementation defect inside P01 scope**. The
following are source/runtime dependencies with explicit owners and later phase
targets, not concealed P01 debt:

- `P01-GAP-01`: `doc-page.js` is referenced by screen 09 but absent from the
  frozen archive; P09/P18 must select a compatible render harness before a
  visual pass.
- `P01-GAP-02`: screen 04 source label says `Summary`, while its frozen
  file/spec are Evidence Flow; P09 must decide canonical copy/route via COR.
- `P01-GAP-03`: current visual suite is fixture/stubbed; P07/P09/P23 require
  a real, isolated browser receipt before browser acceptance.
- `P01-GAP-04` and `P01-GAP-05`: reader snapshot authorization and the
  QuantBT 1.1.1 transition are P04 inputs.
- `P01-GAP-06`: deployed flags/schema/mount/allocation require a redacted P23
  runtime receipt; repository examples are not treated as deployed values.
- `P01-GAP-07`: this worktree lacks the Portal pytest virtual environment; P02
  must provision a lockfile-aligned isolated environment before it can make
  compatibility/test claims.

## Non-interference and cleanup

- No protected strategy source, Execution Edge source, database, migration,
  runtime config, service, container, cache, image, browser baseline or UI
  component was changed.
- P01 created only committed source/evidence files. It created no runtime
  resource, temporary service, cache, image, volume, artifact or credential.
  Cleanup decision: `NO_ACTION_NEEDED`; the self-test deletes its own temporary
  directory in `finally`.
- Rollback is deletion of this P01 source/evidence commit only during normal
  Git review; no server rollback exists or is needed. See [rollback.md](./rollback.md).

## Claude frontend handoff

P01 requires **no frontend implementation or visual refactor**. If Claude
reviews this phase in parallel, review the semantic grouping/copy/controls of
all rows in [screen-field-matrix.csv](./screen-field-matrix.csv) and
[screen-action-matrix.csv](./screen-action-matrix.csv) against the paired
HTML/spec. Record a discrepancy-only P01 handoff. Do not change global
Execution Carbon, routing, accepted UI, snapshots or backend contracts. Full
asset-rendered visual/browser evidence belongs to the approved later phase.

## P02 handoff

P02 receives the exact source inputs, conflict register (`R01`–`R08`), route
owner map, prototype exclusions and one consolidated provisioning packet in
`acceptance-environment.json`. It must prove the unchanged existing Research
R1 path rather than reinterpret these source records as API capability.
