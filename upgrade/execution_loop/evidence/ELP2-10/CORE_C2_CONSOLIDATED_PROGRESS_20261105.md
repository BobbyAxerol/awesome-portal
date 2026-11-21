# Core C2: consolidated independent progress — 5 November 2026

Input: `EDGE_TO_CORE_C2_COMPLETE_DELIVERY_REQUEST_20261105.md`, SHA256
`d8286389ac5cb3e5843df7374d8cc3904590732c528bf721255a3e1ffeda9c9b`.
Base `docs/research-loop-plan@2faa8968fddbde59b2e59525e334ba3d83886144`;
code/test additions below are **UNCOMMITTED and unmounted**, not a source SHA
of an installed server. Prior worktree modifications and Edge WIP were kept.

## A2/B2 per item

| Item | Status | Core owner / exact evidence and remaining action |
| --- | --- | --- |
| P1/P2 | NOT_READY | Core: implement/mount per-request C2 composition with a verified actor and exact trusted request bytes. Source `CurrentHumanCandidate.issue` exists but no current deployed C2 issuer, real request-digest provenance or JWKS is proven. Current preview has no C2 selector. |
| P3/P4 | NOT_READY | Core: commission TLS1.3 server and actual source registration, verify server DER pin and sign TS CSR under current approved Research CA. A1 CSR verifies and uses P-256; source-proof signing key is separate Ed25519. Existing candidate-only trust loader requires Ed25519 TLS and <=24h, so it must not be repurposed. Existing independent ephemeral P-256 mTLS transport test: 19/19, not installed-wire evidence. |
| P5/P6 | NOT_READY | Core: verify current Portal issuer/subject, matching authorized Paper workspace and workload refs. The active Portal owner has an external binding and workspace membership, but at the read-only observation no unexpired active owner session was found. The TS UUID is not the Portal user UUID; that is not by itself a conflict because TS binds its UUID to the Portal issuer/subject. Do not alter either identity to make them equal. |
| P7 | NOT_READY | Core authority owner: establish and verify actual accepted/delegated record, exact scope and immutable digests. Existing generic membership receipts are different and cannot be relabelled P7. |
| P8 | NOT_READY | Core signer owner: provision and verify a dedicated publication signing key/authority and public JWK independently of issuer, and pin it in genuine A2. No current signer authority is evidenced. No private key is published. |
| O-1/O-4 | NOT_READY | Core: C2-specific request provenance, installed image/source/config/schema/route pins and live verification remain unproven. Existing Financial and STATUS compositions are restricted to their own routes and cannot be relabelled a general C2 issuer. |
| O-2 | SOURCE_ONLY | Current authority revision is global and can advance on another user. TS has the P5 decision via Edge; until a revised contract accepts it, no agreement is claimed. Renewal procedure below. |
| O-3 | NOT_READY | Core: actual accepting person/service and authorized P8 signer have not been verified. |
| B1 | INTEGRITY_READY_NOT_AUTHORIZED | A1 5/5 and B1 2/2 checksum validation plus CSR self-signature passed. A bounded source-only B1 verifier rejects digest tampering, duplicate JSON keys, invalid UTF-8, non-Paper principal, bad shape and unsafe data. Real public B1 is validated against independent SHA256 `409542f42012120f994f32600c7632ca3a13cfce8210c685218956a753de31fd`; **this is not approval, signing or publication**. |
| B2 | NOT_READY / UNSIGNED | Core: P7/P8 and genuine A2 acceptance are missing; TS must relay explicit `C2_SEALED` and owner approval via Edge. A one-hour delivery commitment cannot be supported yet. Keep exact B1 scope and operation inputs; no new command/Live or signature. |

`c2-b1-preflight.ts` source SHA256
`8a0fc123ce68c61fac0a1faf286f1efe0762f69e81ef9e17edfacf820dd205cf`;
`c2-b1-preflight.spec.ts` SHA256
`6b1e1c3c3b339af01997dc5b82d8d03370f814cc048615fc76137ea6bce688ac`.
Focused B1 8/8 including supplied public bytes; inventory 9/9; strict focused
TypeScript PASS. `elp210-current-human-transport.spec.ts` 19/19 on local
loopback with synthetic certificate/authority. Initial sandbox attempt failed
18 socket cases with `EPERM`; a separately authorized loopback retake passed.

## Global-revision renewal — proposal, not TS acceptance

On revision mismatch or uncertainty, stop new issue/ENTER and leave existing
UNKNOWN custody intact; still permit only authenticated same-original terminal
settlement under the owner's decision. Re-read the current revision, the real
owner/session/workspace, application and full approved delegation/fields from
their authorities; never infer unchanged rights from an old hash. Revalidate
the exact TS-approved B1 and scope/operations without widening. Obtain the
required source owner approval/new publication generation through Edge;
prepare and sign once only under the currently pinned signer and required seal,
then have TS import/confirm that exact revision through Edge. Resume affected
issuance only after both source and Core agree on the new binding and current
authority. A changed unrelated user may therefore cause a safe availability
outage; it is not evidence of owner-scoped revisions. This is a proposed
procedure until Edge relays explicit TS acceptance and the installed protocol.

## Recovery and remaining provenance

See `CORE_V2_RESTORE_INVENTORY_20261105.md`: the latest inventory refuses a
role whose RLS can hide rows; actual PostgreSQL 2/2 and synthetic restore 1/1
pass in disposable locked cells. It is *only* a diagnostic, not an independent
checkpoint, old-holder fence, trusted late terminal/ACK readback, or permission
to cut over. Preserve the legacy V2 DR refusal. Edge/TS still own actual source
checkpoint/generation, authenticated same-original terminal and ACK readback,
and fence contract. Core continues independent quiescence/reconciliation work.

No frontend field or component changed. Claude can continue fixture/UI work;
connected browser acceptance remains pending qualified APIs. No runtime,
production, stable/dev/main, command/Live, remote push or B2 signing was done.
Final normal hook, integration and commissioning remain NOT_RUN; no phase is
marked complete. Next status checkpoint requested by Edge is **05:15 UTC**,
not an A2 delivery deadline or a background task guarantee.
