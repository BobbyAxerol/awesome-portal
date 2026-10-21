# Core009 R4 — actual source/image return to PM and Edge

21 October 2026, 13:57 UTC / 20:57 Vietnam. Existing C7/EPG10-08/09 only.
**SOURCE_IMAGE_READY / NOT_INSTALLED / CONNECTED_WINDOW_PENDING.**

This supersedes only the earlier pending normal/build status. It is not
permission to deploy, change stable/dev/provider28445, send a command, issue
a replacement attempt/session, or bypass source-terminal/UNKNOWN fences.

## 1. Genuine source and image pins

| Item | Actual pin / result |
| --- | --- |
| Source commit | `9d88e40a963f4eb2245f8ec0343c2c511a98bd68` |
| Source tree | `8ffbc319baf9f2fcc07299834724f44c543f853b` |
| Normal terminal | EXIT0, `2026-10-21T13:41:13Z` |
| Contracts | 1147 PASS |
| Control API | 8785 PASS, 0 FAIL, 3 SKIP; 437 files PASS, 2 SKIP |
| Other normal gates | TypeScript build, canonical migrations and unchanged scoped PostgreSQL restore/four access digests PASS |
| Normal log SHA256 | `b2c0030cfb73173c2fa268bc461c82420e7518cf9645bc72c91886d7d656fc6f` |
| Normal terminal SHA256 | `4ff7861268b1b90382248f058475670977716fb9c55767e2848aa80384220883` |
| Candidate image tag | `local/elp210-core009-candidate:9d88e40a963f` |
| Local image ID | `sha256:05ae2af5e1f6b04b11fd612e752d2120831b3e3f80ad7b0290a74740ec1b5dfd` |
| Image build terminal | EXIT0, `2026-10-21T13:45:00Z`; IMAGE_BUILT_NOT_INSTALLED |
| Build ceiling | 3 CPU / 3 GiB, build-only; not a production budget |
| Build log SHA256 | `0eb4fb4ed6e17b3c05dd3b66d4e358e727eb3901ff3629e5ac0557df89c82a4d` |
| Image-input-tree receipt SHA256 | `eed50b29271f93f2fae2c06ba763d1e0b3879783fbbc759ead59adc6bd83f2fc` |
| Protected runtime before/after SHA256 | Both `f34d69433927fc463fc3cc16abbb97c7e96fedd51cb897d54e60d9d5e703fd2f` |

Private local receipt root, references only:
`/home/bobby/.local/state/portal-execution-elp210/20261021/pm-core009-normal-r4-1250/`.
Image receipt: `recovery-build/image-receipt.txt`; image continuation states
`runtime_install_authorized=false`, `recovery_dispatched=false`.
Local image ID is not a published registry digest or an HK-installed image.
It does not include the newer integrated Claude consumer tree.

## 2. Actual bounded changes and independently reusable evidence

The BUSY repair waits for the real `ClientRequest.close` before releasing
physical admission, and releases before resolving authenticated success.
No timeout, UNKNOWN, TLS or same-attempt assertion was relaxed. Seven exact
source/test/harness paths were independently reviewed and carried into the
integration lane as `a13eb157e58e0030db778a441ebfd8b1a1dceb51`, with its own
EDS12 refresh rather than copying older generated pins.

Focused migration bootstrap runs the existing canonical migration CLI only
before tests against the disposable focused DB. Default full-suite behavior,
post-test restore and four scoped-access signatures are unchanged. Actual
focused retake: 74/74 plus migration/restore PASS, EXIT0 at 12:49:23 UTC;
exact owned Node/PG/network/source-copy resources absent at 12:50:47 UTC.
Previous failures remain in the [integration checkpoint](CODEX_NO_LOSS_INTEGRATION_CHECKPOINT_2026-10-21.md),
not rewritten as successful attempts. Build context cleanup completed; retain
this exact candidate image for the approved recovery review, no shared prune.

## 3. Handoff now — independent of the final combined-source landing

PM owns `core009-followthrough-pm-1345` helper/provenance preparation. Do not
duplicate, execute or overwrite its SOURCE_ONLY work. Return the exact helper
and config/private-reference hashes for independent review. Core's combined
Claude/source landing qualification is separate from this genuine source/image
return; there is no need to withhold these ready pins while it runs.

Original custody only:

- Lease `785387ba-ef57-455d-a7ba-f92663baae60`.
- Attempt `07becd72-1e11-4ab9-8a96-d5fd7339f1a0`.
- Last known state: PM ISSUED / Core ADMITTED, no ENTER or genuine Core ACK.
- Use official lookup/cancel-unentered on that original identity, then real
  source-terminal/Core ACK and official grant/session cleanup; do not issue a
  replacement to manufacture completion.

At 13:56 UTC PM confirmed only its own 14:00–15:30 UTC availability
(21:00–22:30 Vietnam). A matching Edge ACK, reviewed matching helper pins and
independent client-pause/quiescence ACK are still required. An availability
proposal is not a dispatch authorization. Latest Bobby direction remains
**no deploy**: no automatic service replacement follows this build return.

Installed Core remains the previous image
`sha256:9cf5fffac3e0bf55ea4b23c9df2b85565da556b973fbb1ce6928936f49a2950c`;
config `f3fe876df8c47acdf82da46a2046cc9878362614b47339ad888f67b9457863b9`,
schema SQL `826e4e083c8db536fc80a0f0ec272e3a71387a5e5d53a9cde48563f41fe32728`.
Before any approved operation, read back the exact full runtime/config/schema
and same-original state; this return must not be used as an installation receipt.

## 4. Separate open gates / next returns

1. Edge: acknowledge actual compatible recovery window and helper/acceptance
   pins, or return the concrete incompatible pin. Do not infer an ACK here.
2. PM/Core: reviewed original-key recovery, real terminal/Core ACK, official
   cleanup and independent pause/quiescence. Source/image-ready is not custody-ready.
3. Manager trust: public CSR/JWK/inactive manifest are requests, not an issued
   Research client certificate/chain. No READ-to-STREAM permission inheritance.
4. Financial publication/NET_PNL producer bridge, approved budget/calibration,
   coexistence/G2 and consumer/browser acceptance retain their own gates.

ELP2-10 remains open; ELP2-11 not entered. Return ready portions independently.
No secret value, cookie, token or private key is included in this packet.
