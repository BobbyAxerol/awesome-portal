# UXM-07 — Consumer receipt: BE-P12 (identity and stage facts on the SCOPED_V2 stage bodies), 2026-10-20

Writer: Claude (FE writer, consumer side). Consumer receipt per Rules §10.12.4 for the producer delivery
[BE-P12](../BE-CLAUDE-2026-10-20/BE-P12.md) (`c159bb40`, contract published; producer status `CONTRACT_DELIVERED`, `PENDING_GATE`). This is the
consumer's record, **not an ACK of Bobby** (§10.3). `FRONTEND_BACKEND_SYNC.md` and `UNIFIED_IMPLEMENTATION_PLAN.md` are **not edited here**.

## 0. Pin and lane

| Item | Value |
| --- | --- |
| Base | `claude/fe-parity` @ `4ba5f021`; commits in §2 on a private worktree branch, none pushed, none ff-merged |
| Contract artifacts read | `execution-operations.v1.schema.json` (`identity` of `LiveSourceOperationsReadV2` / `SandboxParentReadV2` / `CanaryParentReadV2`, `stage_facts` of the Live body + `execution-stage-facts.v1`), the three OpenAPI `include` query parameters, `execution-{canary,governance,live-full}.d.ts`, fixtures `execution-positive-parent.synthetic` (`sandbox_identity`, `sandbox_identity_hidden`, `canary_identity`, `canary_identity_hidden`) and `execution-live-source.synthetic` (`with_members`, `with_members_hidden`) |
| Lane | **FIXTURE_LAB** (canonical synthetic bodies, schema as oracle). `runtime_qualified: false` everywhere; nothing here is a real read |
| Tier | **R1 only, R2 pending** (§10.10): focused vitest + `tsc`. No Docker, no visual suite, no full hook |

## 1. Verdicts per member

| # | Published (BE-P12) | Consumed | Verdict |
| --- | --- | --- | --- |
| 1 | Live `identity` (opt-in `include=identity`): `basis`, `alpha_id`, `alpha_name` (constant null), `portfolio_name`, two reason codes | NEW closed reader `scopedIdentity.ts` (6 keys, the two `allOf` rules, the `portfolio_name` pattern, 256 **characters**); `liveSourceOperations.ts` carries `identity`. The Live header shows the Alpha crumb only for a published `alpha_id`, the portfolio NAME (printed, not linked), reasons in titles | **ACCEPTED** |
| 2 | Sandbox / Canary `identity` (same object, O1) | `governanceParents.ts` reads the optional member on both following parents; the V2 views carry it; the existing crumb / `AlphaNameLine` code draws it (link only with a published id, portfolio id stands in when the name is hidden) | **ACCEPTED** for the shape actually published (O1). Whether O1 stays (vs O2/O3) is the producer's and Codex's decision; FE needs no change either way beyond this reader |
| 3 | Live `stage_facts.reconciliation.verdict` = `OPEN_FINDINGS` only; never `NO_OPEN_FINDINGS`, never a count | `readLiveStageFactsV2` = the closed V1 fact reader plus the schema's forced `NOT_PUBLISHED` members. A body that breaks them voids the read. The chip is `Open findings` (no number, no `No open findings` wording anywhere); hidden verdict is a gap chip with `AUTHORIZED_POPULATION_ONLY` in the title | **ACCEPTED** |
| 4 | Live `stage_facts.runtime`, `sessions` (NOT_PUBLISHED with `RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY`, `SCOPED_SESSION_ROW_FIELDS_NOT_IN_READ_VOCABULARY`) | read as typed absences; Runtime stays a gap chip (`FE-067`, reason code + "Activation not asserted" in the title). No Sessions tab change | **ACCEPTED as absence**. The facts themselves are **NOT_DELIVERED** (open on the producer: read-field vocabulary entries, BE-P12 request 3) |
| 5 | `unknown_order_count` NOT_PUBLISHED (`FINDING_TYPE_VOCABULARY_NOT_CLASSIFIED`) | read as absence, never printed | **ACCEPTED as absence**; **NOT_DELIVERED** (BE-P12 request 4) |
| 6 | `alpha_name` constant null (`ALPHA_NAME_NOT_PUBLISHED`) | Alpha crumb is labelled by the id; the name is never composed. Sandbox / Canary subtitle keeps the existing `Alpha <id>` line with the reason in its title | **ACCEPTED** |
| 7 | Sandbox / Canary stage facts, Canary compliance / rollback / trial, typed rows, figures, series, gap ranges on any v2 body | unchanged typed absences | **NOT_DELIVERED** by the producer (O3, owner decision); nothing to consume |
| 8 | `include` query on the three GETs (opt-in; default body byte-identical) | `StageVersionedOptions.include` -> `?include=identity,stage_facts` (Live first read) / `?include=identity` (Sandbox, Canary first read), sent last, published order, distinct tokens; Sandbox and Canary refuse `stage_facts` without a request. Not asked = same URL as before. Only the V2 screens ask (their hooks); the Live keyset pages do not | **ACCEPTED** |

One **CHANGES_REQUESTED** (small, producer): the Live v2 body publishes the portfolio's **name without its id** (the `deployments` panel row holds `portfolio_id` only as one retained row among others), so the Live crumb prints the name and cannot link it. Ask: add `portfolio_id` to the `identity` object (same read-field policy, same reason rule) or confirm that the screen may take it from the single `deployments` row. Not blocking.

Reader exactness notes: the `portfolio_name` bound is counted in code points (schema `maxLength` and the producer's `[...value].length`); the testkit checker counts UTF-16 units, so that one bound is pinned by an explicit test and left out of the oracle matrix. A present-but-wrong member voids the whole body (closed object); an absent one reads as `null` (the original body).

## 2. Commits (in order)

1. `948a3f8c` Sandbox/Canary parent readers: optional closed `identity` (+ `scopedIdentity.ts`), 29-body L0 pin, plans, matrix K.
2. `9cd1ea86` Live source reader: optional `identity` and `stage_facts`, L0 / matrices G, H / member negatives.
3. `cf81d85d` stage port: `include` option, `stageVersionedSearch`, http port.
4. `a78c735c` Live screen. 5. `b594b21d` Sandbox. 6. `4833d98a` Canary.
7. `70c3232c` fixture BFF / e2e double: `include` answered from the canonical fixtures, route rows.
8. `4221a132` fix: name bound in code points.
9. this receipt (docs, R0).

## 3. Conformance, with the numbers

| Suite | Tests | What is pinned |
| --- | --- | --- |
| `governanceParents.test` / `.conformance` | 10,806 together (13,255 with the Live conformance) | canonical file grew **25 -> 29 parent bodies** (four identity bodies), added to L0 and the router table; plans `sandbox_identity` / `canary_identity` (enums, closed containers, strings); **matrix K: 11,648 identity states per family**, reader accepts exactly what the schema accepts (looser 0, stricter 0); absent / present-but-wrong member; original six bodies read `identity: null` |
| `liveSourceOperations.conformance` | 2,449 | L0 for `with_members` / `with_members_hidden` (object coverage pinned; members are the only difference from `populated`); **matrix G: 576 stage_facts states** (accepted iff runtime/since/count/sessions NOT_PUBLISHED and verdict not-published or OPEN_FINDINGS; looser 0, stricter 0); matrix H identity states; ~220 member negatives through the dispatcher |
| `stageVersionedPort` / `dispatch` | + include cases | URL order and encoding, empty = no query, repeated / unknown / unpublished token refused without a request, Sandbox/Canary refuse `stage_facts`, both orders on Live sent as `identity,stage_facts` |
| screens | live.identity (7), sandbox.facts (+3), canary.facts (+3) | published / hidden / not asked for each screen; reason codes only in titles; no `No open findings`, no count |
| `fixtureBff` | 273 (golden 882 unchanged) | members only when asked, bad `include` = 400, V1 byte-identical with or without it, product client reads the members |

Existing assertions changed (reason: the V2 hooks now always ask): `live.test` (options), `canary.test` (2), `sandbox.test` (2), `reviewNote.test` (1) pin `include`. Gate run (one pass, `--maxWorkers=2`): `v2/readers`, `screens/{live,sandbox,canary}`, `src/fixtureBff`, `src/execution/api`, v2Hygiene, failClosed, disabledReason, absentValues: 66,355 passed (one load-timeout flake in the canary Envelope tab passed solo); `tsc --noEmit -p .` exit 0.

## 4. Golden and shared files

`fixtureBff/golden/stub-golden.json` **not re-recorded**: no existing request's answer changed (default reads are byte-identical; `include` rows are new route-table rows, not matrix cases). `apps/portal/fixture-bff/ROUTES.md` regenerated (four rows).

## 5. NOT_RUN

Playwright V2, visual suite, Docker, the full R2 hook, `scripts/refresh-release-integrity-ledgers.sh`, EDS-12/N29 re-pin, contracts workspace checks, any real HTTP (R1 only; a hook run at the R2 milestone owes the ledger refresh since Execution frontend files changed).

## 6. Follow-ups that are not mine

- Producer: `portfolio_id` in `identity` (§1, CHANGES_REQUESTED); read-field vocabulary for runtime / sessions; finding-type table; O3 for Sandbox/Canary stage facts.
- The hidden-identity variants are exercised in unit tests only; the e2e double serves the published variant.
