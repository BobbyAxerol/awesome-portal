/**
 * Live (live-source-operations.v2) against the BE-P12 opt-in members, published (lane FIXTURE_LAB: `with_members` and
 * `with_members_hidden` of `execution-live-source.synthetic.valid.json`; a synthetic fixture is never source acceptance).
 *
 * What the screen may say, and no more:
 * - the identity crumb: the Alpha is linked ONLY when `alpha_id` is published, the portfolio shows its published NAME (the v2
 *   body carries no portfolio id, so it is printed, not linked); every reason code is behind a disclosure, never a sentence;
 * - the Reconciliation chip: `Open findings` only for the OPEN_FINDINGS verdict, WITHOUT a count; nothing else is a statement
 *   (the reader refuses `NO_OPEN_FINDINGS` and every count); the Runtime chip stays Not available with the server's reason;
 * - a body without the members (the default request) draws exactly what it drew before.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import LiveScreen from "./index";
import { liveModelV2 } from "./model";
import { DEPLOYMENT_ID, fakeApi, ok, v2Canonical, v2Of, v2Read } from "./live.testbase";
import type { Draft } from "../../testkit/matrix";
import { whyButton, whyText } from "../../gapWhyTestUtil";

afterEach(cleanup);

const canonical = (): Draft => v2Canonical() as unknown as Draft;

function mount(raw: Draft) {
  const m = fakeApi(() => ok(v2Read(raw)));
  render(
    <MemoryRouter initialEntries={[`/deployments/live/${DEPLOYMENT_ID}`]}>
      <LiveScreen api={m.api} deploymentId={DEPLOYMENT_ID} />
    </MemoryRouter>,
  );
  return m;
}
const loaded = async () => {
  await screen.findByRole("heading", { level: 1, name: "Live operations" });
  await waitFor(() => expect(document.querySelector(".exec-stage-chips")).not.toBeNull());
};
const chip = (id: string) => document.querySelector<HTMLElement>(`[data-chip="${id}"]`);
/** The chips that say nothing are ONE chip; each one's request id and reason is in its disclosure (`GapWhy`). */
const gaps = () => document.querySelector<HTMLElement>('[data-chip="gaps"]')!;
const text = (el: Element) => (el.textContent ?? "").replace(/\s+/g, " ").trim();
const crumb = () => within(screen.getByRole("navigation", { name: "Breadcrumb" }));

describe("the first read asks for the members, once", () => {
  it("include is identity and stage_facts on the first read of a V2 screen; nothing else is added", async () => {
    const m = mount(canonical().populated);
    await loaded();
    expect(m.calls).toEqual([{ deploymentId: DEPLOYMENT_ID, options: { include: ["identity", "stage_facts"] } }]);
  });
});

describe("the model", () => {
  it("published: identity from the body; the Runtime chip keeps the reason beside what the read states; Reconciliation is Open findings with no count", () => {
    const model = liveModelV2(v2Of(canonical().with_members));
    expect(model.identity).toMatchObject({ published: true, alphaId: "alpha_TEST_ONLY_identity", alphaName: null, portfolioName: "TEST_ONLY portfolio name" });
    expect(model.chips.runtime).toEqual({ state: "not-published", id: "FE-067", reasonCode: "RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY", detail: "Activation not asserted" });
    expect(model.chips.reconciliation).toEqual({ state: "flag", kind: "attention", label: "Open findings", note: undefined });
  });

  it("hidden: no alpha, no name; the verdict is a typed absence with its reason, never a chip statement", () => {
    const model = liveModelV2(v2Of(canonical().with_members_hidden));
    expect(model.identity).toMatchObject({ published: true, alphaId: null, portfolioName: null, alphaReasonCode: "ALPHA_IDENTITY_NOT_AUTHORIZED" });
    expect(model.chips.reconciliation).toEqual({ state: "not-published", id: "FE-067", reasonCode: "AUTHORIZED_POPULATION_ONLY" });
  });

  it("a body without the members is the model it always was", () => {
    const model = liveModelV2(v2Of(canonical().populated));
    expect(model.identity.published).toBe(false);
    expect(model.chips.runtime).toEqual({ state: "not-published", id: "FE-067", detail: "Activation not asserted" });
    expect(model.chips.reconciliation).toEqual({ state: "not-available", reason: "Source verdict not asserted" });
  });
});

describe("the screen", () => {
  it("published: the Alpha crumb links the id, the portfolio name is printed, the chip says Open findings and no number", async () => {
    mount(canonical().with_members);
    await loaded();
    expect(crumb().getByRole("link", { name: "alpha_TEST_ONLY_identity" }).getAttribute("href")).toBe("/deployments/alphas/alpha_TEST_ONLY_identity");
    expect(crumb().getByText("TEST_ONLY portfolio name").closest("a")).toBeNull();
    expect(text(chip("reconciliation")!)).toContain("Open findings");
    expect(text(chip("reconciliation")!)).not.toMatch(/\d/);
    expect(chip("runtime")).toBeNull();
    expect(text(gaps())).toBe("Not availableRuntime");
    const why = whyButton(gaps());
    expect(why.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(why.getAttribute("aria-controls")!)!.textContent).toContain("RUNTIME_STATE_FIELD_NOT_IN_READ_VOCABULARY");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("false");
    expect(text(gaps())).toBe("Not availableRuntime");
    // The wording that would claim more than the population proves never appears.
    expect(document.body.textContent).not.toMatch(/No open findings|Reconciled|Clean|Running/);
  });

  it("hidden: no Alpha link, no portfolio crumb, Not available; the reason codes are in the disclosure and not in the text", async () => {
    mount(canonical().with_members_hidden);
    await loaded();
    expect(document.querySelector('a[href^="/deployments/alphas/"]:not([href="/deployments/alphas"])')).toBeNull();
    expect(chip("reconciliation")).toBeNull();
    expect(text(gaps())).not.toMatch(/AUTHORIZED_POPULATION_ONLY|FE-\d/);
    const why = whyButton(gaps());
    expect(why.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("true");
    const body = document.getElementById(why.getAttribute("aria-controls")!)!.textContent ?? "";
    expect(body).toContain("Reconciliation: ");
    expect(body).toContain("AUTHORIZED_POPULATION_ONLY");
    fireEvent.click(why);
    expect(why.getAttribute("aria-expanded")).toBe("false");
    expect(whyText(gaps())).toContain("AUTHORIZED_POPULATION_ONLY");
    expect(screen.queryByText(/AUTHORIZED_POPULATION_ONLY|ALPHA_IDENTITY_NOT_AUTHORIZED|PORTFOLIO_NAME_NOT_AUTHORIZED/)).toBeNull();
  });

  it("without the members the header is what it was: no Alpha crumb, Not available · Source verdict not asserted", async () => {
    mount(canonical().populated);
    await loaded();
    expect(document.querySelector('a[href^="/deployments/alphas/"]:not([href="/deployments/alphas"])')).toBeNull();
    expect(text(chip("reconciliation")!)).toContain("Source verdict not asserted");
  });
});
