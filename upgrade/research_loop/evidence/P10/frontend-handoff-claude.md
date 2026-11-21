# P10 frontend handoff — Screen 02 New Run

Backend is ready for a typed product consumer; it has not changed any TSX, CSS,
shell or HIFI composition.

## P10 browser-declaration amendment — `BR-P10-01` and `BR-P10-02` closed

The browser now has the facts required to activate the four verbatim Spec 02
validators and render the optimizer-default panels without inventing a policy.
They are **server-projected, generated types** — not a permission to inspect
raw Alpha source or to loosen P10 admission.

| Product fact | Generated source | Browser rule |
|---|---|---|
| Alpha entrypoint, declared timeframes, `determinism.seed_required`, parameter space | `RegistryEntry.declaration` from `GET /api/v1/research/alphas` | Find the exact selected immutable AlphaVersion; use only this safe declaration for the declaration/pin/sweep validators. |
| Release trial ceiling | `Atlas.current_release.trial_ceiling` from `GET /api/v1/research/quantbt/atlas` | Use the published finite ceiling. Do not retain `Infinity` once the current Atlas is available. |
| Four optimizer default groups | `Atlas.current_release.optimizer_defaults` | Render Study, Sampler, Objective and Candidate selection as `RELEASE_DEFAULT · LOCKED`; do not serialize them as a browser override. |
| P10 submission restriction | `Atlas.current_release.submission_constraints` | This is stricter than the display defaults: current P10 accepts exactly one trial and no optimizer override, early-stop or random-seed override. Let the server's typed refusal remain authoritative for a richer request. |

`RegistryEntry.declaration` is a bounded safe projection. It excludes source
bytes, paths, adapter/provenance facts, protected kernel hashes and execution
inputs. A malformed stored declaration is an exact typed server refusal; the
client must not repair or guess it.

### Required integration

1. Fetch the existing typed registry and Atlas reads in the Screen 02
   container. Locate the exact bound version by the selected
   `alpha_version_id`; do not call the legacy `/api/v1/alphas` API or infer an
   entrypoint from an identifier.
2. Feed `declaration.timeframes`, `declaration.determinism.seed_required`,
   `declaration.entrypoint`, `declaration.parameter_space` and
   `current_release.trial_ceiling` to the existing typed `constraintsFrom` / New
   Run validation boundary.
3. If the typed read is unavailable, partial, denied, or does not contain the
   selected version, preserve the HIFI composition in its documented state and
   do not manufacture a ceiling, parameter range, seed rule or entrypoint.
4. Add focused tests proving all four spec validators become active from a
   real generated response; P04's normalized declaration renders without
   leaking raw binding fields; and all four default groups retain their
   `LOCKED` presentation.

This amendment closes the backend declaration/default gap only. It does not
claim that the product route is wired or that rich P10 requests are accepted.

## Visual baseline boundary

The unsafe cross-feature Tailwind scan introduced by `7441c572` has been
replaced with a Portal-local scan plus an explicit reviewed Planning safelist;
do not restore the sibling-tree glob. The immutable Planning Board matrix is
green without a snapshot update. A separate immutable Chromium run still has
28 screenshot-only baseline/renderer mismatches (three `planning-reports`
Mermaid differences reproduce at baseline `6a712c53`). Do not re-record or
weaken those snapshots while wiring this consumer. A visual owner must make a
separate pinned browser/font evidence decision.

## Use only the generated contract

Generate/consume these three packages only:

- `@portal/contracts-research-alpha-import` for the safe selected
  `RegistryEntry.declaration`;
- `@portal/contracts-research-foundation` for the current Atlas policy facts;
- `@portal/contracts-research-run-create` for:

- `POST /api/v1/research/runs`;
- its exact `research.run-create.v1` request/response/error shape.

Use the existing generated P08 preflight contract for `may_create_run`.  Do
not hand-write a duplicate DTO, parse error strings, compute a digest in the
browser, encode a cursor/token, or send source path, snapshot bytes, worker ID,
lease epoch, adapter ID, effective digest or private principal.

## Product behavior

1. Preserve the full S02 HIFI composition and all 8-step controls; use the
   existing canonical requested-spec serializer for preview, preflight and
   submit.
2. Send the opaque preflight token, canonical requested spec, a fresh bounded
   `client_intent_id`, `intent_kind: "NEW"`, and CSRF through the same-origin
   BFF.
3. Treat `may_create_run` only as server-published display state.  It is not a
   client authorization gate: submit can still return a typed refusal after
   atomic re-admission.
4. Render typed `400/403/404/409/502/503` outcomes faithfully.  In this
   release the fixed P04 adapter may return
   `RESEARCH_RUN_EXECUTION_ADAPTER_UNAVAILABLE` for rich parameters or non-NEW
   intent; keep the user's valid fields visible and do not silently downgrade
   them to fixed values.
5. On successful `202`, use only returned opaque `run_id` and immutable digest
   facts.  P11 owns progress/stream/readback; do not fabricate a timer,
   terminal state or worker status.

## Route and P08/S14 decision to acknowledge

- Screen 02 product route: `/research/quantbt/runs/new`.
- Screen 14 canonical future route remains `/research/quantbt/alpha-import`;
  legacy `/research/quantbt/imports` remains unchanged.
- Confirm `S14-VIS-01`: exactly three authority states — **parse → seven gates
  → register/activate**.  **Code anatomy** is a visual substage under parse,
  never a fourth state, endpoint, persistence field or backend transition.

Record a product-route browser/HIFI receipt only after this consumer is mounted.
Fixture proof is not a substitute for that receipt.
