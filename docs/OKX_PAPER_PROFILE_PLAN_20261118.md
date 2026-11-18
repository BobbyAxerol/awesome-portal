# OKX Paper profile: TS / Manager side, phase 1 (offline) and the ordered real steps

Date: 2026-11-18. Status: everything below is `tested locally` or text. Nothing was installed, started, restarted, created under `/home/bobby/secure` or `/srv/primus`, or run against a stack.
Owner decision (via Core, 2026-11-18): the profile id is `PAPER_OKX_<MARKET>`, audience `portal-execution-edge-paper-okx`; the market of the Paper OKX account is SWAP (verified by the coordinator:
97 OKX instruments, all CRYPTO_PERP/SWAP; the only Paper account is OKX/MARGIN/USDT), so **`PAPER_OKX_SWAP`**, venue `OKX`, mode `paper`, database `trading_system`.
Marks: (checked) = read or run on 2026-11-18; (not checked) = not verified. The Edge-authority Rust generalisation (`manager-compat-authority`) is another agent's work and is not touched here.

## 1. What was produced (all offline)

| item | value | where |
|---|---|---|
| Rust catalogue tool accepts the pair | new commit `2d36d085` on branch `feat/catalogue-paper-okx-swap-20261118` (worktree `edge-rust-okx-paper-catalogue-20261118`, on e035cfee); `profile_binding` and `pin_m0_scopes` accept (`PAPER_OKX_SWAP`, `OKX`) as a Paper pair on `trading_system`; cross pairs stay refused; 93 tests (2 new), fmt, clippy `-D warnings` clean | Edge repo |
| tool binary | sha256 `73a42c979af71d2936c5db74d19360ad8679089d87a6de08bda02b16f3adad4b` (release build, `--locked --offline`, toolchain 1.85.1, container `rust:1.83-slim`, no network) | scratch only |
| Paper BINANCE unchanged (proof) | the same inputs through the OLD tool (e035cfee) and the NEW tool give byte-identical relation-catalogue, serving-policy, profile-selection, release and candidate, and equal the files installed on Paper (seal `4f38c58f...`); the existing PAPER_OKX proposal pair is also unchanged | `catalogue/RESULTS.json` |
| fresh column inventory | `inventory/trading_system.columns-pk-uq.2026-11-18.txt`, read-only psql (`BEGIN READ ONLY`), sha256 `c09d3a9e9f29b3c257de302ded3bd193961ddcbcf8dae7f32f0341986d37aff7`; byte-identical to the 16 Nov dump the Paper 67 were built from: no column added or changed in any of the 67 relations | this branch |
| OKX catalogue (relation-catalogue.json) | file sha256 `6c89a03abb44c8c7bd90cc59ecae17ab4a72a2238f9528d7ba8fb6ad0f485d1a`, seal (`catalogue_sha256`) `14bb84b495bca93807486b4edac1f9fb45488485ee6e80842970a4848312eb29` | `artifacts/paper-okx-swap/` |
| serving policy | `ac8b1478027a090bc0c8b8512bc70cffdaa8dfca8c133586edee1ef7f7509ed1` | same |
| profile descriptor (profile-selection.json; `profile_sha256` equals its file hash) | `b61876234af3b0dc270bad80d33ccf95e03b8d721a95b6ef471a87dc9a00f1dc` | same |
| release file (manager-catalogue-release.json) | `8fd7bdf8d1cc36a50077b7e5565c58ba6886a03f76680c48640c00a9f97d6f82` (the Edge pins this sha256 as `sha256:8fd7bdf8...`) | same |
| shape | 67 relations (47 tables + 2 views of the base 49, 13 T1 tables, 5 shared references: the live Paper set; names equal to the live Paper release), 1105 returnable columns, 12 denied; 58 relations carry mode+venue, 2 carry venue only (`instruments`, `venues`), 7 are fixed-context. Only `authority.profile_id/profile_venue` differ from the Paper files, hence a new seal | same |
| wire proof | image `8d4765a4` facade code (stub source) emitted 203 shapes for this catalogue; the current Edge decoder (`manager-v2-contract`) decodes all (catalogue with `source_identity`, capabilities, 67 x page/empty/more) for `PAPER_OKX_SWAP` and refuses them for `PAPER_BINANCE_USDM`, `PAPER_OKX`, `SANDBOX_BINANCE_USDM`, `PAPER_OKX_PERP`; 3 new tests, `manager-v2-contract` 24 pass | `services/portal-execution-edge-rs/crates/manager-v2-contract/tests/paper_okx_swap_wire.rs`, corpus `scripts/epg10-08/okx-paper/wire-corpus/` |
| compose render (draft) | `compose/manager-paper-okx.rendered.DRAFT.json` sha256 `29b69da09a4456f15061c176ca0685c65b7692076c3bbac88628c9169a88dcf0`; `docker compose config` OK offline | this branch |
| installer/render tool | `okx_render.py` sha256 `1a210a0b37e28cb3e45f87fc834dca7664d1dbf602f97b3119bc181f9eea78aa`; 11 unit tests without docker; optional own-login SQL `okx_paper_login.DRAFT.sql` `646022eb...` | this branch |
| S1 source incarnation (Manager env) | `sha256:ac7c1cd2081f78e3ee7c04772cf7c109d8e5ad271c4f65eef4f63c0e55c5b175` = the `stage_m0_release.py` formula with the OKX seal (the same formula with the 12 Nov Paper seal reproduces Paper's `f9764913...`, checked) | `okx_render.py` |

Wire-proof limits: no mTLS, JWT, HTTP framing or database; rows are synthetic; the compat authority is not exercised (it refuses a fourth profile until the other agent's change).

## 2. What differs from the Paper BINANCE Manager (checked: Paper rendered file, running containers, env key names)

| aspect | Paper BINANCE (running) | OKX Paper (draft) |
|---|---|---|
| compose project | `portal-manager-read-paper-v2` | NEW `trading-system-manager-read-paper-okx` |
| containers | `...-portal_manager_read-1` (8d4765a4), `...-portal_manager_issuer-1` (28ea3958) | two new ones; both 8d4765a4 (the issuer module is byte-identical in both images, sha256 prefix `2fc6c8b5bb1c8404`, checked in a capped container) |
| loopback ports | 127.0.0.1:8023 / 8024 | 8323 / 8324 (free; nothing listens: `ss -ltn`, not a docker-only check) |
| env keys that change (facade and issuer runtime env) | `TS_PORTAL_MANAGER_READ_PROFILE_ID=PAPER_BINANCE_USDM`, `..._PROFILE_VENUE=BINANCE` | `PAPER_OKX_SWAP`, `OKX`. `..._PROFILE_MODE=paper`, `..._ENVIRONMENT=paper` stay. Everything else of the Paper env is kept (JWT issuer/audience/subject/key id, mTLS client subject, purpose, workload, limits, `DB_CONNECTION_LIMIT=2`, `DB_TARGET`, scopes) |
| compose env | `TS_PORTAL_MANAGER_S1_SOURCE_ID=sha256:f9764913...` | `sha256:ac7c1cd2...` (new incarnation: its own catalogue seal) |
| catalogue + policy files | seal `4f38c58f...` | seal `14bb84b4...` |
| private dir | `/home/bobby/secure/portal-manager-m0-r2-20261112` (catalogue, policy, DSN, runtime env) + `portal-manager-read-v2/runtime` (certs, JWKS, keys) | NEW `/home/bobby/secure/portal-manager-paper-okx-20261118` (NOT created; one dir like the Sandbox switch) |
| hardening | cap_drop ALL, read_only, no-new-privileges, user 1001:1001, tmpfs /tmp noexec, cpus 0.5, 512 MiB, pids 128 (facade), restart unless-stopped, json-file 10m x 3, network `executor_network` | identical (taken from `docker inspect` of the Paper containers) |
| profile predicate at query time | `mode='paper' AND venue='BINANCE'` | `mode='paper' AND venue='OKX'` (from the policy, never from the caller) |
| database / login | `trading_system`, login `ts_portal_manager_read_facade` | same database; login reused (section 4) |

## 3. Manager + issuer runtime config, files, JWT and cursor keys

Files mounted read-only at `/run/secrets/...` (names only; the new dir holds all of them, mode 0600, dir 0700):
- facade: `manager-runtime.env` (Paper env, two profile keys changed), `facade-db.dsn`, `relation-catalogue.json`, `serving-policy.json`, `cursor.key`, `jwt-jwks.json`, `revocations.json`, `server-cert.pem`, `server-key.pem`, `mtls-ca-cert.pem`, `ts-postgres-ca.crt`.
- issuer: `manager-runtime.env` (Paper issuer env, two profile keys changed), `mtls-ca-cert.pem`, `jwt-jwks.json`, `revocations.json`, `issuer-server-cert.pem`, `issuer-server-key.pem`, `jwt-ed25519-private.pem`.
Reused byte for byte from the Paper mounts: DSN, Postgres CA, JWKS, revocations, the facade and issuer server leaves and keys (SANs `manager-facade, localhost, 127.0.0.1` / `manager-issuer, ...`: the proxy connects to 127.0.0.1:8323/8324, so they validate), the Ed25519 signing key (see D1), the mTLS anchor.
NEW: `cursor.key` (fresh Fernet key from `cryptography`, never the Paper one; page cursors are also bound to profile id and catalogue digest, so a Paper cursor would be refused anyway).
Changed: only `TS_PORTAL_MANAGER_READ_PROFILE_ID` and `..._PROFILE_VENUE` (tested: `env_with` requires each key exactly once; the output differs from the Paper env in those two lines).
Draft install = `okx_render.py secrets --sec /home/bobby/secure/portal-manager-paper-okx-20261118` (never run): creates the dir 0700, copies by NAME from the mount sources of the running Paper containers, writes files only if absent (mode 0600), refuses a catalogue or policy whose sha256 differs from the pinned values, prints names and 12-hex sha prefixes only (never contents), `dsn` subcommand checks the DSN shape without printing a part of it.
JWT: the facade accepts a token only if its `profile_id/profile_mode/profile_venue` claims equal its own policy (`identity/manager.py:661-679`), and the issuer mints with its own profile fields; a token minted by the Paper issuer is refused by the OKX facade (and the reverse) even with a shared key. A NEW signing key (own key id, own JWKS, own issuer key file, key id changed in both env files) is an optional hardening: D1.
Anchor: the draft copies `mtls-ca-cert.pem` at the moment `secrets` runs. Run it AFTER CA phase 2 (`docs/MANAGER_CA_PHASE2_PLAN_20261116.md`) so the copy is v2-only; the phase 2 tool does not know the new dir (not in its anchor list) and would leave an earlier dual copy dual.

## 4. Database side (read-only checks on `trading_system`, 2026-11-18)

- Group role `ts_portal_manager_read` (NOLOGIN, NOINHERIT): SELECT on 67 of the 67 catalogue relations, 0 write privileges, SELECT on `public.schema_migration_ledger` (checked with `has_table_privilege`). The nine T1 read indexes exist, valid and ready (checked).
- Login `ts_portal_manager_read_facade`: NOINHERIT, connlimit 12, member of the group role, read-only defaults and timeouts; `pg_hba_file_rules` line 100: `hostssl trading_system ts_portal_manager_read_facade 172.18.0.0 scram-sha-256` (the `executor_network` subnet is 172.18.0.0/16); line 106 `host trading_system all all reject`. Current sessions of this login: 1 on `trading_system`, 1 on `live_data_executor`; the OKX facade pool adds 2.
- Recommendation (D2): REUSE this login. Then there is NO database change in any step (no role, grant, index, pg_hba edit). The DSN is a byte copy of the Paper one. Optional alternative `okx_paper_login.DRAFT.sql`: a login of its own plus one pg_hba line (a host step on the database container's `pg_hba.conf`; rollback = restore the backup, DROP ROLE).
- Row facts (checked): OKX rows now: `accounts` 1, `instruments` 97, `venues` 1, `account_equity_snapshots` 207; the Edge answer of today lists the other non-empty relations (command_journal 946, domain_events 1247, source_change_journal 11957). The lower-case venue row `okx` in `venues` does not match `venue='OKX'` and is not served (not a defect of this package).
- Identity guard values the Manager reports for this database: name `trading_system`, oid hash `5a35755d64384917a6c86adc8bc5eba5dadb17b90c761e35e24903c4e57cd97b` (sha256 of `74352923`), ledger rows 175 (checked).

## 5. Compose render (draft) and offline validation

`okx_render.py render --out DIR` (DIR chosen by the caller, not the secret dir) writes `manager-paper-okx.rendered.json` and `RENDER.sha256` (never overwrites); `check --out DIR` re-renders from the running Paper containers and detects drift; the committed copy is `compose/manager-paper-okx.rendered.DRAFT.json` (sha `29b69da0...`, the file name inside `RENDER.sha256` is the un-suffixed one). `docker compose -f <render> config -q` passed offline; services `portal_manager_read` and `portal_manager_issuer`; image `localhost/portal-manager-read@sha256:8d4765a4451431ec6a5e146a24745d3bc791b411e1b0093bbf8cee8edc1044dd` for both.
The rendered file has no secret value (the only host paths are the new private dir's file names). Real start (text only, not run): `docker compose -p trading-system-manager-read-paper-okx -f manager-paper-okx.rendered.json up -d --no-deps --pull never`.

## 6. New Edge instance, source proxy, route and ports (documentation only)

What could NOT be read: `/srv/primus/portal` is `drwxr-x--- root portal-runtime` and `bobby` is not in that group (checked), so the three source proxies' nginx configs and rendered location files, the shared secret directories (`source-proxy/`, `execution-edge/`: certificates, JWKS, event-ledger files) and the Edge `.env` files were not read. What follows comes from `docker inspect` of the running containers and the repo scripts/templates (`scripts/execution-profile-runtime-prepare.sh`, `deploy/execution-d1/...`).

| item | Paper / Sandbox / Live today (checked) | OKX Paper instance (proposal) |
|---|---|---|
| Edge process | env `paper`/`sandbox`/`live`, host ports 10.70.0.2:8443/8444/8445 (all three listening) | `EDGE_ENVIRONMENT=paper`, `EDGE_MANAGER_V2_PROFILE_ID=PAPER_OKX_SWAP`, `EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper-okx`, host port **10.70.0.2:8446** (nothing listens on it: `ss -ltn`; Docker publishes none: checked) |
| compose project / private bridge | `portal-execution-edge[-sandbox\|-live]`, network `..._execution-private` 172.23/24/25.0.0/24 | new project `portal-execution-edge-paper-okx`, new bridge e.g. 172.31.0.0/24, gateway .1 (unused in `docker network ls`; the Docker address pool and host routes were not checked) |
| source proxy | `ghcr.io/bobbyaxerol/portal-source-proxy@sha256:aa14e21c...`, host network, listens on the bridge gateway :8444 (172.23.0.1, 172.24.0.1, 172.25.0.1), upstream 127.0.0.1:8023/8024 (8123/8124, 8223/8224) | new container `...-paper-okx-source-proxy-1`, listens on its gateway:8444, upstream **127.0.0.1:8323/8324**; its own `nginx.manager-paper-okx.conf` and `manager-v2-locations-paper-okx.conf` rendered by the repo script from templates, under `/srv/primus/portal/source-proxy` (root-owned) |
| Manager mTLS legs | the proxy presents `manager-v2-client.pem` (v2-signed leaf, SAN `spiffe://trading-system.internal/portal-execution-edge/manager-read`) and trusts `manager-v2-ca.crt`, both in the SHARED directory `/srv/primus/portal/source-proxy` | the same two files (the new proxy mounts the same directory): after CA phase 2 the anchor there is v2-only; the OKX facade expects the same client subject, so no new client leaf is needed |
| Edge to proxy leg | other CA family (Primus Portal Execution Offline Root v1); proxy server certificate must name the proxy's own bridge gateway address | a NEW proxy server certificate for the new gateway IP signed by the Edge server CA (custody: the offline root, owner step), OR (alternative) listen on a free port of the Paper bridge gateway and reuse its certificate. Not checked which the owner prefers; the file layout of the certificates is unreadable to me |
| profile script keys | `scripts/execution-profile-runtime-prepare.sh` `case` has paper/sandbox/live (id, edge_port, bridge, facade/issuer ports, projection volume, proxy conf names) | a fourth key (Edge repo change, e.g. `paper-okx`: id PAPER_OKX_SWAP, edge_port 8446, bridge 172.31.0.0/24, facade 8323, issuer 8324, volume `...-v4`, conf names `...paper-okx...`); the script also sets `EDGE_ENVIRONMENT`/audience from the key, so it needs the environment (`paper`) separated from the key |
| projection worker / postgres | Sandbox and Live have `...-manager-projection-worker-1` and `...-projection-postgres-1` running; the Paper worker is exited | not part of this proposal: `EDGE_MANAGER_PROJECTION_ENABLED=false` on all three Edges (checked); an OKX instance starts read-through only |
| event ledger | env `EDGE_MANAGER_EVENT_LEDGER_ADMISSION_FILE=/run/secrets/event-ledger-runtime-<profile>.json`, `EDGE_EVENT_LEDGER_STATE_DIRECTORY` per profile; Manager-side state dirs exist under `portal-manager-read-v2/profiles/{live,sandbox}` | whether the OKX instance needs these at start was not checked (files live under the unreadable `/srv`); STREAM for OKX is out of phase 1 |
| release / pin | `EDGE_MANAGER_CATALOGUE_RELEASE_FILE/_SHA256`, guard pin file/sha | release sha `sha256:8fd7bdf8...` (this package); a NEW guard pin for (`paper`, `PAPER_OKX_SWAP`, `trading_system`, name `trading_system`, oid hash above, minimum ledger rows 175): the Paper pin cannot be reused |
| Edge image | `167e031a` (three running Edges) | a NEW Edge image carrying the authority change (other agent); the three running Edges are not rolled |

## 7. Ordered steps (nothing below is approved or run; each real step needs its own owner hash)

Every step: Core gives a baseline and an OK first (silence is not an OK); the previous steps' state is re-checked read-only before it; one step per call; stops at the first error.

| # | step | owner hash to approve | needs first | rollback | what Core must watch |
|---|---|---|---|---|---|
| 0 | CA phase 2 on the current roster (separate plan `MANAGER_CA_PHASE2_PLAN_20261116.md`) | its own prepare manifest | owner approval | its own fallback | six Managers restart: Paper/Sandbox/Live reads fail for 2-4 min |
| 1 | Review the Rust commit `2d36d085` and merge nothing yet | commit sha | none (no host action) | n/a | nothing |
| 2a | `okx_render.py secrets --sec /home/bobby/secure/portal-manager-paper-okx-20261118` (creates ONE new dir, 15 files by name, new cursor key) | `okx_render.py` `1a210a0b...`, `artifacts` hashes of section 1, expected file list | step 0 done | `rm -r` the new dir (nothing else was touched; the files are copies) | nothing changes in any running service |
| 2b | `okx_render.py dsn` then `render --out <dir>`/`check`, then `docker compose -p trading-system-manager-read-paper-okx -f ... up -d --no-deps --pull never` (two NEW containers; Paper/Sandbox/Live containers are not named) | render sha `29b69da0...` (re-rendered on the day: must equal), image digest `8d4765a4...` | 2a | `docker compose -p trading-system-manager-read-paper-okx down` removes only these two containers; remove the private dir if abandoning | DB sessions of `ts_portal_manager_read_facade` rise by 2 (limit 12); loopback 8323/8324 only; no change to 8023/8024/8123/8124/8223/8224 |
| 3 | Manager-only TLS and catalogue probe from the host with the proxy client leaf (like `renew_manager_tls.qualify()` restricted to ports 8323/8324; a ~20-line variant, not written) | probe script hash | 2b | none (read-only); if it fails: step 2b rollback | `source_identity` in the catalogue answer: name `trading_system`, oid hash `5a35755d...`, rows 175; `profile_id PAPER_OKX_SWAP`; seal `14bb84b4...` |
| 4 | Source proxy + new Edge instance on 10.70.0.2:8446 (new bridge, new proxy server certificate, nginx files, new Edge container). Needs the Edge authority change and the new Edge image | Edge image digest, release sha `8fd7bdf8...`, rendered compose sha, nginx file shas, pin file sha | step 3, the other agent's image, owner custody step for the proxy server certificate | `docker compose -p portal-execution-edge-paper-okx down`, remove the bridge and the nginx files | the three existing Edges keep image `167e031a` and their start times; no change in Paper/Sandbox/Live answers |
| 5 | Control API slot (origin/profile/audience triple) and Core's slot ON (Core change, flag off by default) | Core's commit/config hash | step 4 | slot OFF | PROFILE_CONTEXT_MISMATCH separation between `PAPER_BINANCE_USDM` and `PAPER_OKX_SWAP`; OKX screens show 1 account, 97 instruments, the equity curve, empty orders/fills |
| 6 | Guard pin ON for the new instance (identity pin of section 6) | pin file sha | step 5 | pin OFF | the guard refuses a wrong database name, oid hash or fewer than 175 ledger rows |

Core must watch throughout: HTTP 200 and `completeness` of catalogue/capabilities/records/projection for the new profile only; any answer of the new Edge for the Paper BINANCE profile (must be refused); counts per relation against the Edge note of today (a snapshot, rows keep arriving); and that `venues` returns exactly the `OKX` row.

## 8. Verification list (read-only unless stated)

- Package: the five files match section 1 hashes; `catalogue_sha256` equals the release pin; 67 names equal the live Paper release.
- After 2b: both containers `running`, restart count 0, user 1001:1001, read-only rootfs, ports only on 127.0.0.1:8323/8324, project name as rendered; no Manager log line with a `*_REJECTED` code; the Paper/Sandbox/Live Managers' start times unchanged (`docker inspect`).
- After 3: served leaf equals the file; TLS 1.3; catalogue envelope decodes with the current `manager-v2-contract`.
- After 4-6: as in the table; plus the existing guard/identity tests for the new pin.

## 9. Not verified (stated plainly)

- Everything under `/srv/primus` (proxy confs and location files, shared secret directories, the Edge env and secrets, event-ledger files); whether the three `control-api.jwks.json` files hold the same keys; whether the Edge needs the event-ledger files to start.
- The Edge side as a whole: authority change, new image, new pin, proxy server certificate, Docker address pool for the new bridge, Control API/Core slot.
- A real start of the two containers, a real TLS handshake or HTTP call against them, real timings; the TLS probe of step 3 is not written.
- That a second Manager login session count or the shared connection limit 12 is enough under load (2 + 2 sessions today; load not measured).
- Whether the 12 denied columns and the 67 relation scope are what Core wants for OKX (same scope as the live Paper by design; Core decides).
- One host command of this task was run without the docker lock (the import check of the issuer module in the old issuer image, a capped `--network none` container); all others used `flock docker.lock`.

## 10. Files for Core to mirror to the owner

Edge repo branch `feat/okx-paper-profile-catalogue-20261118` (worktree `edge-okx-paper-ts-20261118`): `docs/OKX_PAPER_PROFILE_PLAN_20261118.md`; `scripts/epg10-08/okx-paper/artifacts/paper-okx-swap/{relation-catalogue,serving-policy,profile-selection,manager-catalogue-release,catalogue-candidate}.json`; `.../catalogue/{README.md,RESULTS.json,gen_okx.py,t1_t2_gen.py,run-tool.sh}`; `.../inventory/trading_system.columns-pk-uq.2026-11-18.txt`; `.../okx_render.py`; `.../okx_paper_login.DRAFT.sql`; `.../compose/{manager-paper-okx.rendered.DRAFT.json,RENDER.sha256}`; `.../tests/test_okx_render.py`; `.../wire-corpus/` (gen_wire.py + 203 shapes); `services/portal-execution-edge-rs/crates/manager-v2-contract/tests/paper_okx_swap_wire.rs`.
Edge repo branch `feat/catalogue-paper-okx-swap-20261118` (worktree `edge-rust-okx-paper-catalogue-20261118`): `crates/manager-projection/src/target_catalogue_refresh.rs` and `target_catalogue_scopes.rs` (commit `2d36d085`).

## 11. Decisions for the owner (each has a recommended default)

- D1 JWT signing key: reuse the Paper key (default; profile claims already separate the two) or a NEW Ed25519 key with its own key id (independent revocation; needs a key generation step and both env files edited).
- D2 database login: reuse `ts_portal_manager_read_facade` (default, zero DB change) or a login of its own (`okx_paper_login.DRAFT.sql`, one pg_hba line).
- D3 mTLS anchor in the new dir: a copy made after CA phase 2 (default) or mounting the shared runtime file (then every future CA operation also restarts these two containers).
- D4 issuer image: 8d4765a4 for both (default; the issuer module is identical to the Paper issuer's) or the Paper issuer's 28ea3958.
- D5 Edge to proxy leg: a new bridge and server certificate (default pattern) or a free port on an existing bridge gateway.
- D6 scope: the Paper 67 (default, as Core asked) or a wider set later.
