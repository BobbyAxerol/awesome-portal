# Core → Edge/PM: actual original-custody recovery and cleanup

21 October2026,14:25UTC. **ACTUAL_CORE_ACK_AND_SCOPED_CLEANUP /
NOT_CONNECTED_READ_STREAM_ACCEPTANCE / NO_RUNTIME_SWAP.**

Continues [matched recovery window](CORE_OPERATOR_RECOVERY_WINDOW_MATCH_2026-10-21_1400.md)
and [reviewed helper successor](CORE_OPERATOR_RECOVERY_GUARD_RETURN_2026-10-21_1400.md).
This is no longer merely prepared source or a test plan: the official fixed
CLI ran against the unchanged Research target and its actual readbacks follow.
Historical pending/UNKNOWN attempts and their original bytes are retained.

## 1. Actual sequence, all times UTC

| Operation | Terminal time | Actual result |
| --- | --- | --- |
| Offline image/artifact verification | before14:21 | PASS; image05ae/schema826e/compiled transport204907a8 matched real normal/build provenance |
| STREAM dry-run, original artifact |14:21:12.718| EXIT0; network-none, verified, no mutation |
| Official same-operation STREAM cleanup |14:22:28.843| EXIT0; original custody becomes CANCELLED with genuine cancel-unentered source ACK |
| STREAM readback/closeout |14:22:29.040|8native retained,0unresolved,0invalid terminal;0unfinished mutations,drain NULL |
| READ dry-run / official cleanup |14:22:50.396 /14:23:20.071| both EXIT0; scoped cleanup closed14:23:20.249 |
| Temporary-session dry-run / official revoke |14:23:33.043 /14:24:05.524| both EXIT0; REVOKED, token removed,0other sessions touched; closed14:24:05.712 |
| Final read-only custody status |after14:24|0unresolved/native unresolved/unfinished; exact normal-session digest unchanged |

Grant results are `NOOP_EXPIRED`, **not** evidence that expiry cleared custody.
Closure rests on the actual same-original source ACK and zero unresolved
readback. No new ISSUE/ENTER, attempt, authority/session/grant/head renewal,
manual SQL, replacement bytes or fabricated receipt was used.

## 2. Exact original correlation

```text
lease=785387ba-ef57-455d-a7ba-f92663baae60
attempt=07becd72-1e11-4ab9-8a96-d5fd7339f1a0
source_identity=sha256:0dc8921f29b27e3de6fc55129f4cde69d6a4e67e0f94c76d20a44dff3dc55c7b
binding=ef98ed112e70b264857d42172b51980661238045ea3e8fa5f1cb0afe480eb69b
source_ack_action=cancel-unentered
source_ack_digest=sha256:e6f01e947af07cac8e8148b53065f90254c352fd9d5b9a1125f9e7f004dbfc9b
phase=CANCELLED
source_reconciled=true
no_send_fenced=true
body_digest=NULL
```

Core's persisted ACK is genuine connected recovery evidence. Edge still owns
independent exact-PK TS correlation, physical SDK exit and downstream eligible
read/revoke/SSE acceptance. This return does not infer those from Core alone.

## 3. Private references and immutable actual receipt hashes

No private file values are attached. Existing SGP-only directory:
`/home/bobby/secure/core009-commissioning-20261021-xwAWdhFY/`.
All names below are relative to it; SHA256 values are full pins.

| Actual file | SHA256 |
| --- | --- |
|`cleanup1030-stream-1.result.json`|`cdb8736f7e9adc116292fad7e14363b818cb591af33588eea8ab7cd07e648a8f`|
|`cleanup1030-stream-1.after.json`|`76ea3c74b3e0e0070c6b6b17ae67900e74303da38a55f827b0bc58d2706fb0d6`|
|`cleanup1030-stream-1.closed.json`|`6941779b91bd9aa6da364b2f9ee673c66724a58a15d9c108b4927f2571cc9f25`|
|`cleanup1030-stream-1.stdout`|`7e72080397b40ab4d4861765d4151333c6c321370e6c7154abcf9f57d261d99d`|
|`cleanup1030-read-1.result.json`|`fef35772875df35597bc5dd7137717e7dd301e24a62e1ba74ca0ff297c1498f6`|
|`cleanup1030-read-1.after.json`|`47879e63ff7681e3886f23a7714d4664434f8602ec581ac23ac36872bc621c1d`|
|`cleanup1030-read-1.closed.json`|`38cf84df07d7a850e24519e5765a216f95350fa611deef0159905718dd5420bb`|
|`cleanup1030-session-1.result.json`|`856ad4819119b30b813d80d7d0dccb4bceeb58bbf4d0478bca0effc3e311113c`|
|`cleanup1030-session-1.after.json`|`232b3d37b99710c6e907dfa96ae48c2432e32580a37460305a7484eeca6452ab`|
|`cleanup1030-session-1.closed.json`|`ec644b08a2264473b73b763c5d7177be5931a053514b97d3c49a88088ab45d0e`|
|`cleanup1030-session-1.stdout`|`965f54116f6a7b21e1b6c573f8b5399cb777e88387e90b7a6f21d7a5008560e8`|

Effective root0600 `operator-plan1400-v2.json` is pinned by
`d5d311045b3a11522f19b3f93bbe805dfe97546b56dc29596fcbe0f022f4c5c9`;
helper181879b8, original STREAM artifactd9e3c07d, qualified CLI05ae/source9d88.
Before/dry-run/dispatch/stdout/stderr files also remain in the same directory.
No manual retry was needed after the first actual successor dispatch.

## 4. Data, authority and resource preservation

- Fourteen normal ACTIVE sessions preserved across all three official
  operations; all686normal rows retain exact pre-operation digest
  `e2a299414c198451530c0def79ee010f6f3b9f02556af1107b1603715225fd89`.
  Both original and continuation acceptance credentials are removed; final
  acceptance ACTIVE count0. No password/account reset or copied stable grant.
- Original grant validity intervals unchanged, including05:45UTC expiry.
  Same original custody/attempt and all8retained records remain in place;
  authority41/lease epoch48/drainNULL observed after recovery.
- Installed Core4095/image9cf5/configf3fe/schema826e remains unchanged;
  source28446 is not replaced/restarted. Fixed05ae was used only as the
  official CLI image with2CPU/1536MiB/128PID bounds, not installed server code.
- All six own dry-run/revoke containers auto-removed. No shared prune,
  volume deletion, force stop or unrelated cleanup. Keep the qualified image
  as a named follow-up input; keep historical receipts/private custody refs.
- Read-only host snapshot14:24UTC:8,950MiB available RAM,128GiB free disk,
  root80%used. Claude's separate frozen normal gate was not interrupted and
  no second heavy build/test was launched.

## 5. Next owners and still-open gates

1. **Edge/PM:** correlate original TS terminal/ACK and physical SDK exit;
   acknowledge this partial real return without waiting for every other gate.
   Do not duplicate cancellation or infer new data authority.
2. **Core integrator:** preserve incoming canonical owner Markdown, run the
   final changed-tree normal gate at the agreed resource slot, ff-only land
   reviewed source/consumer history. No push/deploy permission is implied.
3. **Claude:** accepted Paper/Governance consumer is already imported; repair
   Fleet refresh cancellation per the [independent review](CLAUDE_CONSUMER_REVIEW_RETURN_2026-10-21.md).
   Keep new STREAM feature dark. Fixture/browser design continues without
   inventing issued PKI, READ/STREAM authority or source financial facts.
4. **Connected commissioning:** actual Research Manager trust/eligible source
   and separately granted STREAM, read/revoke/restart/recovery/SSE receipts;
   PM command07 target, TS publisher03, financial mapping, approved bounds/
   calibration, coexistence/G2 and actual browser acceptance remain open.

**ELP2-10 remains NOT_MET; ELP2-11/release/dev/main are not opened.**
Rollback does not undo legitimate revoke or resurrect credentials/custody.
Retain current runtime and immutable evidence; future commissioning needs its
own matching eligible inputs. Verification: R0 documentation closeout,
focused actual operations above; no repeated full hook for receipt Markdown.
