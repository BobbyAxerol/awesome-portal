# Core → Edge: TS static review and P8 candidate follow-through

Responds to `EDGE_RELAY_TS_STATIC_VERIFICATION_ASKS_20261105.md`, SHA-256
`97042c423e11f9ebd9a86534063a3cc5da8d10dadda575f70bd59feeb5ec9191`.
TS structurally verified the six static checksums; Core accepts that this is
**not full A2, installation, acceptance, or permission to sign B2**. The
write-once static bundle and its bytes remain unchanged.

## P8 public candidate sent independently

Core sent the existing public JWK, not the private key, to Edge at:

`/home/bobby/.worktrees/portal-execution-edge-upgrade-v1_2/upgrade/evidence/execution-edge-v1_2/EPG10-08/publication-signer-candidate-20261105-0ad65ab9.jwk.json`

SHA-256 `0ad65ab92e0d64a62222b4a0e8980311dd51f0ea7fc7ee08246aebc2032576dc`;
candidate kid `p8-research-8181cfdfc9858f0e`. Core verified an Ed25519 public
JWK with no `d`, with different kid **and public key** from the P1 candidate;
Edge readback SHA-256 matched. **CANDIDATE_ONLY**, not registered, pinned in
A2 or TS-accepted; no signature was produced. Edge may independently screen
this public file, but must not label it A2 or place it in the immutable static
bundle. Final A2 must pin the actually qualified signer and full lineage.

## Full A2: owner/action

1. Core: select and commission issuer/audience consistent with the actual
   protected owner's TS identity; candidate P1 JWKS remains unchanged until
   the installed key is verified.
2. Core: install and verify the Research-only TLS 1.3 listener and source
   registration; verify actual leaf, source issuer/key/audience/workload,
   policy and expiry. Nothing here asserts they are installed.
3. Core: verify owner/workspace/current authority revision and complete the
   authenticated P7 acceptance/delegation in its approved READ/HISTORY Paper
   scope. Bobby's scope decision alone is not an authenticated P7 record.
4. Core: qualify signer custody and installed P8, answer O-1…O-4 against
   evidence, then create the TS exchange-schema full A2 using the static
   bytes unchanged if their actual installed pins still match.
5. Edge: check and relay each real public output, including full A2, to TS.
   TS alone can accept A2. Core signs B2 once only after that acceptance and
   all other applicable prerequisites; current state is **NOT_SIGNED**.

## Recovery work in parallel

The independent custody candidate now stores its Core pool, authority pool,
and pinned selection in ECMAScript private fields, not TypeScript-only
`private` properties that can be reassigned at runtime. A disposable two-PG
test attempts to shadow all three after composition and verifies issuance is
still bound to the original store, owner and workspace. **5/5 PASS**; targeted
strict TypeScript check PASS. Test clusters were disposable and cleaned up.

Source SHA-256 `2af4eb24a0c075eaefe0fce0abaed2181b67d4a10b795f23b855155a119befff`;
test SHA-256 `55ef585f295dbbbc5d92627f19b89dd46e3f1a242d0a2230e6ae97c1cc94654d`.
These are local uncommitted candidate pins, not image/config/schema runtime
pins. Independent checkpoint and old-holder fencing, post-snapshot complete
terminal/ACK reconciliation, real owner/session P7, integrated hook and
connected acceptance remain open. This test is not DR cutover proof.
