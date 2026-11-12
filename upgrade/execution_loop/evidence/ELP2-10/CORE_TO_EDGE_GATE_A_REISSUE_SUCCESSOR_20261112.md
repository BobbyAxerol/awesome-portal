# Core → Edge (for TS): gate (a) re-issued on the successor path; install window moves to 07:15Z

Written 2026-11-12T15:06:51Z by Claude (Core backend, delegated by Bobby). Public text only. Supersedes the install-path part of `CORE_TO_EDGE_GATE_A_INTAKE_ACK_20261112.md`
(`a2b1b900…f79b`, withdrawn as an install authorization in `CORE_TO_EDGE_C01_C08_DISPOSITION_20261112.md` `dfd4df5c…3a43`). Not an SDK ACK, not a grant, session or connected PASS.

## 1. What is acknowledged

| Item | Value |
| --- | --- |
| Install tool | Core's offline **successor** writer (`execution-native-successor`), appends one finite READ grant; it never edits or resurrects predecessors |
| Reviewed owner artifact | private, root-owned 0600, compact JSON, 3,205 bytes, schema `portal.private-owner-manager-successor.v1` |
| **Owner artifact SHA256** | `4412d884e9c6cd5e9b6a2cdfdfd294317d851e0197be38fa2bfc7d118ff14b7b` (recomputed on the placed root-owned copy and on the private original) |
| Policy revision / digest / approval | unchanged: `policy-m0r2-read-20261113-01`, `sha256:fa81b92b…94b9` (the policy review), approval record `5ba5ab62…4018` |
| Compare-and-swap preconditions pinned in the artifact | current policy revision `core009-stream-window-aa0318bc-6561-4cc5-b082-17f0cf544786`, digest `sha256:89dac0e5039be13def3c5e44cccc8de5bcab0e6fdf5994c4e9c150f309b4e224`; predecessor grant `core009-read-aa0318bc-…`, revision `acr_d53a4e14…`, digest `sha256:2e4de55f4963470ef47f1b77684b8405a07e8f0d2787f398c73a1510635163ec`. If the workspace changes before the run, the writer refuses (revision conflict) |
| The one new grant | `grant-m0r2-read-20261113-01` / `rev-1`, `business.read_all` ALLOW, subject `usr_5a38…`, paper, `PAPER_BINANCE_USDM`, seals `aac7f93e…` / `c8fb4344…` / `bee80b18…` (the TS-accepted tuple), 2026-11-13T07:15:00Z–09:15:00Z (exactly 7,200,000 ms); no STREAM, no DENY |
| Old artifact `191d5a09…` | kept only as the manifest's owner-intake pin / validator reference. **Core will not run `install policy`** (it would refuse, workspace not fresh) |

## 2. Evidence (offline, real stored facts, read-only)

Core read the workspace's stored policy and all 7 stored grants from the Research DB (read-only) and ran its own planner on the new artifact at 2026-11-13T07:20Z with the renewal ceiling set to the manifest's domain:
**plan OK**: policy advances, exactly one READ grant is planned, STREAM none. The same artifact **without** the manifest-pinned domain is refused (`MANAGER_SUCCESSOR_SCOPE_REFUSED`).
Source change that makes this possible: the successor writer may change the domain **only** to the domain of the hash-pinned runtime manifest, keeping the profile id and every other rule (same subject, action, environment, 2 h ceiling, source-trust ceiling, no STREAM).
Local gates: 8 new renewal tests and the 5 probe tests pass (260 tests across 7 related specs), `tsc --noEmit` clean. **Normal R3 on this exact tree is running now** (staged tree `ede74a0a015db0fc69fc6d58ee4873101cf17a9a`); the commit and the image follow a green R3. Nothing is installed.

## 3. Consequence for the schedule (13 November)

The successor window is pinned to the grant: **`not_before` 07:15:00Z, `not_after` 09:15:00Z**. Core therefore runs the writer from **07:15:00Z**, not from 07:10Z as in the earlier plan. It also needs the final serving manifest (native acceptance fields), so the order is:
native append with `effective_from` ≤ 07:10Z (07:14Z latest with owner consent) → Core fills the five mechanical native values and mounts the manifest → successor writer from 07:15:00Z → native composition → session → runner. If the append is later than 07:14Z, no append and the slot is re-coordinated, as already agreed.

## 4. Still open (owner delta, not yet approved)

Exact hash of the source change (successor domain renewal), the mutation-intent cap 1 → 80, the probe CLI, the identity-step effects, candidate PKI, and the two swap envelopes; Bobby chose the successor remedy in principle today.

SHA256 in `CORE_TO_EDGE_GATE_A_REISSUE_SUCCESSOR_20261112.sha256`; mirrored to HK EPG10-08.
