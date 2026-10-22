// @vitest-environment node
/** Opt-in fixture navigation/layout only. No mounted source, command, financial tie-out or runtime proof. */
import { afterAll, describe, expect, it } from "vitest";

import { transformReviewBody } from "../../../fixture-bff/review-relations";
import { answerFixtureRequest, V2_OPTIONS } from "../../e2e/bffAnswerer";
import { readProfileEnvelope } from "../execution/api/profileRead";
import { canonicalDigest, loadCanonical } from "../execution/v2/testkit/loadCanonical";
import { validateAgainst } from "../execution/v2/testkit/schema";

const EX = "/api/v1/execution";
const FIXTURE = "execution-manager-dataset.partitions.synthetic";
const originalDigest = canonicalDigest(FIXTURE);
afterAll(() => expect(canonicalDigest(FIXTURE)).toBe(originalDigest));

function answer(path: string) {
  const url = new URL(path, "http://fixture.invalid");
  return answerFixtureRequest({ method: "GET", path: url.pathname, search: url.search, headers: {}, body: null }, V2_OPTIONS);
}

function obj(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>;
}

/** Compare every scalar leaf: only the explicitly asserted identity/display paths may differ. */
function changes(before: unknown, after: unknown, path = ""): string[] {
  if (before === after) return [];
  if (before === null || after === null || typeof before !== "object" || typeof after !== "object") return [path];
  expect(Object.keys(after)).toEqual(Object.keys(before));
  return Object.keys(before).flatMap((key) => changes(obj(before)[key], obj(after)[key], `${path}/${key}`));
}

describe("review relations — exact fixture counterpart aliases", () => {
  it("fixes Core's three known account links consistently and leaves its unsupported Bybit key alone", () => {
    const path = `${EX}/resources/portfolios/pf_TEST_ONLY_core`;
    const raw = answer(path)!;
    expect(raw.status).toBe(200);
    const original = JSON.stringify(raw.body);
    const body = obj(transformReviewBody(path, raw.body, "populated"));
    const data = obj(body.data);
    const accounts = data.accounts as Record<string, unknown>[];
    expect(accounts.map((row) => row.account_id)).toEqual(["acc_bnc_core", "acc_okx_main", "Bybit-01", "acc_pap_sim"]);
    expect(obj(data.portfolio).account_ids).toEqual(accounts.map((row) => row.account_id));
    for (const relation of ["deployments", "account_balances", "margin_balances", "account_sync", "reconciliation"]) {
      expect((data[relation] as Record<string, unknown>[]).every((row) => !["Binance-02", "OKX-01", "Paper-Binance"].includes(String(row.account_id)))).toBe(true);
    }
    expect(readProfileEnvelope(body)).not.toBeNull();
    expect(JSON.stringify(raw.body)).toBe(original);
    expect(changes(raw.body, body).every((key) => /\/account_id$|\/account_ids\/\d+$/.test(key))).toBe(true);
  });

  it("each repaired account key resolves to the existing matching Account resource, not a fabricated success", () => {
    const path = `${EX}/resources/portfolios/pf_TEST_ONLY_core`;
    const core = obj(transformReviewBody(path, answer(path)!.body, "populated"));
    const accounts = obj(core.data).accounts as Record<string, unknown>[];
    for (const id of ["acc_bnc_core", "acc_okx_main", "acc_pap_sim"]) {
      expect(accounts.some((row) => row.account_id === id)).toBe(true);
      const resourcePath = `${EX}/resources/accounts/${id}`;
      const response = answer(resourcePath)!;
      expect(response.status).toBe(200);
      const body = obj(transformReviewBody(resourcePath, response.body, "populated"));
      expect(obj(body.resource)).toMatchObject({ kind: "ACCOUNT", id });
      expect(readProfileEnvelope(body)).not.toBeNull();
    }
    // No fuzzy matching, resource creation or direct alias fallback is introduced.
    expect(answer(`${EX}/resources/accounts/Bybit-01`)!.status).toBe(404);
    expect(answer(`${EX}/resources/accounts/Binance-02`)!.status).toBe(404);
  });

  it("maps only explicit account fields and relative account links, never opaque IDs, URLs or free text", () => {
    const body = {
      resource: { kind: "ACCOUNT", id: "Binance-02" }, account_id: "OKX-01", account_ids: ["Paper-Binance", "unknown"],
      href: "/deployments/accounts/Binance-02?tab=orders#ledger", url: `${EX}/resources/accounts/OKX-01/fills`,
      cursor: "Binance-02", row_key: "Binance-02", deployment_id: "Binance-02", portfolio_id: "Binance-02",
      label: "Binance-02", external_url: "https://external.test/deployments/accounts/Binance-02",
      nested: { href: "https://external.test/deployments/accounts/Binance-02" },
    };
    const projected = obj(transformReviewBody(`${EX}/resources/accounts/Binance-02`, body, "populated"));
    expect(projected).toEqual({ ...body,
      resource: { kind: "ACCOUNT", id: "acc_bnc_core" }, account_id: "acc_okx_main", account_ids: ["acc_pap_sim", "unknown"],
      href: "/deployments/accounts/acc_bnc_core?tab=orders#ledger", url: `${EX}/resources/accounts/acc_okx_main/fills`,
    });
  });

  it.each(["populated", "layout-stress"] as const)("preserves unknown and typed error/refusal answers in %s", (profile) => {
    for (const path of [`${EX}/resources/accounts/not-known`, `${EX}/resources/accounts/acc_err`, `${EX}/resources/portfolios/pf_TEST_ONLY_missing`]) {
      const response = answer(path)!;
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(transformReviewBody(path, response.body, profile)).toBe(response.body);
    }
    expect(answer(`${EX}/not-served`)).toBeNull();
    const malformed = { error: { code: "ACCESS_DENIED", message: "Denied", account_id: "Binance-02" } };
    expect(transformReviewBody(`${EX}/resources/accounts/Binance-02`, malformed, profile)).toBe(malformed);
  });
});

describe("layout stress — human labels only", () => {
  it("keeps the canonical Manager schema, identities, metrics, units, timestamps, enums and reasons intact", () => {
    const raw = loadCanonical<{ value: Record<string, unknown> }>(FIXTURE).value;
    const before = JSON.stringify(raw);
    const stressed = obj(transformReviewBody(`${EX}/manager/fleet`, raw, "layout-stress"));
    const changed = changes(raw, stressed);
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.every((key) => /\/name$|\/label$|\/display_name$|\/(?:portfolio|alpha|account|deployment)_name$/.test(key))).toBe(true);
    expect(validateAgainst("../openapi/execution-manager-models.openapi.json", "/components/schemas/ManagerDataset", stressed)).toEqual([]);
    expect(JSON.stringify(raw)).toBe(before);
    expect(transformReviewBody(`${EX}/manager/fleet`, stressed, "layout-stress")).toEqual(stressed);
  });

  it("does not invent labels for absent names or alter negative zero, null metrics, human IDs or description copy", () => {
    const body = { items: [{ alpha_id: "alpha", name: "研究チーム", alpha_name: null, account_name: "", display_name: "Équipe Việt",
      metrics: { pnl: { value: "-0.000", currency: "USDT", unit: "CURRENCY", reason_code: "NOT_PUBLISHED" } },
      source_as_of_ms: null, created_at: "2026-10-17T12:04:00.000Z", stage: "PAPER", description: "Not published", owner_user_id: "bobby" }] };
    const changed = obj(transformReviewBody(`${EX}/manager/fleet`, body, "layout-stress"));
    expect(changes(body, changed)).toEqual(["/items/0/name", "/items/0/display_name"]);
    expect(JSON.stringify(changed)).toContain("日本語");
    expect(JSON.stringify(changed)).toContain('"value":"-0.000"');
  });

  it("does not stress arbitrary metadata names or touch unrelated routes, strings, null or arrays", () => {
    const body = { name: "schema_name", metadata: { name: "field_identifier", label: "enum_label" }, reason_code: "NO_SOURCE" };
    expect(transformReviewBody(`${EX}/manager/fleet`, body, "layout-stress")).toEqual(body);
    expect(transformReviewBody("/api/v1/research/runs", body, "layout-stress")).toBe(body);
    expect(transformReviewBody("https://external.test/api/v1/execution/manager/fleet", body, "layout-stress")).toBe(body);
    for (const value of [null, "event: unavailable\n\n", ["Binance-02"]]) {
      expect(transformReviewBody(`${EX}/manager/fleet`, value, "layout-stress")).toBe(value);
    }
  });

  it("keeps existing defaults byte-equivalent unless the caller explicitly invokes the projection", () => {
    const path = `${EX}/resources/portfolios/pf_TEST_ONLY_core`;
    const original = JSON.stringify(answer(path));
    transformReviewBody(path, answer(path)!.body, "layout-stress");
    expect(JSON.stringify(answer(path))).toBe(original);
  });
});
