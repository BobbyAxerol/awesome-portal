# P07/P10 canonical Delta-RSI sample — scoped delivery

Client date: 2026-10-05 (Asia/Saigon); focused checks ran 2026-10-04 UTC.
Baseline: `99de587e` on `codex/be-gaps`. Bobby explicitly authorizes publishing
this sample without waiting for another owner source. This is an additive
sample/source-admission slice, not a new lifecycle, engine release or rollout.

## Source and product mapping

One authoritative file:
`apps/portal/frontend/src/research/samples/deltaRsiReference.py`.
SHA-256: `bd8a5b68e9a72023069731020a3e890463609eecb1565ef8c9ed713a87ebd2ac`.
The Import **Use sample** constant uses Vite's raw import from that exact file.
No duplicate `.py` is maintained and no browser parser or executor was added.
The [researcher guide](../../examples/DELTA_RSI_REFERENCE.md) links the source
and documents each class/def and its assumptions.

| Purpose | Definition | Product presentation / authority |
|---|---|---|
| Declaration | `ALPHA_CONTRACT` | Current eight Delta-RSI bounds; server parse owns the readonly mirror. |
| Parameter pins | `DeltaRsiParameters.read` | No hidden defaults; absent pins fail. |
| Indicators | `DeltaRsiIndicators` | Wilder RSI, trailing quadratic endpoint derivative, EMA/SMA/ATR and volume. Sliding moments make the derivative linear per supplied window. |
| Policy | `DeltaRsiPolicy.target_weight` | Filtered entry/direction-change exit/hard stop; previous-bar exposure only. |
| Entrypoint | `generate_signals(context)` | Exact output schema and code-fixed 1000-unit notional. Child supplies the past-only history. |

The existing collapsed **Code anatomy** presentation now sketches these five
purposes plus the unchanged seven gates. It remains a presentation substage,
not a fourth import authority state. No CSS, layout, router, interaction,
design token, baseline or legacy Import route changed. Existing entrypoint
tooltips no longer incorrectly prohibit all classes. The only modified
historical frontend assertion tracks this admitted helper shape; no browser
baseline was re-recorded.

## Runtime scope and strict definition boundary

The sample is a **bounded-history Delta-RSI reference**, not an export of or
replacement for protected `strategy/main.py` and not full-history kernel
parity. It resets indicator/position state at each worker-provided history's
first bar. Warmup is 256 bars; the current evaluator supplies at most 257 bars.
RSI on an exactly flat initialized tape stays 50 rather than implying positive
momentum. QuantBT owns fills/accounting/metrics; the sample claims none.

`research_alpha_definition.py` exposes:

- `validate_research_alpha_definition(source_text, *, expected_entrypoint)`:
  approved definition-only AST plus literal source contract, without execution.
- `load_research_alpha_definition(...)`: callable entrypoint plus contract,
  defining but never calling the strategy body.

The loader permits at most four plain helper classes, twenty static methods,
twelve module functions, 20,000 AST nodes, depth 96 and 256 KiB of source. It
rejects imports, top-level calls/state, inheritance/metaclasses, instance
fields/attributes, reflection/dunder names, defaults/annotations, dynamic
calls, nested definitions, recursion/cycles and builtin/helper shadowing.
Only the existing numeric safe builtin set and exact declared helper calls
are admitted. Bodies cannot read/alias/mutate module contract state. A helper
class may contain only a docstring and `@staticmethod` definitions. This is
not an arbitrary plugin/dependency-installer expansion. Child confinement and
CPU/wall/memory/identity limits remain mandatory and unchanged.

Root integration updated the existing analyzer/child to call that same
validator/loader so gates and execution do not disagree. The source contract
and one Portal entrypoint remain `research.alpha-source.v1`; helper classes
are internal definition organization, not additional public routes.

## Focused verification

- Pinned interpreter:
  `/home/bobby/portal-research/apps/portal/.venv/bin/python`.
- `PYTHONPATH=apps/portal/backend/src:apps/portal PYTHONDONTWRITEBYTECODE=1 ...
  -m pytest -q -c apps/portal/backend/pyproject.toml
  apps/portal/backend/tests/test_research_alpha_definition.py`: **36 PASS**.
  Covers actual canonical source loading, quadratic analytic vectors,
  causal-prefix equality, flat-tape RSI, deterministic finite exact-envelope
  output/no input mutation, legacy plain functions, acyclic helpers and strict
  negative authority/shape/bounds tests.
- Existing Import base/E6/W2c unit suites: **96 PASS** before the anatomy copy
  refinement. Final affected sample/F2/F2b/base/W2c run after the refinement:
  **98 PASS across five files**.
- Canonical sample tests: **4 PASS** before the additional anatomy assertion;
  final focused run passes all **five**, including source/anatomy alignment.
- Frontend `tsc -b --noEmit`: exit **0** before the reference-only copy
  refinement. Final grouped source gate is root-owned, not fabricated here.
- Protected strategy source was read-only; no protected kernel was edited.

These focused checks alone are not a real market/engine run receipt. Root added
the exact final-source pinned QuantBT 1.1.1 child result: 500 golden market bars,
one trade, final equity20000.0. Its precise scope and the separate actual HMD
sampler run are in the [combined closeout](../P24/P24_CANONICAL_SAMPLE_SAMPLER_CLOSEOUT_2026-10-05.md).
Post-build browser custody is recorded privately there; neither unit vectors
nor child output is relabelled as a profitability recommendation or Product GO.

## Coordination and cleanup

Only sample content, its focused tests, narrow helper-loader source/tests and
this packet/guide belong to this lane. No stage, commit, remote push, migration,
runtime/account/feature-profile operation or backend ≤P21 overwrite occurred
in the sample lane. No sample test stack, job, temporary identity, socket,
Docker volume or image was created; scoped resource disposition:
`NO_ACTION_NEEDED`. Root runs the one normal grouped hook and clean landing;
not a full hook for every documentation adjustment.
