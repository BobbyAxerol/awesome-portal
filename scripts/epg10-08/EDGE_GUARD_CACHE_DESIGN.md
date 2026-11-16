# Edge catalogue memo and source-database identity guard (design, 2026-11-16)

Status: both changes are `implemented`, **UNBUILT: not compiled, CI must build
and test**. The authoring host has no Rust toolchain (no `cargo`, `rustc` or
`rustfmt` anywhere), so nothing here was compiled, formatted by `rustfmt`, linted
by clippy or run. Code was written to mirror neighbouring code and hand-checked
for rustfmt width rules, which is the first thing CI is likely to flag.

Base: `a4e48963`. Branch `chore/edge-db-identity-guard-and-catalogue-cache-20261116`,
two commits (A cache, B guard). Source of the request: Core note
`CORE_GO_OFFLINE_T1_T2_GUARD_CACHE_AND_NO_NATIVE_WINDOW_TODAY_20261116.md`
(workstreams 3 and 4) and the TS item-4 design.

## 0. Two corrections to the premises (grep result, not memory)

1. The catalogue **already has a cache**. `fetch_manager_catalogue` read a shared
   Postgres cache (`load_source_read_cache` / `store_source_read_cache`) before
   this change. Its TTL is `EDGE_MANAGER_SHARED_CACHE_TTL_MS` (default 750 ms,
   config max 5000 ms) and the store itself rejects anything above 5 s
   (`projection-store-pg/src/source_admission.rs:389`). So a 30 s cache cannot
   reuse that path without touching the store crate, and I did not. Change A is
   therefore a second, process-local layer in front of it, not a new cache.
2. The "catalogue release file" (`EDGE_MANAGER_CATALOGUE_RELEASE_FILE/_SHA256`,
   cited in the TS item-4 design as `manager-compat-authority/src/lib.rs:178-212`)
   **does not exist at `a4e48963`**. In that file lines 178-212 are
   `activation_revision()` and `bind()`. The mechanism exists only as uncommitted
   work in `/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2`
   (`from_pinned_release`, `CatalogueReleaseManifest`, `pinned_catalogue_digest`).
   I read it and did not touch it. Consequently there is no committed catalogue
   digest pin: "digest differs from the compat authority pin" is implemented as
   "fails the frozen 96-relation set (and, in B, the database identity pin)".

## 1. Change A: process-local catalogue memo (commit A)

What: `ProfileTtlMemo<T>` (`edge-service/src/main.rs:2291`) keeps one validated
`ManagerCatalogue` per profile id. `fetch_manager_catalogue` (`:2328`) returns a
live memo entry first; otherwise it calls the previous function, renamed
`fetch_shared_manager_catalogue` (`:2357`, body unchanged, still uses the shared
Postgres cache), and remembers the result only if it passes
`catalogue_matches_release` (`:2346`).

- TTL: `EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS`, default 30000, range 0..300000,
  0 disables (`:529`). Parsed with the existing `bounded_usize`.
- Never past TTL: `get` compares `Instant::elapsed()` with the TTL on every hit.
- Never caches errors: only the success path calls `put`.
- Drift handling: a catalogue that fails the relation-set pin is never stored, so
  a repaired Manager is seen on the next call.
- Contract errors drop the entry: `admitted_manager_execute` (`:2227`) calls
  `invalidate(profile_id)` when any Manager read returns
  `ManagerV2ClientError::Contract(_)`, which is how a Manager restarted with a new
  catalogue first shows itself (envelope digest mismatch on a request built from
  the old copy).
- "Keyed by digest": the memo key is the profile id. The entry carries its own
  `catalogue_revision`; digest equality with the Manager answer is enforced by the
  existing contract decoder on every later request (`CatalogueBindingDenied`).
  A key by digest is impossible before the first request because the digest is
  only known from the answer.
- Test builder uses TTL zero so existing tests behave exactly as before.

Tests added (`main.rs` tests module): memo serves only inside TTL and never when
disabled; invalidation drops only the named profile.

Static scans kept green: `execution-n21-shared-admission-test.sh` still finds
`manager_shared_cache_ttl`, `admitted_manager_execute`, `load_source_read_cache`,
etc. in `main.rs`; the compose assertion on `EDGE_MANAGER_SHARED_CACHE_TTL_MS:-750`
is untouched. I did not add the new variable to `deploy/compose.execution-edge.yaml`
or `deploy/.env.execution-edge.example`; the code default applies.

## 2. Change B: source-database identity guard (commits B and C)

Commit B first guessed the wire shape (a single ledger count member and a
`sha256:` prefixed OID hash). The Manager side (`ts-manager-source-identity-20261116`,
commit `ec707e0d`, `docs/MANAGER_SOURCE_IDENTITY_NOTE.md`) emits a different
shape, so a strict decoder would have refused every real answer. Commit C
reshapes types, decoder, pin schema, tests and this document to the real wire.

Wire (Manager side, decode only here): optional member `data.source_identity` of
the catalogue answer, exactly five keys, all present when the member is present:

```json
"source_identity": {
  "database_name": "trading_system_sandbox",
  "database_oid_sha256": "<64 lowercase hex, no prefix>",
  "schema_ledger_rows": 122,
  "latest_ledger_version": "99zzzzzzzzzzzzzz-package-release-command-kind-v1",
  "ledger_status": "READABLE"
}
```

Decoder rules (`manager-v2-contract`): name 1..63 bytes without control
characters; OID hash exactly 64 lowercase hex; `schema_ledger_rows` is
`null` or an unsigned integer and `latest_ledger_version` is `null` or a string (the
Manager keeps 256 characters; the decoder allows up to 1024 bytes), and **both keys must be present** (a missing key is refused,
unlike serde's default for `Option`); `ledger_status` is a closed enum, exactly
`READABLE` or `NOT_READABLE`, anything else refused; `READABLE` with null rows is
refused; `NOT_READABLE` with non-null rows or a non-null version is refused;
unknown keys are refused. `READABLE` with a null version is accepted (an empty
ledger has no latest row; the Manager note does not say, so I did not refuse it).

Manager wire field -> Rust field -> pin field:

| Manager wire field | Rust field (`SourceIdentity`, `manager-v2-contract`) | Pin field (`SourceIdentityPin`) | Rule |
|---|---|---|---|
| `database_name` | `database_name: String`, `database_name()` | `database_name` | exact match, always |
| `database_oid_sha256` | `database_oid_sha256: String`, `database_oid_sha256()` | `database_oid_sha256` (64 lowercase hex, no prefix) | exact match, always |
| `schema_ledger_rows` | `schema_ledger_rows: Option<u64>`, `schema_ledger_rows()` | `minimum_schema_ledger_rows: Option<u64>` (null or absent = not checked) | if set: ledger `READABLE` and rows >= minimum |
| `latest_ledger_version` | `latest_ledger_version: Option<String>`, `latest_ledger_version()` | none | decoded and kept, never compared (lexicographic, misleading) |
| `ledger_status` | `ledger_status: LedgerStatus` (`Readable`, `NotReadable`), `ledger_status()` | `ledger_status_required: bool` (default false) | if true: ledger must be `READABLE` even without a minimum |
| member absent | `ManagerCatalogue::source_identity() == None` | `source_identity_required: bool` (no default) | absent refused unless the pin says `false` |

Pin file (deployed outside the repo, raw bytes pinned by
`EDGE_MANAGER_SOURCE_DB_PIN_SHA256`; both variables or neither):

```json
{
  "schema_version": "portal.execution.manager-source-identity-pin.v1",
  "environment": "paper",
  "profile_id": "PAPER_BINANCE_USDM",
  "source_identity_required": true,
  "database_name": "trading_system",
  "database_oid_sha256": "<64 lowercase hex>",
  "minimum_schema_ledger_rows": 173,
  "ledger_status_required": false
}
```

Guard order (`validate_source_identity`, compat `lib.rs:402`): no pin for the
profile means not checked (today's behaviour). Member absent: refused with reason
`IDENTITY_ABSENT` unless the pin allows a legacy Manager. Then name
(`DATABASE_NAME`), then OID hash (`DATABASE_OID`), then, only if the pin sets a
minimum or requires a readable ledger: `LEDGER_NOT_READABLE` when the ledger is
not `READABLE`, `LEDGER_BELOW_MINIMUM` when rows are below the minimum. A Manager
that sends an identity must match even when absence is allowed.

Typed problem: HTTP 502, body
`{"error": {"code": "MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH", "message": "...",
"reason": "<one of the five codes>", "pinned_database_name": "...",
"observed_database_name": "..." | null}}`. Only the two database names are echoed;
the OID hash, counts and ledger version never appear in the body or in the error's
`Display`/`Debug` (tested). `IDENTITY_ABSENT` is my addition to your four codes,
because an absent member needs a reason too.

Code locations: `manager-v2-contract/src/lib.rs`: `LedgerStatus` `:460`,
`SourceIdentity` `:470`, `decode_source_identity` `:1396`, `SourceIdentityWire`
`:1839`, `required_nullable` `:1851`. `manager-compat-authority/src/lib.rs`:
`SourceIdentityPin` `:130`, `SourceIdentityMismatchReason` `:153`,
`with_source_identity_pin` `:231` (size-bounded 64 KiB, digest of the raw bytes,
schema, environment and profile must match, profile must bind),
`validate_source_identity` `:402`, `SourceDbIdentityMismatch { reason,
pinned_database_name, observed_database_name }` `:615`, `source_identity_detail`
`:639`. `BoundManagerAuthority::validate_catalogue` also checks identity, and
`relation_page_request`, `record_request` and `projection_request` call it instead
of the unbound check. `edge-service/src/main.rs`: `manager_compatibility_authority`
`:2108` loads the pin at startup (exactly one variable set is a startup error),
`manager_authority_error_response` `:2594` and `manager_source_identity_problem`
`:2730` build the 502. The catalogue memo (section 1) only stores a catalogue that
also passes the identity check.

A profile with **no pin configured is not checked**. That keeps existing
deployments and fixtures valid, and makes the guard opt-in per deployment, not
fail-closed by default (owner decision 1).

Deviation from the original request: the pins live in their own pinned file, not
in "the release file", because that file is not in committed code (section 0).
When the uncommitted catalogue-release work lands, the same members can become an
optional `source_identity` object inside `CatalogueReleaseManifest`.

Tests (all unrun): contract crate: legacy decode gives `None`; a `READABLE` member
decodes exactly and survives serialise then decode; a `NOT_READABLE` member decodes
with null rows and version and round-trips; 19 malformed or inconsistent members
are refused (bad hash prefix, uppercase hash, empty or 64-byte name, negative or
string rows, unknown status, wrong-case status, long version, READABLE with null
rows, NOT_READABLE with rows or a version, each of the five keys missing, extra
key, non-object). Authority crate: unpinned not checked; exact match and higher
rows pass; each mismatch yields its own reason and never echoes a hash or count;
null or absent minimum skips the count, `ledger_status_required` and a set
minimum require `READABLE`; absent member refused unless not-required; the pin
loader rejects wrong digest, missing `source_identity_required`, unknown key, the
pre-Manager-wire pin key for the ledger minimum, prefixed or uppercase hash, empty name,
wrong environment, profile or schema, negative minimum, non-boolean status flag;
the bound authority guards `validate_catalogue`, `relation_page_request` and
`projection_request`. Edge service: the mismatch maps to 502 with the five-member
body. Not tested: `manager_compatibility_authority` config loading (needs a full
`EdgeConfig`) and any HTTP path.

## 3. How CI should build and test it

Toolchain `1.85.1` (`services/portal-execution-edge-rs/rust-toolchain.toml`).
The repo gate is `scripts/execution-edge-test.sh`, which in a container runs, from
`services/portal-execution-edge-rs`:

```
cargo fmt --all -- --check
cargo test --locked --all-targets
cargo clean
cargo clippy --locked --all-targets -- -D warnings
```

Run `cargo fmt --all` first and amend, because the code was formatted by hand.
Focused loop for these changes (crate names are the package names):

```
cargo test --locked -p manager-v2-contract
cargo test --locked -p manager-compat-authority
cargo test --locked -p edge-service
cargo clippy --locked -p manager-v2-contract -p manager-compat-authority -p edge-service --all-targets -- -D warnings
```

Also run the two static gates that read these sources:
`scripts/execution-n19-manager-compat-test.sh` (authority source must not contain
`std::env` or `std::process`; the pin loader takes bytes, not a path, for that
reason) and `scripts/execution-n21-shared-admission-test.sh`.

## 4. Hash-pinned files: what would have to be re-pinned

Edited: none of the pinned files. Specifically untouched:
`contracts/manager-compat-authority-v1/adapter-matrix.v1.json` (`N19_MATRIX_DIGEST`),
`contracts/manager-profile-activation-v1/runtime-activation.v1.json`
(`RUNTIME_ACTIVATION_DIGEST`), `qualification-evidence.v1.json`, the two
`MANIFEST.sha256` files, `deploy/manifests/*-release-profile.v1.json` (their
digests are recorded in the activation file), and the manager-v2 contract pack.

Would need re-pinning only if the owner wants the member documented in the frozen
contract: `contracts/manager-v2-paper-read-v1/manager-v2.openapi.json`,
`manager-v2-fixtures.json`, the owner-publication and runtime-overlay manifests,
`contract-pack.lock.json`, and the `EXPECTED_FILES` hashes read by
`manager-v2-contract/build.rs`. The decoder does not consult those files at
runtime, so the order is safe: ship the Edge decoder first, then the Manager.
New deployment inputs (not repo files): the pin file and its `sha256:` for each
environment/profile.

## 5. Risks

- Not compiled. Likeliest failures: `rustfmt` line breaks at the width boundaries,
  a clippy lint I cannot see, a type or borrow slip. Review the diff, not only CI.
- Merge conflicts. The dirty worktree has about 6200 uncommitted lines in the same
  files (`main.rs`, compat `lib.rs`/`tests.rs`, contract `lib.rs`, plus
  `manager_projection_command.rs`). Expect conflicts in the
  `ManagerCompatibilityAuthority` struct and `canonical()`, `validate_catalogue`,
  the `AuthorityError` enum, `EdgeConfig`, `AppState` and the test-state builder.
- Staleness: a catalogue change on the Manager is invisible for up to the TTL (30 s)
  unless a contract error invalidates the memo first. The memo is per replica.
  Set the variable to 0 to turn it off.
- The guard only runs where a catalogue is fetched or validated. Two other
  authority instances are built without the pin: the Manager projection worker
  (`edge-service/src/manager_projection_command.rs:287`) and
  `maximum-data-adapter/src/lib.rs:615`. Both are follow-ups; the first is a
  one-line change once the dirty work there lands.
- Capabilities responses carry no identity; only the catalogue is checked.
- The wire is taken from the Manager note and checked against `build_source_identity`
  (`manager_facade.py:656-685` in `ts-manager-source-identity-20261116`); it is not
  exercised against a running Manager, and that Manager is not built or deployed.
- Until TS ships the member and a pin is deployed, nothing changes at runtime.
  Today's evidence (sandbox and live read `live_data_executor`, 149 ledger rows)
  would be caught only after a pin for the Sandbox profile exists and says what
  the owner decides it should read.

## 6. Owner decisions

1. Opt-in (as built) versus fail-closed-always: should a deployment without a
   pin file refuse to start? That breaks every existing deployment and test, so I
   did not do it.
2. Where the pins live: separate pinned file now, or wait for the catalogue-release
   mechanism to be committed and fold them in.
3. Memo default 30 s, and whether to add the variable to compose and the env example.
4. Whether `READABLE` with a null `latest_ledger_version` (empty ledger) should be
   refused; currently accepted. The wire itself is now the Manager's, not mine.
5. Which database the Sandbox profile must pin (owner is unsure per Core's note).
