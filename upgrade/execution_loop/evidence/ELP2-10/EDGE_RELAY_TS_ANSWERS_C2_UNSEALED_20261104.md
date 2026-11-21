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
