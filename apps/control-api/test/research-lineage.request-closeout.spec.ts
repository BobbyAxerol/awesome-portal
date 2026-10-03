import { describe, expect, it } from "vitest";
import { attempt, digest, resetClock, scope, snapshot, subject, version } from "./research-lineage.builders";

function census(total: number, before?: number) {
  return {
    total_attempts: total, draft_attempts: 0, submitted_attempts: total,
    failed_attempts: 0, abandoned_attempts: 0, child_runs: 0, technical_retries: 8,
    ...(before === undefined ? {} : { attempts_before_boundary: before }),
  };
}

describe("BR-F3-03 canonical logical-attempt presentation", () => {
  it("uses the complete Alpha prefix, not page position or worker ordinal", async () => {
    resetClock();
    const older = [attempt("ratt-history-2", { technical_retry_count: 8 }), attempt("ratt-history-3")];
    const newer = [attempt("ratt-history-4"), attempt("ratt-history-5")];
    const current = await subject(snapshot({ attempts: newer, counts: census(5, 5), hasMore: true }))
      .service.read(scope, "alpha-p19", { limit: 2 });
    expect(current.attempts.map(row => row.display_label)).toEqual(["att_04", "att_05"]);
    const page = await subject(snapshot({ attempts: older, counts: census(5, 3), window: "OLDER_PAGE", hasMore: true }))
      .service.read(scope, "alpha-p19", { limit: 2 });
    expect(page.attempts.map(row => row.display_label)).toEqual(["att_02", "att_03"]);
    expect(page.attempts[0]?.primary_run.technical_retry_count).toBe(8);
    expect(page.attempts[0]?.display_label_basis).toBe("PRESENTATION_ONLY_WORKSPACE_ALPHA_CREATED_AT_ID_V1");
    const differentLimit = await subject(snapshot({ attempts: [older[1]!], counts: census(5, 3), window: "OLDER_PAGE" }))
      .service.read(scope, "alpha-p19", { limit: 1 });
    expect(differentLimit.attempts[0]?.display_label).toBe("att_03");
  });

  it("publishes typed absence if an older-page source cannot supply its full prefix", async () => {
    const body = await subject(snapshot({ counts: census(5), window: "OLDER_PAGE" }))
      .service.read(scope, "alpha-p19", { limit: 1 });
    expect(body.attempts[0]?.display_label).toBeNull();
    expect(body.attempts[0]?.display_label_availability).toEqual({
      state: "NOT_PUBLISHED", reason_code: "P19_LOGICAL_ATTEMPT_HISTORY_PREFIX_NOT_PUBLISHED",
    });
  });

  it("refuses an incompatible prefix and includes presentation facts in the ETag", async () => {
    await expect(subject(snapshot({ counts: census(5, 0) })).service.read(scope, "alpha-p19", { limit: 1 }))
      .rejects.toMatchObject({ code: "RESEARCH_LINEAGE_UNAVAILABLE" });
    const first = await subject(snapshot({ counts: census(5, 5) })).service.read(scope, "alpha-p19", { limit: 1 });
    const second = await subject(snapshot({ counts: census(5, 4) })).service.read(scope, "alpha-p19", { limit: 1 });
    expect(first.etag).not.toBe(second.etag);
  });
});

describe("BR-S11-01 exact P19 promotion receipt", () => {
  function source(receipt: Record<string, unknown> = {}) {
    return snapshot({ versions: [version("av-p19-1", "ACTIVE", {
      promotion_attempt_id: "ratt-picked", promotion_run_id: "rrun_picked",
      promotion_source_contract_rev: "research.p22-promotion-pick.v1", promotion_source_digest: digest("9"),
      promotion_source_as_of: new Date("2026-09-22T00:06:00.000Z"),
      promotion_receipt_count: 1, promotion_selected_trial_id: "t_214748", promotion_selected_params_digest: digest("8"),
      promotion_approval_id: "apr_p19_exact", ...receipt,
    })] });
  }
  it("links only the exact approval and never interprets a global trial id as a fold", async () => {
    const body = await subject(source()).service.read(scope, "alpha-p19", { limit: 1 });
    const pick = body.alpha.versions[0]!.promotion_pick;
    expect(pick.approval_href).toBe("/governance/approvals/apr_p19_exact/r1");
    expect(pick.approval_availability?.state).toBe("AVAILABLE");
    expect(pick.selected_trial_id).toBe("t_214748");
    expect(pick.fold).toBeNull();
    expect(pick.fold_availability).toEqual({ state: "NOT_PUBLISHED", reason_code: "P19_P22_SELECTED_FOLD_NOT_PUBLISHED" });
  });
  it.each([
    { promotion_receipt_count: 0 }, { promotion_receipt_count: 2 },
    { promotion_approval_id: null }, { promotion_approval_id: "../other?token=secret" },
  ])("keeps missing, ambiguous or unsafe approval facts typed: %j", async (row) => {
    const body = await subject(source(row)).service.read(scope, "alpha-p19", { limit: 1 });
    expect(body.alpha.versions[0]!.promotion_pick.approval_href).toBeNull();
    expect(body.alpha.versions[0]!.promotion_pick.approval_availability?.state).toBe("NOT_PUBLISHED");
  });
  it("includes the exact approval href in lineage revision without changing immutable ids/digests", async () => {
    const first = await subject(source()).service.read(scope, "alpha-p19", { limit: 1 });
    const second = await subject(source({ promotion_approval_id: null })).service.read(scope, "alpha-p19", { limit: 1 });
    expect(first.etag).not.toBe(second.etag);
    expect(first.alpha.versions[0]!.promotion_pick.source_digest).toBe(second.alpha.versions[0]!.promotion_pick.source_digest);
    expect(first.alpha.versions[0]!.promotion_pick.run_id).toBe(second.alpha.versions[0]!.promotion_pick.run_id);
  });
});
