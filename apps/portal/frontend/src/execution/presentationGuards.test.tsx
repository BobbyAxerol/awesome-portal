/**
 * PHASE 9 (round 2) - guards for presentation defects a green suite has
 * already let through once each.
 *
 * WHY THESE ARE DOM TESTS AND NOT A SOURCE SCAN
 *
 * The cheapest guard would read the JSX: find every element carrying
 * `disabled` and require a `title` beside it. I wrote that scan first and
 * measured it before trusting it. It reported 46 violations across the app
 * while an authenticated browser on the same screens reported none, because
 * most of those controls are disabled only while a submit is in flight, or
 * carry their reason on a wrapper, or are never disabled in any state a reader
 * reaches. A guard that cries wolf 46 times is a guard nobody reads - that is
 * the rule recorded in A56.3, and it applies to the instrument as much as to
 * the product.
 *
 * So a control is in violation only when it is ACTUALLY disabled in a rendered
 * state. That is a DOM question. It is answered here in jsdom rather than in a
 * browser, because the BE-R2 handoff rules out a blanket browser scan on every
 * PR - the browser stays for targeted evidence, recorded once.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { AccountBroker360 } from "./screens/AccountBroker360";
import { account360 } from "./account360.fixtures";
import { accountHandlers } from "./testHandlers";
import { portfolioOverviewPanels } from "./portfolioOverview";
import { readCrossEquity } from "./analytics";
import { CROSS_EQUITY } from "./analytics.presentation.fixtures";
import { Num } from "./components/cells";
import { GateR1Review } from "./screens/GateR1Review";
import { GateR2Review } from "./screens/GateR2Review";
import { SandboxCertificationScreen } from "./screens/SandboxCertification";
import { CanaryControlRoomScreen } from "./screens/CanaryControlRoom";

afterEach(cleanup);

/** Source decimals carry up to eighteen places; seven is past every display class. */
const OVER_PRECISION = /\d+\.\d{7,}/;

function textNodes(root: HTMLElement): string[] {
  const out: string[] = [];
  const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walk.nextNode();
  while (node) {
    const value = (node.nodeValue ?? "").trim();
    if (value) out.push(value);
    node = walk.nextNode();
  }
  return out;
}

/** Everything the reader can recover: rendered text plus every title attribute. */
function recoverable(root: HTMLElement): string {
  const titles = [...root.querySelectorAll("[title]")].map((e) => e.getAttribute("title") ?? "");
  return [...textNodes(root), ...titles].join("   ");
}

function crossPortfolio() {
  const served = readCrossEquity(CROSS_EQUITY)!;
  return {
    rows: served.rows,
    node: (
      <>
        {portfolioOverviewPanels({
          portfolioId: "portfolio_types_pool",
          relations: null,
          loading: false,
          asOf: null,
          crossEquity: { rows: served.rows, status: "empty", reason: null },
        }).crossPortfolio}
      </>
    ),
  };
}

/** True when the display would differ from the source, i.e. something is hidden. */
function rounds(value: string): boolean {
  if (!/^-?\d+(\.\d+)?$/.test(value)) return false;
  const [whole, fraction = ""] = value.replace("-", "").split(".");
  return whole.length > 3 || fraction.length > 2;
}

describe("guard 1 - source precision never reaches the reader verbatim", () => {
  it("Account / Broker 360 rounds every figure to its display class", () => {
    // The fixture carries `61204.000000000000000000` because the source does.
    // On dev this screen printed EQUITY, CASH FREE and CASH LOCKED raw while
    // the chart tooltip two panels away read `20,000.00`.
    const { container } = render(<AccountBroker360 {...accountHandlers()} {...account360()} />);
    const offenders = textNodes(container).filter((t) => OVER_PRECISION.test(t));
    expect(offenders, `raw source decimals rendered: ${offenders.join(" | ")}`).toEqual([]);
  });

  it("Portfolio 360 cross-portfolio rounds every figure to its display class", () => {
    const { container } = render(crossPortfolio().node);
    const offenders = textNodes(container).filter((t) => OVER_PRECISION.test(t));
    expect(offenders, `raw source decimals rendered: ${offenders.join(" | ")}`).toEqual([]);
  });
});

describe("guard 2 - rounding hides nothing, every source value stays recoverable", () => {
  /*
   * Rounding for display is right; losing the original is not. The reader of a
   * reconciliation screen must be able to get back to the exact figure, and
   * `title` is where the rest of this surface keeps it. Portfolio 360 had nine
   * cells that formatted inline and threw the original away.
   */
  it("Account / Broker 360 keeps each exact figure in reach", () => {
    const fixture = account360();
    const sources = [
      fixture.internal.headline.value,
      ...(fixture.internal.extra ?? []).filter((e) => e.unit !== "text").map((e) => e.value),
    ].filter((v): v is string => typeof v === "string" && /^\d+\.\d{7,}$/.test(v));
    // A scan that finds nothing is not a pass.
    expect(sources.length, "the fixture must be source-shaped or this guard proves nothing").toBeGreaterThan(0);
    const { container } = render(<AccountBroker360 {...accountHandlers()} {...account360()} />);
    const reach = recoverable(container);
    for (const value of sources) expect(reach, `${value} is not recoverable from the DOM`).toContain(value);
  });

  it("Portfolio 360 cross-portfolio keeps each exact figure in reach", () => {
    const { rows, node } = crossPortfolio();
    const sources = rows
      .flatMap((r) => [r.firstEquity, r.lastEquity, r.netPnl])
      .filter((v) => typeof v === "string" && rounds(v)) as string[];
    expect(sources.length, "no row in this fixture is rounded, so the guard proves nothing").toBeGreaterThan(0);
    const { container } = render(node);
    const reach = recoverable(container);
    for (const value of sources) expect(reach, `${value} is not recoverable from the DOM`).toContain(value);
  });
});

/*
 * A control the reader cannot press must say why - rule 3.5. The allowlist is
 * per control, not per screen, and each line carries its reason; an empty
 * allowlist is the goal and a growing one is a signal.
 */
const DISABLED_ALLOWLIST: readonly { label: string; because: string }[] = [];

function disabledWithoutReason(root: HTMLElement) {
  return [...root.querySelectorAll("button[disabled], [aria-disabled='true']")]
    .map((el) => ({
      label: (el.textContent ?? "").replace(/\s+/g, " ").trim(),
      title: (el.getAttribute("title") ?? "").trim(),
    }))
    .filter((c) => c.title.length < 8)
    .filter((c) => !DISABLED_ALLOWLIST.some((a) => a.label === c.label));
}

describe("guard 3 - a control that cannot be pressed says why", () => {
  const CASES: readonly [string, () => void][] = [
    [
      "Gate R1, self-approval and a blocking finding",
      () => {
        render(
          <GateR1Review
            approvalId="AP-201"
            alphaLabel="RSI v1.7"
            quorumMet={0}
            quorumRequired={2}
            policyVersion="approval.v3"
            creator="Minh"
            creatorId="u_minh"
            actor="Minh"
            actorId="u_minh"
            passport={[]}
            checklist={[{ label: "engine pinned", outcome: "fail" }]}
            eligibility={{ canApprove: false, canApproveWithCondition: false, canDeny: false }}
            onRequestCondition={() => undefined}
          />,
        );
      },
    ],
    [
      "Gate R2, the linked R1 is expired",
      () => {
        render(
          <GateR2Review
            approvalId="AP-352"
            subject="Carry v3.2"
            r1Id="AP-201"
            r1State="EXPIRED"
            policyVersion="approval.v3"
            planAuthor="Minh"
            actor="Minh"
            quorumMet={0}
            quorumRequired={2}
            readiness={[]}
            capital={[]}
            onRequestCondition={() => undefined}
          />,
        );
      },
    ],
    [
      "Sandbox Certification, absent record",
      () => {
        render(
          <SandboxCertificationScreen
            certification={null}
            status="unavailable"
            reason="SANDBOX_DEPLOYMENT_NOT_FOUND"
          />,
        );
      },
    ],
    [
      "Canary Control Room, absent envelope",
      () => {
        render(
          <CanaryControlRoomScreen room={null} status="unavailable" reason="CANARY_ENVELOPE_NOT_FOUND" />,
        );
      },
    ],
    [
      "Account / Broker 360",
      () => {
        render(<AccountBroker360 {...accountHandlers()} {...account360()} />);
      },
    ],
  ];

  it.each(CASES)("%s", (_name, mount) => {
    mount();
    const offenders = disabledWithoutReason(document.body);
    expect(offenders, `disabled with no reason: ${JSON.stringify(offenders)}`).toEqual([]);
  });

  it("keeps the allowlist honest", () => {
    for (const entry of DISABLED_ALLOWLIST) expect(entry.because.length).toBeGreaterThan(30);
  });
});

describe("guard 4 - the shared numeric cell keeps its own promise", () => {
  it("puts the exact original in title whenever display differs", () => {
    const { container } = render(<Num value="20000.000000000000000000" unit="money" />);
    const cell = container.querySelector(".exec-num")!;
    expect(cell.textContent).toBe("20,000.00");
    expect(cell.getAttribute("title")).toBe("20000.000000000000000000");
  });

  it("adds no title when the display already IS the source", () => {
    const { container } = render(<Num value="7" unit="count" />);
    expect(container.querySelector(".exec-num")!.getAttribute("title")).toBeNull();
  });

  it("never turns an absent figure into a zero", () => {
    render(<Num value={null} absent="not reported" />);
    expect(screen.getByText("not reported")).toBeTruthy();
  });
});
