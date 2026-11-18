# Edge image: how the running one was built, and how to build and roll the integrated candidate

Status: plan only. Nothing was built, tagged, run or swapped by this document. This version replaces the first integrated candidate
(`feat/edge-integrated-candidate-20261116`, which lost the S1 snapshot support and was rolled back at 15:09Z) with a candidate built on the
exact source of the running image. Facts marked (checked) were read from the host or the
repo on 2026-11-16 (read-only `docker inspect`, `docker history`, `docker save` into a scratch directory that was deleted, `git`);
everything else is stated as unchecked.

Scope: the Paper Edge only (`portal-execution-edge-execution-edge-1`, compose project `portal-execution-edge`, service `execution-edge`).
The Sandbox and Live Edges run another image (`ghcr.io/bobbyaxerol/portal-execution-edge`, id `d6aa7a510ddf`, created 2026-09-09, checked)
and are not covered.

## 1. How the running image was built

### Checked
| item | value |
|---|---|
| container | `portal-execution-edge-execution-edge-1`, healthy, RestartCount 0, recreated 2026-11-16T11:35:35Z (the T2-five release recreate) |
| image id | `sha256:2b929dff6d31036b6dd94fa8b5d6f941e4e7f662d94c4882921a334009db13d6` = `localhost/portal-execution-edge:m0-r2-20261112` |
| image created | 2026-11-12T06:32:38Z, built with BuildKit (history lines end in `# buildkit`) |
| labels | `org.opencontainers.image.revision=636d58a7c4368a617903734ab1d0ce933d2804ca`, `com.primus.owner=epg10-m0-release-20261112`, title and description equal to the repo Dockerfile |
| layers | distroless `cc-debian12` base layers (bazel, 1970 timestamps), ONE `COPY /portal-execution-edge /usr/local/bin/portal-execution-edge` layer of 22 MB, then `USER 65532:65532`, `EXPOSE 8443`, `ENTRYPOINT`, `CMD ["serve"]` |
| rendered compose | `.../releases/m0-r2-20261112/preinstall-20261112T0810Z/edge-candidate.r3.rendered.json` (sha256 starts `8600b9f4670c92e5`): service `execution-edge`, `image: localhost/portal-execution-edge@sha256:2b929dff...`, `pull_policy: never`, healthcheck, port 8443 |

This matches the final stage of `deploy/images/execution-edge.Dockerfile` (stage 1 `rust:1.85.1-slim-bookworm@sha256:9f841bbe...`
runs `cargo build --locked --release --package edge-service` and copies the binary; stage 2
`gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79...`). The same Dockerfile history: `7cb06532` (introduced), `0c719449`, `f014b772`
("make edge image build reproducible"). The `rust:1.85.1-slim-bookworm` image with the pinned digest is present on this host.

Inside the image (checked by extracting the binary from `docker save` into scratchpad, strings only, then deleting it):
the binary is 21,956,256 bytes, sha256 `31ad212bb5fc90268c48e318506fd224076de4e71a9a865d2349b0a5ed89f790`. It contains
`EDGE_MANAGER_CATALOGUE_RELEASE_FILE`, `EDGE_MANAGER_CATALOGUE_RELEASE_SHA256` and `portal.execution.manager-catalogue-release.v1`
(unit B: release-pinned catalogue), the v1 census digest `cb577bdd...` and NO `source_identity`, NO `SourceDbIdentityMismatch`, NO
`manager-surface-census.v2`, NO `cab031d8`. So the running Edge is "unit B, without the guard and the catalogue memo, on census v1".

### Source of the running image (checked 2026-11-16)
- `/home/bobby/.local/state/portal-execution-edge/releases/m0-r2-20261112/edge-code-context.tar.gz` (930 files) is the Docker build context of
  the running image. Against the preserved dirty tree `a299441e` it is byte-identical for `Cargo.lock`/`Cargo.toml`, `deploy/manifests`,
  `packages/contracts`, the contract pack, `deploy/images/execution-edge.Dockerfile` and every Rust crate except
  `manager-projection/src/target_catalogue.rs` (+7 lines in a299441e), `manager-projection/src/bin/target_catalogue_candidate.rs` (+25),
  `target_catalogue_refresh.rs` and `target_catalogue_scopes.rs` (exist only in a299441e), `projection-store-pg/tests/epg10_05_scoped_read.rs`
  (only in a299441e) and `upgrade/backend/README.md`. So a299441e carries later work and is not the exact source; the tarball is.
- The label revision `636d58a7` is an Oct 28 docs commit and says nothing about the code. The context carries unit B, the S1 snapshot
  support (`manager-v2-contract/src/s1.rs`), the typed 429 `RateLimited` handling and about 1,700 more lines in `edge-service/src/main.rs`
  than unit B, none of which exist in Git history.

### Not checked, so do not rely on it
- The exact build command, host and time. No build log was found.
- Whether the build used the repo Dockerfile unchanged (the layers match it) or a variant.
- The file mode of the binary inside the image (set 755 in the overlay below; verify with the post-swap health check).

## 2. What the candidate contains and the proof of its delta

Branch `feat/edge-from-running-source-20261116` (worktree `/home/bobby/.worktrees/edge-from-running-source-20261116`), built as:
1. `67a06aa0` base: the tarball content overlaid on `a4e48963` (plus the three deploy files unit B changed, taken from `d8caca38`; they
   wire the release variables and are not part of the image context). The base also removes `projection-store-pg/tests/epg10_05_scoped_read.rs`,
   which the context does not have; history keeps it.
2. Guard and 30 s memo, cherry-picked from `feat/edge-guard-cache-on-b-20261116`: `2ac489d0`, `5d626d5e`, `ee2fc3f1`, `5939a8a5`, `3818be48`.
   No conflicts (the base is identical to unit B in the files they touch).
3. Census v2 candidate and pin: `1dbf1bfb`, `b2ebda37`. No conflicts.
4. Regression tests, ledger refresh and this document (commits listed in the report that accompanies this file).
Unit B itself is not re-applied; the base already has it.

Proof that the delta is only ours: `diff -rq` of the extracted tarball against the tree, over `services/portal-execution-edge-rs`,
`deploy/manifests`, `packages/contracts`, `upgrade/backend` and the contract pack, lists exactly 20 entries and no other:
- Code: `edge-service/src/main.rs` (+225 -8), `manager-compat-authority/src/lib.rs` (+218 -16), `manager-v2-contract/src/lib.rs` (+115 -1),
  `product-acceptance/src/lib.rs` (+2 -2).
- Tests: `manager-compat-authority/src/tests.rs`, `manager-v2-contract/src/tests.rs`, `manager-v2-client/src/tests.rs`,
  `maximum-data-adapter/src/tests.rs`.
- Ledgers and digests: the `MANIFEST.sha256` files and the matrix/activation/N28/N29/EDS-12 files, 1 to 4 lines each.
- New directories: `contracts/manager-surface-census-v2` and `contracts/maximum-data-return-v2`.
Unchanged against the tarball: `manager-v2-contract/src/s1.rs`, `manager-v2-client/src/lib.rs`, every projection crate, `Cargo.lock`, the Dockerfile.
Re-run the check before any build: `tar -xzf edge-code-context.tar.gz -C <empty scratch dir>` then `diff -rq <scratch>/<path> <worktree>/<path>`.

Runtime behaviour compared with the running image:
- Release-pinned subset unchanged: the Paper release file lists 54 relations (all inside v1 and v2, none of the 13 T1 relations,
  checked), so the set of readable relations does not change.
- New and default-on: the process-local catalogue memo (`EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS`, default 30000, `0` disables).
  The rendered compose does not set it (checked).
- New and opt-in: the source-identity guard runs only when `EDGE_MANAGER_SOURCE_DB_PIN_FILE` and `EDGE_MANAGER_SOURCE_DB_PIN_SHA256`
  are set; neither is set in the rendered compose (checked), so nothing is enforced until a pin is deployed.
- Without a release file `canonical()` now requires the full 109-relation catalogue (was 96); Paper has a release file, so it is
  unaffected. Any other deployment without one is not.
- S1 and 429: both come from the base, unchanged; regression tests for them are in this branch (contract level and through the HTTP client).

Known test facts (checked 2026-11-16, container, `RUSTUP_TOOLCHAIN=1.85.1`, `--cpus 2 --memory 6g`):
- `cargo fmt --check`: one diff, in the base (`manager-v2-client/src/tests.rs:646`, a 2-line wrap), left untouched on purpose. Nothing else.
- `cargo test --locked --all-targets` over 12 crates (manager-v2-contract, manager-v2-client, manager-compat-authority, edge-service,
  maximum-data-adapter/-acceptance/-contract/-return, product-acceptance, manager-projection, manager-extension-contract,
  eds12-qualification): 362 passed, 1 failed. Per binary: edge-service lib 40, bin 118 (+1 failed), eds12-qualification 3,
  manager-compat-authority 21, manager-extension-contract 10, manager-projection 75, manager-v2-client lib 21, epg10_08_tls 12,
  manager-v2-contract 21, maximum-data-acceptance 4, maximum-data-adapter 20, maximum-data-contract 9, maximum-data-return 4,
  product-acceptance 4. clippy `-D warnings` over the same crates: rc 0.
- `epg10_08_tls` passes (12) only with `EPG10_TEST_ONLY=1` and a private `TMPDIR` named `/tmp/epg10-08-<suffix>`; without them 10 of 12 fail at
  `tests/epg10_08_tls.rs:83`.
- PRE-EXISTING failure of the running image's own source: `tests::shadow_manager_feed_observations_do_not_invent_freshness` fails on the base
  `67a06aa0` (`main.rs:6893`) and on this branch (`main.rs:7057`) with the same assertion, that `bounded.warnings` contains
  `SOURCE_FAILURE_STATUS_UNAVAILABLE` (the code is produced at `main.rs:4008`). Not caused by the guard, memo or census v2, and not fixed here.
- Not run: `scripts/execution-edge-test.sh` as is (it builds `execution-edge-ci.Dockerfile` and starts a second Postgres container, which the
  one-container/no-image-build rules forbid), so the Postgres-backed tests and its restore drill are unverified.

## 3. Build (text only, NOT run)

Two ways. The first matches the running image's recipe; the second is the one that fits the host rules (CPU/memory caps, no new
network paths). Pick one; record the binary sha256 and the image id either way.

### 3a. Repo Dockerfile (same recipe as the running image)
```
cd /home/bobby/.worktrees/edge-from-running-source-20261116        # clean tree; note: git rev-parse HEAD
DOCKER_BUILDKIT=1 docker build -f deploy/images/execution-edge.Dockerfile \
  --label org.opencontainers.image.revision=$(git rev-parse HEAD) --label com.primus.owner=edge-integrated-20261116 \
  -t localhost/portal-execution-edge:integrated-20261116 .
```
Needs: crates.io access (through the host proxy; `no_proxy` details in CLAUDE.md section 4 item 7) and a pull of the distroless base by
digest if BuildKit has not cached it (it is not tagged as an image on this host, checked). The Docker daemon applies no `--cpus` or
`--memory` to a build with the default driver, so this variant cannot be capped; do not use it while a measurement lock exists or while
the host load average is above 24.

### 3b. Capped build of the binary, then a one-layer overlay (recommended, offline-capable)
Step 1, build the release binary in the pinned Rust image, source mounted read-only at `/repo` so embedded paths equal the Dockerfile's
(`WORKDIR /repo`), cargo cache reused from the scratchpad (596 MB registry from the checks of this branch; the target dir is a separate
`target-rel`, so the debug `target-v2` is untouched). One container, behind the `docker.lock` flock, only if
`/home/bobby/.local/state/host-measurement-window.lock` is absent:
```
RC=/tmp/claude-1001/-home-bobby/798e80a2-9f96-4c92-b157-75b07ed3460c/scratchpad/rust-cache
WT=/home/bobby/.worktrees/edge-from-running-source-20261116
mkdir -p $RC/out-integrated
flock $RC/docker.lock docker run --rm --pull=never --cpus 2 --memory 6g --network none --name edge-integrated-build \
  -v $WT:/repo:ro -v $RC:/cache -e CARGO_HOME=/cache/cargo -e CARGO_TARGET_DIR=/cache/target-rel \
  -w /repo/services/portal-execution-edge-rs \
  rust:1.85.1-slim-bookworm@sha256:9f841bbe9e7d8e37ceb96ed907265a3a0df7f44e3737d0b100e7907a679acb36 \
  sh -c 'cargo build --locked --release --offline --package edge-service && cp /cache/target-rel/release/edge-service /cache/out-integrated/portal-execution-edge'
sha256sum $RC/out-integrated/portal-execution-edge ; chmod 755 $RC/out-integrated/portal-execution-edge
```
`--network none` should work because every dependency was fetched by the earlier `--locked` test/clippy runs; this was NOT tried for
`--release`. If it fails on a missing crate, rerun that one container with `--network host` and the proxy variables, nothing else
changed. Time and memory of a release build were not measured (a cold debug build of the six crates took several minutes at
`--cpus 2`; release with the `aws-lc-sys` and `ring` crates is longer).

Step 2, overlay on the running image (no network, no pull):
```
CTX=$RC/overlay-integrated; mkdir -p $CTX; cp $RC/out-integrated/portal-execution-edge $CTX/
cat > $CTX/Dockerfile <<'DOCKERFILE'
FROM localhost/portal-execution-edge@sha256:2b929dff6d31036b6dd94fa8b5d6f941e4e7f662d94c4882921a334009db13d6
COPY --chown=0:0 portal-execution-edge /usr/local/bin/portal-execution-edge
LABEL org.opencontainers.image.revision=<HEAD sha of the integrated branch> com.primus.owner=edge-integrated-20261116
DOCKERFILE
DOCKER_BUILDKIT=0 docker build --pull=false --network none -t localhost/portal-execution-edge:integrated-20261116 $CTX
docker image inspect localhost/portal-execution-edge:integrated-20261116 --format '{{.Id}}'   # NEW; record with the binary sha256
```
The old binary layer (22 MB) stays under the new one; the image is about 22 MB larger than a Dockerfile build and the label revision
is the integrated HEAD. `chown`/mode follow the Manager overlay precedent; the mode inside the running image was not checked.

## 3c. Pre-swap acceptance (mandatory, offline, before ANY swap)

The first integrated candidate passed every unit test and every gate and still failed in production for two relations, because no test
had ever seen a real Manager response for them. Unit tests are not acceptance. Before a candidate is swapped in, its decoder and client path
must be shown, offline, to accept real recorded wire shapes of every relation the Paper release serves (54 today), the catalogue and the
capabilities answer.

Proposed recording (for the owner to approve, not performed):
1. Tool: a one-shot read-only script run with `docker run --rm` (one container, capped) using the Edge's own mTLS client identity mounted
   read-only exactly as the Edge container mounts it, against the Paper Manager's Source Proxy origin. It sends only the five fixed GET
   shapes: capabilities, catalogue, and for each relation of the release file one `records` page with `limit=1` (no cursor chains).
2. Redaction at capture time, before anything touches disk: keep status, the two checked headers (`content-type`,
   `x-manager-contract`) and the full envelope; keep `source_snapshot`, `meta`, `completeness`, `next_cursor` shape and every key name; replace
   each cell under `fields` by a synthetic value of the same `kind` that parses (INTEGER 1, DECIMAL `"1.0"`, TIMESTAMP a fixed instant, STRING
   `"redacted"`), and `record_key` by a hash of the same length. No raw body is ever stored; no credentials, DSN or cell values leave the tool.
3. Output: one JSON corpus file plus its sha256 under a new private directory (mode 700) chosen by the owner, retained until the swap is
   decided; the corpus contains no business data by construction (item 2), but is still not committed to Git.
4. Approvals needed from the owner: the tool text, the identity mount, the output directory, the time window (outside a measurement lock;
   54+2 requests, rate-limit aware, one at a time).
5. Offline acceptance test (new, `#[ignore]`d unless `EDGE_WIRE_CORPUS` is set): for each recorded response run the real path
   `decode_success_for_profile` with the catalogue from the corpus, then `validate_catalogue` and `relation_page_request` of the compat
   authority built from the Paper release file. Run the same test against the tarball source (old binary's code) and the candidate:
   any response the old code accepts and the candidate rejects blocks the swap. This differential is what would have caught S1.
6. Add to the post-swap checks: one read of every relation of the release through the Edge, expecting 200 for each (not only a sample).

## 4. Swap, Paper Edge only (text only)

Reuse the shape of `t2_paper_release.sh edge` (session scratchpad `catalogue-max/runbook/`): same rendered compose `EF`, the existing T2
release override, plus ONE new override that changes the image line. Copy the script to a new name, set
`EIMG=sha256:2b929dff6d31036b6dd94fa8b5d6f941e4e7f662d94c4882921a334009db13d6` (old, for the pre-check and rollback) and
`NIMG=<NEW id>`, and pin the sha256 of both override files in `gate()`.
```
# $D/override-edge-image.yaml   (new, hash pinned in the script)
services:
  execution-edge:
    image: localhost/portal-execution-edge@sha256:<NEW>
    environment:
      EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS: "0"        # step 1 only: behave like the running image
```
Command (service `execution-edge` only; Core, Manager, issuer, Postgres, the Sandbox and Live stacks are not touched):
`docker compose -p portal-execution-edge -f $EF -f $D/override-t2-edge-release.yaml -f $D/override-edge-image.yaml up -d --no-deps --pull never --force-recreate execution-edge`,
then poll `docker inspect ... .State.Health.Status` up to 60 s like the script, and stop with a non-zero exit unless the container runs
on NEW and is `healthy`.

Two steps on purpose, one change at a time: step 1 swaps the binary with the memo off (behaviour equals the running image); step 2,
a second recreate with the `EDGE_MANAGER_CATALOGUE_CACHE_TTL_MS` line removed (memo on, 30 s), is a separate decision after step 1 is
clean. The guard stays off in both steps (no pin variables).

## 5. Rollback

Same helper, `rollback-edge` shape: `docker compose -p portal-execution-edge -f $EF -f $D/override-t2-edge-release.yaml up -d --no-deps --pull never --force-recreate execution-edge`
(that is the T2 state with the old image line from `$EF`), then check image id `sha256:2b929dff...` and health. The old image stays on
the host (never remove it). For the earlier state without the T2 release file use plain `-f $EF` as `rollback-edge` does in the
runbook. Nothing is migrated or written by the Edge, so rollback loses no data.

## 6. Checks after the swap
1. Container: image id equals NEW, `running`, `healthy` within 60 s, RestartCount 0; the other Paper services and the Sandbox/Live Edges
   keep their ids and start times.
2. Startup log: no `catalogue release` or `census` digest errors, no `InvalidCatalogueRestriction`.
3. The Edge probes already used for T2 (read routes through the Edge to the Paper Manager): catalogue answer 200 with
   `relation_count` 54, `catalogue_sha256` equal to the release file, capabilities 200, one records page for a relation in the release,
   a relation outside the release refused as before.
4. Memo (step 2 only): two catalogue reads within 30 s cause one upstream call (check the Manager access log); a read after 30 s
   causes another.
5. Guard (only after a pin exists): with the pin file present and the Manager serving the member, a catalogue read returns 200; with
   a wrong pin the typed identity-mismatch problem is returned and nothing is served from the memo.
6. Record in the window journal: NEW image id, binary sha256, `git rev-parse HEAD`, both override hashes, time, results of 1-5.

## 7. Order with the Manager source_identity image
1. Edge first: swap the integrated Edge (step 1, then step 2). Its decoder accepts the optional `source_identity` member and the guard
   is off, so a Manager without the member is unchanged and a Manager with it is accepted. The running Edge image has NO such decoder
   (checked, no `source_identity` string), so a Manager that adds the member must not be rolled before this swap.
2. Manager second: build and swap the Manager source_identity overlay (`docs/MANAGER_IMAGE_BUILD_AND_ROLL_PLAN.md` in the
   Manager worktree), then check the catalogue answer carries the five `source_identity` keys.
3. Pin last: deploy the pin file and its sha256 (`EDGE_MANAGER_SOURCE_DB_PIN_FILE`, `EDGE_MANAGER_SOURCE_DB_PIN_SHA256`, both or
   neither) as a third Edge recreate for the Paper profile, `database_name` `trading_system`, the observed `database_oid_sha256`, and
   `minimum_schema_ledger_rows` from the Manager's current value (173 at the design note). Rollback of any step goes to the previous step.
4. If the Manager must go first for any reason, the Edge decoder rejection risk (a strict decoder refusing the unknown member) is the
   swap risk; keep `rollback-manager` ready.

## 8. Risks and unchecked items
- The running image is not reproducible from Git (section 1); the new image is. Expect the binary hash to differ for that reason alone.
- The offline release build and the 755 file mode were not tried. The first signal is container start and health.
- Two other authority instances are built without the pin (the Manager projection worker and `maximum-data-adapter`); the guard does
  not cover them. The Paper projection worker is not running (`EDGE_MANAGER_PROJECTION_ENABLED=false`, checked).
- The identity wire shape was checked against the Manager source, not against a running Manager.
- Verified locally on this branch: see "Known test facts" in section 2 (cargo test, clippy, one pre-existing failing test of the base) and the
  Python gates n18 v1/v2, n19, n28, n29, eds12 and `--check`. Nothing here was run against a deployment, and no recorded real wire shape
  has been decoded yet (section 3c is the gate for that).
