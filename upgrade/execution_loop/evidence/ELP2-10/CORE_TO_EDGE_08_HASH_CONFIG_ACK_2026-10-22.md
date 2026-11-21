# Core → Edge08 — exact PREPARED hash/config ACK

22 October 2026, 12:13 Asia/Saigon (05:13 UTC).
**ACK_MATCHED / SDK_READY_PENDING / CURRENT_READ_NOT_ISSUED.**
Existing approved C7/EPG10-08 Research-only commissioning; not a new phase,
production permission, source installation receipt or connected PASS.

## 1. Exact source reply accepted

Core received the complete [Edge PREPARED reply](EDGE_TO_CORE_08_BINDING_REPLY_2026-10-22.md),
raw SHA256 `b92e487466fc46848d19dd2452c05ffdadb14ba077881c8fe943b90a3258f229`.
Core directly rehashed the four HK prepared files and obtained exactly:

| Prepared artifact | Accepted raw SHA256 |
| --- | --- |
| `native-runtime.json` | `940a3a71e608d78ccc8671c21b633b152f4d5fd0b802e2e577764000840bc74b` |
| `read-acceptance.DRAFT.json` | `7daffe5f1e790cd6d88bfa1f3426460763d73cec4f22f83e09cf2f00c39542a6` |
| `read-revocation.DRAFT.json` | `8fdf944afeaf895baa027e41f46935e9d484dfee19b359e30c8db423fbb42f8e` |
| `human-jwks.json` | `36ddec45387e772387a5827f1fac6398672fbb36658e22ef1bd579ca80f451ed` |

Private HK directory is exactly
`/home/bobby/secure/edge-core009-prepared-20261022-JDChXXKN/`.
Accept acceptance `bc432e2e-1f59-403d-8d72-fecf9e983ab5`, install command
`1de53174-5d8a-46f1-b585-c3ebcb22d48d`/CAS0→1 and document
`f270f140d75471d7aa6e271400a9e6afe32a0da17667d9690463e60ee983855e`;
revoke `211c3ab5-a2bc-4646-8d59-d8d765f5e960`/CAS1→2 and document
`b6847b29455885d0e0f96e5391f0cd11f9dd57f863b61b560d31d7b07abef833`.
The semantic document digests are accepted from the pinned SDK validation
receipt, not substituted for raw file hashes or a not-yet-issued receipt.

**Window accepted: 22Oct13:00–13:30 Asia/Saigon, exactly
2026-10-22T06:00:00Z…2026-10-22T06:30:00Z.** Do not install before it or
silently extend/re-date it. A missed window needs a new explicit owner return.
This ACK arrives before the requested05:50UTC cutoff.

## 2. Trust, identity and source semantics accepted without widening

- Fresh native trust raw SHA256
  `12504f4444bfd2fa871c017b82641147dd1d666fe08eed58466413e473c45f52`
  matches Core's actual local bundle and the already-transferred8PM files.
  Validity ends23Oct03:00:58UTC; this covers the finite READ slot, not the
  longer maintenance document expiry. No TLS extension is inferred.
- PM workload `elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm`, human audience
  `urn:elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:pm` and Core kid
  `elp210-5e3a2ac0-23e9-4cb3-8ff6-e6820a3d5881:core` stay exact.
- Human/Portal subject `usr_5a38d5dfb08b44748f5776fbe04a1434`, workspace
  `ws_06G19F61YB8CFR7TEWMS7HQ660`, human mapping
  `ts-user:608dcbd6-e8df-4aa4-b0fc-bc0881d0aafd:1` remain unchanged.
  Protected source owner mapping is separately
  `ts-user:a72b0e8c-70f7-4795-aff3-6ae58619149d:1`; it is not the human map
  and must not replace it in the Core human selector.
- Accept the exact Paper catalogue/profile/field-policy and source fingerprint,
  SDK28ea3958, lifecycle1ee3a15d, source DB/system and admission25d2b3ef in
  the pinned reply. No command, capital, Live, other human/domain or stable
  grant follows. Transport remains TLS1.3/mTLS to10.70.0.2:28446.
- `source_set_ref` is explicitly stage-dependent. Its absence in PREPARED
  does not block this ACK. Actual SDK READY receipt/revision/document,
  effective interval and semantic/source pins must be returned before Core
  constructs a current source selection; no invented UUID, expired source
  receipt or unimplemented field is inserted into the closed SDK contract.

## 3. Actual Core target and config plan

Read-only direct observations in this round:

- Control API image
  `sha256:a96c754dfbd52801f6d451dfa329eeeb3ab37fe9e467db145e201c9fa9acf121`,
  serving UID1000, healthy/restart0, unchanged since21Oct19:02:12UTC.
- Selected runtime raw hash
  `f3fe876df8c47acdf82da46a2046cc9878362614b47339ad888f67b9457863b9`;
  private effective Compose
  `7be687b6cdf1fe9872f9960c4cdf4b855646609bffff5e3cbe3c344bfeb37dd1`.
  The old selection is expired/recovery-only, not silently current.
- Actual READ ONLY transaction: DB `portal_control`, role `portal`, system
  `7688673963308855330`; migrations143/schema149; overall retained9,
  unresolved0; native retained8/unreconciled0; pending mutations0.

On genuine SDK READY, Root prepares a NEW hash-pinned Research runtime with
the actual returned native/source pins, fresh Core TLS/signing references and
same exact selector/pool/target. Keep all original retained recovery entries,
policy/grant/audit/custody history and mutation fences. Use the installed
official successor CLI for finite current READ, then the official temporary
acceptance-session CLI; never seed SQL grants or send credential values.
Return actual new runtime/Compose/source/grant/session receipt hashes after
their verification, not before the READY-dependent config exists.

The first eligible READ remains bounded by existing C32/reserve20: census9
leaves at most3new admissions; recheck before each specimen. C288 is approved
only for the separate Research acceptance campaign and is not yet installed.
Do not run a full multi-request/SSE driver under32, purge history, or count a
client frame cap as a server producer bound. READ grants no STREAM. Full
STREAM/cache/control/P22/financial/Manager/load work does not hold this READ.

## 4. Edge action now and exact return

Record this file's actual raw hash as `CORE_WINDOW_ACK_SHA256`; arm only the
matched existing operator constant, reporting its resulting helper hash.
Preserve all four pinned prepared files. During the accepted slot, execute
the exact official install0→1; retain process/exit witness, then observe real
SDK READY and return the actual receipt/revision/document digest, source
fingerprint, effective_from/expiry and semantic observation digest. Until
then READY/current authority/session/CONNECTED_READ remain NOT_RUN.

Keep this in original08; no new ledger/phase or dependency on P22, independent
STREAM/control, Manager PKI, financial mapping or calibration. Root will use
the READY input immediately through the installed official lifecycle and
settle/revoke/logout originals with source-terminal/UNKNOWN fences intact.
An unknown result is recovered by the SAME intent/key, never fabricated or
retried as a new attempt. Preserve stable/dev/provider28445 and peer WIP/index.

This ACK itself changes no service, DB, grant, session or listener. R0
verification is diff/link/tracking and exact SSH/public hash delivery, not a
new test/connected qualification. Private trust/drafts remain inactive pending
the slot and retained for exact recovery; no broad cleanup or repeated build.
