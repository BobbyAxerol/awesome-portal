# Core009 actual SSE terminal and scoped session closeout —21October2026

At05:09:08UTC Core READONLY observations show4retained native admissions,
ALLSERVED/source_reconciled:true/ACKresolve, unresolved0/unfinished0:

| Kind | Lease | Physical receipt | Body digest | Source ACK digest |
| --- | --- | --- | --- | --- |
| HTTP second fresh baseline | 0e035e95-69c2-480d-ab6a-57a76d06d089 | dfe41ac4-0794-49a9-942e-f82e21d00969 | e3e8043d58826e17240019f87c3361cd1d9885d44a8aa52548990558ae334989 | 8c1eee385a783cead51472df47979d24892202e6a5af596f0fff301984342f09 |
| SSE frame | 6d789240-5ca9-4694-a7bd-94c846ab7998 | fc5ef779-bf65-4764-b4cb-5fdc364f78b1 | 46d7e9dd5896b019f1143245f76be6de295be634849a9ad5274f53212d1e6060 | 43c5cf956532f33b16d8e774e0b329a39942a4e94c4c2fc6496b3cbb7194cbd2 |
| SSE frame | 263ad2e7-fa48-48a8-bb0e-a3f3bb69957f | d49abbed-dc1b-4b67-bc9f-8d5f4f98494d | 40d9e5e27c17e304c8e84211de3cf9036924527bb8bb15c6591077a9f5eaa60e | 2000c4e6811daa4c887da71fe818467b17b56d0492c91568608a3123b68ae6c5 |

Original firstHTTP22bc1a61 is recorded in the previous actual correlation
return. SSE terminal reason is FRAME_WRITE_CALLBACK_COMPLETED for both frames.
Edge still cross-checks original source rows/actual wire; this is not a source
update/FRESH claim, active-revoke proof or browser acceptance. Earlier409 used
the genuine baseline after its300sTTL and is preserved, not hidden/retried.

Original temporary session `ses_5e86a430f62b4f77ad2af3053113dd9f` idle cutoff
05:08:51UTC has passed. **Core is invoking official exact-session revoke**, not
extending it. No more cases may use that old credential. Cleanup result will
follow; no token removal or terminal claim before the official receipt.

Within the SAME approved Research commissioning package and04:15–05:45window,
Core is preparing one scoped20minute continuation session ONLY AFTER the old
session is officially REVOKED, its token absent and14normal active sessions
preserved. Fresh session/receipt/cursor will be explicit; no old session-ID,
authority or HTTP result reused. Existing two grants/user/workspace/image/source
head remain unchanged; no extra rights, stable account, command or Live action.
This supports remaining independent revoke/restart cases, not hiding expiry.
Do not open another stream until Core returns actual new private pins.

## Actual original-session cleanup, 05:10:23 UTC

Official `execution-native-session revoke` returned exit0, outcomeREVOKED,
token_fileREMOVED, other_sessions_touched0 for exactly the session above.
Receipt SHA256:
`e99e706cba2f09bba6b4a7e82054a5c46bbd0670dbf9d0ac0599b3ae2c8df3f6`.
Private `cleanup-session-1.*` holds original dispatch/result/before/after.
Token absence checked separately. All686normal owner sessions (14ACTIVE,
672REVOKED) unchanged. This is actual cleanup, not just automatic idle expiry.
No grant revoked yet; continuation not issued as of05:16UTC. Preserve all four
terminal native rows; their retained existence must not be mistaken for open
custody. Edge independently matched both SSE physical receipts and ACKs.
