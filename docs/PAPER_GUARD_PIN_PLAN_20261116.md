# PAPER source-database identity pin (guard): exact scope, files, proof, runbook (DRAFT, NOT APPROVED, NOTHING APPLIED)

Written 2026-11-16, offline: no host step, no running container touched, no image built. Facts marked (checked) were read today; "(not checked)" was not.
Package: `scripts/epg10-08/guard-pin/` (pin file, one override, one script) on branch `feat/edge-from-running-source-20261116`.

## 1. Scope

- Paper Edge only: container `portal-execution-edge-execution-edge-1`, project `portal-execution-edge`, `EDGE_ENVIRONMENT=paper`, `EDGE_MANAGER_V2_PROFILE_ID=PAPER_BINANCE_USDM` (checked). The pin names both; the Edge refuses to start with a pin for another environment or profile.
- Live state it builds on (checked): Edge image `167e031a...` healthy, memo on, T1 67-relation release (`57d52f66...`), guard off (no pin variables); Manager image `8d4765a4...` with the `source_identity` member.
- Sandbox and Live Edges (image `d6aa7a51...`) are untouched: they are other containers and other projects, and their Managers still read the legacy database `live_data_executor`; a pin with `trading_system` would be wrong for them and none is created.
- Not touched: the Manager, the issuer, Core, any database, the Edge image, the release file, the memo setting.

## 2. The pin file (`scripts/epg10-08/guard-pin/pin.paper.json`, sha256 `f62d2bf73e7a586fa6f87b05140cbfa669e26f8013135b0be116f0f3ee488f2c`)

```json
{
  "database_name": "trading_system",
  "database_oid_sha256": "5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b",
  "environment": "paper",
  "ledger_status_required": false,
  "minimum_schema_ledger_rows": 175,
  "profile_id": "PAPER_BINANCE_USDM",
  "schema_version": "portal.execution.manager-source-identity-pin.v1",
  "source_identity_required": true
}
```
Schema read from the code (`manager-compat-authority/src/lib.rs`, `SourceIdentityPin`, `deny_unknown_fields`): all keys above are accepted, `source_identity_required` has no default and must be present, `minimum_schema_ledger_rows` and `ledger_status_required` are optional. The loader (`with_source_identity_pin`) takes the raw bytes plus the `sha256:` digest from `EDGE_MANAGER_SOURCE_DB_PIN_SHA256` and refuses empty files, files over 64 KiB, a digest mismatch, a wrong schema version, an `environment`/`profile_id` that differs from the deployment, an empty or over-long name and a malformed OID hash.
The database name and the 175 are the live identity as the coordinator gave it and as the Manager identity image reports it; the OID hash `5a35755d...` was supplied by the coordinator and was NOT re-read by this author (not checked against the live Manager).

What the guard checks, in this order (`validate_source_identity`, on the catalogue answer; first failure wins):
1. No pin for the profile: nothing checked (today's behaviour). Here a pin exists.
2. Identity member absent: `IDENTITY_ABSENT` because `source_identity_required` is true.
3. `database_name` differs: `DATABASE_NAME`. 4. `database_oid_sha256` differs: `DATABASE_OID`.
5. Because a minimum is set, the ledger must be readable with at least 175 rows: not readable `LEDGER_NOT_READABLE`, fewer rows `LEDGER_BELOW_MINIMUM`.
`latest_ledger_version` is decoded but never compared. `ledger_status_required` is false because the minimum already implies a readable ledger.

The pin is a MINIMUM for the ledger on purpose. A PM bundle that adds ledger rows (176, 180, 5000 ...) passes (tested with 176 and 5000) and needs no new pin; a new pin is only needed if the owner wants to raise the floor. What does trip it: a database whose ledger has fewer than 175 rows (a restore or an older database), a Manager login that loses its SELECT grant on the ledger (reported as not readable), a different database name or OID (the case it exists for). Note the Manager reads its identity once at its own start, so after a bundle the reported row count changes only when the Manager restarts; both values pass.

## 3. Proof, offline (all green; nothing ran against a deployment)

Tests added on this branch (container, `--network none --cpus 2 --memory 6g`, RUSTUP_TOOLCHAIN 1.85.1):
- `manager-compat-authority/tests/guard_pin_paper.rs` (2 tests; the second reads the corpus emitted by the REAL Manager facade code of the identity image and the old image, `EDGE_WIRE_CORPUS`, skipped otherwise):
  - the pin file loads for Paper + `PAPER_BINANCE_USDM` with its exact bytes; it refuses another environment (sandbox, live), another profile, a different digest, an empty or oversized file, a pin whose own `profile_id`/`environment` differs, an unknown member and a missing `source_identity_required`.
  - against the real catalogue answer shape (67 relations): matching identity passes; rows 176 and 5000 pass; wrong name `DATABASE_NAME`; wrong OID `DATABASE_OID`; rows 174 `LEDGER_BELOW_MINIMUM`; not readable `LEDGER_NOT_READABLE`; member removed and the legacy (old image) answer both `IDENTITY_ABSENT`; wrong name plus wrong OID reports the name first. A relation page request fails with the same error as the catalogue validation in every case.
- `edge-service` unit tests (2): every one of the five reasons maps to HTTP 502 with code `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH` and its reason, and the problem body never contains the OID hash; the start-up loader accepts the real Paper pin file with its digest and refuses exactly-one-variable, sandbox/live environment, another profile, no profile, a wrong digest and a missing file (the Edge process then fails to start).
Counts: `manager-compat-authority` 23 unit + 2 (`guard_pin_paper`) + 1 + 1 (wire tests, corpus set) passed, 0 failed; `edge-service` 5 selected tests passed (the 3 related older ones plus the 2 new). `cargo fmt --check` rc 0 and `cargo clippy -D warnings --all-targets` rc 0 for both crates (separate container with network only to install the toolchain components).

## 4. The change (Edge recreate only)

Stack today (checked, compose labels): `edge-candidate.r3.rendered.json` + `override-t2-edge-release.yaml` + `t1-paper-20261116/override-t1-edge-release.yaml` + `running-source-20261116/override-edge-running-source-memo-on.yaml`. The pin adds one file, `override-guard-pin-on.yaml` (sha256 `8ad15e3561ffd542364f70fd6bbbf61b89e953c67cc2f6d0dce8e7b1a63f3561`): env `EDGE_MANAGER_SOURCE_DB_PIN_FILE=/run/manager-source-pin/pin.json`, `EDGE_MANAGER_SOURCE_DB_PIN_SHA256=sha256:f62d2bf7...`, and a read-only bind of `releases/guard-pin-paper-20261116/pin.paper.json`. The merged stack was proven offline with `docker compose config` (selected keys only): image `167e031a`, release pin unchanged (`57d52f66...`), the two pin variables and the read-only pin mount present, memo TTL variable absent (default 30 s), 5 services as before.

Script `scripts/epg10-08/guard-pin/guard_pin_step.sh` (sha256 `f6d0f4ae22ff22c0aad50a3b3611d5bd61d8e069ab924d3f34ebaa3c5afe52ab`; `bash -n` ok; NOT run): `status | stage | pin-on | verify | pin-off | rollback`.
- `stage`: re-checks the live inputs (rendered file `8600b9f4...`, T2 override `100aa0b5...`, T1 override `cc973342...`, T1 release `57d52f66...`, memo-on override `1baea74e...`), creates `releases/guard-pin-paper-20261116` (new, never overwritten) with the pin file and the override.
- `pin-on`: refuses unless the Manager runs `8d4765a4...` (a required pin against a Manager without the member would 502 every read) and the Edge runs `167e031a...`; recreates only `execution-edge` with `--no-deps --pull never`; waits up to 60 s for healthy; if the Edge is not healthy it rolls itself back to the current state and exits 4.
- `verify`: read-only state, pin variables, counts of `SOURCE_DB_IDENTITY_MISMATCH` and `CATALOGUE_DRIFT` in the last 120 s of the Edge log (best effort: it is not checked that the Edge logs these codes; the real signal is Core's reads), restarts.
- `pin-off` and `rollback`: recreate the CURRENT stack without the pin variables and mount (the state that runs today), image `167e031a`, memo on, T1 release.
Outage per recreate: Edge 8443 about 15-45 s (stop grace plus start plus health), as for the memo and T1 steps; no Manager restart.

## 5. Failure modes

- Mismatch at run time: the catalogue answer is the gate for every relation, so ONE mismatch turns EVERY relation read through the Paper Edge into HTTP 502 `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH` (reason, pinned database name, observed database name; no hash, no count). It is a refusal, never an empty result. A catalogue that fails the pin is never stored in the memo; a good one can be served up to 30 s after the Manager changed (the memo staleness).
- Start: the pin is validated when the Edge process starts (`EDGE_MANAGER_SOURCE_DB_PIN`): wrong environment/profile/digest/schema, a missing or oversized file, or only one of the two variables stops the process (container unhealthy); `pin-on` then rolls back.
- First start when the Manager catalogue lacks the identity member: the pin has `source_identity_required: true`, so every read answers 502 `IDENTITY_ABSENT` until the Manager answers with the member. Today the Manager has it (identity image `8d4765a4`), so this only happens after a Manager rollback. The Edge itself does not fail at start for this reason; whether a background probe fetches the catalogue before the first Core read was not checked.
- Coupling with the Manager rollback of the T1 package: `rollback-manager` returns to `b0d2e90b`, which has no identity member. With the pin on, that would make every read 502 `IDENTITY_ABSENT`. Always `pin-off` first (or together), then roll the Manager back. If the owner prefers the guard to tolerate a legacy Manager, set `source_identity_required` to false in a new pin file (new hash); that also lets a Manager without the member bypass the check, so it is not recommended for Paper.

## 6. What Core must watch

- After `pin-on`, the first reads of every relation: any 502 with code `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH` is a stop, not a retry; do not treat it as empty or as stale-ok. `reason` says which pinned fact failed.
- During any Manager restart, rollback or database change on Paper, expect either a pass or an explicit 502; never a silent wrong-database read.
- Core's OK for the guard pin is the pre-condition for running `pin-on`; the pin scope above is the exact scope to confirm (Paper Edge only, the values in section 2).

## 7. Unverified, stated plainly
- The OID hash value against the live Manager (supplied, not re-read), the live ledger row count at run time (175 as reported), the Edge log text for a mismatch, background catalogue fetches before the first read.
- Behaviour against the live Manager and Core's worker (no real read was made); only the corpus emitted by the Manager images' own code with synthetic rows was used (see the wire-shape corpus test for its limits).
- That the Edge image `167e031a` (built from `3055572e`) contains exactly the guard code tested here: the tests ran on this branch's source (HEAD after this commit), which adds only tests and package files on top of that source.
