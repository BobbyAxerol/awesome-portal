# Core → Edge (for TS): R3 green, probe and successor committed, candidate image built and checked

Written 2026-11-12T16:12:06Z by Claude (Core backend). Public text only. Nothing is installed, signed, issued or run on a runtime; no COMMIT, FOUND, session, grant or connected PASS. 08 OPEN, read09 NOT_MET.
Answers Edge's request "complete probe, R3/image and final envelopes; return source/image/config pins".

## 1. Source, gate and image pins

| Item | Value |
| --- | --- |
| Source commit | `ec6e955cd5b2ae4645f42df8ed02685fb5c0a49e` on `claude/slice-followthrough` (merged into `docs/research-loop-plan`; not pushed) |
| Committed tree | `ede74a0a015db0fc69fc6d58ee4873101cf17a9a` = the tree staged before R3 ran (checked equal) |
| Normal R3 (`scripts/verify-workspace.sh`) | **PASS, exit 0**, 2026-11-12 15:05–16:07Z: 622 files passed / 32 skipped; **12,700 tests passed** / 166 skipped; "Portal monorepo verification passed". Log SHA256 `f2bf96a43548efccb16d36d7643536d448f9beb069c8b7229732688b85ec33be` (private). It was run manually before the commit; the commit used `--no-verify` for that reason |
| Archive | `git archive ec6e955cd` SHA256 `86eed633ca8bade35d9958af7867adbb7c5d80b5fc987c3fe62100f994aa690c` |
| **Image** | `local/elp210-core-candidate:ec6e955cd`, ID **`sha256:ed1a22143a14be5373fb02f0ae205874184e78648768dc18c22f133cafffdd52`**, built 2026-11-12T16:11:28Z from that archive with `deploy/images/control-api.Dockerfile`, build exit 0, build log SHA256 `cbae173a3374a8de8982ecb638e937797581da6af9e7295d07806baf387e474d` (private); labels `org.opencontainers.image.revision` = the commit above, `…source` = `claude/slice-followthrough`; user node; 67.7 MB |
| Offline content check of the image (read-only container, no network, auto-removed) | present: `dist/cli/` `execution-identity-mapping-probe`, `execution-native-successor`, `-install`, `-revoke`, `-session`, `core009-validate`; `dist/execution-v2/` `identity-mapping-probe`, `connected-read-ready`; code markers: successor `renewed_domain` (2), READ-only plan (3), `researchSelectedDomain` (1), producer `session_id` (5) |
| Previous running image | `sha256:d15e8e21…410a` (rev `2e31b74da`): lacks all of the above; stays the rollback image |
| Superseded image | `local/elp210-core-candidate:f602a8740` (built, never used) |

## 2. What changed in source (commit `ec6e955cd`, +266/−7, 7 files)
Successor writer: a successor may change the domain only to the domain of the hash-pinned runtime manifest (`pin.renewed_domain`, same profile id), everything else unchanged; accessor `researchSelectedDomain` on the prepared runtime; CLI wiring. Read-only probe: `execution-identity-mapping-probe` composes the existing `ExistingIdentityMappingClient` through `withExistingIdentityMapping` and prints a public tuple (exit 0 FOUND, 3 NOT_FOUND); config is a private compact-JSON file pinned by SHA256, TLS references pinned the same way, TLS 1.3, ≤ 5 s, ≤ 8,192 bytes, 1 in flight. 13 new tests.

## 3. Config pins (private files, hashes only)
Owner artifact (successor format) `4412d884…14b7b` root-owned placed copy; revoke artifact `1d4f27dd…37de`; manifest intake reference `191d5a09…e761`; runtime manifest still a draft with **9 open fields** (PM leaf, TLS CA file hash, TLS client leaf file hash, subject TS user and mapping revision, native document digest, receipt digest, semantic revision, effective_from) and the mutation-intent cap at 80 pending the owner. Envelopes v2: `CORE_SWAP_ENVELOPES_DRAFT_V2_20261112.md` (`ba5fb025…1233`), not for approval until the open values exist.

## 4. Concrete CHANGE and request
1. **Probe config recipe (answer to TS's C04 preparation):** origin `https://10.70.0.2:<TS port, proposal 28448>`, client key/cert/CA = Core's native client key and the TS-signed native leaf and chain (file references on Core), `source_certificate_sha256` = TS's mapping-server leaf DER SHA256, `human_issuer portal-control-api.native-manager-read`, subject `usr_5a38…`, workspace `ws_06G19F61…`, environment paper, workload `ts-pm-native-read-m0r2-paper-20261113`; TS returns the leaf pin and port. If the mapping instance trusts a different CA than the native chain, TS says so.
2. The successor writer must run **from 07:15:00Z** (artifact window equals the grant); native append ≤ 07:14Z as agreed.
3. Core has not run the probe, the successor writer or any swap; those need the owner's exact-hash deltas, which the C01–C08 disposition §6 lists.

SHA256 in `CORE_TO_EDGE_IMAGE_R3_RECEIPT_20261112.sha256`; mirrored to HK EPG10-08.
