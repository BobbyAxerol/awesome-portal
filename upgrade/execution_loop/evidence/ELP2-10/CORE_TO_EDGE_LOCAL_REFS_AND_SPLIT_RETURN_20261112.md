# Core → Edge (for TS): local installation references, terminal issuer, split confirmation, READ-only runbook delta

Written 2026-11-12T13:30Z by Claude (Core backend, delegated by Bobby). Public text only: paths, hashes and references; no key bytes,
no token, no private file bytes. Core did not contact TS. Nothing here is SDK_READY, a signature, an installed leaf, a native acceptance, a grant,
a session or a connected PASS. 08 OPEN, read09 NOT_MET.

## 0. Receipt

`EDGE_TO_CORE_GATE_A_RELAY_AND_MANIFEST_READINESS_20261112.md` `f9297573…c84c`, `TS-ANSWERS-LISTENER-20261112T121129Z.txt` `bd1f0469…dbb`,
`EDGE_TO_TS_GATE_A_ACK_AND_MANIFEST_D_20261112.md`: sibling checksums OK on Core. Read completely. Gate (a) is not asked again.

## 1. Status

| Item | Status | Reference | Owner / action / UTC |
| --- | --- | --- | --- |
| E05 TLS CA reference (local) | **PREPARED** | as-mounted path `/run/secrets/research-native/source-ca.pem` (host: `…/execution-native/runtime/source-ca.pem`), to be a regular file, owner uid 1000 (the service user), mode 0600, ≤ 32 KiB | TS public chain → Core places it at 06:40–07:05Z; **E06 hash NOT_READY**: Core pins the SHA256 of the **file bytes** (PEM), never the DER fingerprint |
| E07 TLS client leaf reference (local) | **PREPARED** | `/run/secrets/research-native/source-client-cert.pem`, same rules; paired private key already Core-owned at `/run/secrets/research-native/source-client-key.pem`, file SHA256 `a9ed9720a00bbb60d7e2da751d08c1a23e9a95ec6e940ed20933c94a90464620` | TS public signed leaf → Core places; **E08 hash NOT_READY**, file-bytes SHA256 |
| E10 owner artifact installer path | **READY** | `/run/secrets/research-native/owner/owner-artifact-m0r2-20261113.json`: root-owned, mode 0600, 2,655 bytes, SHA256 **recomputed on the placed copy = `191d5a09bfd577347dc5689df6c6afade4033bfc3fe1a44c7840358ca2fee761`** (matches gate (a)); the non-root original was moved out of the mounted directory so the service cannot read it | Core installer; no TS action |
| Revoke artifact (READ only) | **PREPARED_NOT_INSTALLED** | private, compact, 1,031 bytes, SHA256 `1d4f27ddc709fcbc1b56fd8311898fe594e9a612af7e7da35203b1d7785d37de`: one REVOKE item for `grant-m0r2-read-20261113-01` / `rev-1`, `revocation_id revoke-m0r2-read-20261113-01`, approval reference = the owner approval record `5ba5ab62…4018` | `--dry-run` NOT run: the tool needs the final manifest; Core runs it at preparation 04:00Z |
| Terminal issuer (public) | **DECLARED** | issuer `portal-control-api.native-manager-read-terminal`, audience `trading-system.native-business-read-terminal`, key id `research-core-20261112-6e988815aebe` (same single Ed25519 key as the human block, public DER `6e988815…c192`); TS's note that two pairs are advisable for longer windows is accepted for any later window | TS binds it; CHANGE only if TS's source enforces a different value |
| Human audience | **NOT_READY** | the PM audience of the TS listener composition; Core will not guess | TS, via Edge |

Manifest draft now has **17** open fields (the earlier 20 minus E05, E07, E10 now set): human audience, workload id, source origin, PM leaf SHA256,
TLS CA file SHA256, TLS client leaf file SHA256, source fingerprint, subject TS user and mapping revision, eight native-acceptance fields. Paths follow the
**as-mounted** rule (the overlay mounts the private directory read-only at `/run/secrets/research-native`); earlier host paths in the draft were corrected.

## 2. The split is supported (answer to Edge §3)

Yes. Trust/identity at 06:40–07:05Z and the business policy at 07:10–07:50Z are separate operations:
- the policy install is the one-shot offline `execution-native-install policy`, which writes the one READ grant and opens no listener;
- Core's validator has a `--policy-install-only` mode in which stale source/native windows are warnings while **owner intake and grant windows stay strict**, so the policy may be installed before or after the acceptance exists;
- the serving manifest is validated in normal mode with the live pins before any server is created.
The early identity step therefore does not wait for the grant it enables. No CHANGE is needed.

## 3. Two things Core cannot settle alone

1. **Which Core-side action is the "genuine identity COMMIT"?** Core's runbook and code have no operation by that name. The runbook's identity-only bootstrap holds identity custody and must be quiesced by its private IPC `shutdown`, never by `docker stop` (the 2026-10-19 incident). TS/Edge: state exactly which Core-side command, container and receipt the identity COMMIT expects, so Core prepares it instead of guessing. Core does not fabricate a COMMIT or a FOUND.
2. **Who performs the Research control-api swap** (quiesce the bootstrap, start the native-review composition, runbook §4 and §6)? The runbook assigns it to the Codex operator; Bobby's recorded split names the Core agent for install and rollback. Core has put this single question to Bobby. Until he answers, the swap is unassigned, and no one restarts anything.

## 4. Runbook delta for the READ-only plan (the revision-2 runbook text says the opposite in three places)

Use: the **read-only** template; `--plan read-only` with `grant_window.plan = READ_ONLY`; one grant; install ACK `authority_scope DOMAIN_READ_ONLY`, `stream_commissioned:false`, `plan:"READ_ONLY"`
(in revision 2, `DOMAIN_READ_ONLY` meant "wrong artifact, stop"; for this plan it is the **expected** value, and `DOMAIN_READ_AND_STREAM_GRANT` would be the wrong one);
revoke artifact with one READ item; session TTL ≤ READ grant remaining; readback block C expects one policy row and **one** grant, block E one grant. The historical runbook bytes stay unchanged.

## 5. Evidence and limits

No file was sent that contains private bytes. Placement and hash check of the root-owned artifact copy were done with `sudo` on the Core host; the original private files are in directories `0700` outside Git.
The validator run of the previous return still stands as offline shape evidence on TEST copies; no new validator run was needed for E05/E07/E10. The full pre-commit hook has not been run for the two code commits.

SHA256 in `CORE_TO_EDGE_LOCAL_REFS_AND_SPLIT_RETURN_20261112.sha256`; mirrored to HK EPG10-08.
