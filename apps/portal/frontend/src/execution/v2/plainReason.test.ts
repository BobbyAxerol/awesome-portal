/**
 * UI review F1 / D12: machine codes leave the sentence and stay available (codes[]).
 */
import { describe, expect, it } from "vitest";

import { hasMachineCode, plainReason } from "./plainReason";

describe("plainReason", () => {
  it("drops a parenthesised code and keeps it", () => {
    const hit = plainReason("The Manager dataset could not be read (MANAGER_DATASET_REFUSED).");
    expect(hit.text).toBe("The Manager dataset could not be read. Try again in a moment; if it keeps failing, tell the Portal owner.");
    expect(hit.codes).toEqual(["MANAGER_DATASET_REFUSED"]);
  });
  it("keeps the server's own words of `(CODE: words)` and drops the code", () => {
    const hit = plainReason("No incident with the id inc_9 is visible in this workspace (OPERATIONAL_READ_NOT_FOUND: The incident was not found.). Check the id; nothing is shown in its place.");
    expect(hit.text).not.toMatch(/OPERATIONAL_READ_NOT_FOUND/);
    expect(hit.text).toContain("No incident with the id inc_9 is visible in this workspace (The incident was not found).");
    expect(hit.codes).toEqual(["OPERATIONAL_READ_NOT_FOUND"]);
  });
  it("a code followed by a comma and detail keeps the detail", () => {
    expect(plainReason("The account roster could not be read (ROSTER_MALFORMED, row 51, user_id (repeated)).").text).toBe("The account roster could not be read (row 51, user_id (repeated)).");
  });
  it("drops a `CODE:` prefix", () => {
    expect(plainReason("ACCOUNT_NOT_FOUND: no account Binance-02").text).toBe("No account Binance-02. Check the id or go back to the list.");
  });
  it("rewrites the lock sentence", () => {
    const hit = plainReason('lock="REQUEST_ALREADY_DECIDED" treated as NOT_ELIGIBLE');
    expect(hit.text).not.toMatch(/[A-Z]{3,}_[A-Z]/);
    expect(hit.text).toContain("shown as not eligible");
    expect(hit.codes).toEqual(["REQUEST_ALREADY_DECIDED", "NOT_ELIGIBLE"]);
  });
  it("a bare unknown code reads as its words; an upper-case id is left alone", () => {
    expect(plainReason("Source is SOURCE_GAP now").text).toBe("Source is source gap now");
    expect(plainReason("Deployment DEP_CANARY_01 is paused").text).toBe("Deployment DEP_CANARY_01 is paused");
    expect(plainReason("Nothing to say.").codes).toEqual([]);
  });
  it("hasMachineCode", () => {
    expect(hasMachineCode("x (A_B)")).toBe(true);
    expect(hasMachineCode("plain words")).toBe(false);
  });
});
