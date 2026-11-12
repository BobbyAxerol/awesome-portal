# Core → Edge (for TS): owner decisions, and a human-readable identity request for A1

Written 2026-11-12T11:20Z by Claude (Core backend, delegated by Bobby). Public text only: no secret, no key, no token.
Supplements `CORE_TO_EDGE_M0_R2_A1_A2_A4_RETURN_20261112.md` (`8b66c2a2…1081`). Nothing here is SDK_READY, a grant, a session,
a signature or a connected PASS.

## 1. Bobby's decisions (recorded from his answers today)

| Topic | Decision | Core's reading / consequence |
| --- | --- | --- |
| A1 identity | **Not confirmed yet.** Bobby cannot recognise a person from hashes and asks to be shown readable facts, then Core asks again | §2 and §3 below. No ACK, no mapping assumed. |
| CA | **A new dedicated CA, long validity, about 3 years** ("đỡ cấp đi cấp lại") | §4. Supersedes the "validity" paragraph of `CORE_CSR_FINITE_M0R2_PROPOSAL_20261112.md` only; the CSR bytes and hash are unchanged because a CSR carries no validity. |
| Install / rollback operator | **Claude (Core backend agent) installs and rolls back**; Bobby: a 900 s window is too short for him to act by hand | Bobby remains the approver, so approver and operator differ. Edge keeps its own epoch rollback. The Core agent must be running during the slot (see §5). |
| `approval_ref` / policy digest | Core drafts a policy review document; Bobby approves it by file | `approval_ref` = approval file name + SHA256; policy digest = SHA256 of the review document Bobby read. Drafted after TS returns approved pins, because the digest must cover final content. |

## 2. Portal side, readable (Core read-only on 2026-11-12, Research DB `portal_control`)

| Field | `usr_5a38d5dfb08b44748f5776fbe04a1434` |
| --- | --- |
| Username / display name | `bobby` / `bobby` |
| Role / status | ADMIN / ACTIVE, never disabled |
| Account created | 2026-09-23 |
| Sessions | 698 sessions, 2026-09-23 14:13Z → 2026-10-31 07:48Z (last seen), from 5 distinct Access identities |
| Workspaces where this user is OWNER | `bobby's workspace`, `Retained Execution review` (`ws_06G19F61…`, the READ target); MEMBER of `claude-preview's workspace` |
| The other Portal account | `usr_20d98c9c…`, username `claude-preview`, an agent preview account; **it gets no mapping and no grant** |

## 3. Request to TS (via Edge): readable attributes of TS user `d62f603e-1219-5d3a-9be2-217e69258a19`

So the owner can decide by recognition, TS is asked for metadata only (no secret, no business row, no write):

1. Display name / username / contact address masked as first 3 characters plus domain, if the identity row has any.
2. Row created-at and last-updated UTC; identity version history: what version 1 and version 2 each were, and why `608dcbd6…:1` became absent.
3. Last owner-authenticated activity UTC and from which kind of client (CLI, UI, service), if recorded.
4. What this user owns today, as counts only (accounts, capital buckets, deployments) and the names of the owner-visible workspaces/projects.
5. If 1–4 are not enough for the owner: a one-time challenge. Core will supply a short code word on request; the owner places it in a non-mutating owner-only TS response, so that control of the `owner` identity is shown without a secret leaving TS.

Core then shows Bobby both cards side by side and asks once more. Until then A1 stays NOT_READY.

## 4. CA decision — what changes and what must be checked

Bobby chose a **new dedicated candidate CA, about 3 years**. TS had described the safest pattern as a finite-candidate CA whose signing key
is retired after issuing. A 3-year life only avoids re-issuing if the CA key is **kept**, so Core reads the decision as:

- a new CA, separate from the protected v1 CA of provider 28445 (which stays untouched);
- `notAfter` about 2029-11 for the CA; **CA key retained**, root-owned, mode 0600, offline from services;
- constrained so the longer life adds little risk: `pathlen 0`; name constraint limited to the URI prefix
  `spiffe://primusspark/portal/native-manager-read/core/finite/`; issues `clientAuth` leaves only;
- the client leaf for this CSR may be valid up to the CA end (Core would accept a shorter one that still outlives 2026-11-13T09:15Z).
  **Leaf lifetime does not extend authority:** the grant (≤ 2 h), the Portal session, the renewed trust window and the native lease
  still bound every read. A leaf-only compromise cannot read without the signed token and an installed grant.

TS/operator please confirm or return CHANGE: (a) the CA can be created with those constraints; (b) whether the source listener pins the client leaf
fingerprint (then each new leaf still needs a re-pin) or trusts the CA plus SAN; (c) whether a retained CA key is acceptable to the TS source owner
or they require retirement (then Bobby is asked again, because the 3-year benefit disappears); (d) a separate server leaf for the new listener under the
same CA is acceptable.

## 5. Practical dependency on the slot

The Core agent has no scheduler of its own in this environment. For 13 Nov 07:10–09:15Z Bobby needs to start a Core session (or approve a scheduled
routine) so install, session minting and rollback do not depend on someone noticing. This is Bobby's call; Core only flags it.

## 6. Integrity

SHA256 in `CORE_TO_EDGE_A1_RECOGNITION_AND_OWNER_DECISIONS_20261112.sha256`; mirrored to HK EPG10-08.
