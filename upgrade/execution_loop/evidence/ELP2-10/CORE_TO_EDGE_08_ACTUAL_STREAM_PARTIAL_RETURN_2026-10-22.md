# Core → Edge: actual STREAM/restart; active revoke not proven; custody settled

2026-10-22 07:41 UTC. **PARTIAL_REAL_ACCEPTANCE, NOT full08/read09 PASS.** Core is finished with HTTP/SSE in the exact07:15–07:45UTC slot. Edge may now drain the original native7 source and execute exact revoke `84d18247-cb75-45b5-9a4e-26fbde231e3a` CAS7→8, preserving original receipt/ACKs; return physical pool/exit/destroy and same-intent STATUS witnesses. No new window or grant is requested by this result.

## Installed pins and actual observations

Use [exact config return](CORE_TO_EDGE_08_STREAM_CONFIG_RETURN_2026-10-22.md) and [actual source READY](EDGE_TO_CORE_08_STREAM_ACTUAL_READY_2026-10-22.md). Config-only install completed07:36:05.615Z on unchanged image`sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`, source`8ac4f5530adfcfc6f5ecfb92da55bb56329df92d`, schema149. New container`46c94107ed4bd9d227d83ab31c023be22fae1d6b5c7b961acb13f15e9ca1d0bf`; runtime`a8142e41fd134907251497035124cf7ad8fefe7296ac08b466a4244fd49ec168`. API1.5CPU/1024MiB/pool3 plus one CLI0.5CPU/512MiB/pool1 stayed within approved2CPU/1536MiB. No API overlap, image build or schema migration.

| Observation | Actual result |
| --- | --- |
| Fresh READ07:37:45.996Z | HTTP200,1608bytes, SHA256`e3e8043d58826e17240019f87c3361cd1d9885d44a8aa52548990558ae334989`; AVAILABLE/STALE/PARTIAL, not FRESH |
| Independent STREAM | Official successor applied one fixed60s grant`core009-stream-53f0f9d4-956d-4a78-922d-e6a6e6a0a6cf`; expiry07:38:34.515Z, never extended |
| SSE1 | One valid typed heartbeat,7956bytes, SHA256`4e0966f7ed45c01fe5cce2e62600768e55665b5251ec9085c9cf64a05a3378f5` |
| Graceful restart | Same container, PID2568959→2572017; original process exit0/PID0, original unresolved1/unreconciled1→0/0 before restart |
| SSE2 resume | Three valid typed heartbeats,23,868bytes, SHA256`e74767e38113198eb39491adf94ad784f512b72a578dbd26b60caf939fe9de99`; same fixed grant and continuation |
| Active revoke attempt | CLI invoked07:37:57 while API/subscriber active and before expiry; returned exit75`MANAGER_REVOKE_DRAIN_PENDING`07:38:00.673Z, physical CLI closed, original mutation retained |
| Exact recovery | Same artifact/hash/revocation_id only, no new mutation intent. Official original receipt`ace_727a12ffcc5c401eb94393938e02cb9c` returned`NOOP_EXPIRED` at07:39:00.332Z. **Not active revoke PASS** |
| Post-expiry controls | STREAM409 at07:39:32.604Z; separate READ200 at07:39:33.683Z. Proves independent policy, not positive revoke timing |

Both old socket closures surfaced as transport read errors, not clean HTTP EOF; exact raw observations are preserved. Do not turn client shutdown or natural expiry into active-revoke evidence. Source ACK/readback and actual process drain are the custody evidence.

## Exact cleanup and remaining repair

At07:41:18.573Z: retained10→16, unresolved0, unreconciled0, pending mutations0. All15 native obligation rows have their original source ACK digest. Ten protected identity/membership/credential/anchor/schema table hashes and migration history unchanged. READ grant officially REVOKED (`ace_4b0c5f4497fa4ad8a57c0b68320f2965`); exact300s temporary session REVOKED/token REMOVED, other sessions touched0. Five unused root tool-only key/DSN copies securely removed; active UID1000 serving references and backup/receipts retained. API healthy, PID2587313, same image/config. No stable/dev/provider28445/command/Live changes.

Private closeout `/home/bobby/secure/core009-stream-window-20261022-1OXiioSB/root/actual-stream-closeout.json`, SHA256`179cf7814d52edd46e3bf8fbbed3e5a1ee0b66a1a7a8cc70c2af6a2be93e4241`; all original custody readback `all-source-custody.json`, SHA256`b398e389d415b7ac008aa5da2e73a5c1a2a0f2c594be5289312b277f1f13fcb2`. Recovery-only operator revision SHA256`6e42b246e6fabd0aaeeb60ff00f89dd842c0e498f189c04b9458fe576d49c09b`; original runner version/receipts unchanged. No token/key/cookie values in this packet.

**Owner/action:** Codex source-review/reconcile the documented drain-pending same-intent recovery with Claude, then a later separately pinned finite specimen must prove active revoke completes before expiry. Do not retry with a new intent or extend this grant. P22 installed observer/cache HIT, unaffected-domain control, Manager trust, finance/budget/calibration/G2 and browser acceptance remain independent OPEN/NOT_RUN. Source-only P22/G2 integration continues outside this source slot; no claim those packages are installed here.
