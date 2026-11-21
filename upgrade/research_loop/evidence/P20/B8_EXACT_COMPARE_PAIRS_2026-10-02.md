# G-01 / G-21 — exact Compare backend proof

2026-10-02; approved named read-only QA lane on the existing preview :8095.
Verdict: **EXACT_PAIR_BACKEND_READ_PROOF_ACCEPTED; OWNED_QA_SESSION_REVOKED**.
This is not a frontend/browser acceptance or a P23/P24 waiver.

## Actual requests, not substitute pairs

| Pair, in requested order | HTTP | Elapsed | Exact matched observations | Pearson correlation |
| --- | --- | --- | --- | --- |
| R-WFO-020 → R-WFO-023 | 200 | 180 ms | 720 | -0.322493589412 |
| R-WFO-023 → R-WFO-020 | 200 | 164 ms | 720 | -0.322493589412 |
| R-WFO-022 → R-WFO-023 | 200 | 163 ms | 1,488 | 1.000000000000 |
| R-WFO-023 → R-WFO-022 | 200 | 160 ms | 1,488 | 1.000000000000 |

Run identities:

- 020: `rrun_3258a4c450816129d2d285f25b801061`
- 022: `rrun_a76afa62adb6c427ba2f4cec44bb43bd`
- 023: `rrun_3d5633d2adb712722fe4ba108102aa5d`

All four use the named `/api/v1/research/alphas/delta-rsi-polynomial-alpha/compare`
GET, `mode=pair`, the two exact `runs` in requested order. The installed
`research.compare.v1` schema validates all bodies. Pair/run keys, run labels,
common-window bounds, swapped source counts and per-run chart annotations
agree in both directions. Correlation joins exact timestamps with no forward
fill. All AVAILABLE values are non-null. Common-window trade count and win
rate remain typed NOT_APPLICABLE because they do not represent audited
round trips; they are not replaced with zero.

Sanitized measured proof, outside Git, mode 0600:
`/tmp/portal-research-g01-g21-exact-pair-actual-20261002.json`.
File-byte SHA-256:
`bd4b0cd04c75c4caa17291ef191cdc4a9f58e3ae72bf8d792df3e8ac76cc66c1`.
Collection: 18:51:45.792–18:51:46.549 UTC. No run, preflight, business write,
profile change, restart or source read was performed on the shared preview.

## Session cleanup truth

The normal session-specific logout returned 403 because its Origin was
`localhost` rather than the configured `127.0.0.1`. Its failed cleanup stays
in the original immutable receipt. No second login or global revoke followed.

The parent identified exactly one newly created `claude-preview` QA session
from the creation window and exact session/user identity. A transaction used
the **existing** `SessionsRepository.revokeSession` for that session only;
the target is REVOKED, and all other active sessions are unchanged. Token,
cookie and session identifiers are not included in this packet.

Separate private cleanup receipt:
`/home/bobby/.local/state/portal-research-p23/20260927/runtime/g01-g21-preview-session-cleanup.json`.
File-byte SHA-256:
`64022228d5351e2f5afac6f146107b369ea7f14b52c57f177c571287efa83eda`.
Cleanup completed 19:01:23.824 UTC. The original proof is not rewritten.

## Claude handoff

Backend G-01/G-21 exact pairs are delivered; preserve the existing rich S13
composition and exact return/overlap/source scopes. Backend correlation is
not evidence that frontend labels or all four browser paths are accepted.
Use this packet together with the latest frontend audit to close only the
remaining consumer/browser items, not to repeat backend qualification.
