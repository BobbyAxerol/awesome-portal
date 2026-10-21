# Original08 — genuine recovery correlation and scoped retirement

21October2026,14:22–14:35UTC. **ORIGINAL_RECOVERY_RECONCILED /
ACCEPTANCE_RETIRED / FULL08_NOT_MET / FULL09_NOT_MET.**
This supersedes the old unresolved1/window/build blockers, not the remaining
current read/security/data-plane acceptance requirements.

## Exact original, qualified tool and observed result

- Lease `785387ba-ef57-455d-a7ba-f92663baae60`, attempt
  `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`, binding
  `ef98ed112e70b264857d42172b51980661238045ea3e8fa5f1cb0afe480eb69b`,
  source digest `42f88db9a0195feaf60cbd54c842d30660eba2e22a929bad7a86fd19e5791826`.
- Actual Core CLI source9d88e40a/image
  `sha256:05ae2af5e1f6b04b11fd612e752d2120831b3e3f80ad7b0290a74740ec1b5dfd`.
  Owning normal gate1147contracts/8785API PASS/0FAIL/3SKIP and PGrestore PASS;
  independently verified11frozen blobs/index/tree and10provenance references.
  No duplicate suite/build or deployment by Edge.
- Exact14:00–15:30UTC recovery-only availability
  [ACK](EDGE_CORE009_RECOVERY_WINDOW_ACK_2026-10-21_1400.md), SHA12a47f13.
  Actual Core successor plan SHA256
  `d5d311045b3a11522f19b3f93bbe805dfe97546b56dc29596fcbe0f022f4c5c9`.
  Source-only predecessor228ecd5e is historical, not the executed plan.

Core alone ran the official original-artifact/idempotency continuation:

| Step | Actual UTC / result | Result SHA256 |
| --- | --- | --- |
| STREAM recovery/cleanup |14:22:28.843, EXIT0|`cdb8736f7e9adc116292fad7e14363b818cb591af33588eea8ab7cd07e648a8f`|
| READ cleanup |14:23:20.071, EXIT0|`fef35772875df35597bc5dd7137717e7dd301e24a62e1ba74ca0ff297c1498f6`|
| Temporary session cleanup |14:24:05.524, EXIT0|`856ad4819119b30b813d80d7d0dccb4bceeb58bbf4d0478bca0effc3e311113c`|

Private receipt root, references only:
SGP `/home/bobby/secure/core009-commissioning-20261021-xwAWdhFY/`,
`cleanup1030-{stream,read,session}-1.result.json` and matching `.closed.json`.
STREAM original artifact SHA remains
`d9e3c07deeb1b4851f7906c5184daa753f44dff31b0e092f8c95d87c48411b5f`.
Three closeouts are real producer records, not created by Edge. Their SHAs:
STREAM `6941779b91bd9aa6da364b2f9ee673c66724a58a15d9c108b4927f2571cc9f25`;
READ `38cf84df07d7a850e24519e5765a216f95350fa611deef0159905718dd5420bb`;
session `ec644b08a2264473b73b763c5d7177be5931a053514b97d3c49a88088ab45d0e`.

## Independent source/Core correlation, not process health

| Boundary | Before | After |
| --- | --- | --- |
| TS live_data_executor/system7674585245102796834, trading_system_pgdata |14:09:21, same original ISSUED/event22, terminal fieldsNULL|14:22:57, same original RETIRED/event23, terminal fieldsNULL|
| Core portal_control/system7688673963308855330 |14:10:26,8retained/1unresolved, original ADMITTED/no_send_fenced, noACK|Core actual14:22:29after receipt:8retained/0unresolved/0unfinished, original CANCELLED/source_reconciledtrue|

Core ACK action `cancel-unentered`, digest
`sha256:e6f01e947af07cac8e8148b53065f90254c352fd9d5b9a1125f9e7f004dbfc9b`.
The same original cancellation is authoritative; NULL signed-terminal fields
on source RETIRED do not invent a COMMIT/financial terminal. No new attempt,
ISSUE/ENTER, cap increase, manual SQL mutation or forced stop was performed.
READ/STREAM grant outcomes are **NOOP_EXPIRED**, NOT active-revocation PASS.
Original continuation session `ses_f1c6ea88ef394c4290a7bf393b0710d8` is actually
REVOKED, token REMOVED, other_sessions_touched0. Normal-session state hash
`e2a299414c198451530c0def79ee010f6f3b9f02556af1107b1603715225fd89`
matches the Core closeouts; no ordinary user session was removed by Edge.

Independent **direct DB** verification14:34:42UTC, not only producer files:
same Core original CANCELLED/reconciled/cancel-unentered ACK digest,8/0/0;
686ordinary session records/14ACTIVE, recomputed full normal-session state
hash exactly matches the original closeouts. TS14:34:44 independently confirms
the same original RETIRED, currenthead4/revokedtrue/exact manifest and0owned
source/control/observer/maintenance backends. Both used bounded READ ONLY
transactions. No ordinary-session IDs/cookies/token bytes were copied here.

## Edge-owned official retirement and negative verification

After genuine source/Core settlement, Edge used the unchanged pinned official
SDK, not raw mutation SQL. Original acceptance
`b922c105-4e99-4830-8be2-bb2e1f41b5d9`, expectedhead3→4/revokedtrue;
command `a69bd97b-3834-423b-8c4e-f44d73985b23`, revocation manifest SHA256
`1bbe119f450495f526d57e8da171bf4db3ac0a3d8c6d8041274e0bbcd23c09b8`.

- `invoke_native.py revoke`: EXIT0/stderr0, RECORDED current/nonhistorical
  head4, effective14:28:31.050338UTC; physical maintenance pool0.
- `invoke_native.py revoke-status`: EXIT0/stderr0, identical current head4,
  exact manifest/command and document digest
  `8b60215fa29202906d509747484acf9e452b9c985102322e90a9f99e8b0c7a2f`, pool0.
- Existing actual READ ONLY/RR SDK observer: **PASS_EXPECTED_DENIAL**,
  `BUSINESS_READ_REVOKED_OR_EXPIRED`; underlying observer exit2 is the expected
  negative, not a positive-preflight PASS. Zero ISSUE/ENTER/new authority.
- Earlier fresh SGP→native28446 mTLS/TLS1.3/CA/hostname compatibility EXIT0;
  no HTTP or application grant inferred from that one handshake.

## Physical cleanup and exact evidence limit

Original serve container7d034810, its controller and28446socket are absent;
14:26:28 source/control backend count0. Three own bounded workers
`edge-core009-native-revoke-kkmO9cv7`,
`edge-core009-native-revoke-status-kkmO9cv7`,
`edge-core009-ready-observer-kkmO9cv7` physically exited/auto-removed.
Revoke/status were1CPU/512MiB, observer0.5CPU/256MiB; no image build/pull,
volume/network/listener created. SDK maintenance pools actually closed at0.

**Do not overclaim original serve exit:** bounded exact-ID/name Docker-history
queries returned no historical events. No original captured exit0 or
`NATIVE_PHYSICALLY_DRAINED` stdout is claimed from absence or idle pools. Its
process/socket/backend absence is real; provide the original controller's
terminal/observer receipt if retained. Any next actual source run must have
a fresh finite exact-ID exit witness before activation, not the expired
12:05 observer. Do not replay the retired head to manufacture missing evidence.

HK free219009040384→218862432256bytes is shared-host movement, not exclusive
reclamation. Read-only inventory114unique image IDs/519BuildKit entries;
zero owned new images/cache, no prune. Shared image28ea and named operational/
rollback resources remain; Core installed9cf5 is unchanged. Measurement lock
owner claude writer-rollA14:19:33–14:49:33 is untouched; bounded correctness
receipts above are not latency/capacity measurements.

## Next existing08 acceptance, no new generic phase approval

Core/Edge can now prepare the next genuinely current READ and independently
granted STREAM window using existing identities, not this retired acceptance
or expired cookie/grants. Return exact eligible source/config/session references
and coordinated active-revoke actions for cache/cursor/SSE tests. All-mode
Manager issued leaf/issuer and per-mode configuration remain a separate input;
native28446 trust is not Manager8443/8444/8445 trust. No swap/deploy/financial
command or Live-trading activation follows. Full08 and connected09 stayNOT_MET.
HK main journal (host-qualified locator, not an SGP-local path):
`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/EXECUTION_LOOP_BACKEND_UNIFIED_PLAN_AND_GUIDE.md`,
anchor `original08-core-green-return-and-recovery-ack-20261021`.
