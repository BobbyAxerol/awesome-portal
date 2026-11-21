# S02 — Optional per-study early stopping, 2026-10-07

Status: **REAL_PREVIEW_ACCEPTED** for this scoped feature. Landing requires the
normal grouped commit hook; this is not P24/release/production acceptance.
Authority: Bobby's optional early-stopping request, backend queue §43.
Base: `ffddb95ae03147d651e18baa69b04d72669f2ae9`; lane `codex/be-gaps`.

## Policy and public contract

- Blank remains `early_stopping: null`: disabled; existing execution and
  historical child payloads remain unchanged.
- Search recipes admit integer patience from 1 through `optuna_trials` per
  study. Fixed/native recipes with no optimizer still forbid the option;
  enabling a field cannot create an optimizer on those routes.
- The value means consecutive **COMPLETE trials without objective improvement**.
  It is not a target trial number, wall-clock timeout or total-run allowance.
  Independent fold studies reset their own patience.
- Setup publishes `early_stopping_policy: OPTIONAL` and typed
  `early_stopping_guidance`: PER_STUDY, minimum 1, requested-study trial ceiling,
  range ratios `[0.5, 0.75]`, suggested ratio `2/3`, and
  `suggestion_is_default: false`. For 400 trials: 200–300, suggested 267.
  The existing field shows the hint, but never silently applies it.
- Invalid values use `EARLY_STOPPING_OUTSIDE_STUDY_BUDGET` and
  `field_path: ["early_stopping"]`. Preflight now includes the distinct
  `execution_admission` PASS/FAIL gate; all-pass data gates alone do not grant
  creation. Creation still rechecks its own admission.
- Generated types/OpenAPI/fixtures updated: Research Run Setup/Foundation/
  Preflight (Dataset Index regenerated mechanically from its foundation ref).
  Canonical Atlas presentation fixture/generator also projects OPTIONAL and
  regenerates its ETag without rewriting pinned source/recipe captures.

## Implementation and faults found by the real path

The same predicate is enforced at TS setup/Conditions/P08/P10 and the Python
producer/child boundary. The admitted integer reaches QuantBT 1.1.1's actual
`optuna_early_stopping`; no Portal-simulated stopping callback or engine patch.
P05 keeps actual retained rows, candidates and selection. Read/seal validators
allow shortened populations only with the digest-pinned immutable P08 request;
an exporter cannot grant its own shorter population. Null keeps exact counts.

Real qualification found and fixed three integration faults, with failed
attempt receipts retained, not relabelled PASS:

1. Optimized Three Window's Python producer still hardcoded the former
   3-trial budget after setup/TS admitted 400. It now uses the exact recipe
   bounds (the older fixed-budget recipe stays unchanged).
2. Seal/read validation still required the declared count after actual engine
   stopping. It now uses the pinned stopping authority and actual study facts,
   preserving caps/digests and rejecting missing/mismatched authority.
3. P11 required uniform counts for independent fold studies. It now validates
   each actual count against the original request, keeps cursor/selection
   identities and never pads studies to match one another.

Scoped preview rollout supports explicit application services with
`--no-build --no-deps`, guards in-flight children, and waits for both API and
Control readiness. It excludes DB/NATS/migration/bootstrap. An expired,
never-dispatched producer reservation is not confused with a live child;
unknown/live leases still fail closed. No job was cancelled to deploy.

## Real qualification

Read-only HMD: `crypto-binance-1m`, BTCUSDT, 1h; installed pinned QuantBT 1.1.1;
Delta pct-equity edition 1.0.2, seed 42 and declared search space. Ordinary
P08 → P10 → confined child → P05 → named Progress/Search/Evidence/Freeze reads.

| Case | Run | Requested/study | Patience | Actual retained trials | Terminal |
|---|---|---:|---:|---|---|
| Optimized Three Window | `rrun_7d4709b7aad10eb8b3c55b77411764ff` | 400 | 200 | 390 | COMPLETED / READY |
| WFO global | `rrun_c789f9af2e86dd254023e97b9f526de1` | 20 | 3 | 5 | COMPLETED / READY |
| WFO per-fold decay | `rrun_42087e3338c7557eb1db19f3cf82f0fa` | 20 | 3 | 4 + 7 + 6 = 17 | COMPLETED / READY |
| Blank regression, Three Window | `rrun_f69dc1a59e541f07f52a99d023ddeefd` | 3 | null | 3 | COMPLETED / READY |

Three bounds (UTC, end-exclusive): IS 2026-08-01 → 08-22, OOS 08-22 →
08-29, Holdout 08-29 → 09-05. WFO: 2026-07-01 → 08-24, first OOS 08-03,
weekly/expanding, 3 engine folds and temporal guards 0.
These qualification windows are not a change to the owner's 2020–2026 runs.

Final readback at **2026-10-07T10:48:37.728Z** on the final application images:
all four runs remain COMPLETED/READY and their typed ledger counts agree;
S06 shows 390 and independent studies without a whole-screen unavailable;
0 browser page/console errors. Readback creates **0** additional engine jobs.
The separate real negative POST uses 401 patience for 400 trials: HTTP 409,
`RESEARCH_PREFLIGHT_INVALID`, exact early-stopping reason/field path.
The existing S02 hint was inspected at 1280/660; no style/token/baseline edit.

Private evidence root:
`/home/bobby/.local/state/portal-research-p23/early-stopping-20261007/`.
Reproducers: `scripts/research-preview/early-stopping.mjs` and the no-rerun
`early-stopping-readback.mjs`. Persisted JSON recursively redacts credentials,
tokens, cookies and JWTs; private files are 0600 in a 0700 directory. Each
normal review session was logged out and its browser closed in `finally`.

| Final evidence | SHA-256 |
|---|---|
| `final-readback/receipt.json` | `84f8dfbd1b51c82036e4ec7483be403564c9f62ca6192a721231085eba3d7dc2` |
| `final-readback/identity.json` | `1fbada11190f3ff7e93a5182bd4d3fe6a4d677b6176261de517ea5e6fb457de3` |
| `final-readback/three.search.json` | `743f2c6cae6283d59ccc3edfa1c1175b7eb8988a542d095c89e1a27342b7c1aa` |
| `final-readback/per-fold.search.json` | `5d1450c6ae0da36d4d699294d944eb1b21df1cda99a6aa98d3efff54f5b6d81a` |
| `final-readback/invalid-patience.json` | `0884ad86b825b382847aadc3e6ab2576d8130f0ef5c88caf0a3eabb406892f0b` |

## Final preview identity and verification

Images built from the base plus this uncommitted implementation, not a signed
release claim; the commit containing this receipt identifies the code change.

| Service | Image ID |
|---|---|
| Control API | `sha256:13ac43e5fe5dc8deac3333c5be039838722fe17215911e8de09afb73036e09eb` |
| Portal API and worker | `sha256:dff2da1d64f65df372334a6a5084f91d17b4d659e26edda997f14f9827a86171` |
| Web | `sha256:9b77042029dd711ca5788cc516437c6f9cb37bcc69beafc93ec088d4dfe049b4` |
| Roadmap (unchanged) | `sha256:da8e84189dbeb07a976e14cb71e7824bf7d54cc5eadccb47d37d8f548fa7e87c` |

Focused verification (overlapping runs are not added into one inflated total):
Control admission/setup 148 PASS; final read/seal/surface suite 113 PASS /
1 SKIP; additional full02 authority suite 35 PASS; Python selected
producer/child/retention 180 PASS and final patience/P11 progress 55 PASS;
frontend existing NewRun/Preflight 134 PASS and new binding 2 PASS; contracts
33 PASS; Control build and final frontend `tsc -b` PASS; shell/Node syntax and
diff checks PASS. Normal commit hook is the landing gate; do not rerun already
accepted engine/DR/whole visual matrices for this optional field.
The first normal hook had 2375 PASS / 6 FAIL / 3 SKIP. It found two stale
Atlas canonical-fixture assertions (FORBIDDEN policy/old ETag), the 192-case
historical hash, a VN runtime-admission fixture, the old WFO refusal of valid
patience2, and literal-refusal registration for the new trial/seed copy.
Fixture/generator were corrected; the hash test still checks the exact old
hash/key order after normalizing **only** this approved policy and separately
asserts OPTIONAL for search/FORBIDDEN for fixed. Membership/cache/other source
facts remain checked. WFO now asserts positive2 and negative4/3; the exact
field-path rules move unchanged from special cases into their central map.
These fixture/test/behavior-equivalent mapping corrections do not rerun engine
jobs; the normal hook must pass before landing. No gate is removed or skipped.
All six affected Control suites subsequently pass **100/100**, and the native
presentation/admission generator `--check` passes before the hook retry.

## Custody, cleanup and Claude handoff

No production, main/dev/remote push, migration, dependency/wheel/strategy-kernel
change, HMD mutation, old seal rewrite, DB/NATS restart or broad prune.
Final preview applications healthy; no RUNNING/CANCEL_REQUESTED jobs.
Historical queued `rrun_5e1185f847dddd418bdbd1f9f32b87c7` preserved: canonical
JSONB MD5 job `3d080bd27919935a3abd9c3f0f9051cd`, producer
`5d89dffe0ba2c7110c841203339f9c9d`, identical to pre-slice custody.
Failed qualification attempts and their actual retained evidence stay explicit.

Cleanup **NO_ACTION_NEEDED**: disposable test containers removed via `--rm`,
review browsers/sessions closed; no additional persistent test stack. Retain
named product receipts/artifacts and active/rollback images. Final root free
105,185,234,944 / 665,811,062,784 bytes (~15.8%), available RAM 13,135 MiB,
swap 0. Capacity decision authorized only scoped sequential cached builds;
no further full-stack/release build or destructive cleanup in this slice.

Claude: consume generated OPTIONAL policy/guidance; preserve blank as null,
the meaning of patience and actual retained counts. Existing field/panel binding
is implemented, no frontend redesign request. If refining copy later, do not
autofill, call this statistically optimal, promise stopping at N, or enable
early stopping for fixed/native no-search recipes. Other RF/P23/P24 gaps are
not closed by this feature receipt.
