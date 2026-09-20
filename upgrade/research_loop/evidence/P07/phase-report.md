# P07 phase report — Alpha Registry, Import and immutable version binding

Status: `BACKEND_CONTRACT_PUBLISHED_FE_HANDOFF_PENDING` — 2026-09-20.

## Delivered authority

P07 adds an additive Research schema and a same-origin Control API contract:

- `POST /api/v1/research/alphas/import/parse` accepts exactly one bounded
  `.py` text plus filename and returns only an opaque `source_file_ref`,
  source/analysis SHA-256 values and read-only parsed mirror.
- `POST /import/gates` re-analyses the exact retained bytes and records seven
  ordered gate rows. A failure makes every later gate `SKIPPED`; it never
  creates a provisional registration.
- `POST /import/register` derives entrypoint, version label, dependency
  reference and immutable version identity from server analysis. A browser
  cannot override parsed entrypoint, parameter space or data contract.
- `POST /:alpha_version_id/activate` is ADMIN-only and uses Alpha revision as
  CAS precondition. Existing runs/attempts remain pinned to their old version.
- `GET /api/v1/research/alphas` is a safe registry strip: it never exposes raw
  stored bytes or an opaque source ref.

## Contract-publication amendment — `CG-P07-01`

The initial server slice omitted the generated public client contract despite
having all five routes. That delivery defect is resolved in the same P07
authority, not deferred to a frontend workaround:

- `packages/contracts/openapi/research-alpha-import.openapi.json` is the
  canonical five-operation OpenAPI source; its emitted TypeScript is
  `packages/contracts/generated/research-alpha-import.d.ts`.
- `research.alpha-source.v1`, `research.alpha-import-gates.v1` and
  `research.alpha-analysis.v1` are explicit shared schemas. The analysis
  document remains private Control-API↔parser compatibility material; it is
  not a browser route.
- Every browser success response has a schema version. The Registry list is
  now the `research.alpha-registry.v1` envelope rather than an unversioned
  array, because no browser consumer existed before this publication.
- Admission saturation and immutable version identity conflict are translated
  into the bounded P07 public error vocabulary before `HttpErrorFilter` writes
  a response.
- The generated-contract drift verifier now derives its repository root from
  its own path rather than assuming `/repo`; it runs identically from a local
  worktree and the immutable release image.
- Screen 14 stays additive at `/research/alphas/import`; legacy
  `/research/quantbt/imports` remains untouched until an explicitly approved
  migration phase.

The seven gates are fixed in this order: contract complete,
restricted-definition entrypoint load, digest uniqueness, parameter-space
sanity (maximum twelve), determinism declaration, known P04 data contract and
no-lookahead static scan. Gate 7 returns exactly:

> Static scan — runtime causality is proven per run at Stage 3/4.

It never claims static analysis proves causality. P10 remains the owner of any
future worker execution adapter; P07 has no installer, multi-file bundle,
path reference, dependency resolution or arbitrary-code runtime.

## Boundaries and retention

- Browser access ends at the same-origin session/CSRF boundary. It cannot
  choose Portal API origin, hold internal HMAC, mutate a parsed contract,
  reuse another actor's ref or retrieve raw stored bytes.
- Control API signs a 60-second internal principal for fixed private
  `/internal/research/alpha-analysis`. Portal API verifies it before accepting
  source text; that route is not mounted under `/api`.
- Temporary source rows are immutable. Only expired, unbound rows owned by the
  caller are deleted through bounded atomic `DELETE … RETURNING`; the runtime
  role has no `UPDATE` privilege on source bytes. Referenced provenance stays.
- One digest claims one AlphaVersion per workspace. Advisory lock plus durable
  claim table closes races. Activation changes lifecycle metadata and active
  pointer only; it never rewrites version identity or prior run bindings.

## Intentionally not claimed

No React/S14 code, browser journey, dev URL receipt, runtime container,
deployment, QuantBT worker execution, protected `strategy/main.py` change,
Execution Loop authority, Trading System path, direct browser database access
or dependency installer exists in P07. Screen 14 UI acceptance is the next
delivery action for Claude; this blocks full phase closeout but is not an
unrecorded backend defect.
