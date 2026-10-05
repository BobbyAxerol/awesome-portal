# FULL-01 — shared recipe authority, compatibility and bounded budgets

Date: 2026-10-05 UTC. Owner: Codex. Baseline: `491eb0663fa84b8064dbb68247e75535d159a7db`.
Scope: [FULL-01](../../S02_FULL_SUPPORT_STAGED_PLAN_2026-10-05.md#full-01), queue §37.
Delivery commit locator: `git log -1 --format='%H %s' -- upgrade/research_loop/evidence/P10/FULL_01_SHARED_RECIPES_2026-10-05.md`.

## 1. Delivered behavior

- One authoring table and strict schema:
  `apps/portal/registry/research-execution-recipes.v1{,.schema}.json`.
  TS and Python image-owned views are generated from these same bytes; neither
  service fetches a policy file, engine source or database configuration at runtime.
- Exactly **six existing** profiles. The five non-null descriptor digests are
  unchanged; historic fixed P04 keeps its **null** profile digest and original
  private work shape. Unknown, ambiguous and changed bindings are refused.
- Separate recipe-policy revision/legacy qualification references, including
  receipt byte hash. These references inherit **only the original receipt's
  scope**; they do not qualify another dataset, timeframe, engine or mode.
  VN still requires its exact source-index qualification before enablement.
- Atlas/Conditions/setup and named admission predicates resolve existing facts
  through the shared table. Named adapters keep their protocol-specific rules.
  Queue costs/classes, confined child limits and progress CPU caps derive from
  the same policy. Indexed declaration planning retains the shared 100k-bar
  ceiling; P08 retains 100k warmup-bar input bounds. CPU estimation remains an
  estimate, not a reservation or statistical quality guarantee.
- Existing global preview exception stays explicitly local/dev and at its old
  2–400 trials / 1800 CPU / 3600 wall seconds. It cannot widen causal-inner,
  imported or production recipes. Ordinary WFO/imported remains 120/240;
  fixed P04 remains 45/90. Memory/scratch/IO/file/FD bounds are unchanged.
- `SetupOptions` has additive optional `recipe_revision`, `preflight_policy`
  and `profiles[].budget` generated fields. Scope is
  `DECLARED_CAPS_NOT_RESERVATION_OR_ESTIMATE`, not permission to execute.
  Setup and engine-option profile lists are bounded at **256**, the serialized
  response at **1 MiB**, including its final revision. Existing axis-specific
  refusals and distinct `RESEARCH_SETUP_OPTIONS_STALE` 409 remain intact.
  No new profile ID is silently inserted into legacy Atlas/worker contracts.

Table revision: `e635e7986c90587e5253ee461b1e74d94db5fddcd4aa9eac20b976ad59c6774c`.

## 2. Repeated preflight 503 diagnosis and fix

The old persistence boundary counted all live actor manifests and issued a
new token even for identical repeated preflights. Its count and insert were
not serialized across API replicas. This is distinct from worker saturation.

The new scoped transaction takes a bounded actor/workspace advisory lock,
then reuses only a **fresh, identical, unbound** manifest. Every digest and
immutable document must agree, including source/snapshot identities. P08 still
calls and validates the private source on every request; it does not use the
stored token as a source-validation cache. Reuse never extends TTL. Expired,
different-source, different-actor/workspace and producer-bound records are not
reused. Bound producer history is excluded from abandonment quota and remains
protected from existing expiry cleanup.

Default active unbound quota remains **8**, hard maximum **16**, default TTL
**600 seconds**. No quota enlargement or history deletion. Genuine saturation
keeps 503; the browser receives `RESEARCH_PREFLIGHT_UNAVAILABLE` with
`details.gate=preflight_manifest_quota` and bounded `retry_after_seconds`
(1–3600). Private DB diagnostics do not become browser copy.

## 3. Append-only migration 095

`1723680000095_research-execution-recipes-v1.sql` mirrors six exact immutable
descriptors/policies and their scoped legacy qualification references. Runtime
may SELECT, not INSERT/UPDATE/DELETE. Explicit revocation also removes P03's
inherited default INSERT privilege on these two configuration tables.

The additive nullable `run_producers.execution_recipe_digest` binds **new**
producers to their exact policy revision. Old producers remain NULL; no
backfill, guessed historical policy, seal change or business-data rewrite.
Existing 094 private work/source-pair constraints are retained. A conflicting
explicit recipe revision is rejected before insertion. Future recipe changes
require a new append-only migration, never edits to applied 095.

Migration was applied only in a disposable PostgreSQL test cell. Preview,
production, accounts and runtime profiles are unchanged.

## 4. Verification receipts

| Check | Result / meaning |
| --- | --- |
| Independent baseline Atlas matrix | **192 outputs identical**, canonical SHA `3c0dd1fa932ecbb773ead7f8632624451c7a13b973319c8bcf79797b2fb5bacc`, raw wire SHA `3ec4a92d48d0acb80dc9c71530a580a5c024235b2cd0c2628d7a946daa63dec6`; engine/verified/flags/VN-qualified combinations captured from baseline, not generated from the new implementation; wire key order and Atlas ETags preserved |
| Initial affected Control API set | **127/127 PASS** (recipes/setup, WFO/imported/VN, Conditions and index admission) |
| Final affected Control API retake | **37/37 PASS** (exact selected matching files; not an additional full gate) |
| Setup/preflight contract fixtures | **13/13 PASS**, bounded quota retry included |
| Python affected pure adapters/planner/progress/limits | **126 PASS, 1 opt-in HMD test skipped**, 1122 deselected; no claim of a new real recipe qualification |
| Disposable PostgreSQL | **22/22 PASS**: P08/P10 regression plus 094→095 old DB, fresh DB, role privileges, immutable custody, new revision binding, six concurrent identical requests, six concurrent distinct requests, changed source identity, expiry and actor/workspace isolation |
| Production TS compile | `tsc -p tsconfig.build.json --noEmit` PASS; no writes into root-owned legacy build cache |
| Generator + contract snapshot | TS/Python source revision and receipt hashes match; snapshot covers **298 files** |
| Protected strategy | `34dc1847d051ca40f9ae3d2fbbf2d7e8fdc6b8d1e853beb0cc480b69afe2054d`, unchanged |

Normal repository hook is mandatory on the grouped delivery commit; a commit
containing this packet is accepted only after that hook succeeds. Its full
verification output is retained in the local FULL-01 commit receipt. No
`--no-verify`, host-wide prune, runtime build or repeat unrelated browser gate.

The first hook attempt passed 283 contract tests, then caught the derived
Dataset Index Problem schema not regenerated after the additive retry field.
Both Dataset Index OpenAPI/types are mechanically synchronized, and the recipe
generate target now regenerates that dependent contract as well. This changes
no Dataset Index operation or admission rule. The hook must pass before landing.

The second hook attempt passed all 283 contract tests and production compilation,
then reported 1991 Control API tests passing and two Atlas presentation failures.
Both were a wire key-order drift, not changed profile facts. The original JSON
insertion order was restored (no fixture/ETag expectation changes); the focused
Atlas/recipe retake passed 14/14. A separate baseline raw-byte fingerprint above
now guards all 192 combinations as well as their semantic values. Failed hook
attempts are not accepted delivery receipts; the final normal hook is required.
The next compile also caught an overly broad type on that copied profile object;
the copy now explicitly excludes server-computed state/reason and destructures
its ID before composing the historical prefix. Production compilation and the
same 14 focused tests are checked before retrying the normal hook.

Two stale Python test expectations were repaired without changing execution:
the existing 1.1.0 unbound-receipt refusal code (also failed on baseline), and
a preview child mock that predated temporal-control keyword arguments.
An over-broad exploratory Python selection was stopped; its partial failures
are not counted as PASS. The final bounded selection above is the receipt.

Original unchanged-descriptor receipts remain referenced in the table (P04,
B7/B8 temporal, causal-inner, imported E17, VN and P23 closeout). Their actual
child/API scope is not upgraded by this refactor. No new HMD execution binding
was opened, so no new long optimizer run or preview rebuild is required here.

## 5. Claude handoff and next stage

Regenerate mechanically with `npm run generate:research-execution-recipes`
inside `packages/contracts`. New generated names are `SetupOptions`,
`Profile.budget` / `Budget` in `research-run-setup.d.ts`, and
`Problem.details.retry_after_seconds` in `research-preflight.d.ts`.
Canonical examples: `research-run-setup-options.fixed.valid.json` and
`research-preflight.quota.valid.json`.

Keep current S02 composition/calendar/typed refusals. If displaying caps, label
them as declared caps; do not interpret them as actual duration, worker
reservation or permission. Quota retry is distinct from disabled-profile or
stale-options errors. Existing optional fields preserve old consumers/fixtures.
No frontend file, baseline or visual acceptance was changed in FULL-01.

Next approved-plan stage is **FULL-02**: missing Mode 1 per-fold-decay and a
separate optimized Three Window recipe, each with real retained product proof.
FULL-02 has **not started**. FULL-01 does not claim all modes/timeframes are open.

## 6. Cleanup / landing boundaries

Disposable PostgreSQL containers used tmpfs and were removed by their scoped
EXIT traps; no persistent volume was created. Interrupted test processes were
checked: no orphan child remained. Shared node/Postgres base images, snapshots,
artifacts and runtime containers are retained. No production cache cleanup.
Landing is a local fast-forward into clean `docs/research-loop-plan` only;
no origin/primus-origin push, dev/main merge, flag change or deployment.
