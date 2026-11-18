# SANDBOX source-database identity pin (guard) and the post-switch Edge steps: scope, files, proof, runbook (DRAFT, NOT APPROVED, NOTHING APPLIED)

Written 2026-11-18, offline: no host step, no compose action, no DB write, no running container touched (read-only `docker inspect` and read-only psql only). "(checked)" = read today, "(not checked)" = not.
Package: `scripts/epg10-08/sandbox-switch/` on branch `feat/edge-from-running-source-20261116`. Same design as `docs/PAPER_GUARD_PIN_PLAN_20261116.md`; read that for the guard semantics, this file only records what differs for the Sandbox.

## 1. Live state it builds on (checked 2026-11-18)
- Sandbox Manager image `8d4765a4...` running (identity member present), Sandbox Edge image `167e031a...` running, healthy, restarts 0; the Edge compose config file is `render-final/edge-sandbox.rendered.json` (hash `3ae54225...`).
- Edge env: `EDGE_MANAGER_CATALOGUE_RELEASE_SHA256=sha256:14778175...` (106 release), `EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS=0` (memo OFF), no `EDGE_MANAGER_SOURCE_DB_PIN_*` (guard OFF). The N24 projection worker is exited on the old image.
- `sandbox_render.py check --only edge --live` and `--only manager --live` against the real live containers and `render-final/RENDER.sha256` print `render matches` (read-only run, see 5).

## 2. The pin file (`scripts/epg10-08/sandbox-switch/pin.sandbox.json`, sha256 `1fd93331ed27902d049366451e1c787eb024992c6aac9388145ef8259cfa51f6`)
```json
{
  "database_name": "trading_system_sandbox",
  "database_oid_sha256": "3455fa708d1b9ad728b8c44f400b93f178468a33511eac2db099e01a8edbbb5f",
  "environment": "sandbox",
  "ledger_status_required": false,
  "minimum_schema_ledger_rows": 124,
  "profile_id": "SANDBOX_BINANCE_USDM",
  "schema_version": "portal.execution.manager-source-identity-pin.v1",
  "source_identity_required": true
}
```
- Facts re-read today with read-only psql on `trading_system_sandbox` (checked): `pg_database.oid` = 75754038, `sha256("75754038")` = the hash above (the Manager computes `sha256(str(oid).encode("ascii"))`, `build_source_identity` in image 8d4765a4, read from the image); `count(*)` of `public.schema_migration_ledger` = 124 (latest version `99zzzzzzzzzzzzzzzz-t1-read-indexes-small-relations-v1`; the guard never compares the version).
- It differs from `pin.sandbox.DRAFT.json` (sha256 `90bccb99...`) only in `minimum_schema_ledger_rows` 122 -> 124. The DRAFT stays untouched because `sandbox_switch.rs` and `sandbox_union.rs` include it.
- The ledger is a MINIMUM: new migration rows (125, 5000 ...) pass; a database with fewer than 124 rows (a restore from before the nine read indexes, which left 122) is refused. The OID check is what catches a recreated or different database; the name check catches a wrong DSN (tested: Paper `trading_system`, legacy `live_data_executor`).
- Guard order (same code as Paper): identity member absent -> `IDENTITY_ABSENT`; name -> `DATABASE_NAME`; OID -> `DATABASE_OID`; ledger not readable -> `LEDGER_NOT_READABLE`; fewer rows -> `LEDGER_BELOW_MINIMUM`; every one is HTTP 502 `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH` on every relation read through the Sandbox Edge (a refusal, never an empty answer).

## 3. The override (`override-sandbox-guard-pin-on.yaml`, sha256 `db75fcced83586d8bf177aea11b869985e8ed2165ed844271fba4b696f6b8bb0`)
Adds `EDGE_MANAGER_SOURCE_DB_PIN_FILE=/run/manager-source-pin/pin.json`, `EDGE_MANAGER_SOURCE_DB_PIN_SHA256=sha256:1fd93331...` and a read-only bind of `releases/guard-pin-sandbox-20261118/pin.sandbox.json` (created by `pin-stage`, 0644 in a 0755 dir, no secret). Stacked after `render-final/edge-sandbox.rendered.json` and, when the memo is on, `override-edge-memo-on.yaml`; nothing else changes (image, release file and its pin, secrets bind). Offline `docker compose config` of all four combinations (render; + memo; + pin; + memo + pin) merged as expected: TTL 0/30000, pin variables and the pin mount only with the override, release pin and image unchanged (checked).

## 4. Proof, offline (nothing ran against a deployment)
- `manager-compat-authority/tests/guard_pin_sandbox.rs` (2 tests, `--network none` container `--cpus 2 --memory 6g`, toolchain 1.85.1, `--offline`; the second reads the corpus `sandbox_union106_live`, generated from the REAL facade code of image 8d4765a4 with the live identity: database `trading_system_sandbox`, OID 75754038, ledger 124, the 106-relation union catalogue):
  - pin file: loads only for `Sandbox` + `SANDBOX_BINANCE_USDM` with its exact bytes; refused for Paper, Live, `SANDBOX_OKX`, `PAPER_BINANCE_USDM`, a wrong digest, empty or oversized file, the Paper pin file, a pin whose own `profile_id`/`environment` differs, an unknown member, a missing `source_identity_required`; the OID member equals `sha256("75754038")`.
  - catalogue shape, 11 cases (expected = got): matching identity pass; rows 125 and 5000 pass; Paper name `DATABASE_NAME`; legacy name `DATABASE_NAME`; Paper OID hash `DATABASE_OID`; rows 123 and 122 `LEDGER_BELOW_MINIMUM`; not readable `LEDGER_NOT_READABLE`; member removed `IDENTITY_ABSENT`; name and OID both wrong `DATABASE_NAME` (name first).
- `edge-service` unit test `the_sandbox_pin_is_loaded_at_start_only_for_sandbox_and_its_profile_with_exact_bytes` (the start-up loader with the real pin file): accepts sandbox + profile, no pin unchanged; exactly one variable, Paper, Live, `SANDBOX_OKX`, no profile, a wrong digest or a missing file all refuse. Test-only change in `edge-service/src/main.rs`; the binary of image 167e031a is not affected (not rebuilt).
- Results: `guard_pin_sandbox` 2 passed, `sandbox_union` 2 passed, `guard_pin_paper` 2 passed, `edge-service` 2 pin tests passed; `cargo fmt --check` and `cargo clippy --all-targets -D warnings` clean for both crates.
- Not tested for the Sandbox: a real Edge start with the pin (the Paper step ran the same code path; the Sandbox container and bind are the only differences).

## 5. Script and check changes (`sandbox_render.py`, `sandbox_switch_step.sh`)
Defect reproduced: after the Manager step the Manager container carries `TS_PORTAL_MANAGER_S1_SOURCE_ID` as compose env, `render_all()` rendered BOTH containers for every check, so `check --only edge` aborted with "Sandbox Manager has compose-set env beyond the four known names". The old code fails the same canned world in the new unit test; the new code passes it.
- `sandbox_render.py`: `render_group()` renders one group only (`--only manager` inspects the Sandbox Manager and the Paper Manager reference; `--only edge` the Sandbox Edge and the Live Edge reference), the other group is never inspected. New `--live` for a container already on its post-switch state: skips the two rollback renders (they describe the PRE-switch container) and accepts the Manager's S1 env. The Edge render drops the two pin variables like it already forces the memo TTL (they come from override files), so memo/guard overlays never count as drift. Output of `render` is unchanged byte for byte (the five approved hashes are the same).
- `sandbox_switch_step.sh`: `memo-on`, new `memo-off`, `pin-stage`, `pin-on`, `pin-off`; `verify` prints `memo=... guard=...`. The overlay state is READ from the live container env (never assumed) and each step keeps the other overlay: stack = `render-final/edge-sandbox.rendered.json` [+ memo-on override] [+ pin override]. Every step starts with `gate_edge_live`: renders at their approved hashes, release file approved, Manager on `8d4765a4` and running, Edge on `167e031a`, release pin = approved, `check --only edge --live` clean. Recreate is always `compose -p portal-execution-edge-sandbox ... up -d --no-deps --pull never --force-recreate execution-edge`.
- Bug found by the shim test and fixed: `wait_healthy` returned the status of its last `[ ... ] && break`, so an unhealthy last probe aborted the script under `set -e` before the Edge-step rollback branches ran. It now `return 0`. (The same pattern is in `guard-pin/guard_pin_step.sh` for Paper, which is hash-pinned and was not touched.)
- Tests without docker: `tests/test_sandbox_render.py` (12 unit tests, canned inspect dicts, docker never called: scope of each check, the reproduced flaw, live mode, drift detection, CLI forms) and `tests/test_step_shim.sh` (a fake `docker` and `sleep` first on PATH, a stub render check, a temp pin dir via `SBX_PD`; 47 assertions: modes, stacks and overlay preservation, every compose call is the single-service no-deps recreate in the Sandbox Edge project, no stop/start/restart/rm/kill/run/exec/pull, refused pin rolls back to guard off with rc 4, gates refuse before any compose call). Both ran green.
- Also checked read-only against the real live containers: `check --only edge --live`, `--only manager --live` and `--live` match `render-final/RENDER.sha256`; the non-live `--only edge` reports only the Edge rollback render as drifted and `--only manager` stops on the S1 env, both by design (pre-switch checks).

## 6. Runbook (each step needs its own go; nothing here has run)
1. `sandbox_switch_step.sh pin-stage` (creates `releases/guard-pin-sandbox-20261118`, no service touched).
2. `pin-on`: Edge recreate about 15-45 s outage on port 8444, memo overlay kept as live (off today). Unhealthy after 60 s -> automatic recreate without the pin, rc 4.
3. `verify`, then Core's first reads of each relation: any 502 `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH` is a stop, not a retry; `reason` names the failed fact.
4. Rollback = `pin-off` (same stack without the pin variables and mount). Never roll the Manager back to `0bd48db3` (no identity member) with the pin on: `pin-off` first.
5. Memo: `memo-on` / `memo-off` independent of the guard.

## 7. Unverified, stated plainly
- A real Edge start with the pin file and bind on the Sandbox host path, the Edge log text for a mismatch (the `verify` log counts are best effort), the first real reads after `pin-on` (Core's check).
- The ledger count at run time (124 read today; any restore below 124 refuses by design).
- The shim and unit tests prove the script logic against canned `docker` answers, not Docker's own behaviour (compose merge was checked separately with offline `compose config`).
- `docker compose` needs read access to the override's bind source only at run time; the source dir does not exist until `pin-stage`.
