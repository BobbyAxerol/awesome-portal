# P09 phase report — Journey Map and Engine Atlas backend foundation

Status: `BACKEND_AND_TYPED_CONTRACT_COMPLETE` · Codex · 2026-09-20.

## Delivered boundary

P09 publishes exactly two authenticated, same-origin, read-only operations:

| Product operation | Method/path | Authority and bound |
|---|---|---|
| Read the Research Journey descriptor and normalized inspection URL | `GET /api/v1/research/journey` | Session + workspace membership; immutable descriptor revision; P02 opaque cursor vocabulary |
| Read the manifest-owned Engine Atlas | `GET /api/v1/research/quantbt/atlas` | Session + workspace membership; one server-side signed private GET; 1.5 s default deadline and 128 KiB contract ceiling |

Both return an ETag and `Cache-Control: private, max-age=0, must-revalidate`.
The browser cannot receive a Portal API base URL, signed internal principal,
engine import/handle, worker claim, source path, raw market rows, credential or
an executable route.

`research.journey_descriptor_registry` is additive and revisioned.  Its
content hash is pinned to the compiled descriptor, `UPDATE`/`DELETE` are
rejected by an immutable trigger, and `portal_research_runtime` has `SELECT`
only.  The primary key is `(descriptor_id, revision)`, allowing a deliberate
future descriptor revision without mutating historical truth.

The Atlas private adapter calls only
`GET /internal/research/engine-atlas` under the existing deployment-bound
internal-principal mechanism.  Portal API reads the existing P04 catalog
already loaded at application start.  It does not import a QuantBT engine per
view, start a worker, call a historical-data loader, or write a Research
domain object.

## P02 URL semantics retained

- Every cursor identifier is opaque and bounded.
- `event_seq` is accepted only as the legacy alias of `seq`; unequal values are
  a typed `400` rather than an arbitrary winner.
- An ambiguous `trial` under a known run requires `study`; no run context is
  reported as `UNRESOLVED_NO_RUN_CONTEXT`, not guessed.
- `pick` is always returned as `INSPECTION_ONLY`; it cannot select, promote,
  activate or dispatch anything.
- Unknown release, route and mode have separate typed `404` outcomes.  A
  private contract/auth/transport fault cannot become a browser-side fallback.

## Contract and ledger

`packages/contracts/openapi/research-foundation.openapi.json` and generated
`research-foundation.d.ts` publish the two named operations, P02 cursor
semantics and the 14-route / 5-mode / 7-claim Atlas shape.  The frontend alias
`@portal/contracts-research-foundation` is registered but no UI source was
modified.  Both routes are declared in the R2 capability inventory as
`AUTO_READ`, owned/tested by Codex, so the route ledger cannot drift silently.

## Exact verification

| Gate | Command | Result |
|---|---|---|
| P09 isolated authority, immutable registry, P02 aliases, private signed hop | `bash scripts/research-loop-v11/test-p09-postgres.sh` | 5/5 pass on a disposable tmpfs PostgreSQL container; named container is removed by trap |
| Control API production build typing | `apps/control-api/node_modules/.bin/tsc -p apps/control-api/tsconfig.build.json --noEmit` | pass |
| Portal API private route syntax | `python3 -m compileall -q apps/portal/backend/src/portal_api/api/routes_research_internal.py` | pass |
| Portal API private-route boundary | `PYTHONPATH=apps/portal/backend/src:apps/portal apps/portal/.venv/bin/python -m pytest -q -c apps/portal/backend/pyproject.toml apps/portal/backend/tests/test_research_foundation_private_atlas.py` | 1/1 pass; missing HMAC is `401`, signed private response has 14/5/7 contract shape, public equivalent is `404` |
| Generated OpenAPI contract | `cd packages/contracts && npm test` | 141/141 pass |
| Generated artifact parity | `cd packages/contracts && ./tooling/verify-generated.sh && python3 tooling/snapshot.py --check` | pass; 172 tracked artifacts |
| Global route ownership ledger | `cd apps/portal/frontend && npx vitest run src/execution/r2Ledger.test.ts` | 22/22 pass |
| Diff hygiene | `git diff --check` | pass |

No image build, dev-stack rebuild, cache warming, source read, runtime profile
change, deploy or database migration was run outside the disposable P09 proof.

## Explicit remaining P09 ownership

P09's backend and typed contract are complete.  The phase is **not** called a
full product exit yet: Claude must mount the lazy Research product routes,
consume these generated types, retain the existing Execution shell unchanged,
and collect the required S00/S12 HIFI browser receipts.  This is a named
frontend acceptance lane, not a backend gap or a reason to invent fixture
fallbacks.

`S14-VIS-01` from P08 is also awaiting Claude's explicit presentation decision:
retain the three authority states (parse, seven gates, register/activate) and
render HIFI's **Code anatomy** as a presentational substage under parse.  It
must not create a fourth lifecycle state, API field or backend transition.

## Rollback

Disable only the two lazy Research routes/consumer imports if a later P09
frontend release is reverted.  Keep the immutable descriptor registry and the
P04 Atlas catalog; neither has changed an Execution route, QuantBT invocation,
worker, source system or business record.
