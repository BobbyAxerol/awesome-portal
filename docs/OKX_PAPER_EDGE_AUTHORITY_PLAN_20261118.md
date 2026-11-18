# OKX Paper profile on the Edge: authority generalisation, build recipe for the NEW instance's image, instance env, limits (2026-11-18)

Status: code `implemented` and `tested locally` (offline, capped `--network none` container); NOT built into an image, NOT deployed, NOT activated.
Nothing here touches the three running Edges (image `167e031a`), any Manager, DB, proxy or Core. Every real step needs its own owner approval with hashes.
Branch `feat/edge-okx-paper-authority-20261118` (worktree `/home/bobby/.worktrees/edge-okx-paper-20261118`), based on `feat/edge-from-running-source-20261116` HEAD `c308eb10`.
Background: `EDGE_ANSWER_OKX_PAPER_PROFILE_20261118.md` (handoffs) and Core's decision file `CORE_OWNER_DECISION_OKX_PAPER_PROFILE_STAGED_PHASE1_OFFLINE_20261118.md`.

## 1. What changed (commit `4dea9b51`)

Ids: profile `PAPER_OKX_SWAP`, audience `portal-execution-edge-paper-okx`, venue `OKX`, environment `paper` (market SWAP checked by the TS side from the DB).

`manager-compat-authority` (`crates/manager-compat-authority/src/lib.rs`):
- One table `ACCEPTED_PROFILES` (environment, profile id, audience, matrix `transport_qualified`): paper/PAPER_BINANCE_USDM, paper/PAPER_OKX_SWAP, sandbox/SANDBOX_BINANCE_USDM, live/LIVE_BINANCE_USDM.
- `validate_bindings` and `validate_runtime_activation` require the documents to list exactly these four pairs (no duplicates, exact audience, resource, qualification flags) instead of exactly one profile per environment.
- `bind()` looks the binding and the activation profile up by (environment, profile): unknown environment keeps `EnvironmentDenied`, a known environment with another profile keeps `ProfileDenied`, then resource, activation flags and revision as before. Order of refusals is unchanged.
- `from_pinned_release` / `with_source_identity_pin` / `pinned_context` were already (environment, profile) bound and are unchanged: a Paper release or pin written for one Paper profile is refused by an Edge configured for the other (`InvalidCatalogueRestriction` / `InvalidSourceIdentityPin` / `ProfileDenied`), and neither Paper profile loads for Sandbox or Live.
- Not touched on purpose: `edge-service` (its start-up check is the prefix rule `PAPER_[A-Z0-9_]+` and already accepts the new id), `manager-v2-contract`, `manager-v2-client`, the N26 realtime activation (`source-qualification/src/realtime_manager_activation.rs`, exactly three tuples), `manager-projection` / `projection-store-pg` profile tables, N28, N29, EDS-12 documents. See 5 for what that means for the new instance.

Documents and digests (`services/portal-execution-edge-rs/contracts/`):

| item | old | new |
|---|---|---|
| `manager-compat-authority-v1/adapter-matrix.v1.json` (`profile_bindings`: + paper/PAPER_OKX_SWAP, `transport_qualified: false`, `product_enabled: false`) = const `N19_MATRIX_DIGEST` (`lib.rs:45`) | `9ff30c0df4a1a2f1f123c0b4c9592116d9449def645f3ccc8a8dbad7724bbb8d` | `aba5095d0077b76b30af5dd5e219ccb2d735b13cf83e906a7288e005d2f36f55` |
| `manager-profile-activation-v1/runtime-activation.v1.json` (`profiles`: + OKX entry, `adapter_matrix_sha256` follows the matrix, revision `...2026-09-01.1` -> `...2026-11-18.1`) = const `RUNTIME_ACTIVATION_DIGEST` (`lib.rs:47`) | `d33e5c19627f2abaa1cc59b68e2d074d1ecc050632fa8ec6a516d506949f4c68` | `d263b2e464e8f4539164cf2a2a982c4ba37775861443870ed989c98ba948c1b0` |
| `manager-compat-authority-v1/README.md` / `manager-profile-activation-v1/README.md` (text only) | `5f611b4c...` / `9da8b72c...` | `f78c8b86...` / `9c7d9a9c...` |
| both `MANIFEST.sha256` | regenerated for the three changed files each | `sha256sum -c` OK |
| unchanged: census v2 `N18_CENSUS_DIGEST` (`lib.rs:43`) `cab031d8...`, `qualification-evidence.v1.json` `8bbd2750...`, `negative-matrix.v1.json` `ee3cd0c0...`, the three release-profile manifests under `deploy/manifests/`, N28 registry, N29 acceptance/debt/evidence, EDS-12 static inputs | | |

Why the qualification evidence is NOT changed: it is the sanitized observation of 2026-09-01 (three environments, real responses). Nothing was observed for OKX and none is invented: the matrix says `transport_qualified: false` for the OKX binding, the activation switch is `true` for it exactly as it is for Sandbox and Live (the activation is the runtime gate; the matrix is the historical qualification record). A real OKX read observation belongs in a SEPARATE evidence file that is not compiled in (compiling it in would change the activation digest and force another image).
Why N28/N29/EDS-12 did not change: their documents use the coarse names PAPER/SANDBOX/LIVE or contain no profile id; `scripts/refresh-release-integrity-ledgers.sh --check` reports both ledgers (N29 39 inputs, EDS-12 42 inputs) current after the change, i.e. none of their input files is one of the edited files, so `--write` would be a no-op and was not run. The matrix/activation digests are checked by the compiled constants, `execution-n19-manager-compat-test.sh` (updated to the four pairs and the OKX `transport_qualified` flag) and `sha256sum -c`.

## 2. Tests and gates run (all offline; counts from the container logs)
Container: `rust:1.83-slim` carrier image with toolchain `1.85.1-x86_64-unknown-linux-gnu` from the scratchpad cargo cache (`--network none --cpus 2 --memory 6g`, behind `docker.lock`, lock file absent). The pinned `rust:1.85.1-slim-bookworm@sha256:9f841bbe...` image is no longer on this host (see 3).
- `manager-compat-authority`: 23 unit + `okx_paper_profile` 6 (new) + `guard_pin_paper` 2 + `guard_pin_sandbox` 2 + `sandbox_switch` 2 + `sandbox_union` 2 + `wire_shape_corpus` 1 + `wire_shape_identity` 1 = 39 passed, 0 failed. The existing test files are byte-unchanged; only `src/tests.rs` changed one string (the activation revision).
- New `tests/okx_paper_profile.rs` (6): (a) bind matrix over 3 environments x (4 accepted ids + 12 near misses such as SANDBOX_OKX_SWAP, LIVE_OKX_SWAP, PAPER_OKX, PAPER_OKX_USDM, lower case, trailing space, PAPER_DNSE_VNM): exactly 4 binds, every other combination is `ProfileDenied`; (b) resource and revision refusals for every accepted pair; (c) releases: a release loads only for the identical accepted (environment, profile), cross Paper loads are `InvalidCatalogueRestriction`, the OKX-bound authority refuses the Binance profile at bind, committed Paper and Sandbox release files keep loading for their own profile and are refused for OKX, a widened OKX release is refused; (d) pins: OKX pin only on the OKX authority, Binance pin only on the Binance authority, cross loads `InvalidSourceIdentityPin`/`ProfileDenied`, the committed Paper and Sandbox pin files are refused for OKX, wrong environment/unknown member refused; (e) identity guard on the OKX profile (match, ledger grows, wrong name, below minimum, not readable, legacy database, name before rows) and cross-profile catalogue answers are refused at decode in both directions; (f) the matrix/activation documents list the four pairs, the OKX binding is not transport qualified, the evidence file has three environments and no OKX, and the digests inside the documents equal the file digests.
- Running Edges stay byte-for-byte: `wire_shape_corpus` output (`EDGE_WIRE_OUT`, 736 lines) from the baseline source `c308eb10` and from this branch are `cmp`-identical (the candidate run also passed with `EDGE_WIRE_BASELINE`); the Sandbox/Paper guard, switch and union tests pass unchanged.
- Other crates, one run: `edge-service` lib 40 + bin 121 passed, 1 failed; `eds12-qualification` 3; `manager-v2-contract` 21; `manager-v2-client` lib 21, `epg10_08_tls` 2 passed, 10 failed; `maximum-data-acceptance` 4; `maximum-data-adapter` 20; `maximum-data-contract` 9; `maximum-data-return` 4; `product-acceptance` 4. Total 288 passed, 11 failed (doc-tests: 0 tests).
- The 11 failures are PRE-EXISTING and identical on the baseline `c308eb10` (same container, separate target dir): `tests::shadow_manager_feed_observations_do_not_invent_freshness` (documented in `docs/EDGE_IMAGE_BUILD_AND_ROLL_PLAN_20261116.md`, "pre-existing failure of the running image's own source") and the 10 `epg10_08_tls` tests (`Err(NotPresent)` at `tests/epg10_08_tls.rs:83`, an environment input absent in this container). They are not caused by this change and were not fixed.
- `cargo fmt --check` clean (manager-compat-authority); `cargo clippy --all-targets -D warnings` clean for `manager-compat-authority` and `edge-service`.
- Python/shell gates (host, `python3 -B`): `execution-n18-census-test.sh`, `execution-n18-census-v2-test.sh`, `execution-n19-manager-compat-test.sh`, `execution-n26-n27-test.sh`, `execution-n28-missing-capability-test.sh`, `execution-n29-product-acceptance-test.sh`, `execution-eds12-qualification-test.sh` all pass; `python3 -B -m unittest` of the four `scripts/test_*.py` (5 tests) OK; `refresh-release-integrity-ledgers.sh --check` current. `execution-n21-shared-admission-test.sh` fails on the baseline too (`assert ".execute(request)" in edge_service`), unrelated and not touched.

## 3. Build recipe for the NEW image (text only, NOT run; the image build waits for an owner hash)
Rule: one image for the new instance only; the three running Edges keep `167e031a`.

Overlay base, decision: `localhost/portal-execution-edge@sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054`.
Why: (1) three running containers reference it, so no cleanup can remove it under the build, while `2b929dff...` is referenced by no container (only as a parent layer); (2) its runtime config equals `2b929dff` (entrypoint, cmd, user 65532, env, exposed port, healthcheck, workdir: sha256 of the JSON equal, checked with `docker image inspect`), so base choice changes nothing but history; (3) the new image is then exactly "the running image + one binary layer", easy to diff with `docker history`. Cost: one more 22 MB binary layer (167e031a already carries two). If size matters use `2b929dff6d31036b6dd94fa8b5d6f941e4e7f662d94c4882921a334009db13d6`: same result, 22 MB smaller, but pinned only by an unreferenced image.

Step 1, release binary (no network, source read-only at `/repo` so embedded paths equal the repo Dockerfile's `WORKDIR /repo`):
```
RC=/tmp/claude-1001/-home-bobby/798e80a2-9f96-4c92-b157-75b07ed3460c/scratchpad/rust-cache
WT=/home/bobby/.worktrees/edge-okx-paper-20261118          # clean tree; record: git -C $WT rev-parse HEAD
test ! -e /home/bobby/.local/state/host-measurement-window.lock && mkdir -p $RC/out-okx-paper
flock /home/bobby/.local/state/docker.lock docker run --rm --pull=never --network none --cpus 2 --memory 6g --name edge-okx-paper-build \
  -v $WT:/repo:ro -v $RC:/cache -e CARGO_HOME=/cache/cargo -e RUSTUP_HOME=/cache/rustup -e RUSTUP_TOOLCHAIN=1.85.1-x86_64-unknown-linux-gnu \
  -e CARGO_TARGET_DIR=/cache/target-rel-okx -e CARGO_NET_OFFLINE=true -w /repo/services/portal-execution-edge-rs \
  --entrypoint sh rust:1.83-slim -c 'cargo build --locked --release --offline --package edge-service && cp /cache/target-rel-okx/release/edge-service /cache/out-okx-paper/portal-execution-edge'
sha256sum $RC/out-okx-paper/portal-execution-edge; chmod 755 $RC/out-okx-paper/portal-execution-edge
```
- Toolchain source: the pinned image `rust:1.85.1-slim-bookworm@sha256:9f841bbe9e7d8e37ceb96ed907265a3a0df7f44e3737d0b100e7907a679acb36` named in `deploy/images/execution-edge.Dockerfile` is NOT on this host any more (`docker images`: only `rust:1.83-slim` and `rust:1.82-slim`). The command above uses `rust:1.83-slim` as a carrier with toolchain 1.85.1 from `$RC/rustup`, which is what every test run of this branch used. If the owner prefers the pinned image, it must be pulled once (network, a host image change that needs its own approval) and the `docker run` then uses it directly with `-e CARGO_HOME=/cache/cargo` and no `RUSTUP_*`. Either way record the toolchain id (`rustc -vV` of the container) with the binary sha256; the binary will not be bit-identical across the two toolchain sources.
- `--release` offline was not tried (debug builds and tests ran offline from the same registry cache). If a crate is missing, rerun that one container once with `--network host` and the proxy variables; nothing else changes. Time and RAM of a release build are unmeasured.

Step 2, one-layer overlay (host image creation: needs the owner's hash approval of the binary sha256 first; no network, no pull):
```
HEAD=$(git -C $WT rev-parse HEAD)
CTX=$RC/overlay-okx-paper; mkdir -p $CTX; cp $RC/out-okx-paper/portal-execution-edge $CTX/
cat > $CTX/Dockerfile <<DOCKERFILE
FROM localhost/portal-execution-edge@sha256:167e031aa4999a7df43efdbce34e91204ce7b85cc862ec5174e989872c449054
COPY --chown=0:0 portal-execution-edge /usr/local/bin/portal-execution-edge
LABEL org.opencontainers.image.revision=$HEAD com.primus.owner=edge-okx-paper-authority-20261118
DOCKERFILE
DOCKER_BUILDKIT=0 docker build --pull=false --network none -t localhost/portal-execution-edge:okx-paper-20261118 $CTX
docker image inspect localhost/portal-execution-edge:okx-paper-20261118 --format '{{.Id}}'     # record: NEW id + binary sha256 + HEAD
```
Expected binary markers (`grep -c -a -- <marker> binary`; the old binary of `167e031a` was extracted and grepped today: sha256 `ef540b6a02da781feb5f9411f83fbb899c603d4fcff587eb147d3aab8ad7cf5c`, 22,062,576 bytes; the extracted copies were deleted afterwards):

| marker | old (167e031a, checked) | new (expected, to be checked after the build) |
|---|---|---|
| `PAPER_OKX_SWAP` | 0 | >= 1 |
| `portal-execution-edge-paper-okx` | 0 | >= 1 |
| `sha256:aba5095d0077b76b30af5dd5e219ccb2d735b13cf83e906a7288e005d2f36f55` (matrix const) | 0 | >= 1 |
| `sha256:d263b2e464e8f4539164cf2a2a982c4ba37775861443870ed989c98ba948c1b0` (activation const) | 0 | >= 1 |
| `manager-profile-runtime-activation.2026-11-18.1` | 0 | >= 1 |
| `9ff30c0df4a1a2f1`, `d33e5c19627f2abaa`, `runtime-activation.2026-09-01.1` (old consts/revision) | 2, 1, 1 | 0 |
| `cab031d8495c61b8` (census v2), `MANAGER_V2_SOURCE_DB_IDENTITY_MISMATCH`, `EDGE_MANAGER_SOURCE_DB_PIN_FILE`, `EDGE_MANAGER_CATALOGUE_RELEASE_FILE` | 2, 1, 1, 1 | >= 1 each (unchanged features) |

Proof that the diff against the running source is only the generalisation:
1. Source: the label of `167e031a` is revision `3055572e`. `git diff --stat 3055572e HEAD -- services/portal-execution-edge-rs deploy Cargo.lock Cargo.toml` lists 16 files: the six contract/README/MANIFEST files, `crates/manager-compat-authority/src/lib.rs` (hunks only in the two constants, `bind`, `validate_runtime_activation`, `validate_bindings`, the new `ACCEPTED_PROFILES`), and test-only files (`edge-service/src/main.rs` +133 lines entirely inside `mod tests` from line 7397; `manager-compat-authority/src/tests.rs`; six `tests/*.rs`). No `Cargo.lock`, `Cargo.toml`, Dockerfile, `deploy/manifests`, other crate or non-test file differs. Re-run that command before the build and attach the output.
2. Binary: build `c308eb10` (baseline) and this HEAD with the SAME container and recipe (separate target dirs), then compare `strings -a` of both: the set difference must be exactly the marker table above (plus the changed code symbols of the four functions). The same A/B makes the toolchain difference of 3 irrelevant.
3. Behaviour: section 2 (wire corpus identical, existing guard/sandbox tests unchanged, cross-profile matrix).

## 4. The new instance: what it needs (names; values are decisions for the TS/ops steps, none are set here)
One Edge process = one environment + one profile + one audience. New instance, side by side with the three running ones:
- `EDGE_ENVIRONMENT=paper`, `EDGE_MANAGER_V2_PROFILE_ID=PAPER_OKX_SWAP`, `EDGE_MANAGER_V2_READ_ENABLED=true`, `EDGE_DELEGATION_AUDIENCE=portal-execution-edge-paper-okx` (Control API must mint tokens with this audience and `profile_id` claim `PAPER_OKX_SWAP`), `EDGE_DELEGATION_ISSUER=portal-control-api`, `EDGE_DELEGATION_MAXIMUM_TTL_SECONDS=60`, `EDGE_DELEGATION_JWKS_FILE` (the issuer's public key set as the other Edges mount it; whether the three existing files are identical was not checked).
- `EDGE_BIND_ADDRESS=0.0.0.0:8443` inside the container, host port `8446` (next in the 8443/8444/8445 sequence; whether it is free was not checked), `EDGE_HEALTH_BIND_ADDRESS=127.0.0.1:9100`; TLS: `EDGE_TLS_CERTIFICATE_FILE`, `EDGE_TLS_PRIVATE_KEY_FILE`, `EDGE_TLS_CLIENT_CA_FILE` (server certificate and the client CA that Control API's client certificate chains to).
- Source side: `EDGE_SOURCE_ORIGIN` (its own source proxy / route to the OKX Manager), `EDGE_SOURCE_CA_FILE`, `EDGE_SOURCE_CLIENT_IDENTITY_FILE`, `EDGE_SOURCE_API_KEY_FILE`, `EDGE_SOURCE_GATEWAY_DIGEST`, `EDGE_SOURCE_PROBES_ENABLED=false`.
- Release and guard (both required before the instance serves data, files produced by the TS/Edge offline steps): `EDGE_MANAGER_CATALOGUE_RELEASE_FILE` + `EDGE_MANAGER_CATALOGUE_RELEASE_SHA256` (release manifest with `environment: paper`, `profile_id: PAPER_OKX_SWAP`), `EDGE_MANAGER_SOURCE_DB_PIN_FILE` + `EDGE_MANAGER_SOURCE_DB_PIN_SHA256` (pin with `environment: paper`, `profile_id: PAPER_OKX_SWAP`, `database_name: trading_system`, the observed OID hash, a ledger minimum), `EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS` (start at `0`, as every earlier switch did).
- Query/cursor: `EDGE_QUERY_CURSOR_KEYS_FILE`, `EDGE_QUERY_CURSOR_ACTIVE_KEY_ID`, `EDGE_QUERY_CURSOR_TTL_SECONDS` as the Paper Edge sets them (its own keys, not shared); limits/timeouts (`EDGE_MAXIMUM_CONCURRENCY`, `EDGE_REQUEST_TIMEOUT_MS`, `EDGE_QUEUE_TIMEOUT_MS`, `EDGE_MANAGER_SHARED_*`, retries) copied from the Paper Edge.
- Features that must stay OFF on this instance with the image of this branch (the generalisation covers the read authority only): `EDGE_REALTIME_SSE_ENABLED=false` (the N26 realtime manifest accepts exactly the three Binance tuples, `realtime_manager_activation.rs:155-161`, so SSE would fail at start), `EDGE_MANAGER_PROJECTION_ENABLED=false` and `EDGE_PROJECTION_INGESTION_ENABLED=false` (the projection profile tables are the three Binance tuples), `EDGE_MANAGER_EVENT_LEDGER_ENABLED=false`, `EDGE_SHADOW_QUERY_ENABLED=false`, `EDGE_PAPER_WORKBENCH_SHADOW_ENABLED=false`, `EDGE_COMMAND_RELAY_ENABLED=false`. The Paper Edge runs SSE and analytics query today; the OKX instance would not offer them until those tables are generalised in a later, separate step (not planned here).
- Container shape: same user/read-only/cap_drop/healthcheck/limits as the Paper Edge compose render, own compose project (`portal-execution-edge-okx`, proposal), own network, own secrets directory; the image `localhost/portal-execution-edge@sha256:<NEW>` by digest, `pull_policy: never`.
- Outside the Edge repo, UNVERIFIED and not Edge work: the OKX Manager + issuer, the source proxy and route under `/srv/primus/portal` (not readable here), the Control API slot (origin/profile/audience triple), Core's profile slot.

## 5. What must NOT change on the three running Edges
- No recreate, restart, image change, env change, file replacement or compose edit of `portal-execution-edge-execution-edge-1` (Paper, 8443), `...-sandbox-execution-edge-1` (8444), `...-live-execution-edge-1` (8445). They keep image `167e031a` and the matrix/activation digests `9ff30c0d...` / `d33e5c19...` compiled into their binaries; the new constants exist only in the new binary.
- No change of their release files, pin files (Paper and Sandbox guards stay on), JWKS files, secrets directories, source proxies or Managers. The new instance gets its own copies of everything.
- Do not edit a shared directory in place for the new instance. Do not reuse the Paper Edge's cursor keys, release or pin files.
- Rolling the new image onto an existing Edge is not part of this plan; if ever wanted it is its own step (the new binary serves the old profiles identically per section 2, but that is a proof from tests, not from a deployment).
- Rollback of the new instance: stop and remove only the new compose project; delete the new image tag; no effect on the others.

## 6. Order and interaction
- CA phase 2 is done (Core's note), so the new Manager/issuer/proxy are built on the v2-only anchor; the Edge image and the Edge-to-proxy leg do not use the Manager CA.
- Sequence proposal, each step separately approved: (1) hash approval of the build inputs (this branch HEAD, the toolchain source, the binary sha256) -> build + overlay + marker check (offline); (2) TS: OKX catalogue/policy/release, pin, Manager + issuer config (offline); (3) real: Manager + issuer, proxy route; (4) real: Edge instance with guard on and cache TTL 0; (5) Core slot on, Core's watch; (6) memo on if wanted.

## 7. Unverified, stated plainly
- The release build and the overlay were not run: marker counts for the new binary, binary size and the new image id are unknown; the pinned 1.85.1 image is absent so the binary hash depends on the toolchain source chosen.
- A real start of the new binary with `PAPER_OKX_SWAP` (`EdgeConfig::from_environment`, release + pin loading, health) was not executed; only the authority crate's loaders are tested, plus the existing `edge-service` start-up loader tests (which are profile-agnostic for pins and take the release through `from_pinned_release`).
- No OKX release file, OKX pin file or OKX catalogue exists yet in this repo (TS/Edge offline steps); the tests build in-memory stand-ins and use the committed Paper/Sandbox files as negatives.
- `edge-service` has no test that starts the OKX profile end to end; `manager_profile_matches_environment` accepts the id by the prefix rule (read, not executed with this id).
- N26 realtime, projection, analytics-with-projection and event-ledger paths for the OKX profile are intentionally not generalised (see 4); whether Core needs any of them for the OKX screens was not asked.
- Whether the three `control-api.jwks.json` files are identical, whether port 8446 is free, and the proxy/Manager side are not checked.
- Pre-existing failures (section 2) remain: 1 edge-service test, 10 `epg10_08_tls` tests (environment input absent), the n21 gate.
