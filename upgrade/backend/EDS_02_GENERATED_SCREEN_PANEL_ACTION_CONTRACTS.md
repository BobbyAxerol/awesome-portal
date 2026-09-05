# EDS-02 — Generated screen, panel, action and exact-value contracts

**Status:** `CONTRACT_AUTHORITY_COMPLETE / FRONTEND_COMPATIBLE / NO_RUNTIME_MUTATION`  
**Campaign branch:** `feat/eds-current-bff`  
**Scope date:** 2026-09-05

## Result

`source_authority` preserves the exact E3 source-system ownership label.  In
particular, composite evidence stays composite (`TRADING_SYSTEM_OR_RESEARCH`)
instead of being silently rewritten as a single authority.  The public schema,
generated TypeScript type and Control API all share the six frozen labels.

EDS-02 gives the Portal Control API and the frozen rich frontend one
deterministic, versioned contract authority. It is metadata and decoder work,
not a source activation or a visual redesign.

```text
immutable E3/E5 return-pack metadata
          │ deterministic compiler + input digests
          ▼
checked-in Control API generated source
          │ role/workspace-filtered, same-origin BFF
          ▼
GET /api/v1/execution/contract-authority
          │ generated OpenAPI/JSON Schema/TS types + runtime decoder
          ▼
frozen Portal routes keep their approved rich composition
```

The endpoint is session-guarded and workspace-membership-bound. It reports
only semantic screens, panels and actions; it never calls Edge, a Trading
System database, Source Proxy, Redis, broker or CLI. A browser receives no
relation name, raw cursor, upstream origin, credential, certificate or
server-selected URL.

## Generated authority

`apps/control-api/tooling/generate-eds02-contract-source.mjs` compiles the
sanitized `maximum-data-return-v1` E3/E5 evidence into
`eds02-contract-source.generated.ts`. The compiler is deterministic and
`--check` fails on any byte drift. Runtime reads the checked-in generated
module only; it never mounts or reads the return pack.

The immutable E3 inventory remains exactly **23 frozen screens**. EDS-02
adds two explicit, already-published BR-EX-72 Portal extensions rather than
silently mapping their list screens to unrelated detail views:

| Explicit extension | Existing named BFF |
|---|---|
| `EXECUTION_ALPHA_FLEET_LIST_SCREEN` | `executionAlphaFleetListV2` |
| `EXECUTION_ACCOUNTS_BINDINGS_LIST_SCREEN` | `executionBindingsListV1` |

The resulting current authority has **25 classified screens**, **34 frozen
field definitions**, and **12 semantic actions**. The immutable 23-screen
comparison remains a separate drift gate, so the two counts cannot be
confused or accidentally widened.

## Exact wire semantics

- `UtcEpochMs` is an exact signed epoch-millisecond number within the browser
  `Date` range (`±8_640_000_000_000_000`), not ISO text or a numeric string.
  The seven distinct clocks are `event`, `source_published`, `received`,
  `ingested`, `processed`, `as_of`, and `read`; no clock is inferred from
  another.
- Financial values are exact decimal strings with explicit uppercase currency
  and scale. Large identifiers and sequences are opaque strings only.
- Every dynamic panel has all ten coverage dimensions, source-history
  semantics, distinct readiness/delivery information, and formula lineage
  when derived.
- The frontend runtime decoder accepts the authority only when every nested
  screen, panel, action, coverage/lineage field, action-to-screen edge and
  redaction shape is exact. Unknown metadata (including a leaked relation or
  URL) is rejected before it can influence an approved rich screen.
- `READY`, `PARTIAL`, and `STALE` require non-null data. `EMPTY`,
  `UNAVAILABLE`, `DENIED`, and `ERROR` require explicit `null` data. Thus
  `READY + null`, missing-as-zero and partial-as-exact are impossible at the
  Portal contract boundary.
- Actions carry semantic IDs and resource/precondition requirements only. The
  frontend owns route/URL resolution and validates that every published screen
  has an approved renderer.

The existing Rust E4 `UtcEpochMs(i64)` and `ExactDecimal` remain the
inter-cell primitives. EDS-02 introduces no new Rust crossing because this
authority endpoint is Control-API metadata only; the Portal BFF's narrower
browser-renderable UTC range is explicit rather than a hidden coercion.

## Frontend integration

The frontend consumes generated OpenAPI types through
`@portal/contracts-screen-data`, provides UTC-only formatting and strict
runtime decoders for authority metadata and future dynamic panel envelopes.
The decoder rejects malformed clocks, bounds, coverage, gaps, exact values,
formula digest/lineage, panel state, action graph and leakage markers before
a rich screen can trust the result.

No approved route hierarchy, visual composition, rich panel, fixture lab or
runtime product route was replaced. EDS-03 will insert source-backed data into
these existing panels; it must not replace a panel's layout with a generic
envelope page.

## Verification

The phase closes only with the following evidence:

```bash
python3 services/portal-execution-edge-rs/tools/validate_maximum_data_e7.py
(cd services/portal-execution-edge-rs/contracts/maximum-data-return-v1 && sha256sum --check MANIFEST.sha256)
node apps/control-api/tooling/generate-eds02-contract-source.mjs --check
./scripts/contracts-test.sh
./scripts/control-api-test.sh
# clean frontend environment installs both Portal and embedded Planning graphs
cd apps/portal/frontend
npm ci
npm ci --prefix ../../../features/roadmap-task-board/frontend
npm test && npm run build
```

Focused tests cover generator reproducibility and digest equality; 23+2 screen
classification; RBAC filtering; browser/DST UTC display; decimal and large-ID
round trips; every panel state; malformed coverage/formula/action metadata;
route/action mapping; direct-source leakage; and the production fixture-import
guard. The full Control API gate also performs a fresh PostgreSQL
migration/restore drill.

**Recorded result:** E7 accepted **34 capabilities / 18 genuine source gaps /
three measured profiles**, the source manifest verified entry-for-entry, the
contracts suite passed **117/117**, the isolated Control API gate passed
**40 files / 348 tests** plus restore, and the clean Portal+Planning frontend
gate passed **590 suites / 1,826 passed / 0 failed / 3 skipped** followed by a
production build. The known Vite chunk-size advisory comes from existing
Mermaid/feature chunks; EDS-02 adds no production bundle or layout replacement.

The contract snapshot was regenerated in the same closure. Besides the new
EDS-02 schema/OpenAPI/fixture/type entries, this repairs hashes that were
already stale against committed current contract sources; it is a manifest
truth repair, not an unrelated source-contract rewrite.

## Closed scope and next phase

There is no EDS-02 technical debt: the source authority, public schema,
generated types, decoder, role/workspace endpoint, evidence digest and frozen
renderer graph are closed together. Runtime/source/profile/command activation,
Edge changes, cache changes, containers and network remain intentionally out
of scope and unchanged.

**Next:** **EDS-03 — Maximum current truth for Paper, Sandbox and Live stage
screens.** It will use this authority to populate the already-approved rich
panels with named, server-side BFF DTOs and retain a typed state only for the
specific field that the current source genuinely lacks.
