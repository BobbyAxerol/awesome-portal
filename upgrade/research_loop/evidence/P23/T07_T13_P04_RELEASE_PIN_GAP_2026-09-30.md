# P23-T07/T13 — P04 installed-release pin gap

2026-09-30 · Codex · `docs/research-loop-plan` · **SOURCE REPAIRED / T07,T13 OPEN**.

The finding below was a pre-fix compiled-module probe, not an engine-upgrade runtime
receipt. No P23 cell, shared preview, dev, Production, database, or frontend was
changed. It does not imply that QuantBT 1.1.2 is installed or accepted.

## Finding

The installed P04 binding declares `er_quantbt_111` in
`apps/control-api/src/research/p04-delta.binding.ts` (`execution.engine_release_id`).
`ResearchRunAdmissionService.p04UnsupportedReason()` compares the submitted
release with the *preflight's* effective release, but never compares either to
that installed binding. Thus a future current Atlas/preflight release could
pass P04 admission while the installed child still executes the 1.1.1 profile.
The WFO and imported-alpha branches already check their own installed release;
this finding is limited to P04.

Read-only probe against the locally built `apps/control-api/dist` module:

```text
requested_release=er_quantbt_112
installed_release=er_quantbt_111
predicate_result=null
release_mismatch_admitted=true
```

The probe supplied a matching requested/effective preflight release and an
otherwise valid fixed `signal_notional` P04 request. It called the P04
predicate directly: this proves the predicate gap, not that a real 1.1.2
preflight or run is currently available.

## Minimal repair request for the ≤P21 owner boundary

Pin P04 admission to `P04_DELTA_DECLARED_CONTRACT.execution.engine_release_id`
before the other P04 shape checks; preserve the current 1.1.1 request bytes and
typed `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` refusal. Add tests for both
`er_quantbt_112` with a matching effective preflight and the existing 1.1.1
golden run, with WFO enabled and disabled. No new route, default, mapper,
frontend field, or migration is needed for this repair.

## Owner-approved source repair and test

Bobby approved the exact P10 backend fix on 2026-09-30. P04 admission now
compares the requested release to the installed P04 binding after checking
preflight/request agreement. A simulated `er_quantbt_112` request with a
matching effective preflight is refused with typed 409
`RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` and field path
`client.engine_release_id`; the existing `er_quantbt_111` golden request remains
admitted with WFO on and off. Focused Control API tests: **45/45 PASS** across
the WFO profile and admission-field-path suites; Control API TypeScript build:
**PASS**. No route, schema, frontend, migration or runtime flag changed.

After the repair, T07/T13 still require a **real, separately pinned engine
upgrade/default and rollback receipt**: in-flight 1.1.1 run stays on its old
pin; the new route/default does not enable an unsupported adapter; reproduction
retains the old effective spec. The current Docker inventory contains only the
1.1.1 Research worker lineage, so this probe cannot be promoted to full T07 or
T13 acceptance. Keep both gates OPEN until that source exists and is tested.
