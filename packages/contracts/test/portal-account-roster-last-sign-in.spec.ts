/** FE-CAT-8: the optional, roster-only `last_sign_in_at` on AccountSummary. Synthetic fixture, no producer yet. */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const load = (path: string) => JSON.parse(readFileSync(resolve(root, path), "utf8"));
const spec = load("openapi/portal-account-lifecycle.openapi.json");
const fixture = load("fixtures/portal-account-roster.last-sign-in.synthetic.valid.json");
const ajv = new Ajv2020({ strict: false, allErrors: true });
addFormats(ajv);
ajv.addSchema(spec, "spec");
const roster = ajv.getSchema("spec#/components/schemas/AccountRoster")!;
const summary = ajv.getSchema("spec#/components/schemas/AccountSummary")!;

describe("last_sign_in_at on the roster", () => {
  it("the fixture validates: a timestamp, a typed null (never signed in) and an omitted key (producer without the fact)", () => {
    expect(roster(fixture), JSON.stringify(roster.errors)).toBe(true);
    const [signedIn, never, unpublished] = fixture.accounts;
    expect(signedIn.last_sign_in_at).toBe("2026-10-17T09:14:00Z");
    expect(never.last_sign_in_at).toBeNull();
    expect("last_sign_in_at" in unpublished).toBe(false);
  });

  it("the field is optional: an account without it stays valid, so no existing roster body changes", () => {
    const { last_sign_in_at: _drop, ...without } = fixture.accounts[0];
    expect(summary(without)).toBe(true);
    expect(spec.components.schemas.AccountSummary.required).not.toContain("last_sign_in_at");
  });

  it("refuses a number, a non-date string, an epoch and any sibling key (the summary stays closed)", () => {
    for (const value of [1760692440000, "yesterday", "", 0, true]) {
      expect(summary({ ...fixture.accounts[0], last_sign_in_at: value }), String(value)).toBe(false);
    }
    expect(summary({ ...fixture.accounts[0], role_preset: "Reviewer" })).toBe(false); // a preset is not published here
    expect(summary({ ...fixture.accounts[0], last_seen_at: "2026-10-17T09:14:00Z" })).toBe(false);
  });

  it("says it authorizes nothing and is not a guess", () => {
    const text = spec.components.schemas.AccountSummary.properties.last_sign_in_at.description as string;
    for (const phrase of ["authorizes nothing", "Never a guess", "null = the account has never signed in", "Omitted"]) expect(text).toContain(phrase);
  });
});
