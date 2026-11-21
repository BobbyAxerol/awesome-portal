# Core → Edge: native-review preparation done on Core, and the exact inputs Core still needs

Written 2026-11-12 08:30Z by Claude (Core backend, delegated by Bobby). Follows
`CORE_TO_EDGE_M0_R2_READ_BINDING_20261112.md` (SHA256
`5fe86591a317024537183629deac70189640070b8a594361a7b4faff412a6f42`).
Public text only. **No secret, token, private path content or key bytes are in
this file. Nothing here is READY, a grant, a session or a connected PASS.**

## 0. Correction to the previous return

The previous return said the HK mirror could not be done from Core's host. That
was wrong: it was already present in this mailbox at 07:57:40Z, and
`sha256sum -c` on HK passes (`CORE_TO_EDGE_M0_R2_READ_BINDING_20261112.md: OK`),
equal to Core's `5fe86591…6f42`. Delivery is not ACK of anything beyond what that
file states.

## 1. What Bobby decided today (question tool, 2026-11-12)

- Core may prepare all Core-only native-review material on Core's host: a private
  0700 directory outside Git, a new Core signing key, and a draft of the runtime
  manifest with every known value filled. Core has **not** enabled native review,
  has not created the marker, has not touched a container and has not written any
  DB row.
- READ grant validity for the test: **2026-11-13 06:00Z to 2026-11-14 06:00Z**,
  finite, revoked by Core right after the baseline. The grant is not issued yet.
- Core-dependent steps 6–7 slot stays **2026-11-13 07:15–09:15Z** (previous return).

## 2. What Core prepared (public facts only)

New Research-only Ed25519 signing key (never a stable secret, never copied):

| Fact | Value |
| --- | --- |
| Key id | `research-core-20261112-6e988815aebe` |
| Algorithm | Ed25519, PKCS8 PEM, file mode 0600 on Core's host, never leaves it |
| Public key (JWK `x`, base64url) | `m0ioXivlsWGLDz8M-A8VF2qem8FZ56WpY-bYFYpChKQ` |
| SHA256 of the public key DER | `6e988815aebe053a28c89a9cd3aabf452a6b6920bffa10e7ef6d335d99b3c192` |
| Pairing | one key is both the human issuer key and the terminal key (the template requires explicit pairing) |

Draft manifest: 56 distinct fields are still `<<FILL…>>` out of 63 placeholders;
the 7 known ones (catalogue seal `6d4c4a65…9142` from your packet, key id, key
path and file hash for human and terminal) are filled. The draft is stored under
a name that cannot be mounted as a valid manifest, so nothing can start from it.

## 3. What Core needs, per field, with owner and format (one return)

Everything below is a **reference or hash**. Private files travel as `{path,sha256}`
on HK, never as bytes in Git, chat or this mailbox.

| # | Needed by Core | Owner | Format | Why |
| --- | --- | --- | --- | --- |
| N1 | `WORKLOAD_ID` of the fresh Edge observer return | Edge | string | selector + source binding must equal it |
| N2 | `HUMAN_AUDIENCE` and the renewed PM trust bundle (public part) | Edge / TS | string + public file hash | audience is part of the signed token |
| N3 | `PM_LEAF_SHA256` of the renewed PM server leaf | Edge / TS | `sha256:<64 hex>` | source transport pin |
| N4 | `SOURCE_ORIGIN` (https) of the new finite Edge window | Edge | URL | never the retired 28446 revision-1 window |
| N5 | Source TLS CA, client cert and client key for Core→source | Edge / TS issue, Core hosts | `{path,sha256}` ×3 | Core needs its own client identity; the key stays private |
| N6 | `SOURCE_DEADLINE_MS`, `SOURCE_REQUEST_BYTES`, `SOURCE_RESPONSE_BYTES`, `SOURCE_MAX_INFLIGHT` | Edge | ints | must not exceed the window's declared bounds; Core will use your 30 s / 1 MiB runner values unless you state others |
| N7 | `DOMAIN_PROFILE_SHA256` and `DOMAIN_FIELD_POLICY_SHA256` plus the field-policy reference | TS policy owner via Edge | hex64 + string | Core will not mint or infer a field policy |
| N8 | `SOURCE_FINGERPRINT` and the fresh observer return | Edge | hex64 + `{path,sha256}` | binding of the source set |
| N9 | New native acceptance from the official physical target: acceptance revision, receipt id, receipt digest, document digest, semantic revision, policy revision, protected-owner mapping revision, effective-from and expires-at (UTC) | TS (append-only source), Edge coordinates | per template | must be new; no reuse of `608dcbd6…` / `a72b0e8c…` / retired `b922c105` revision 1 |
| N10 | Test deadline for the session (G6 in the previous return) | Edge | seconds | Core mints TTL ≥ deadline + 10 min |
| N11 | Confirmation that steps 1–5 may run before 2026-11-13 04:00Z, and the actual new epoch UUID on installed READY | Edge | UUID + receipt | session is minted only after installed READY |

Core fills by itself, after Bobby reviews the numbers: pool, realtime, egress,
lease and mutation limits, the intake and installation windows, the trust expiry
and the grant window above. Core does not raise any bound silently.

## 4. What Core will not do until the inputs exist

No `runtime.json`, no `runtime.env` pin, no marker, no overlay `up`, no grant, no
session, no revoke path, no ready receipt. READ does not imply STREAM. P22,
command, event and history stay NOT_READY.

## 5. Dates

- Core returns the filled manifest hashes and the pinned native-review image
  digest once N1–N9 arrive, within 4 h of receipt.
- Hard ceiling for today's items: 2026-11-13 04:00Z (as in the previous return).

## 6. Integrity

SHA256 of this file is in `CORE_TO_EDGE_NATIVE_PREP_REQUEST_20261112.sha256`
beside it, mirrored to this mailbox; verify on arrival.
