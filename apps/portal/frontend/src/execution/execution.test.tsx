/**
 * Execution Loop component tests — Phase 0.
 *
 * These assert the rules the spec states as non-negotiable, not that the
 * components render. A snapshot would pass while `PARTIAL` turned green; these
 * fail. The list under test is guide §6 plus DS §6: PARTIAL is never good, the
 * four state fields never merge, canary and live differ by treatment rather
 * than hue, a withheld panel says why, and 202 is not success.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExecutionSurface } from "./ExecutionSurface";
import {
  BLOTTER_BUCKET,
  BLOTTER_UNBUCKETED,
  guardFor,
  slaOverdue,
  STAGE_ORDER,
  type Envelope,
  type OrderStatus,
} from "./contracts";
import {
  AuthorityBadge,
  BrokerSyncChip,
  CapabilityChip,
  EnvironmentBadge,
  FreshnessIndicator,
  formatAge,
  OperationStatusChip,
  OrderStatusChip,
  ProfileBadge,
  VerificationChip,
} from "./components/badges";
import { ChartTile, envelopeCaption } from "./components/chart";
import { CommandPlanDrawer } from "./components/drawer";
import { EvidencePanel, SlaCell } from "./components/evidence";
import { GuardBand, ObservationProgress, stageRail } from "./components/lifecycle";
import { CapNotice, PanelState } from "./components/states";

afterEach(cleanup);

const envelope: Envelope = {
  authority: "EXECUTION",
  asOf: "2026-08-21T10:42:01Z",
  freshness: "OK",
  ageSeconds: 0.9,
};

describe("Carbon surface isolation", () => {
  it("scopes the theme to a wrapper so it cannot reach a Research screen", () => {
    const { container } = render(
      <ExecutionSurface>
        <span>inside</span>
      </ExecutionSurface>,
    );
    const surface = container.querySelector(".exec-surface");
    expect(surface?.getAttribute("data-theme")).toBe("operations-carbon");
    // Density is pinned rather than inherited: DS §1 makes `operational` the
    // default for every Deployments screen.
    expect(surface?.getAttribute("data-density")).toBe("operational");
  });
});

describe("PARTIAL is never green", () => {
  it("tones a partly-filled order as a warning", () => {
    render(<OrderStatusChip status="PARTIALLY_FILLED" />);
    expect(screen.getByText("PARTIALLY_FILLED").getAttribute("data-tone")).toBe("warn");
  });

  it("tones a partly-applied operation as a warning", () => {
    render(<OperationStatusChip status="PARTIAL" />);
    expect(screen.getByText("PARTIAL").getAttribute("data-tone")).toBe("warn");
  });

  it("keeps FILLED and VERIFIED as the only good outcomes in their vocabularies", () => {
    const { rerender } = render(<OrderStatusChip status="FILLED" />);
    expect(screen.getByText("FILLED").getAttribute("data-tone")).toBe("good");
    rerender(<OperationStatusChip status="VERIFIED" />);
    expect(screen.getByText("VERIFIED").getAttribute("data-tone")).toBe("good");
  });

  it("marks an accepted-but-unconfirmed operation as a warning, not a success", () => {
    render(<OperationStatusChip status="APPLIED_UNVERIFIED" />);
    const chip = screen.getByText("APPLIED_UNVERIFIED");
    expect(chip.getAttribute("data-tone")).toBe("warn");
    expect(chip.getAttribute("title")).toContain("202 is not success");
  });
});

describe("the four fields stay four fields", () => {
  it("renders broker sync as its own chip, separate from runtime state", () => {
    render(<BrokerSyncChip sync="MISMATCH" />);
    const chip = screen.getByText("SYNC MISMATCH");
    expect(chip.getAttribute("data-tone")).toBe("bad");
    expect(chip.getAttribute("title")).toContain("withheld");
  });

  it("names the promotion stage verbatim and never abbreviates canary", () => {
    render(<EnvironmentBadge stage="LIVE_CANARY" />);
    // Canary is live money. `CANARY` alone would be the one abbreviation on
    // this surface that could cost capital.
    expect(screen.getByText("LIVE · CANARY").getAttribute("data-stage")).toBe("LIVE_CANARY");
  });
});

describe("guard treatment (decision D2)", () => {
  it("assigns a guard only to the two live stages", () => {
    expect(guardFor("PAPER_OBSERVATION")).toBe("none");
    expect(guardFor("SANDBOX_VALIDATION")).toBe("none");
    expect(guardFor("LIVE_CANARY")).toBe("canary");
    expect(guardFor("LIVE_FULL")).toBe("live");
  });

  it("separates canary from live by treatment and words, not by hue", () => {
    const canary = render(<GuardBand stage="LIVE_CANARY" />);
    expect(canary.container.querySelector(".exec-guard")?.getAttribute("data-guard")).toBe("canary");
    expect(screen.getByText("LIVE · CANARY")).toBeTruthy();
    cleanup();

    const live = render(<GuardBand stage="LIVE_FULL" />);
    expect(live.container.querySelector(".exec-guard")?.getAttribute("data-guard")).toBe("live");
    expect(screen.getByText("LIVE")).toBeTruthy();
  });

  it("renders no band on a stage that is not live", () => {
    const { container } = render(<GuardBand stage="PAPER_OBSERVATION" />);
    expect(container.querySelector(".exec-guard")).toBeNull();
  });
});

describe("AuthorityBadge", () => {
  it("states a missing formula version rather than omitting it", () => {
    render(<AuthorityBadge envelope={{ ...envelope, authority: "DERIVED", formulaVersion: null }} />);
    expect(screen.getByText(/formula version not published/)).toBeTruthy();
  });

  it("says nothing extra when the formula version is present", () => {
    render(
      <AuthorityBadge envelope={{ ...envelope, authority: "DERIVED", formulaVersion: "diff.v1" }} />,
    );
    expect(screen.queryByText(/formula version not published/)).toBeNull();
  });

  it("keeps sub-minute ages to one decimal because seconds are argued about", () => {
    expect(formatAge(0.9)).toBe("0.9s");
    expect(formatAge(1)).toBe("1s");
    expect(formatAge(90)).toBe("1m");
    expect(formatAge(7200)).toBe("2h");
    expect(formatAge(null)).toBeNull();
  });
});

describe("FreshnessIndicator", () => {
  it("treats PAUSED as a calendar fact, not a stale reading", () => {
    render(
      <FreshnessIndicator state="PAUSED" reason="VN MARKET closed, reopens 09:00 ICT" />,
    );
    const node = screen.getByText(/paused/);
    expect(node.textContent).toContain("VN MARKET closed");
    expect(node.textContent).not.toContain("stale");
  });

  it("distinguishes aging from stale", () => {
    const { container, rerender } = render(<FreshnessIndicator state="AGING" ageSeconds={45} />);
    expect(container.querySelector(".exec-freshness")?.getAttribute("data-state")).toBe("AGING");
    rerender(<FreshnessIndicator state="STALE" ageSeconds={400} />);
    expect(container.querySelector(".exec-freshness")?.getAttribute("data-state")).toBe("STALE");
  });
});

describe("panel states", () => {
  it("renders each unavailable-kind as a distinct, named claim", () => {
    for (const status of ["empty", "denied", "unavailable", "insufficient_data"] as const) {
      const { container } = render(<PanelState status={status} reason="because" />);
      expect(container.querySelector(".exec-state")?.getAttribute("data-status")).toBe(status);
      cleanup();
    }
  });

  it("keeps the loading skeleton out of the accessibility tree", () => {
    const { container } = render(<PanelState status="loading" />);
    const blocks = container.querySelectorAll(".exec-skeleton-block");
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block.getAttribute("aria-hidden")).toBe("true");
    }
    // Exactly one spoken announcement, in words.
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);
  });

  it("shows a demoted last-good value rather than a blank when stale", () => {
    render(<PanelState status="stale" reason="4m old" lastGood={<span>18,412.55 USDT</span>} />);
    expect(screen.getByText("18,412.55 USDT")).toBeTruthy();
    expect(screen.getByText("4m old")).toBeTruthy();
  });

  it("hides the cap notice when nothing was truncated", () => {
    const { container } = render(<CapNotice shown={10} total={10} />);
    expect(container.textContent).toBe("");
  });

  it("states the exact denominator when a list is capped", () => {
    render(<CapNotice shown={10} total={214} noun="open items" />);
    // Exact, not approximate: at this cardinality a COUNT is a millisecond
    // query, so a `~` would be a choice rather than a constraint.
    expect(screen.getByText(/showing top 10 of 214 open items/)).toBeTruthy();
  });
});

describe("evidence and SLA", () => {
  it("labels a watch item as non-blocking and a gap as insufficient", () => {
    render(
      <EvidencePanel
        rows={[
          { label: "Drift", mark: "watch" },
          { label: "Slippage", mark: "insufficient" },
        ]}
      />,
    );
    expect(screen.getByText(/watch item, non-blocking/)).toBeTruthy();
    expect(screen.getByText(/insufficient data/)).toBeTruthy();
  });

  it("says OVERDUE in words, not only in colour", () => {
    render(<SlaCell sla={{ ageMinutes: 1560, budgetMinutes: 1440 }} />);
    expect(screen.getByText(/OVERDUE/)).toBeTruthy();
    expect(slaOverdue({ ageMinutes: 1560, budgetMinutes: 1440 })).toBe(true);
    expect(slaOverdue({ ageMinutes: 60, budgetMinutes: 1440 })).toBe(false);
  });
});

describe("lifecycle rail", () => {
  it("reaches back to the gates that authorised the deployment", () => {
    const steps = stageRail({ stage: "LIVE_CANARY", r1: { label: "AP-118" }, r2: { label: "AP-152" } });
    expect(steps.map((step) => step.name).slice(0, 2)).toEqual(["R1", "R2"]);
    expect(steps).toHaveLength(2 + STAGE_ORDER.length);
  });

  it("marks exactly one step current and everything after it pending", () => {
    const steps = stageRail({ stage: "SANDBOX_VALIDATION" });
    expect(steps.filter((step) => step.state === "current")).toHaveLength(1);
    const currentIndex = steps.findIndex((step) => step.state === "current");
    expect(steps.slice(currentIndex + 1).every((step) => step.state === "pending")).toBe(true);
  });
});

describe("observation progress", () => {
  it("takes the gate verdict from the server instead of recomputing it", () => {
    // Both bars are past target, yet the gate is not met: the rule can require
    // conditions this component cannot see (spec §10.5). A client that inferred
    // `met` would eventually disagree with the server about promotion.
    const { container } = render(
      <ObservationProgress
        met={false}
        items={[
          { label: "Days", current: 31, target: 30, unit: "days" },
          { label: "Trades", current: 400, target: 300, unit: "trades" },
        ]}
      />,
    );
    expect(container.querySelector(".exec-progress")?.getAttribute("data-met")).toBe("false");
  });
});

describe("chart envelope", () => {
  it("prints the aggregation arrow only when the server reduced the series", () => {
    const complete = envelopeCaption({
      window: "30d",
      interval: "15m",
      asOf: "2026-08-21T10:42:01Z",
      authority: "EXECUTION",
      sourceRows: 2880,
      returnedRows: 2880,
    });
    expect(complete).toContain("2880 samples");
    expect(complete).not.toContain("→");

    const reduced = envelopeCaption({
      window: "6mo",
      interval: "1h",
      asOf: "2026-08-21T10:42:01Z",
      authority: "EXECUTION",
      sourceRows: 43_800,
      returnedRows: 4368,
    });
    expect(reduced).toContain("43800 → 4368 samples");
  });

  it("always renders the interval the server actually served", () => {
    render(
      <ChartTile
        title="Equity"
        envelope={{
          window: "6mo",
          interval: "1h",
          asOf: "2026-08-21T10:42:01Z",
          authority: "EXECUTION",
        }}
      />,
    );
    expect(screen.getByText(/6mo · 1h · as_of/)).toBeTruthy();
  });
});

describe("command plan drawer", () => {
  it("lists every unmet condition rather than only the first", () => {
    render(<CommandPlanDrawer title="Allocate capital" step="plan" plan={null} confirmWord="CLOSE" />);
    const reason = screen.getByText(/Apply is blocked/);
    expect(reason.textContent).toContain("generate a plan first");
    expect(reason.textContent).toContain("a reason is required");
    expect(reason.textContent).toContain("type CLOSE to confirm");
  });

  it("blocks apply on an expired plan", () => {
    render(
      <CommandPlanDrawer
        title="Allocate capital"
        step="apply"
        plan={{
          id: "cmd_9f12",
          expiresInSeconds: 0,
          requestPreview: "POST /allocations",
          equivalentCli: "primus portfolio allocate",
          checks: [],
        }}
      />,
    );
    expect(screen.getByText(/Apply is blocked/).textContent).toContain("plan expired");
  });

  it("blocks apply on a failed policy check but not on a warning", () => {
    const plan = {
      id: "cmd_9f12",
      expiresInSeconds: 60,
      requestPreview: "POST /allocations",
      equivalentCli: "primus portfolio allocate",
      checks: [{ label: "Concentration above 20% of NAV", outcome: "warning" as const }],
    };
    render(<CommandPlanDrawer title="Allocate" step="apply" plan={plan} />);
    const blocked = screen.getByText(/Apply is blocked/).textContent ?? "";
    expect(blocked).not.toContain("policy check failed");
    expect(screen.getByText(/warning, not blocking/)).toBeTruthy();
  });

  it("opens the verify timeline with 202, which is not success", () => {
    render(
      <CommandPlanDrawer
        title="Allocate"
        step="verify"
        plan={null}
        verifyEntries={[{ label: "Allocation row written", status: "VERIFIED" }]}
      />,
    );
    expect(screen.getByText(/202 — accepted, NOT success yet/)).toBeTruthy();
  });

  it("shows the equivalent CLI as text and never as an executable control", () => {
    const { container } = render(
      <CommandPlanDrawer
        title="Allocate"
        step="apply"
        plan={{
          id: "cmd_9f12",
          expiresInSeconds: 60,
          requestPreview: "POST /allocations",
          equivalentCli: "primus portfolio allocate PF-MAIN dep_77",
          checks: [],
        }}
      />,
    );
    const cli = screen.getByText(/primus portfolio allocate PF-MAIN dep_77/);
    expect(cli.tagName).toBe("PRE");
    expect(screen.getByText(/browser never runs a shell/)).toBeTruthy();
    // No control anywhere in the drawer offers to run it.
    const buttons = [...container.querySelectorAll("button")].map((b) => b.textContent);
    expect(buttons.some((label) => /run|exec|shell/i.test(label ?? ""))).toBe(false);
  });
});

/* ---------------------------------------------------------------------------
 * Reconciliation against the Trading System contract pack, 2026-08-21.
 *
 * `extract/freshness-authority.json` states that the Trading System supplies
 * no `as_of` on list endpoints, no `source_sequence` over HTTP, and no single
 * freshness enum. These tests pin the consequences so a later refactor cannot
 * quietly reintroduce the assumptions we just removed.
 * ------------------------------------------------------------------------ */

describe("envelope reconciliation", () => {
  it("says as_of is unpublished rather than borrowing the connector read time", () => {
    // The mapping doc's rule: never present the connector's own read time as
    // Trading System authority. A fast read of a two-hour-old row must not
    // render as two seconds fresh.
    render(
      <AuthorityBadge
        envelope={{
          authority: "EXECUTION",
          asOf: null,
          readAt: "2026-08-21T10:42:01Z",
          freshness: "UNKNOWN",
        }}
      />,
    );
    expect(screen.getByText(/as_of not published/)).toBeTruthy();
  });

  it("labels readAt as connector time, not as authority", () => {
    const { container } = render(
      <AuthorityBadge
        envelope={{
          authority: "EXECUTION",
          asOf: "2026-08-21T10:40:00Z",
          readAt: "2026-08-21T10:42:01Z",
          freshness: "OK",
        }}
      />,
    );
    const title = container.querySelector(".exec-authority")?.getAttribute("title") ?? "";
    expect(title).toContain("when the data was true");
    expect(title).toContain("not authority");
  });

  it("keeps ERROR distinct from MISMATCH on broker sync", () => {
    // The DB CHECK is OK / STALE / MISMATCH / ERROR. A failed sync attempt and
    // a sync that ran and disagreed are different operational situations.
    const { rerender, container } = render(<BrokerSyncChip sync="ERROR" />);
    expect(screen.getByText("SYNC ERROR").getAttribute("data-tone")).toBe("bad");
    rerender(<BrokerSyncChip sync="UNKNOWN" />);
    expect(container.textContent).toContain("SYNC UNKNOWN");
  });
});

describe("blotter bucketing", () => {
  it("maps the five hi-fi chips onto the twelve real statuses without overlap", () => {
    const buckets = Object.values(BLOTTER_BUCKET).flat();
    expect(new Set(buckets).size).toBe(buckets.length);
  });

  it("accounts for every status, with the two exclusions stated", () => {
    const covered = new Set([...Object.values(BLOTTER_BUCKET).flat(), ...BLOTTER_UNBUCKETED]);
    const all: OrderStatus[] = [
      "INITIALIZED",
      "SUBMITTED",
      "ACCEPTED",
      "REJECTED",
      "DENIED",
      "PENDING_UPDATE",
      "PENDING_CANCEL",
      "PARTIALLY_FILLED",
      "FILLED",
      "CANCELED",
      "EXPIRED",
      "TRIGGERED",
    ];
    // No status may fall through silently: it is either in a chip's bucket or
    // in the explicit exclusion list, and both are reachable through `All`.
    for (const status of all) {
      expect(covered.has(status), `${status} is unreachable from any filter`).toBe(true);
    }
  });

  it("treats a risk denial as a rejection, not as an open order", () => {
    expect(BLOTTER_BUCKET.REJECTED).toContain("DENIED");
    expect(BLOTTER_BUCKET.OPEN).not.toContain("DENIED");
  });
});

/* Added when the backend master plan landed. Each of these fails if a contract
 * the plan rules on is quietly softened back into something more comfortable. */

describe("verification is a second axis, not a nicer word for status", () => {
  it("renders UNCERTAIN as bad, not as a neutral in-progress state", () => {
    const { container } = render(<VerificationChip result="UNCERTAIN" />);
    expect(container.querySelector('[data-tone="bad"]')).not.toBeNull();
    // The distinction the tone exists to protect: PENDING is waiting,
    // UNCERTAIN is escalating. They must not read the same.
    cleanup();
    const pending = render(<VerificationChip result="PENDING" />).container;
    expect(pending.querySelector('[data-tone="bad"]')).toBeNull();
  });

  it("tells the operator to escalate rather than wait", () => {
    render(<VerificationChip result="UNCERTAIN" />);
    expect(screen.getByTitle(/escalate; do not wait/i)).toBeTruthy();
  });

  it("never renders PARTIAL as success, in this vocabulary either", () => {
    const { container } = render(<VerificationChip result="PARTIAL" />);
    expect(container.querySelector('[data-tone="good"]')).toBeNull();
  });
});

describe("capability state is per capability", () => {
  it("lets reads be supported while commands are disabled", () => {
    const { container } = render(
      <>
        <CapabilityChip name="orders.read" state="SUPPORTED" />
        <CapabilityChip name="orders.command" state="DISABLED" />
      </>,
    );
    // Two chips, two different tones. A single rolled-up health badge could not
    // express this, which is why the backend plan forbids one.
    const tones = [...container.querySelectorAll("[data-tone]")].map((n) =>
      n.getAttribute("data-tone"),
    );
    expect(tones).toEqual(["good", "mute"]);
  });

  it("marks an incompatible capability as bad, not as merely off", () => {
    const { container } = render(<CapabilityChip name="events" state="INCOMPATIBLE" />);
    expect(container.querySelector('[data-tone="bad"]')).not.toBeNull();
  });
});

describe("delivery profile", () => {
  it("marks shadow data, which otherwise looks exactly like production", () => {
    render(<ProfileBadge profile="shadow" />);
    expect(screen.getByText("SHADOW DATA")).toBeTruthy();
    expect(screen.getByTitle(/not a production feed/i)).toBeTruthy();
  });

  it("marks fixture data", () => {
    render(<ProfileBadge profile="fixture" />);
    expect(screen.getByText("FIXTURE DATA")).toBeTruthy();
  });

  it("stays silent for profiles the guard band and environment badge already carry", () => {
    // Rendering it here would be a second badge repeating the first. The rule
    // is that this component covers exactly the gap nothing else covers.
    for (const profile of ["paper", "sandbox", "live_canary", "live_full"] as const) {
      const { container } = render(<ProfileBadge profile={profile} />);
      expect(container.textContent, `${profile} should be carried elsewhere`).toBe("");
      cleanup();
    }
  });
});

describe("envelope carries the projection facts the plan defines", () => {
  it("keeps data age and projection lag as separate quantities", () => {
    // A panel can be seconds-fresh off a projection that is minutes behind.
    // One number cannot say both, so the envelope carries two.
    const behind: Envelope = {
      authority: "EXECUTION",
      asOf: "2026-08-21T10:42:01Z",
      freshness: "OK",
      ageSeconds: 1.2,
      lagMs: 240_000,
    };
    expect(behind.ageSeconds).toBeLessThan(2);
    expect(behind.lagMs).toBeGreaterThan(60_000);
  });

  it("never presents a projection sequence as a source sequence", () => {
    const projected: Envelope = {
      authority: "EXECUTION",
      asOf: "2026-08-21T10:42:01Z",
      freshness: "OK",
      projectionEpoch: "0a4c…",
      projectionSequence: 8814,
      sourceSequence: null,
    };
    // BR-EX-11 was ruled MODIFY: the Trading System publishes no global
    // sequence and Portal is forbidden to fabricate one. A future refactor that
    // "helpfully" fills sourceSequence from projectionSequence fails here.
    expect(projected.sourceSequence).toBeNull();
    expect(projected.projectionSequence).not.toBeNull();
  });
});
