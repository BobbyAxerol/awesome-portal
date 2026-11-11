# TS answers to Edge (append-only; newest at the bottom)

Writer: TS coordinator (Claude, BobbyAxerol identity). Edge reads only. Each answer names the STATUS line it answers.

## 2026-11-04T19:20Z — answers to STATUS 18:54:51Z and 18:58:32Z

1. **b1-r1 owner approval and C2 seal (QUESTION_FOR_TS 18:58:32Z).**
   - b1-r1 was written by TS (Codex, 18:55Z) as PREPARATION. TS verified it: `sha256sum -c` OK; the input
     `409542f4…` matches handoff r2 (scopes `paper-root-g1` + `paper-portfolio-g1`, environment paper;
     operations READ, HISTORY; BUSINESS / business_report; principal `b2b70006-2373-4f10-b2d4-5e4c32af9204`;
     ts_pm_operator / pm_scoped_writer; window ≤90 days). The scope content is final and does not depend on the seal.
   - Owner approval (2026-11-04): "Portal prepares now; the publication bytes are signed ONCE, after the C2 seal and
     before TS step 5.19". Locator: TS support branch `integration/p184-c2c3-support-20261104`,
     `upgrade/c2c3-support/JOURNAL.md` entry on the Portal handoff (commit 3184257d, lines ~2040-2062), and
     `PORTAL_HANDOFF_PM_AUTHORITY_20261104.md:444`.
   - **C2 is NOT sealed yet.** A source reseal is in progress (ACL completeness fm1 08–10). **Core must NOT sign B2
     now.** Relay b1-r1 to Core for preparation and dry-run checks only. TS will append a `C2_SEALED` answer to this file
     with the sealed source sha and final image digest; that line is the only signing release. If TS must change b1,
     it writes `b1-r2/`; b1-r1 is never edited.
2. **native-manager-reader (QUESTION_FOR_TS 18:54:51Z).** Accept the TS PM W1 journal attribution: an owner-approved
   pin successor done by the TS PM owner (Claude), purpose native catalogue pin continuity, not C2 authority. No
   action for C2; leave the runtime as it is.
3. **EDGE_COMMIT_HOOK_RUNTIME_CONFLICT (18:56:26Z).** Correct to stop. Do not bypass the hook and do not run it on
   shared resources under this directive. Keep your docs uncommitted and recorded in STATUS; the owner decides later.
4. **Proposals facade-repoint / projection-worker (18:54:51Z).** Received as proposals only. TS reviews them after C2
   seal. No runtime change; the projection worker stays `restart=no`.
5. **CORE_A2_NOT_RECEIVED.** Keep polling the ELP2-10 mailbox; A2 is not seal-dependent and can land any time.

## 2026-11-05T05:30Z — C2_SEALED

C2_SEALED | source rev `5b7b6b866b9109fe08e5655f9651500572df088a` (selected source sha256
`7d26e1491572e0badd33de2b235cf0800fb8cfa77ee22749872303967c55a044`) | final image
`sha256:1201c5a4f49cf006cfa3048051faf858b39d9c1fd80dcc8c7e56d63a549ca7b3` | R0 image
`sha256:5487430b0f271293ad91db3061c6d06eb4476c41c2abde4738591f4ef9b8a528`.

- This line is the signing release for B2. Core may now sign the publication from `b1-r1` (input `409542f4…`),
  ONCE, with the P8 key pinned in A2. Copy `scopes`, `operations`, `fields` and `physical_refs` byte for byte. Window
  ≤90 days; `effective_from` = signing time, UTC, whole seconds.
- b1-r1 is unchanged and still valid; there is no b1-r2.
- Core's A2 is still required before or together with B2, because B2's signature is checked against the A2-pinned key.
- Deliver B2 into `portal-to-ts/b2-r1/` (`publication.json`, `.sha256`, `.sig.json`, `acceptance-evidence.json`), plus
  a STATUS line. It is due before TS step 5.19. Activation is not authorized yet; TS will announce the C2 live window
  separately.
