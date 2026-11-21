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

### P09 contract-tightening amendment — 2026-09-20

`CG-P09-01` is closed at the producer boundary rather than by a frontend
cast. `CapabilityAxes`, every claim descriptor and the evidence contract are
now strict shared OpenAPI/Zod shapes matching the P04 catalog vocabulary. The
Atlas private adapter rejects a widened, missing or misspelled axis/claim
before it reaches a same-origin response. `claims` remain informational: the
contract does not make a browser claim, a preflight, or an Atlas card execution
authority.

`FD-P09-02` is settled as a route-authority decision for P10 consumer work:
the new Alpha Import product route is `/research/quantbt/alpha-import`, inside
the QuantBT Research shell. The legacy `/research/quantbt/imports` route is
preserved unchanged. `/research/alphas/import` is not mounted while
`ALPHA_POOL` remains `COMMISSIONED`; an import wizard must not silently promote
that unrelated product surface. Claude owns the presentational mount and its
browser receipt; no lifecycle state or backend transition changes because of
this routing decision.

## Exact verification

| Gate | Command | Result |
|---|---|---|
| P09 isolated authority, immutable registry, P02 aliases, private signed hop | `bash scripts/research-loop-v11/test-p09-postgres.sh` | 5/5 pass on a disposable tmpfs PostgreSQL container; named container is removed by trap |
| Control API production build typing | `apps/control-api/node_modules/.bin/tsc -p apps/control-api/tsconfig.build.json --noEmit` | pass |
| Portal API private route syntax | `python3 -m compileall -q apps/portal/backend/src/portal_api/api/routes_research_internal.py` | pass |
| Portal API private-route boundary | `PYTHONPATH=apps/portal/backend/src:apps/portal apps/portal/.venv/bin/python -m pytest -q -c apps/portal/backend/pyproject.toml apps/portal/backend/tests/test_research_foundation_private_atlas.py` | 1/1 pass; missing HMAC is `401`, signed private response has 14/5/7 contract shape, public equivalent is `404` |
| Generated OpenAPI contract | `cd packages/contracts && npm test` | 142/142 pass |
| Generated artifact parity | `cd packages/contracts && ./tooling/verify-generated.sh && python3 tooling/snapshot.py --check` | pass; 172 tracked artifacts |
| Global route ownership ledger | `cd apps/portal/frontend && npx vitest run src/execution/r2Ledger.test.ts` | 22/22 pass |
| Diff hygiene | `git diff --check` | pass |

No image build, dev-stack rebuild, cache warming, source read, runtime profile
change, deploy or database migration was run outside the disposable P09 proof.

## Closeout ownership and P08 presentation decision

P09's backend, typed contract and product composition are complete at this
revision. Claude mounted the two lazy Research routes, consumed the generated
types, retained the existing Execution shell and recorded S00/S12 browser/HIFI
receipts. `CG-P09-02` remains deliberately classified as an **evidence-fixture
improvement**, not a backend or product-data gap: the current browser fixtures
are generated from the immutable Journey descriptor and P04 catalog, and may
not become a local product fallback.

The P08 presentation decision `S14-VIS-01` is also already recorded in the
frontend composition: retain the three authority states (parse, seven gates,
register/activate) and render HIFI's **Code anatomy** as a presentational
substage under parse. It creates no fourth lifecycle state, API field,
migration or backend transition. P10 owns the only remaining route/action
dependency: a preflight cannot be routed until its durable producer exists.

## E12 Journey descriptor revision 3

Five already-mounted product screens are now advertised as `AVAILABLE` by immutable descriptor revision 3. See [the E12 closeout receipt](./E12_JOURNEY_DESCRIPTOR_V3_CLOSEOUT_2026-09-27.md) for migration, compatibility, generated-contract and rollback evidence.

## Rollback

Disable only the two lazy Research routes/consumer imports if a later P09
frontend release is reverted.  Keep the immutable descriptor registry and the
P04 Atlas catalog; neither has changed an Execution route, QuantBT invocation,
worker, source system or business record.
