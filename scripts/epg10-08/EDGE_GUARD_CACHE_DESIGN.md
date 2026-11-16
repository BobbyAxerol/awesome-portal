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

## 2. Change B: source-database identity guard (commit B)

Wire (decode only, Manager side not yet built): optional member of the catalogue
`data`:

```json
"source_identity": {
  "database_name": "trading_system",
  "database_oid_sha256": "sha256:<64 lowercase hex>",
  "schema_migration_count": 173
}
```

`database_oid_sha256` is SHA-256 of the decimal `pg_database.oid` as ASCII text
(for example `74352923`), written `sha256:` plus lowercase hex. The TS side and
the pin author must use the same rule. It is an identity label, not a secret: the
OID space is small, so do not rely on the hash to hide it.

Edge code:
- `manager-v2-contract/src/lib.rs`: `SourceIdentity` (`:460`),
  `ManagerCatalogue::source_identity()` (`:491`), strict wire struct
  `SourceIdentityWire` (`:1801`, `deny_unknown_fields`, required members inside),
  `decode_source_identity` (`:1373`; name must be a valid identifier, hash must
  be `sha256:` + 64 lowercase hex). The field serialises only when present, so
  re-serialised cache entries round-trip and existing serialised output is
  byte-identical when a Manager sends nothing.
- `manager-compat-authority/src/lib.rs`: `SourceIdentityPin` (`:130`, strict,
  every member required, no defaults), `with_source_identity_pin` (`:200`:
  size-bounded 64 KiB, raw-bytes SHA-256 pin, schema, environment and profile
  must match the deployment, profile must bind), `validate_source_identity`
  (`:370`), error variants `SourceDbIdentityMismatch` / `InvalidSourceIdentityPin`
  (`:570`), constant `SOURCE_DB_IDENTITY_MISMATCH_CODE`.
  `BoundManagerAuthority::validate_catalogue` now also checks identity, and
  `relation_page_request`, `record_request` and `projection_request` call it
  instead of the unbound check, so every request builder is guarded.
- `edge-service/src/main.rs`: `manager_compatibility_authority` (`:2094`) loads
  the pin at startup; both `EDGE_MANAGER_SOURCE_DB_PIN_FILE` and
  `EDGE_MANAGER_SOURCE_DB_PIN_SHA256` unset keeps today's behaviour, exactly one
  set is a startup error. `manager_authority_error_response` (`:2600`) maps the
  new variant to HTTP 502 with code `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH`.
  The memo only stores a catalogue that also passes the identity check.

Pin file (deployed outside the repo, bytes pinned by the env digest):

```json
{
  "schema_version": "portal.execution.manager-source-identity-pin.v1",
  "environment": "paper",
  "profile_id": "PAPER_BINANCE_USDM",
  "source_identity_required": true,
  "database_name": "trading_system",
  "database_oid_sha256": "sha256:...",
  "minimum_schema_migration_count": 173
}
```

Rules: name and OID hash must match exactly; the reported ledger count must be
>= the pinned minimum; absent member is refused unless the pin explicitly says
`"source_identity_required": false` (the member has no default, a pin without it
is rejected); a Manager that does send an identity must match even when absent is
allowed. A profile with **no pin configured is not checked**, which is today's
behaviour and what keeps existing deployments and fixtures valid. That makes the
guard opt-in per deployment, not fail-closed by default. This is the main owner
decision below.

Deviation from the request: the pins live in their own pinned file, not in "the
release file", because that file does not exist in committed code (section 0).
When the uncommitted catalogue-release work lands, the same seven members can
become an optional `source_identity` object inside `CatalogueReleaseManifest`
with `source_identity_pins` filled from it; that is a small follow-up, and the
separate-file path can then be dropped.

Tests added: contract crate (`tests.rs`): legacy decode gives `None`; member
decodes exactly and survives serialise then decode; malformed, negative, missing
or extra members are rejected. Authority crate (`tests.rs`): unpinned profile not
checked; exact match and higher count pass; name, OID, lower count mismatches are
`SourceDbIdentityMismatch`; absent member refused unless not-required; pin loader
rejects wrong digest, missing member, extra member, bad hash, empty name, wrong
environment, wrong profile, wrong schema; bound authority guards
`validate_catalogue`, `relation_page_request` and `projection_request`. Edge
service: the mismatch maps to 502. Not tested: `manager_compatibility_authority`
config loading (needs a full `EdgeConfig`), and nothing exercises HTTP.

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
4. Name, hashing rule and member names for the TS wire (section 2), since TS builds
   against them.
5. Which database the Sandbox profile must pin (owner is unsure per Core's note).
