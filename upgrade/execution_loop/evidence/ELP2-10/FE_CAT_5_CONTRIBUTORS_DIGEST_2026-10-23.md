# FE-CAT-5: Overview Contributors and the "Since your last visit" digest (2026-10-23)

> **CORRECTED IN PART (2026-10-23, Codex review): the group cap is a refusal, not a silent truncation. See the section 'Corrections' at the end. The original text below is kept as history.**

Level: R0 note. FRONTEND and FIXTURE only: no schema, generated file or control-api change. Approved by the Codex closeout of 2026-10-23, section 5 (FE-CAT-5). Nothing here connects a real source.

Closeout text: "Contributors: server-side alpha grouping inside the named FUND partition/window, with attribution and complete authorized population. Visit digest: explicit persisted/user-scoped baseline and current source facts, not heuristic 'since last visit' from fixture dates. Return absence until the comparison baseline exists."

## 1. DELIVERED (fixture level, FIXTURE_VERIFIED)

### Contributors (FE-025)
- The Overview makes a second read of the FUND dataset: `getManagerDataset({surface: "FUND", environment, window, groupBy: ["alpha_id"], limit: 1})`, the SAME environment and window as the rest of the page. It is asked only after the ungrouped fund read says `query_options.group_fields` contains `alpha_id`. `limit: 1` because only `groups` (the whole filtered query) is read, never the page of rows.
- Each `groups[]` entry is one alpha: the published key (`alpha_id`), `unique_row_count`, and `economic_partitions[]`. One table line per economic partition (Real-funded / Paper / Sandbox, one currency per figure), `net_pnl` as the Amount, exact decimals through the shared `MetricValue`. A published `"0"` is a value; an absent metric is a typed absence with its published reason code. No sum across partitions, currencies or groups, no join to rows, no re-aggregation, no client sort (no sort is requested either).
- Return (`return_30d_pct`) and Score (`score`) are columns only when some group publishes the key; a partition that does not is a typed absence in its cell; when no group publishes a key a one-line "Not published by the groups: Return, Score" with a disclosure replaces the column.
- The population is stated from what the dataset says: `N alpha groups over M authorized rows (full authorized filtered query), <environment>, window <W>`. A list at the server's 200-group cap says it is not the whole population.
- Typed absence (`Not published (FE-025)`, code in `data-contributors-absence`, reason in words): `DATASET_NOT_SERVED`, `DATASET_READ_FAILED` (typed refusal reason), `GROUP_FIELD_NOT_OFFERED`, `GROUPING_NOT_ANSWERED` (the dataset answered another grouping), `NO_GROUPS_PUBLISHED` (rows counted, no group), `METRIC_NOT_PUBLISHED` (no group publishes `net_pnl`). An authorized count of 0 says "No alpha is in this population", not a gap.
- Code: `v2/screens/overview/contributorsModel.ts` (pure), `Contributors.tsx` (panel body), wiring and layout in `index.tsx`, small additive `exec-ov-contrib` rules in `v2/css/overview.css`.

### Since your last visit (FE-024)
- No heuristic. The panel draws `Not published (FE-024)` and "No comparison baseline is published yet." with a disclosure naming what would make it appear: a persisted, user-scoped baseline (what this user last saw) plus the current source facts to compare it with. Nothing is derived from fixture dates or the browser clock.

### Fixture lane
- `apps/portal/fixture-bff/review-manager.ts`: one small additive block (about 8 lines) in the populated/layout-stress dataset answer. It runs only for `group_by=alpha_id` alone: the first group's first partition gets a published true zero `net_pnl`, the second group's first partition gets `net_pnl` null (typed absence, `SOURCE_FACTS_NOT_PUBLISHED`). Marked SIMULATED. Grouping itself was already generic. The original sparse L0 doubles are unchanged and publish no alpha group, so the sparse profile keeps the typed absence.
- Tests: `contributors.test.tsx` (panel), `contributorsFixture.test.ts` (populated lane through the production HTTP port and reader).

## 2. ACCEPTED_FOR_IMPLEMENTATION (Edge/Core inputs, not delivered here)
1. **Real attribution.** A group today carries only its key (`alpha_id`), so the panel prints the alpha id. A display name (alpha name/label) must be published WITH the group (an additive field on `groups[]` or in its key attribution); resolving it from the page rows would be a client-side join and is not done. Owner: Edge (Manager dataset producer) with the Core alpha register.
2. **Complete authorized population.** The real producer must compute `groups[]` over the FULL authorized filtered query (`totals_scope: FULL_AUTHORIZED_FILTERED_QUERY`) inside the named FUND environment and window, and state when the 200-group cap truncates the list (an explicit truncation/continuation signal on `groups`, not only the count of rows). Until then the panel can only say "at the cap" from the group count.
3. **Per-group Return and Score.** `return_30d_pct` and `score` inside `groups[].economic_partitions[].metrics` are published by no real producer; the panel shows them the moment a group carries the key (score stays "Pending" until the score policy is set).
4. **Digest baseline.** A persisted, USER-SCOPED comparison baseline (what the user last saw: a per-user `last_seen` marker or snapshot reference with its own as-of) and the CURRENT source facts to compare it with, as an explicit published panel (command-center `digest`, FE-024). Until both exist the panel stays absent; it must not be computed from dates.

## 3. Not verified here
- No Playwright, visual recording, docker or full hook was run. The Overview visual baseline WILL differ (Contributors panel body, the digest note, new table rules); it was not recorded and must be re-recorded by the visual lane.
- The populated lane's `group_by=alpha_id` answer was judged by the production reader in vitest, not in a browser.

## Corrections (2026-10-23, after Codex review CODEX_NUMERIC_AND_FINANCIAL_REVIEW_2026-10-23.md and CLAUDE_POST_FREEZE_REVIEW_2026-10-23.md)

- Codex (`manager-model.ts:391,553`): the producer refuses more than 200 groups with `EXECUTION_READ_SCOPE_LIMIT`; it does not silently truncate. Continuation beyond 200 groups is a scalability addition (Codex fixture-support package 5), not the repair of an existing silent-total bug. The request in item 2 above is reworded accordingly: ask for bounded continuation, not for a truncation signal on a body that already refuses.
