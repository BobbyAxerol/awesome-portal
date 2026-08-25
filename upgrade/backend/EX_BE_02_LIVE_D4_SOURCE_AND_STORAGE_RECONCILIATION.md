# EX-BE-02-LIVE D4 — Source and Storage Reconciliation

Date: 2026-08-24  
Status: `D4_SOURCE_AND_STORAGE_INPUTS_RECONCILED / CONTRACT_ARTIFACT_IMPORT_PENDING / NO_PORTAL_SOURCE_TRAFFIC`

## Outcome

The two owner-side blockers identified by the earlier D4 audit now have
sanitized evidence:

- Trading System exposes a dedicated Paper read facade on host loopback only;
- the facade uses a mandatory, dedicated read identity and a frozen scope;
- missing, wrong and revoked identities fail closed, mutation methods are
  denied, and the existing Gateway remains unchanged;
- the source contract publishes exactly four bounded GET routes and one
  snapshot/watermark/resync protocol; and
- the existing AWS-HK instance now has a separate encrypted 40-GiB gp3
  filesystem mounted exclusively for the D4 projection PostgreSQL data path.

This reconciliation changes no AWS-HK runtime. It sends no Portal request,
creates no epoch and enables no delivery profile, Query, analytics, SSE or
command authority.

## Locked source identity

| Field | Accepted sanitized value |
|---|---|
| Source implementation commit | `4ad5d49322ce2e90e95148d36c5aa535c98b4935` |
| Source runtime acceptance commit | `99e912f4de9d23b51a3c2b9bc68eacd0841e9dfc` |
| Dedicated facade image | `sha256:8cf9adbc567b26e2d9489564b30e6dbc0c0a93a8ff2d9768c8e1d7f46d5c8088` |
| Contract revision | `d4.paper-read.v1` |
| Fixed scope | `PAPER_BINANCE_USDM / paper / BINANCE` |
| Runtime bind | AWS-HK host loopback `127.0.0.1:8011` only |
| Portal path | mTLS Source Proxy only; direct facade access forbidden |
| Route allowlist digest | `sha256:c45c3f3f4f8f0aecc5ef4bdac3dcdf1250af1057454d8c3a0312bf803ec6e9d9` |
| OpenAPI digest | `sha256:620fc88821c44a4019079b48055fa709b932ebf28c243a3122c6cb217fd3121d` |
| Capability/cursor/completeness/resync digest | `sha256:284caf2e299fbc71d924219d0f5312553a2c60c81a70adad716fb78cf093b11b` |
| Source guide digest | `sha256:478eaec1f51f849170cc8170ed1224dd08931f293c1d124f75a6996919110ee7` |
| Source tests digest | `sha256:a1cd28d785dfff1697ed9527474c649fc6288b0839e080f64aae45fa5cea8922` |

The exact routes are `GET /v1/orders`, `GET /v1/fills`, `GET /v1/positions`
and `GET /v1/events`. Initial synchronization starts with
`/v1/events?snapshot=begin`, pages all three snapshot resources to
`complete=true`, commits the snapshot atomically, and then consumes incremental
events from the returned watermark. Cursor tamper, ahead and expiry are typed
`400`, `409` and `410`; expiry requires a new `BUILDING` epoch snapshot.

The v1 bounds are pinned at 250 rows/page, 1 MiB/response, 120 requests/minute,
300-second snapshot TTL, 10,000 snapshot rows and 10,000 retained events.
Future source revisions cannot silently inherit these values.

## Runtime acceptance already proven by the owner

- missing identity, wrong identity and wrong contract are rejected;
- a temporary revoked overlap identity was rejected with `401`;
- `POST` and `OPTIONS` are denied and `/admin` is absent;
- the original one-key identity file was restored byte-for-byte;
- the facade remained read-only, capability-dropped and loopback-only;
- Gateway health before and after stayed healthy; and
- non-D4 Trading System container state was unchanged.

The Portal never receives the identity value, DSN, source scope file or
business response body. Secret delivery remains an owner action directly into
the root-owned Source Proxy runtime include.

## Encrypted projection storage

The owner independently proved the attached D4 volume is encrypted and kept
the AWS control-plane evidence outside Git. The AWS-HK host preparation proves:

- a dedicated ext4 filesystem distinct from `/`;
- UUID-bound persistent mount at `/srv/primus/portal/projection-d4`;
- effective `nosuid,nodev,noexec,noatime` mount options; and
- PostgreSQL data directory ownership/mode `70:70 / 0700`.

The storage verifier may report a deliberate `FACADE_CONTAINER_RUNNING` stop
after the source facade starts. That guard protects pre-provision storage work;
it is not evidence that the already-verified encrypted filesystem regressed.
Any later destructive format/mount action remains prohibited.

## Portal authorization contract v2

`portal.execution-d4.owner-input.v2` supersedes v1 before the first Portal
source call. It additionally locks:

- source implementation and runtime-acceptance commits;
- the dedicated facade image rather than the unrelated Gateway digest;
- frozen scope and runtime bounds;
- revoked-credential and loopback-only evidence;
- source guide/test/runtime-acceptance evidence digests; and
- Source Proxy secret delivery plus exact-route configuration as explicit
  pre-read gates.

The validator still requires a maximum two-hour owner window, an exact Portal
deployment/mapper commit, encrypted approved storage, a fresh `BUILDING` epoch
identifier and all D2/D3 predecessors. It still permanently rejects registry
activation, Query, analytics, SSE, commands and Trading System mutations.

## Remaining stop gates

1. Import the five owner-published non-secret source contract artifacts into
   the Portal worktree and independently verify every published digest.
2. Generate/review the Rust wire types and bounded pagination/resync client
   from those exact artifacts; do not infer payload shapes from prose.
3. Render the D4 Source Proxy route include, have the source owner deliver the
   secret directly, and prove header stripping/injection without revealing it.
4. Build, scan and sign the exact Portal Edge commit.
5. Open a new owner-approved window, pass v2 readiness, create one fresh
   `BUILDING` epoch and run the D4 qualification drills.

Until all five finish, the frontend must remain fixture/dark and the runtime
must remain `NO_PORTAL_SOURCE_TRAFFIC`.

## Local verification

- D4 authorization unit tests: `15/15` passed;
- v2 inactive template validation: passed; and
- v2 private owner-input reconciliation: passed without live authority; and
- whitespace/diff gate: passed.
