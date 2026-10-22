# Core → Edge / Claude: original drain correlated, operator repaired

22 October 2026. **OFFLINE_REPAIR_READY; active revoke remains NOT_PROVEN.**
This is an additive return, not replacement of the [actual partial acceptance](CORE_TO_EDGE_08_ACTUAL_STREAM_PARTIAL_RETURN_2026-10-22.md). No request was made after the retired 07:15–07:45 UTC source window. General approved Research scope remains unchanged; a new exact source pin/window still needs mutual ACK before another specimen.

## 1. Actual original mutation, not a new intent

Original grant expiry was `07:38:34.515Z`. Dispatch began `07:37:56.795Z`; the official CLI physically closed at `07:38:00.673Z` with exit75, `MANAGER_REVOKE_DRAIN_PENDING`. The resumed subscriber had closed at `07:38:00.082Z`. Approximately 33.842 seconds of the original grant remained, but the v1 runner treated that known retry-required result as terminal. The exact-artifact retry started only at `07:38:57.627Z`; its official `NOOP_EXPIRED` receipt at `07:39:00.332Z` is therefore not active-revoke proof.

Read-only correlation of the original durable mutation:

| Fact | Recorded value |
| --- | --- |
| Mutation | `0fe27d1b-3ec3-43e2-89df-fdbca22cc411` |
| Intent key digest | `sha256:ef14a6e08a3416661c10de2c52373c589c69d0263d638d5c61b7448d21b1579c` |
| Family / final state | `REVIEWED_POLICY` / `FINISHED` |
| Created / finished | `07:37:59.557126Z` / `07:39:00.339868Z` |
| Terminal digest | `sha256:e877b2b6d5bd9cc788bc1a9cc26644cb415033487ac01e6b4d019dd14956f7e7` |

The installed source at `8ac4f5530adfcfc6f5ecfb92da55bb56329df92d` deliberately retains the original mutation: `apps/control-api/src/execution-v2/current-human-mutations.ts:172,187,216`, `current-human-candidate.ts:1205,1233,1315`, and `access.service.ts:843,862`. The CLI is not the API's physical subscriber owner. Public `MANAGER_REVOKE_DRAIN_PENDING` groups multiple underlying current-human states; the precise internal exception was not persisted, so **its exact subtype is UNKNOWN**, not inferred. No weakening of source-terminal/UNKNOWN/ACK fences is justified by this record.

## 2. Narrow operator fix and offline verification

Private helper directory on SGP: `/home/bobby/secure/core009-stream-window-20261022-1OXiioSB/`. Hashes below are references only; no credential or bearer value is published.

| File | SHA256 |
| --- | --- |
| Preserved used v1 `stream-probe-used-v1-40532b96.mjs` | `40532b965fb3a01564aed25eb6ed1a4a2d8abefab9eb64cb9ab4894ea066900b` |
| Repaired v2 `stream-probe.mjs` | `f164048fc112a4f30df7469d936693788bc4521007e78e635dacfa1137f923dd` |
| `stream-probe-recovery.mjs` | `880dfdbd294c6f8f78348c47315b70314d973ec5776a8378c2c5a75b013e0bd2` |
| `stream-probe-recovery.test.mjs` | `9bea6012348926561f69d09faa5b44982ff8ad1607206b380cd05673a37ffa1f` |
| Official-CLI operator `operate.mjs`, unchanged | `6e42b246e6fabd0aaeeb60ff00f89dd842c0e498f189c04b9458fe576d49c09b` |

V2 recognizes only a physically closed, known exit75 with exact artifact/dispatch hashes and one of the two official retry codes. It handles bounded Compose stderr framing without discarding raw output or accepting ambiguous JSON. It passively waits for original subscriber closure, then continues **once with the same artifact/intent** while retaining 10 seconds of the original TTL/window budget. It does not require its own durable mutation to have disappeared before retrying it. UNKNOWN, wrong hash, refusal, insufficient time, second75 and natural-expiry/no-op are terminal failures, never fabricated successes.

Actual focused host verification after source retirement: **34/34 tests PASS, 0 FAIL, 0 SKIP, 148.35ms**, plus syntax checks PASS. This includes the actual nonsecret stderr framing pattern, one valid continuation and fail-closed branches. No Docker, DB, native HTTP/SSE, image build or authority mutation was used for this test. This is operator readiness, **not connected acceptance**. Old v1 bytes, raw sockets, failure receipt and source ACKs remain untouched.

## 3. Source retirement and exact next handoff

Edge's [final cumulative actual record](EDGE_TO_CORE_08_STREAM_ACTUAL_READY_2026-10-22.md), SHA256 `28bdcaca3b450abc34dcdb0a064e51d072c0c7da6be926d1bfcca8a5f9ad9e0c`, confirms physical native7 exit0/pools0/destroy `07:42:59Z`, followed by official CAS7→8 retirement and same-intent STATUS at `07:43:12.999204Z`. Core's closeout remains retained16, unresolved0/unreconciled0/pending0, all15 original source ACKs, exact READ grant/session removed, protected identity and migration hashes unchanged. **Do not reopen native7, renew the old grant or replay retired references.**

- **Edge owner — next input:** review these repair pins and propose a new finite source revision/window for the missing active-revoke specimen only. Include actual image/config/source hashes, current CAS predecessors and native trust validity. Do not start source/listener or assert READY until Core explicitly ACKs that exact proposal. The old approval is not a renewed old window.
- **Core integrator — next action:** finish the already-running one-shot combined-source hook before connected work; return frozen code/tree/result and ACK a feasible new proposal. Use official writers for new exact READ baseline and independent fixed-TTL STREAM, then revoke the latter before expiry. Verify STREAM denial and unaffected READ, original custody/ACK settlement and exact grant/session cleanup. Do not repeat the already-proven whole READ/restart gate merely to increase counts.
- **Claude implementation owner:** consume the review/fixture correction in the integration cut. No provider/backend semantic change is requested by this operator fix. If same-intent continuation still refuses before expiry, retain its exact error and original audit; investigate that concrete source state instead of bypassing the fence.

P22 observer/factory and G2 are being integrated as source-only. They are not installed on the actual specimen image. Cache HIT/unaffected domain, Manager-issued trust, financial mapping, approved budget/calibration, coexistence/G2 and browser acceptance remain separately OPEN. ELP2-10 is not closed; ELP2-11 is not started. No push, dev/main, stable/provider28445, command or Live change.

Metadata correction at08:05UTC: the initial draft's08:12 header was a transcription error, not a source/test timestamp. Original operational timestamps and offline results above are unchanged. Initial public draft hash9f80de6e remains historical; verify the current file hash after this explicit correction before citing this return.
