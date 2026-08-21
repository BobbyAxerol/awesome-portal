/**
 * Execution Loop component tests — Phase 0.
 *
 * These assert the rules the spec states as non-negotiable, not that the
 * components render. A snapshot would pass while `PARTIAL` turned green; these
 * fail. The list under test is guide §6 plus DS §6: PARTIAL is never good, the
 * four state fields never merge, canary and live differ by treatment rather
 * than hue, a withheld panel says why, and 202 is not success.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExecutionSurface } from "./ExecutionSurface";
import {
  BLOTTER_BUCKET,
  BLOTTER_UNBUCKETED,
  cursorStillValid,
  guardFor,
  slaOverdue,
  STAGE_ORDER,
  type ChartEnvelope,
  type Envelope,
  type KeysetPage,
  type OrderStatus,
} from "./contracts";
import {
  commandBlockedReason,
  commandEnabled,
  commandProfileInconsistency,
  PERMISSION_SOURCE,
  PROFILE_ORDER,
  PROFILE_RANK,
  profileNeedsLabel,
  reconcilePanelProfile,
  screenDeliveryPolicy,
  screenDeliveryProfile,
} from "./profile";
import { KeysetTable, type Column } from "./components/table";
import { ZoomableChart, zoomVerdict } from "./components/zoom";
import {
  emptyMeansEmpty,
  panelStatusForRetention,
  RangeTooWideNotice,
  RetentionNotice,
  retentionReason,
} from "./components/retention";
import {
  canClaimContinuity,
  CompletenessNote,
  continuityCaveat,
  SubscriptionBanner,
} from "./components/stream";
import { SubscriptionWalk } from "./components/streamDemo";
import {
  blockingCount,
  ConditionRow,
  draftBlockers,
  EMPTY_DRAFT,
  toCondition,
} from "./components/conditions";
import { readApprovalRow, readGateR1Detail, readGateR2Detail, readPaperExitDetail } from "./api/rows";
import { createFixtureApi } from "./api/fixtureApi";
import {
  ApprovalInboxContainer,
  GateR1ReviewContainer,
  GateR2ReviewContainer,
  PaperExitReviewContainer,
} from "./screens/containers";
import { createHttpApi } from "./api/httpApi";
import {
  decisionReducer,
  initialDecision,
  outstanding,
  shouldPoll,
  succeeded,
} from "./decision";
import {
  INTERVAL_LADDER,
  MAX_POINTS,
  needsRequery,
  pointsFor,
  selectInterval,
  validateSeries,
} from "./series";
import {
  INITIAL_SUBSCRIPTION,
  isLive,
  mayResnapshot,
  parseResumeToken,
  subscriptionReducer,
  type SubscriptionEvent,
  type SubscriptionState,
} from "./subscription";
import { ApprovalInbox, INBOX_FILTERS, reviewRouteFor, type ApprovalRow } from "./screens/ApprovalInbox";
import { GateR1Review } from "./screens/GateR1Review";
import { GateR2Review } from "./screens/GateR2Review";
import { EXIT_OUTCOME, PaperExitReview } from "./screens/PaperExitReview";
import {
  formatDecimal,
  isSettled,
  isTerminalSuccess,
  newRequestKey,
  panelStatusForHttp,
  readDecimal,
  readEnum,
  readEnvelope,
  readId,
  readKeysetPage,
  readOperation,
  readProblem,
} from "./adapter";
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
      <ExecutionSurface kind="deployments">
        <span>inside</span>
      </ExecutionSurface>,
    );
    const surface = container.querySelector(".exec-surface");
    expect(surface?.getAttribute("data-theme")).toBe("operations-carbon");
    expect(surface?.getAttribute("data-density")).toBe("operational");
  });

  it("puts governance on the light surface, as DS §1 and the hi-fi both say", () => {
    // The four governance hi-fi files set a white page background; the
    // Deployments ones set the Carbon near-black. An earlier build wrapped both
    // in the dark theme, which is what this test makes hard to reintroduce.
    const { container } = render(
      <ExecutionSurface kind="governance">
        <span>inside</span>
      </ExecutionSurface>,
    );
    const surface = container.querySelector(".exec-surface");
    expect(surface?.getAttribute("data-theme")).toBe("operations-carbon-light");
    // Governance is a page you read and decide on, not a console you scan.
    expect(surface?.getAttribute("data-density")).toBe("comfortable");
  });

  it("nests, so a light governance panel can sit inside an operations page", () => {
    const { container } = render(
      <ExecutionSurface kind="deployments">
        <ExecutionSurface kind="governance">
          <span>inner</span>
        </ExecutionSurface>
      </ExecutionSurface>,
    );
    const surfaces = [...container.querySelectorAll(".exec-surface")].map((s) =>
      s.getAttribute("data-theme"),
    );
    expect(surfaces).toEqual(["operations-carbon", "operations-carbon-light"]);
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

/* ===========================================================================
 * Slice S2 — mechanism M1, the keyset table
 * ======================================================================== */

interface Row {
  id: string;
  symbol: string;
  qty: string;
  note: string;
}

function makeRows(n: number, offset = 0): Row[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `ord_${offset + i}`,
    symbol: "BTC-PERP",
    qty: "0.0400",
    note: "a reason long enough that a prose column would want to truncate it",
  }));
}

const COLUMNS: readonly Column<Row>[] = [
  { key: "id", header: "order_id", render: (r) => r.id },
  { key: "symbol", header: "symbol", render: (r) => r.symbol },
  { key: "qty", header: "qty", numeric: true, render: (r) => r.qty },
  { key: "note", header: "reason", truncate: true, title: (r) => r.note, render: (r) => r.note },
];

function page(rows: Row[], extra: Partial<KeysetPage<Row>> = {}): KeysetPage<Row> {
  return { rows, totalCount: 48_213, ...extra };
}

describe("M1 keyset table — counts", () => {
  it("reports the server's total, not the number of rows it is holding", () => {
    // Three rows loaded out of 48,213. A browser-side count would say 3, and it
    // would be wrong in exactly the way mechanism M7 exists to prevent.
    render(<KeysetTable label="Orders" columns={COLUMNS} page={page(makeRows(3))} rowKey={(r) => r.id} />);
    expect(screen.getByText("48,213")).toBeTruthy();
    expect(screen.queryByText("3 total")).toBeNull();
  });

  it("shows the filtered count beside the total when a filter narrowed it", () => {
    render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(3), { filteredCount: 412 })}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText("412")).toBeTruthy();
    expect(screen.getByText(/in selection/)).toBeTruthy();
  });

  it("does not claim a selection when the filter matched everything", () => {
    render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(3), { filteredCount: 48_213 })}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.queryByText(/in selection/)).toBeNull();
  });
});

describe("M1 keyset table — pagination is keyset, and says so", () => {
  it("offers no page-number control, because keyset cannot seek to page n", () => {
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(100), { hasMore: true, nextCursor: "c_ab34e91f0055" })}
        rowKey={(r) => r.id}
        onLoadOlder={() => {}}
      />,
    );
    const buttons = [...container.querySelectorAll("button")].map((b) => b.textContent ?? "");
    expect(buttons.some((t) => /load older/.test(t))).toBe(true);
    // No numeric page buttons anywhere in the footer.
    expect(buttons.some((t) => /^\s*\d+\s*$/.test(t))).toBe(false);
    expect(screen.getByText(/never OFFSET/)).toBeTruthy();
  });

  it("offers both directions once pages have been evicted behind the reader", () => {
    // BR-EX-17. Without prev_cursor a reader past the residency budget can only
    // restart at row one.
    render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(100), { hasMore: true, hasPrevious: true })}
        rowKey={(r) => r.id}
        onLoadOlder={() => {}}
        onLoadNewer={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: /load newer/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /load older/ })).toBeTruthy();
  });

  it("truncates the cursor for display but keeps the whole thing in the title", () => {
    render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(2), { nextCursor: "c_ab34e91f0055deadbeef" })}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByTitle("c_ab34e91f0055deadbeef")).toBeTruthy();
  });
});

describe("M1 keyset table — scale behaviour", () => {
  it("renders every row below the virtualization threshold", () => {
    const { container } = render(
      <KeysetTable label="Orders" columns={COLUMNS} page={page(makeRows(200))} rowKey={(r) => r.id} />,
    );
    expect(container.querySelector(".exec-table")?.getAttribute("data-virtualized")).toBe("false");
    expect(container.querySelectorAll("tbody tr").length).toBe(200);
  });

  it("renders a window, not 5,000 rows, once virtualized", () => {
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(5000))}
        rowKey={(r) => r.id}
        viewportRows={20}
      />,
    );
    expect(container.querySelector(".exec-table")?.getAttribute("data-virtualized")).toBe("true");
    const bodyRows = container.querySelectorAll("tbody tr:not(.exec-table-pad)");
    expect(bodyRows.length).toBeLessThan(60);
    // The rows that are not drawn are still accounted for, so the scrollbar is
    // honest about how much is behind it.
    const pads = container.querySelectorAll("tbody tr.exec-table-pad");
    expect(pads.length).toBeGreaterThan(0);
    expect(pads[pads.length - 1].getAttribute("aria-hidden")).toBe("true");
  });

  it("states the true row count to assistive technology rather than the window", () => {
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(5000))}
        rowKey={(r) => r.id}
        viewportRows={20}
      />,
    );
    expect(container.querySelector("table")?.getAttribute("aria-rowcount")).toBe("48213");
  });

  it("says so when the caller has blown the residency budget", () => {
    render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(2001))}
        rowKey={(r) => r.id}
        viewportRows={20}
      />,
    );
    expect(screen.getByText(/over the 2,000 budget/)).toBeTruthy();
  });
});

describe("M1 keyset table — M6, a number is never ellipsised", () => {
  it("marks numeric cells numeric and refuses to truncate them", () => {
    const numeric: readonly Column<Row>[] = [
      // A caller asking for both. M6 is not negotiable per column, so the
      // truncate flag loses.
      { key: "qty", header: "qty", numeric: true, truncate: true, render: (r) => r.qty },
    ];
    const { container } = render(
      <KeysetTable label="Orders" columns={numeric} page={page(makeRows(1))} rowKey={(r) => r.id} />,
    );
    const cell = container.querySelector("tbody td");
    expect(cell?.getAttribute("data-numeric")).toBe("true");
    expect(cell?.getAttribute("data-truncate")).toBeNull();
  });

  it("lets prose truncate, but only with a tooltip carrying the full text", () => {
    const { container } = render(
      <KeysetTable label="Orders" columns={COLUMNS} page={page(makeRows(1))} rowKey={(r) => r.id} />,
    );
    const prose = container.querySelector('tbody td[data-truncate="true"]');
    expect(prose).not.toBeNull();
    expect(prose?.getAttribute("title")).toContain("long enough");
  });
});

describe("M1 keyset table — the server's filter is the truth on display", () => {
  it("echoes what the server actually applied, not what was requested", () => {
    render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page(makeRows(2), {
          appliedFilters: [{ field: "status", op: "in", value: "FILLED" }],
          appliedSort: [{ field: "event_ts", direction: "desc" }],
        })}
        rowKey={(r) => r.id}
      />,
    );
    expect(screen.getByText(/server filter: status in FILLED/)).toBeTruthy();
    expect(screen.getByText(/sort: event_ts desc/)).toBeTruthy();
  });

  it("renders a named empty state rather than a table with no rows", () => {
    const { container } = render(
      <KeysetTable label="Orders" columns={COLUMNS} page={page([])} rowKey={(r) => r.id} />,
    );
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('.exec-state[data-status="empty"]')).not.toBeNull();
  });

  it("shows a denial as a denial, not as an empty list", () => {
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={COLUMNS}
        page={page([])}
        rowKey={(r) => r.id}
        status="denied"
        reason="portal.execution.blotter.read"
      />,
    );
    expect(container.querySelector('.exec-state[data-status="denied"]')).not.toBeNull();
  });
});

/* ===========================================================================
 * Registry revision 4 — delivery profile reconciliation
 * ======================================================================== */

describe("delivery profile reconciliation is fail-closed", () => {
  it("accepts a panel stricter than its screen", () => {
    // A live screen whose correlation panel still reads shadow data is honest,
    // not broken.
    const r = reconcilePanelProfile("live_full", "shadow");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.effective).toBe("shadow");
      expect(r.stricterThanScreen).toBe(true);
      expect(r.label).toBe(true);
    }
  });

  it("refuses a panel claiming more authority than its screen was commissioned for", () => {
    const r = reconcilePanelProfile("shadow", "live_full");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.panelStatus).toBe("unavailable");
      expect(r.reason).toContain("never more");
    }
  });

  it("refuses a panel that did not state its profile at all", () => {
    // Silence and a live claim must not look the same.
    const r = reconcilePanelProfile("live_canary", null);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.panelStatus).toBe("unavailable");
  });

  it("still renders while the registry is at revision 3 and publishes no profile", () => {
    // Failing closed here would blank every Execution panel to prevent a
    // mismatch that cannot occur yet, because there is nothing to mismatch.
    const r = reconcilePanelProfile(null, "paper");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.effective).toBe("paper");
      expect(r.label).toBe(false);
    }
  });

  it("labels exactly the two profiles nothing else on the screen distinguishes", () => {
    expect(PROFILE_ORDER.filter(profileNeedsLabel)).toEqual(["fixture", "shadow"]);
  });

  it("orders profiles by the authority they claim", () => {
    const ranks = PROFILE_ORDER.map((p) => PROFILE_RANK[p]);
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    expect(PROFILE_RANK.shadow).toBeLessThan(PROFILE_RANK.paper);
    expect(PROFILE_RANK.live_canary).toBeLessThan(PROFILE_RANK.live_full);
  });
});

describe("registry revision 4 consumption", () => {
  it("reads the profile off a screen contract, where revision 4 publishes it", () => {
    expect(
      screenDeliveryProfile({ screen_id: "EXECUTION_BLOTTER_SCREEN", delivery_profile: "shadow" }),
    ).toBe("shadow");
  });

  it("treats a screen outside the Execution cluster, whose profile is null, as absent", () => {
    expect(screenDeliveryProfile({ screen_id: "ALPHA_POOL_SCREEN", delivery_profile: null })).toBeNull();
    expect(screenDeliveryProfile(null)).toBeNull();
  });

  it("refuses to guess at a profile this build has never heard of", () => {
    // Version skew. Coercing an unknown value to the nearest known one is how a
    // live_full screen ends up rendering as something safer than it is.
    expect(screenDeliveryProfile({ delivery_profile: "live_shadow_canary" })).toBeNull();
  });
});

describe("delivery policy — the seven flags gate the commands", () => {
  const REV4_FIXTURE_SCREEN = {
    screen_id: "EXECUTION_BLOTTER_SCREEN",
    delivery_profile: "fixture",
    delivery_policy: {
      policy_revision: 1,
      query_enabled: false,
      projection_ingestion_enabled: false,
      sse_enabled: false,
      paper_commands_enabled: false,
      sandbox_commands_enabled: false,
      live_protective_commands_enabled: false,
      live_risk_increasing_commands_enabled: false,
    },
  };

  it("parses the policy the registry actually publishes today", () => {
    const p = screenDeliveryPolicy(REV4_FIXTURE_SCREEN);
    expect(p).not.toBeNull();
    expect(p?.policyRevision).toBe(1);
    // Everything is off in revision 4 as delivered, which is correct: nothing
    // is wired yet.
    expect(p?.queryEnabled).toBe(false);
    expect(p?.liveRiskIncreasingCommandsEnabled).toBe(false);
  });

  it("keeps protective and risk-increasing live commands on separate flags", () => {
    // The rule this test defends: enabling emergency protection must never
    // enable capital expansion. One flag for "live commands" would do that.
    const p = screenDeliveryPolicy({
      delivery_policy: {
        policy_revision: 7,
        live_protective_commands_enabled: true,
        live_risk_increasing_commands_enabled: false,
      },
    });
    expect(commandEnabled(p, "R3")).toBe(true);
    expect(commandEnabled(p, "R4")).toBe(false);
  });

  it("fails closed when a screen publishes no policy at all", () => {
    for (const tier of ["R0", "R1", "R2", "R3", "R4"] as const) {
      expect(commandEnabled(null, tier)).toBe(false);
    }
    expect(commandBlockedReason(null, "R1")).toContain("no published delivery policy");
  });

  it("treats a malformed or missing flag as absence of permission", () => {
    const p = screenDeliveryPolicy({
      delivery_policy: { policy_revision: 2, paper_commands_enabled: "yes" },
    });
    expect(commandEnabled(p, "R1")).toBe(false);
  });

  it("names the policy revision that blocked the command", () => {
    const p = screenDeliveryPolicy(REV4_FIXTURE_SCREEN);
    // A disabled button with no explanation reads the same as a broken one, and
    // the two need different responses.
    expect(commandBlockedReason(p, "R1")).toContain("delivery policy revision 1");
  });
});

describe("registry revision 4 — parsed against the registry actually shipped", () => {
  // A contract test across the FE/BE boundary rather than against a fixture of
  // our own making. It is the thing that notices the day the field moves, is
  // renamed, or grows a value this build does not know.
  const registry = JSON.parse(
    readFileSync(join(process.cwd(), "../registry/registry.json"), "utf8"),
  ) as { revision: number; screens: unknown[] };

  const withProfile = registry.screens.filter(
    (s) => (s as Record<string, unknown>).delivery_profile != null,
  );

  it("parses every published profile — none silently dropped as unknown", () => {
    for (const screen of withProfile) {
      const raw = (screen as Record<string, unknown>).delivery_profile;
      expect(
        screenDeliveryProfile(screen),
        `${String((screen as Record<string, unknown>).screen_id)} publishes ${String(raw)}, which this build does not recognise`,
      ).not.toBeNull();
    }
  });

  it("parses every published policy and enables no command at revision 4", () => {
    // Every screen ships with all seven flags off. If this ever fails, a
    // command was switched on in the registry and somebody should know.
    for (const screen of withProfile) {
      const policy = screenDeliveryPolicy(screen);
      if (!policy) continue;
      for (const tier of ["R1", "R2", "R3", "R4"] as const) {
        expect(
          commandEnabled(policy, tier),
          `${String((screen as Record<string, unknown>).screen_id)} has ${tier} commands enabled`,
        ).toBe(false);
      }
    }
  });

  /* Codex's constraint, 2026-08-21: the frontend adapter may be finished, but
   * `delivery_profile` stays `fixture` and every runtime flag stays false until
   * `EX-BE-02`/`EX-BE-03` have evidence. A constraint nobody can check is a
   * hope, so it is checked here. Both assertions are meant to fail the day the
   * activation happens — that is the point. When they do, the change is
   * deliberate and this test is updated in the same commit that activates it. */
  it("keeps every execution screen at delivery_profile=fixture", () => {
    for (const screen of registry.screens) {
      const s = screen as Record<string, unknown>;
      const id = String(s.screen_id ?? "");
      if (!id.startsWith("EXECUTION_")) continue;
      expect(screenDeliveryProfile(screen), `${id} is no longer fixture`).toBe("fixture");
    }
  });

  it("keeps query, projection ingestion and SSE switched off too", () => {
    // The four command tiers are covered above. These three are the read and
    // realtime halves, and leaving them out would let the surface start
    // consuming real data while the assertion above still passed.
    for (const screen of withProfile) {
      const policy = screenDeliveryPolicy(screen);
      if (!policy) continue;
      const id = String((screen as Record<string, unknown>).screen_id ?? "");
      expect(policy.queryEnabled, `${id} query_enabled`).toBe(false);
      expect(policy.projectionIngestionEnabled, `${id} projection_ingestion_enabled`).toBe(false);
      expect(policy.sseEnabled, `${id} sse_enabled`).toBe(false);
    }
  });
});

/* ===========================================================================
 * Slice S3 — the wire adapter
 * ======================================================================== */

describe("S3 adapter — decimals arrive as strings and stay strings", () => {
  it("keeps every digit the server sent, including trailing zeros", () => {
    // extract/serialization-contract.json headline: every numeric column
    // arrives as a JSON string. Number("0.00100000") is 0.001 — the same value
    // with the instrument's precision thrown away.
    const d = readDecimal("0.00100000");
    expect(d).toBe("0.00100000");
    expect(formatDecimal(d!)).toBe("0.00100000");
  });

  it("groups the integer part and never touches the fraction", () => {
    expect(formatDecimal(readDecimal("60890.00")!)).toBe("60,890.00");
    expect(formatDecimal(readDecimal("182431")!)).toBe("182,431");
    expect(formatDecimal(readDecimal("-1234.5")!)).toBe("-1,234.5");
    expect(formatDecimal(readDecimal("999")!)).toBe("999");
  });

  it("refuses a JSON number where the contract promised a string", () => {
    // By the time it reaches here the precision loss already happened upstream.
    // Accepting it would launder a bug into a plausible-looking figure.
    expect(readDecimal(0.001)).toBeNull();
    expect(readDecimal(60890)).toBeNull();
  });

  it("refuses malformed input rather than guessing at it", () => {
    expect(readDecimal("1e-8")).toBeNull();
    expect(readDecimal("60,890.00")).toBeNull();
    expect(readDecimal("")).toBeNull();
    expect(readDecimal(null)).toBeNull();
  });

  it("exposes no way to turn a decimal into a number", () => {
    // The guard is the branded type plus the absence of a toNumber export.
    // This test documents the intent so a future addition is a deliberate act.
    const mod = { readDecimal, formatDecimal };
    expect(Object.keys(mod).some((k) => /number|float|parse/i.test(k))).toBe(false);
  });
});

describe("S3 adapter — an unknown enum is a finding, not a default", () => {
  it("preserves the raw token instead of mapping to the nearest known value", () => {
    const r = readEnum("PARTIALLY_CANCELLED", ["FILLED", "REJECTED"] as const);
    expect(r).toEqual({ known: false, raw: "PARTIALLY_CANCELLED" });
  });

  it("turns an unsupported envelope value into a warning the panel must show", () => {
    const { envelope, unsupported } = readEnvelope({
      source_authority: "EXECUTION",
      freshness_state: "VERY_FRESH",
      as_of: "2026-08-21T10:42:01Z",
    });
    expect(unsupported).toEqual([{ field: "freshness_state", raw: "VERY_FRESH" }]);
    // Falls back to the value that claims least, and says so out loud.
    expect(envelope.freshness).toBe("UNKNOWN");
    expect(envelope.warnings?.join(" ")).toContain("VERY_FRESH");
  });

  it("does not silently bucket an unsupported order status into a filter", () => {
    const buckets = Object.values(BLOTTER_BUCKET).flat() as string[];
    expect(buckets).not.toContain("PARTIALLY_CANCELLED");
    expect(BLOTTER_UNBUCKETED as readonly string[]).not.toContain("PARTIALLY_CANCELLED");
  });
});

describe("S3 adapter — envelope", () => {
  it("maps the published shape field for field", () => {
    const { envelope } = readEnvelope({
      source_authority: "BROKER",
      as_of: "2026-08-21T10:42:01Z",
      read_at: "2026-08-21T10:42:03Z",
      source_cursor: {
        event_ts: "2026-08-21T10:42:01Z",
        created_at: "2026-08-21T10:42:01Z",
        event_id: "evt_8814",
      },
      source_sequence: null,
      projection_epoch: "0a4c8f22-1111-4222-8333-444455556666",
      projection_sequence: 8814,
      source_completeness: "POLL_BOUNDED",
      poll_interval_ms: 5000,
      freshness_state: "OK",
      age_seconds: 2,
      lag_ms: 240,
      delivery_profile: "shadow",
      panel_state: "ok",
      capability_snapshot_id: "cap_77",
      warnings: [],
    });
    expect(envelope.authority).toBe("BROKER");
    expect(envelope.sourceCursor?.eventId).toBe("evt_8814");
    expect(envelope.projectionSequence).toBe(8814);
    expect(envelope.sourceCompleteness).toBe("POLL_BOUNDED");
    expect(envelope.pollIntervalMs).toBe(5000);
    expect(envelope.deliveryProfile).toBe("shadow");
    // Data age and projection lag stay two quantities.
    expect(envelope.ageSeconds).toBe(2);
    expect(envelope.lagMs).toBe(240);
  });

  it("never fabricates a source sequence from the projection one", () => {
    const { envelope } = readEnvelope({ projection_sequence: 8814, source_sequence: null });
    expect(envelope.sourceSequence).toBeNull();
    expect(envelope.projectionSequence).toBe(8814);
  });

  it("treats an anonymous panel as DERIVED and says why", () => {
    // A panel that states no authority is making an unattributed claim. DERIVED
    // is the weakest of the four, so it is the safe one to be wrong about.
    const { envelope } = readEnvelope({ as_of: "2026-08-21T10:42:01Z" });
    expect(envelope.authority).toBe("DERIVED");
    expect(envelope.warnings?.join(" ")).toContain("No source authority");
  });

  it("does not borrow read_at when as_of is missing", () => {
    const { envelope } = readEnvelope({
      source_authority: "EXECUTION",
      read_at: "2026-08-21T10:42:03Z",
    });
    // Merging them would let a fast read of a two-hour-old row render as two
    // seconds fresh.
    expect(envelope.asOf).toBeNull();
    expect(envelope.readAt).toBe("2026-08-21T10:42:03Z");
  });

  it("rejects a malformed timestamp rather than passing it to the badge", () => {
    const { envelope } = readEnvelope({ source_authority: "EXECUTION", as_of: "yesterday" });
    expect(envelope.asOf).toBeNull();
  });
});

describe("S3 adapter — keyset page", () => {
  const wire = {
    data: {
      rows: [
        { order_id: "ord_88a2", quantity: "0.04000000", price: "60890.00" },
        { order_id: "ord_88a3", quantity: "0.00100000", price: "60891.25" },
      ],
      total_count: 182_431,
      filtered_count: 412,
      next_cursor: "c_ab34e91f0055",
      prev_cursor: "c_9911aa22",
      has_more: true,
      has_previous: true,
      applied_sort: [{ field: "event_ts", direction: "desc" }],
      applied_filters: [{ field: "status", op: "in", value: "FILLED" }],
    },
  };

  const mapOrder = (row: Record<string, unknown>) => {
    const id = readId(row.order_id);
    return id ? { id, qty: readDecimal(row.quantity), price: readDecimal(row.price) } : null;
  };

  it("reads counts and both cursors from the server", () => {
    const p = readKeysetPage(wire, mapOrder);
    expect(p.totalCount).toBe(182_431);
    expect(p.filteredCount).toBe(412);
    expect(p.nextCursor).toBe("c_ab34e91f0055");
    expect(p.prevCursor).toBe("c_9911aa22");
    expect(p.hasPrevious).toBe(true);
  });

  it("carries the decimals through without going near a number", () => {
    const p = readKeysetPage(wire, mapOrder);
    expect(p.rows[1].qty).toBe("0.00100000");
  });

  it("reports zero rather than falling back to the loaded row count", () => {
    // A page that cannot say how large the population is has not met the
    // contract. Zero reads as wrong; rows.length would read as plausible.
    const p = readKeysetPage({ data: { rows: [{ order_id: "ord_1" }] } }, mapOrder);
    expect(p.rows.length).toBe(1);
    expect(p.totalCount).toBe(0);
  });

  it("drops a row it cannot read rather than rendering it half-empty", () => {
    const p = readKeysetPage(
      { data: { rows: [{ order_id: "ord_1" }, { no_id: true }], total_count: 2 } },
      mapOrder,
    );
    expect(p.rows.length).toBe(1);
    // The count still comes from the server, so the footer disagreeing with the
    // visible rows is the correct, visible symptom of a contract skew.
    expect(p.totalCount).toBe(2);
  });

  it("echoes the server's filter and sort so a dropped filter is visible", () => {
    const p = readKeysetPage(wire, mapOrder);
    expect(p.appliedSort).toEqual([{ field: "event_ts", direction: "desc" }]);
    expect(p.appliedFilters).toEqual([{ field: "status", op: "in", value: "FILLED" }]);
  });

  it("survives a response with nothing in it at all", () => {
    const p = readKeysetPage(null, mapOrder);
    expect(p.rows).toEqual([]);
    expect(p.totalCount).toBe(0);
  });
});

describe("command drawer — risk tier and delivery policy", () => {
  const plan = {
    id: "cmd_9f12",
    expiresInSeconds: 120,
    requestPreview: "{}",
    equivalentCli: "portal exec halt",
    checks: [{ label: "Deployment is ACTIVE", outcome: "pass" as const }],
  };
  const allowLive = screenDeliveryPolicy({
    delivery_policy: {
      policy_revision: 9,
      live_protective_commands_enabled: true,
      live_risk_increasing_commands_enabled: true,
      paper_commands_enabled: true,
    },
  });

  it("blocks on delivery policy before anything the operator can type", () => {
    render(
      <CommandPlanDrawer
        title="Halt deployment"
        step="apply"
        plan={plan}
        riskTier="R3"
        policy={screenDeliveryPolicy({
          delivery_policy: { policy_revision: 1, live_protective_commands_enabled: false },
        })}
      />,
    );
    // A command the backend switched off is not a form to fill in correctly.
    expect(screen.getByText(/Live protective commands are disabled/)).toBeTruthy();
    expect(screen.getByText(/delivery policy revision 1/)).toBeTruthy();
  });

  it("blocks every tier when the screen publishes no policy at all", () => {
    render(<CommandPlanDrawer title="Halt" step="apply" plan={plan} riskTier="R1" />);
    expect(screen.getByText(/no published delivery policy/)).toBeTruthy();
  });

  it("demands a security key for a risk-increasing live command and not for a protective one", () => {
    // R3 and R4 are two permissions, not two rungs. A step-up satisfied for an
    // emergency halt must never carry into a capital expansion.
    const { rerender } = render(
      <CommandPlanDrawer
        title="Expand envelope"
        step="apply"
        plan={plan}
        riskTier="R4"
        policy={allowLive}
        freshAuthSatisfied={false}
      />,
    );
    expect(screen.getByText(/security key \(WebAuthn\)/)).toBeTruthy();

    rerender(
      <CommandPlanDrawer
        title="Halt deployment"
        step="apply"
        plan={plan}
        riskTier="R3"
        policy={allowLive}
        freshAuthSatisfied={false}
      />,
    );
    expect(screen.queryByText(/security key \(WebAuthn\)/)).toBeNull();
    expect(screen.getByText(/requires fresh authentication/)).toBeTruthy();
  });

  it("requires a second approver at R2 and R4 but not at R3", () => {
    // R3 is emergency protection. Waiting for a second person to permit a halt
    // is how a position keeps bleeding.
    const { rerender } = render(
      <CommandPlanDrawer
        title="Halt"
        step="apply"
        plan={plan}
        riskTier="R3"
        policy={allowLive}
        secondApproverSatisfied={false}
      />,
    );
    expect(screen.queryByText(/second approver/)).toBeNull();

    rerender(
      <CommandPlanDrawer
        title="Expand"
        step="apply"
        plan={plan}
        riskTier="R4"
        policy={allowLive}
        secondApproverSatisfied={false}
      />,
    );
    expect(screen.getByText(/second approver is required/)).toBeTruthy();
  });

  it("asks nothing extra at R1 once policy allows it", () => {
    render(
      <CommandPlanDrawer
        title="Flatten paper position"
        step="apply"
        plan={plan}
        riskTier="R1"
        policy={allowLive}
      />,
    );
    expect(screen.queryByText(/re-authenticate/)).toBeNull();
    expect(screen.queryByText(/second approver/)).toBeNull();
    // The ordinary blocker still stands.
    expect(screen.getByText(/a reason is required/)).toBeTruthy();
  });

  it("names the tier on the drawer so the demands are not a surprise", () => {
    const { container } = render(
      <CommandPlanDrawer title="Expand" step="plan" plan={null} riskTier="R4" policy={allowLive} />,
    );
    const tier = container.querySelector(".exec-drawer-tier");
    expect(tier?.textContent).toBe("R4");
    expect(tier?.getAttribute("title")).toContain("RISK-INCREASING");
  });
});

/* ===========================================================================
 * The three principles, tested as principles
 * ======================================================================== */

describe("principle 1 — permission is deny-by-default", () => {
  it("denies every tier under every shape of missing permission", () => {
    const cases: [string, ReturnType<typeof screenDeliveryPolicy>][] = [
      ["no policy published", null],
      ["policy present but empty", screenDeliveryPolicy({ delivery_policy: {} })],
      ["flags are strings", screenDeliveryPolicy({ delivery_policy: { paper_commands_enabled: "true" } })],
      ["flags are 1", screenDeliveryPolicy({ delivery_policy: { paper_commands_enabled: 1 } })],
      ["flags are null", screenDeliveryPolicy({ delivery_policy: { paper_commands_enabled: null } })],
    ];
    for (const [label, policy] of cases) {
      for (const tier of ["R0", "R1", "R2", "R3", "R4"] as const) {
        expect(commandEnabled(policy, tier), `${label} / ${tier}`).toBe(false);
      }
    }
  });

  it("grants only on an exact boolean true", () => {
    const p = screenDeliveryPolicy({ delivery_policy: { paper_commands_enabled: true } });
    expect(commandEnabled(p, "R1")).toBe(true);
    expect(commandEnabled(p, "R2")).toBe(false);
  });
});

describe("principle 2 — 202 is never a final result", () => {
  it("reads an accepted apply as unverified and pending, whatever the body says", () => {
    // A server that returns 202 and SUCCEEDED together has contradicted itself.
    // The safe half of a contradiction is the one that keeps the operator
    // watching.
    const op = readOperation({ operation_id: "op_1", status: "VERIFIED", verification_result: "SUCCEEDED" }, 202);
    expect(op.status).toBe("APPLIED_UNVERIFIED");
    expect(op.verification).toEqual({ known: true, value: "PENDING" });
  });

  it("treats SUCCEEDED as the only terminal success", () => {
    expect(isTerminalSuccess("SUCCEEDED")).toBe(true);
    for (const r of ["PENDING", "ACKNOWLEDGED", "PARTIAL", "UNCERTAIN", "FAILED", "DENIED", "EXPIRED"] as const) {
      expect(isTerminalSuccess(r), r).toBe(false);
    }
  });

  it("never lets UNCERTAIN count as settled", () => {
    // Master plan §7.3: terminal for the retry loop, non-terminal for
    // operational truth, and it never ages into EXPIRED.
    expect(isSettled("UNCERTAIN")).toBe(false);
    expect(isSettled("PENDING")).toBe(false);
    expect(isSettled("ACKNOWLEDGED")).toBe(false);
    for (const r of ["SUCCEEDED", "FAILED", "DENIED", "PARTIAL", "EXPIRED"] as const) {
      expect(isSettled(r), r).toBe(true);
    }
  });

  it("says out loud that an uncertain result will not settle itself", () => {
    render(<CommandPlanDrawer title="Halt" step="verify" plan={null} verification="UNCERTAIN" />);
    expect(screen.getByText(/never ages into EXPIRED/)).toBeTruthy();
  });

  it("blocks a risk-increasing retry while an uncertain operation is outstanding", () => {
    const allow = screenDeliveryPolicy({
      delivery_policy: { policy_revision: 3, live_risk_increasing_commands_enabled: true },
    });
    render(
      <CommandPlanDrawer
        title="Expand"
        step="apply"
        plan={{ id: "c", expiresInSeconds: 60, requestPreview: "", equivalentCli: "", checks: [] }}
        riskTier="R4"
        policy={allow}
        outstandingUncertain
      />,
    );
    expect(screen.getByText(/risk-increasing command is blocked until it is reconciled/)).toBeTruthy();
  });

  it("lets a protective command through after a fresh replan, and not before", () => {
    // Refusing to let an operator halt something because an earlier halt is
    // unresolved is the failure mode that costs the most.
    const allow = screenDeliveryPolicy({
      delivery_policy: { policy_revision: 3, live_protective_commands_enabled: true },
    });
    const plan = { id: "c", expiresInSeconds: 60, requestPreview: "", equivalentCli: "", checks: [] };
    const { rerender } = render(
      <CommandPlanDrawer title="Halt" step="apply" plan={plan} riskTier="R3" policy={allow} outstandingUncertain />,
    );
    expect(screen.getByText(/regenerate the plan against fresh authority/)).toBeTruthy();

    rerender(
      <CommandPlanDrawer
        title="Halt"
        step="apply"
        plan={plan}
        riskTier="R3"
        policy={allow}
        outstandingUncertain
        replannedAfterUncertain
      />,
    );
    expect(screen.queryByText(/regenerate the plan against fresh authority/)).toBeNull();
  });
});

describe("principle 3 — permission is never inferred from profile", () => {
  it("does not let a live profile grant anything", () => {
    // The profile says the data is live. It says nothing about whether this
    // actor may act on it.
    render(
      <CommandPlanDrawer
        title="Halt"
        step="apply"
        plan={{ id: "c", expiresInSeconds: 60, requestPreview: "", equivalentCli: "", checks: [] }}
        riskTier="R3"
        dataProfile="live_full"
        policy={null}
      />,
    );
    expect(screen.getByText(/no published delivery policy/)).toBeTruthy();
  });

  it("does not let a fixture profile block what the registry permitted", () => {
    // The inverse direction, and the one that is tempting to get wrong. A
    // client that invents an authorization rule will eventually invent a
    // permissive one, so it invents neither.
    const allow = screenDeliveryPolicy({
      delivery_policy: { policy_revision: 3, live_protective_commands_enabled: true },
    });
    render(
      <CommandPlanDrawer
        title="Halt"
        step="apply"
        plan={{ id: "c", expiresInSeconds: 60, requestPreview: "", equivalentCli: "", checks: [] }}
        riskTier="R3"
        dataProfile="fixture"
        policy={allow}
      />,
    );
    const blocked = screen.queryByText(/Apply is blocked/);
    expect(blocked?.textContent ?? "").not.toContain("delivery policy");
    expect(blocked?.textContent ?? "").not.toContain("FIXTURE");
  });

  it("reports the inconsistency loudly instead of resolving it", () => {
    const allow = screenDeliveryPolicy({
      delivery_policy: { policy_revision: 3, live_protective_commands_enabled: true },
    });
    expect(commandProfileInconsistency("shadow", allow, "R3")).toContain("SHADOW");
    expect(commandProfileInconsistency("shadow", allow, "R3")).toContain("not blocked here");
    // Nothing to report when the profile is a real environment.
    expect(commandProfileInconsistency("live_canary", allow, "R3")).toBeNull();
    // Nothing to report when the command was not granted in the first place.
    expect(commandProfileInconsistency("shadow", null, "R3")).toBeNull();
  });

  it("takes no profile argument in the permission function at all", () => {
    // The separation is structural rather than a convention, because a
    // convention is what gets forgotten on screen fourteen.
    expect(commandEnabled.length).toBe(2);
    expect(PERMISSION_SOURCE).toBe("delivery_policy");
  });
});

describe("BR-EX-18 — the request key belongs to the intent", () => {
  it("keeps one key across re-renders so a retry is not a second operation", () => {
    const { container, rerender } = render(
      <CommandPlanDrawer title="Halt" step="plan" plan={null} />,
    );
    const first = container.querySelector(".exec-drawer-key strong")?.textContent;
    rerender(<CommandPlanDrawer title="Halt" step="apply" plan={null} />);
    expect(container.querySelector(".exec-drawer-key strong")?.textContent).toBe(first);
    expect(first).toMatch(/^rk_/);
  });

  it("generates distinct keys for distinct intents", () => {
    expect(newRequestKey()).not.toBe(newRequestKey());
  });

  it("blocks apply after a 409 rather than silently retrying", () => {
    render(
      <CommandPlanDrawer
        title="Halt"
        step="apply"
        plan={{ id: "c", expiresInSeconds: 60, requestPreview: "", equivalentCli: "", checks: [] }}
        conflict
      />,
    );
    expect(screen.getByText(/already used with a different payload/)).toBeTruthy();
  });
});

describe("problems map to the states a human responds to differently", () => {
  it("follows the sample file's own rule for 5xx and unknown", () => {
    expect(panelStatusForHttp(503)).toBe("unavailable");
    expect(panelStatusForHttp(500)).toBe("unavailable");
    expect(panelStatusForHttp(403)).toBe("denied");
    expect(panelStatusForHttp(429)).toBe("stale");
  });

  it("reads the gateway's problem envelope", () => {
    const p = readProblem(
      {
        envelope: {
          status: "error",
          error: { code: "RATE_LIMIT_EXCEEDED", message: "bucket exceeded", retry_after_seconds: 1 },
        },
      },
      429,
    );
    expect(p.code).toBe("RATE_LIMIT_EXCEEDED");
    expect(p.retryAfterSeconds).toBe(1);
    expect(p.panelStatus).toBe("stale");
  });

  it("names the failure even when the body is empty", () => {
    expect(readProblem(null, 503).code).toBe("HTTP_503");
  });
});

/* ===========================================================================
 * Phase 1 — Approval Inbox (UI states; integration waits on EX-BE-04a/05a)
 * ======================================================================== */

const inboxRow = (over: Partial<ApprovalRow> = {}): ApprovalRow => ({
  id: "AP-352",
  gate: "R2",
  subject: "Carry v3.2 → PF-MAIN",
  target: "paper · BINANCE",
  blockerCount: 1,
  blockerSummary: "broker sync stale",
  sla: { ageMinutes: 26 * 60, budgetMinutes: 24 * 60 },
  quorumMet: 0,
  quorumRequired: 2,
  inert: null,
  needsYou: true,
  ...over,
});

const inboxPage = (rows: ApprovalRow[]): KeysetPage<ApprovalRow> => ({
  rows,
  totalCount: 5,
});

describe("Approval Inbox", () => {
  it("shows a row the actor cannot approve, dimmed and labelled", () => {
    // Hiding it would make the queue lie about its own size and leave a request
    // stuck with nobody seeing it.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow({ inert: "SELF", needsYou: false })])}
        counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText("AP-352")).toBeTruthy();
    expect(screen.getByText(/not you \(separation-of-duty\)/)).toBeTruthy();
  });

  it("distinguishes the three reasons a row is inert", () => {
    const { rerender } = render(
      <ApprovalInbox
        page={inboxPage([inboxRow({ inert: "QUORUM" })])}
        counts={{ pending: 5, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText(/awaiting another approver/)).toBeTruthy();
    rerender(
      <ApprovalInbox
        page={inboxPage([inboxRow({ inert: "BLOCKED" })])}
        counts={{ pending: 5, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText(/blocked before review/)).toBeTruthy();
  });

  it("counts the whole queue, not the loaded page", () => {
    const { container } = render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
        filter="INBOX"
      />,
    );
    // One row is loaded and five are pending. The header describes the queue.
    const header = container.querySelector(".exec-inbox-counts");
    expect(header?.textContent).toContain("5 PENDING");
    expect(header?.textContent).toContain("1 overdue");
    expect(header?.textContent).toContain("1 due < 8h");
  });

  it("says inbox zero rather than showing a blank table", () => {
    const { container } = render(
      <ApprovalInbox
        page={inboxPage([])}
        counts={{ pending: 0, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(container.querySelector('.exec-state[data-status="empty"]')).not.toBeNull();
    expect(screen.getByText(/Inbox zero/)).toBeTruthy();
  });

  it("keeps decided requests out of the pending table", () => {
    // A decided request in the pending list is an action item that is not one.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        decided={inboxPage([inboxRow({ id: "AP-201", inert: null, needsYou: false })])}
        counts={{ pending: 5, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByRole("table", { name: "Pending approvals" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Recently decided" })).toBeTruthy();
  });

  it("names the policy and the actor's roles so a blocked Approve is explicable", () => {
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={{ pending: 1, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
        policyVersion="approval.v3"
        actor="Lan"
        actorRoles={["Quant Reviewer", "Ops Approver"]}
      />,
    );
    expect(screen.getByText(/policy approval\.v3 · you are Lan · Quant Reviewer \+ Ops Approver/)).toBeTruthy();
  });

  it("offers the hi-fi's filters and marks the active one", () => {
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={{ pending: 1, overdue: 0, dueSoon: 0 }}
        filter="OVERDUE"
      />,
    );
    expect(INBOX_FILTERS.length).toBe(8);
    expect(screen.getByRole("button", { name: "Overdue" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Inbox" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("states a cleared blocker rather than leaving the cell blank", () => {
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow({ blockerCount: 0, blockerSummary: "observation gate met" })])}
        counts={{ pending: 1, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText("0 — observation gate met")).toBeTruthy();
  });
});

/* ===========================================================================
 * Phase 2 — Gate R1 Review
 * ======================================================================== */

const PASSPORT = [
  { label: "alpha version", value: "av_2041", note: "· supersedes av_1988", verification: "✓ verified" },
  { label: "artifact digest", value: "sha256:9f3c1a…e2", verification: null },
];

const CHECKLIST = [
  { label: "exact engine / data / version pinned by digest", outcome: "pass" as const },
  { label: "final audit replay reproducible", outcome: "pass" as const },
  { label: "capacity evidence limited — volume covers top-3 symbols", outcome: "watch" as const, suggestion: "suggested condition below" },
];

function gate(over: Record<string, unknown> = {}) {
  return (
    <GateR1Review
      approvalId="AP-201"
      alphaLabel="RSI v1.7"
      releaseCandidate="RC-41"
      quorumMet={1}
      quorumRequired={2}
      policyVersion="approval.v3"
      creator="Minh"
      actor="Lan"
      passport={PASSPORT}
      checklist={CHECKLIST}
      {...over}
    />
  );
}

describe("Gate R1 Review", () => {
  it("locks Approve when the reviewer created the artifact, without being told to", () => {
    // Derived from creator vs actor rather than trusted from a prop: a screen
    // that renders a clean SoD line because a prop said so is one bad prop away
    // from permitting the thing it exists to refuse.
    render(gate({ actor: "Minh" }));
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/self-approval prohibited/)).toBeTruthy();
    expect(screen.getByText(/separation-of-duty VIOLATION/)).toBeTruthy();
  });

  it("confirms separation of duties by naming both people", () => {
    render(gate());
    expect(screen.getByText(/creator \(Minh\) ≠ you \(Lan\)/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false);
  });

  it("allows self-denial — withdrawing your own artifact is the safe direction", () => {
    // Separation of duties exists to stop you waving your own work through, not
    // to stop you withdrawing it. The person who knows the work best is often
    // the one who should.
    render(gate({ actor: "Minh" }));
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("lets a reviewer deny precisely because of a blocking finding", () => {
    // A blocking finding is a reason to refuse, not an obstacle to refusing.
    render(gate({ locks: ["BLOCKING_FINDINGS"] }));
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("locks Deny once the request has stopped being decidable", () => {
    // An expired request has nothing live to refuse, and a denial recorded
    // against it would be a decision on something that already lapsed.
    render(gate({ locks: ["EXPIRED"] }));
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/nothing live to refuse/)).toBeTruthy();
  });

  it("locks Deny for an actor who cannot decide the gate in either direction", () => {
    render(gate({ locks: ["NOT_ELIGIBLE"] }));
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", true);
  });

  it("removes Deny entirely on a closed gate rather than disabling it", () => {
    const { container } = render(
      gate({ decided: { outcome: "APPROVED", by: "Lan", at: "2026-08-21T09:12Z" } }),
    );
    expect(container.querySelector(".exec-gate-decision")).toBeNull();
  });

  it("reports every lock, not only the first", () => {
    render(gate({ actor: "Minh", locks: ["EXPIRED"] }));
    const reason = screen.getByText(/self-approval prohibited/);
    expect(reason.textContent).toContain("expired");
  });

  it("counts blocking findings separately from warnings", () => {
    // A warning counted as a blocker stops a legitimate approval; a blocker
    // counted as a warning waves a real one through.
    render(gate());
    expect(screen.getByText(/blocking items:/).textContent).toContain("0");
    expect(screen.getByText(/warnings:/).textContent).toContain("1");
  });

  it("states a passport claim nobody verified rather than leaving it blank", () => {
    render(gate());
    expect(screen.getByText("not verified")).toBeTruthy();
    expect(screen.getByText("✓ verified")).toBeTruthy();
  });

  it("renders a review it cannot show as a named state", () => {
    const { container } = render(gate({ status: "denied", reason: "portal.governance.r1.read" }));
    expect(container.querySelector('.exec-state[data-status="denied"]')).not.toBeNull();
    expect(container.querySelector("button")).toBeNull();
  });
});

describe("Approval Inbox — the full state set", () => {
  const counts = { pending: 5, overdue: 1, dueSoon: 1 };

  it("never renders a count it does not have as zero", () => {
    // "0 PENDING" is inbox zero — a specific, checkable claim. Showing it before
    // the server answered tells an operator their queue is clear when nobody
    // knows yet (rule §3.3).
    const { container } = render(
      <ApprovalInbox page={inboxPage([])} counts={null} filter="INBOX" status="loading" />,
    );
    expect(container.querySelector(".exec-inbox-counts")?.textContent).toBe("counting…");
    expect(container.querySelector(".exec-inbox-counts")?.textContent).not.toContain("0");
  });

  it("distinguishes a withheld count from an unreadable one", () => {
    const { container, rerender } = render(
      <ApprovalInbox page={inboxPage([])} counts={null} filter="INBOX" status="denied" />,
    );
    expect(container.querySelector(".exec-inbox-counts")?.textContent).toBe("queue size withheld");
    rerender(<ApprovalInbox page={inboxPage([])} counts={null} filter="INBOX" status="unavailable" />);
    expect(container.querySelector(".exec-inbox-counts")?.textContent).toBe("queue size unavailable");
  });

  it("renders a skeleton while loading, not an empty queue", () => {
    const { container } = render(
      <ApprovalInbox page={inboxPage([])} counts={null} filter="INBOX" status="loading" />,
    );
    // The skeleton is deliberately not an `.exec-state` box — it is aria-hidden
    // scaffolding with one spoken announcement beside it.
    expect(container.querySelectorAll(".exec-skeleton-block").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Inbox zero/)).toBeNull();
  });

  it("keeps the rows on a partial read and says what is missing", () => {
    // Blanking the screen because one linked fact timed out withholds work that
    // can be done.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={counts}
        filter="INBOX"
        status="partial"
        partialReason="Broker sync could not be read for 2 of 5 requests."
      />,
    );
    expect(screen.getByText("AP-352")).toBeTruthy();
    expect(screen.getByText(/Broker sync could not be read/)).toBeTruthy();
  });

  it("warns rather than blanks when the queue is stale", () => {
    render(
      <ApprovalInbox page={inboxPage([inboxRow()])} counts={counts} filter="INBOX" status="stale" />,
    );
    expect(screen.getByText("AP-352")).toBeTruthy();
    expect(screen.getByText(/older than its freshness budget/)).toBeTruthy();
  });

  it("makes the filters inert when a query is already known to fail", () => {
    render(<ApprovalInbox page={inboxPage([])} counts={null} filter="INBOX" status="denied" />);
    expect(screen.getByRole("button", { name: "Overdue" })).toHaveProperty("disabled", true);
  });

  it("leaves the filters usable on a partial read", () => {
    render(
      <ApprovalInbox page={inboxPage([inboxRow()])} counts={counts} filter="INBOX" status="partial" />,
    );
    expect(screen.getByRole("button", { name: "Overdue" })).toHaveProperty("disabled", false);
  });
});

describe("Gate R1 — the full state set", () => {
  it("still renders the review when part of it could not be read", () => {
    render(gate({ status: "partial", partialReason: "The equity evidence chart timed out." }));
    expect(screen.getByText(/Artifact passport/)).toBeTruthy();
    expect(screen.getByText("The equity evidence chart timed out.")).toBeTruthy();
    // And the decision is still reachable: a reviewer can read a passport whose
    // evidence chart failed to load.
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
  });

  it("replaces the screen only for states that cannot be reasoned about", () => {
    for (const status of ["denied", "unavailable", "empty", "insufficient_data"] as const) {
      const { container } = render(gate({ status, reason: "because" }));
      expect(container.querySelector(".exec-gate-decision"), status).toBeNull();
      expect(container.querySelector(".exec-state")?.getAttribute("data-status")).toBe(status);
      cleanup();
    }
    // Loading is the same refusal with a different rendering: a skeleton, not a
    // state box.
    const loading = render(gate({ status: "loading" })).container;
    expect(loading.querySelector(".exec-gate-decision")).toBeNull();
    expect(loading.querySelectorAll(".exec-skeleton-block").length).toBeGreaterThan(0);
  });

  it("keeps the gate identifiable even when it cannot be shown", () => {
    // A bare error box does not tell the reviewer which gate failed to load.
    render(gate({ status: "unavailable", reason: "edge unreachable" }));
    expect(screen.getByText(/GATE R1/)).toBeTruthy();
  });

  it("removes the decision controls once the gate is decided", () => {
    // A greyed Approve on an approved request reads as "not yet", which is the
    // opposite of what happened.
    const { container } = render(
      gate({ decided: { outcome: "APPROVED_WITH_CONDITION", by: "Minh", at: "2026-08-21T09:12Z" } }),
    );
    expect(container.querySelector(".exec-gate-decision")).toBeNull();
    expect(screen.getByText(/APPROVED WITH CONDITION by Minh/)).toBeTruthy();
    expect(screen.getByText(/This gate is closed/)).toBeTruthy();
  });

  it("does not print a lock reason on a gate that is already closed", () => {
    render(
      gate({
        actor: "Minh",
        decided: { outcome: "DENIED", by: "Lan", at: "2026-08-21T09:12Z" },
      }),
    );
    expect(screen.queryByText(/self-approval prohibited/)).toBeNull();
  });
});

/* ===========================================================================
 * Phase 3 — Gate R2 Review
 * ======================================================================== */

const READINESS = [
  {
    title: "Account & risk plan",
    entries: [
      { label: "account (new)", value: "paper-binance-carry-v32", revision: "account policy rev 7" },
      { label: "risk profile", value: "max order 5,000 · DD 8%", revision: "rev 12" },
      { label: "matcher config", value: "taker 4.0bp · latency 120ms" },
    ],
  },
];

const CAPITAL = [
  { label: "allocated capital", before: "0.00 USDT", after: "50,000.00 USDT" },
  { label: "concentration top-3", before: "44.0%", after: "46.0%", note: "within policy ceiling 55%" },
];

const CAP_ENVELOPE: Envelope = {
  authority: "DERIVED",
  asOf: "2026-08-21T10:41:07Z",
  freshness: "OK",
  formulaVersion: "capital.v2",
};

function r2(over: Record<string, unknown> = {}) {
  return (
    <GateR2Review
      approvalId="AP-207"
      subject="Carry v3.2 → PF-MAIN · Paper · BINANCE"
      r1Id="AP-201"
      r1State="APPROVED"
      policyVersion="approval.v3"
      planAuthor="Stan"
      actor="Lan"
      quorumMet={0}
      quorumRequired={2}
      readiness={READINESS}
      capital={CAPITAL}
      capitalEnvelope={CAP_ENVELOPE}
      grantName="paper_activation_authorization"
      {...over}
    />
  );
}

describe("Gate R2 Review", () => {
  it("blocks approval when the R1 it rests on has expired", () => {
    // Approving operational readiness for research nobody currently vouches for
    // produces a live deployment resting on a lapsed claim.
    render(r2({ r1State: "EXPIRED" }));
    expect(screen.getByText(/R1 approval expired/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
  });

  it("blocks on every invalid R1 state, not only expiry", () => {
    for (const state of ["DENIED", "PENDING", "MISSING"] as const) {
      render(r2({ r1State: state }));
      expect(screen.getByRole("button", { name: "Approve" }), state).toHaveProperty("disabled", true);
      cleanup();
    }
  });

  it("allows approval on an R1 approved with a condition", () => {
    // A carried condition is not a lapse. It travels forward.
    render(r2({ r1State: "APPROVED_WITH_CONDITION" }));
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false);
  });

  it("derives the R1 block rather than trusting a caller to pass a lock", () => {
    render(r2({ r1State: "EXPIRED", locks: [] }));
    expect(screen.getByText(/see the R1 status above/)).toBeTruthy();
  });

  it("refuses to render a capital preview that arrived without its authority", () => {
    // A before/after table about money, unattributed, looks exactly like a
    // record of something that happened.
    const { container } = render(r2({ capitalEnvelope: undefined }));
    expect(container.querySelector(".exec-gate-capital")).toBeNull();
    expect(screen.getByText(/without an authority envelope/)).toBeTruthy();
  });

  it("marks the preview as derived and not applied", () => {
    render(r2());
    expect(screen.getByText("PLAN PREVIEW")).toBeTruthy();
    expect(screen.getByText(/derived, not applied/)).toBeTruthy();
    expect(screen.getByText("DERIVED")).toBeTruthy();
  });

  it("blocks approval when the preview breaches a policy ceiling", () => {
    render(
      r2({
        capital: [{ label: "concentration top-3", before: "44.0%", after: "61.0%", note: "ceiling 55%", breach: true }],
      }),
    );
    expect(screen.getByText(/breaches a policy ceiling/)).toBeTruthy();
  });

  it("says a config revision is missing rather than leaving it blank", () => {
    // A config without its revision cannot be audited after the fact.
    render(r2());
    expect(screen.getByText(/revision not stated/)).toBeTruthy();
  });

  it("says that approving grants an authorization rather than executing", () => {
    render(r2());
    expect(screen.getByText(/does not execute/)).toBeTruthy();
    expect(screen.getByText("paper_activation_authorization")).toBeTruthy();
  });

  it("blocks the plan author from being the sole approver", () => {
    render(r2({ actor: "Stan" }));
    expect(screen.getByText(/separation-of-duty VIOLATION/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
  });
});

/* ===========================================================================
 * Phase 5 — Paper Exit Review
 * ======================================================================== */

const EXIT_PANELS = [
  {
    title: "Observation coverage",
    source: "obs_29",
    findings: [
      { label: "30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles", outcome: "pass" as const },
      { label: "data freshness violations: 0 · coverage 99.6%", outcome: "pass" as const },
    ],
  },
  {
    title: "Drift vs approved evidence",
    source: "run_5498",
    findings: [
      { label: "hit rate −1.1pt — within band", outcome: "pass" as const },
      { label: "fee drag +0.006pt · signal→fill +70ms", outcome: "watch" as const },
      { label: "slippage", outcome: "insufficient" as const, carriesTo: "sandbox certification" },
    ],
  },
];

function exitReview(over: Record<string, unknown> = {}) {
  return (
    <PaperExitReview
      reviewId="EX-771"
      deploymentId="dep_94"
      subject="Grid v2.1 · dep_94 · DERIBIT"
      promoteTo="SANDBOX_VALIDATION"
      gateMet
      gateSummary="30 / 30 days · 312 / 300 trades · 2 / 2 restart cycles"
      policyId="obs_29"
      quorumMet={0}
      quorumRequired={1}
      panels={EXIT_PANELS}
      {...over}
    />
  );
}

describe("Paper Exit Review", () => {
  it("takes gate met from the server and never computes it from coverage", () => {
    // 30/30 is on screen and the gate is unmet. A client that inferred one from
    // the other would contradict the policy that produced it.
    const { container } = render(exitReview({ gateMet: false }));
    expect(screen.getByText("GATE UNMET")).toBeTruthy();
    // Full coverage is on screen and the gate is still unmet: the policy that
    // produced the verdict knows things the coverage numbers do not show.
    expect(container.querySelector(".exec-exit-summary")?.textContent).toContain("30 / 30 days");
    expect(screen.getByRole("button", { name: /Approve promotion/ })).toHaveProperty("disabled", true);
  });

  it("keeps extend and reject available on an unmet gate", () => {
    // A reviewer facing an unmet gate must be able to act, and both of these
    // are safe from any state.
    render(exitReview({ gateMet: false }));
    expect(screen.getByRole("button", { name: /Extend observation/ })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: /Reject/ })).toHaveProperty("disabled", false);
  });

  it("writes a different state for each of the three branches", () => {
    const outcomes = Object.keys(EXIT_OUTCOME);
    expect(outcomes).toHaveLength(3);
    const writes = Object.values(EXIT_OUTCOME).map((o) => o.writes);
    expect(new Set(writes).size).toBe(3);
  });

  it("carries an insufficient finding forward instead of resolving it either way", () => {
    // Rendered through EvidencePanel now, so the mark is the shared component's
    // `data-mark` rather than a label this screen invented.
    const { container } = render(exitReview());
    expect(container.querySelector('.exec-evidence-row[data-mark="insufficient"]')).not.toBeNull();
    expect(screen.getByText(/carries into sandbox certification/)).toBeTruthy();
    expect(screen.getByText(/Promotion does not resolve them/)).toBeTruthy();
  });

  it("does not treat a watch item as blocking", () => {
    const { container } = render(exitReview());
    expect(container.querySelector('.exec-evidence-row[data-mark="watch"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: /Approve promotion/ })).toHaveProperty("disabled", false);
  });

  it("blocks promotion on a blocking finding even when the gate is met", () => {
    render(
      exitReview({
        panels: [
          { title: "Limits", findings: [{ label: "max DD breached", outcome: "fail" as const }] },
        ],
      }),
    );
    expect(screen.getByText(/1 blocking finding/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Approve promotion/ })).toHaveProperty("disabled", true);
  });

  it("lets one evidence panel fail without taking the review down", () => {
    const { container } = render(
      exitReview({
        panels: [
          EXIT_PANELS[0],
          { title: "Portfolio fit", findings: [], status: "unavailable" as const, reason: "analytics edge unreachable" },
        ],
      }),
    );
    expect(screen.getByText("Observation coverage")).toBeTruthy();
    expect(container.querySelector('.exec-state[data-status="unavailable"]')).not.toBeNull();
  });

  it("becomes a record once decided", () => {
    const { container } = render(
      exitReview({ decided: { outcome: "EXTEND_OBSERVATION", by: "Lan", at: "2026-08-21T11:00Z" } }),
    );
    expect(container.querySelector(".exec-gate-decision")).toBeNull();
    expect(screen.getByText(/observation window extended/)).toBeTruthy();
  });
});

/* ===========================================================================
 * Slice S4 — mechanism M2, resolution-selected series
 * ======================================================================== */

const DAY = 86_400;

describe("M2 — the ladder is finest-that-fits, not range brackets", () => {
  it("keeps every rung under the 5,000 point cap", () => {
    for (const interval of INTERVAL_LADDER) {
      const widest = interval.seconds * MAX_POINTS;
      expect(pointsFor(widest, interval), interval.code).toBeLessThanOrEqual(MAX_POINTS);
    }
  });

  it("recovers the resolution the bracket form threw away", () => {
    // Ten days under the bracket form gets 15m and 960 points. Four to
    // seventeen days is the post-incident window, so the loss lands exactly
    // where it is felt.
    expect(selectInterval(10 * DAY).code).toBe("5m");
    expect(pointsFor(10 * DAY, selectInterval(10 * DAY))).toBe(2880);
    expect(selectInterval(4 * DAY).code).toBe("5m");
    expect(selectInterval(14 * DAY).code).toBe("5m");
  });

  it("picks the finest rung across the whole range of windows", () => {
    expect(selectInterval(DAY).code).toBe("1m");
    expect(selectInterval(3 * DAY).code).toBe("1m");
    expect(selectInterval(30 * DAY).code).toBe("15m");
    expect(selectInterval(182 * DAY).code).toBe("1h");
    expect(selectInterval(730 * DAY).code).toBe("4h");
    expect(selectInterval(3650 * DAY).code).toBe("1d");
  });

  it("stops at a day rather than inventing a rung the contract lacks", () => {
    // Beyond this the cap is genuinely exceeded and the server must downsample
    // and declare how.
    expect(selectInterval(20_000 * DAY).code).toBe("1d");
  });

  it("re-queries only when a strictly finer rung would fit", () => {
    // Zooming within one rung would be a round-trip for identical data.
    expect(needsRequery("1h", 182 * DAY)).toBe(false);
    // 100 days still needs 1h — 100d at 15m is 9,600 points, over the cap. The
    // zoom has not yet earned a round-trip.
    expect(needsRequery("1h", 100 * DAY)).toBe(false);
    // 40 days does: 3,840 points at 15m, comfortably under.
    expect(needsRequery("1h", 40 * DAY)).toBe(true);
    expect(needsRequery("1m", 60 * 60)).toBe(false);
    expect(needsRequery("not-a-rung", DAY)).toBe(false);
  });
});

describe("M2 — a series that misdescribes itself is caught, not rendered", () => {
  const base: ChartEnvelope = {
    window: "30d",
    interval: "15m",
    asOf: "2026-08-21T10:42:01Z",
    authority: "DERIVED",
    returnedRows: 2880,
    sourceRows: 2880,
  };

  it("passes a series that describes itself consistently", () => {
    expect(validateSeries(base, 30 * DAY)).toEqual([]);
  });

  it("reports a series over the interactive cap", () => {
    expect(validateSeries({ ...base, returnedRows: 9000 }, 30 * DAY)[0]).toContain("over the 5,000");
  });

  it("reports an interval this build does not recognise rather than assuming one", () => {
    const w = validateSeries({ ...base, interval: "7m" }, 30 * DAY);
    expect(w.join(" ")).toContain("does not recognise");
  });

  it("notices when the reader is being shown less detail than the cap allowed", () => {
    const w = validateSeries({ ...base, interval: "1d", returnedRows: 30 }, 30 * DAY);
    expect(w.join(" ")).toContain("where 15m would have fit");
  });

  it("accepts a coarser rung when downsampling was declared", () => {
    const w = validateSeries(
      { ...base, interval: "1d", returnedRows: 30, downsampleMethod: "lttb" },
      30 * DAY,
    );
    expect(w.join(" ")).not.toContain("would have fit");
  });

  it("flags points reduced with no method named", () => {
    // Bucket aggregation is lossless by construction; decimation is not, so a
    // reduced series that will not say how is a gap.
    const w = validateSeries({ ...base, sourceRows: 100_000, returnedRows: 2880 }, 30 * DAY);
    expect(w.join(" ")).toContain("no downsample method");
  });

  it("says gaps are real rather than smoothing over them", () => {
    const w = validateSeries({ ...base, coverage: 0.87 }, 30 * DAY);
    expect(w.join(" ")).toContain("gaps in this window are real");
  });
});

/* ===========================================================================
 * Slice S4 — mechanism M3, subscription with gap resync
 * ======================================================================== */

function feed(events: SubscriptionEvent[]): SubscriptionState {
  return events.reduce(subscriptionReducer, INITIAL_SUBSCRIPTION);
}

const SNAP: SubscriptionEvent = {
  type: "SNAPSHOT",
  epoch: "ep_1",
  sequence: 100,
  asOf: "2026-08-21T10:42:01Z",
};

describe("M3 — ordered delivery", () => {
  it("goes live on a snapshot and builds the resume token the contract specifies", () => {
    const s = feed([{ type: "SUBSCRIBE" }, SNAP]);
    expect(s.phase).toBe("live");
    expect(s.resumeToken).toBe("ep_1:100");
    expect(isLive(s)).toBe(true);
  });

  it("accepts contiguous deltas", () => {
    const s = feed([
      { type: "SUBSCRIBE" },
      SNAP,
      { type: "DELTA", epoch: "ep_1", sequence: 101, asOf: "2026-08-21T10:42:05Z" },
      { type: "DELTA", epoch: "ep_1", sequence: 102, asOf: "2026-08-21T10:42:09Z" },
    ]);
    expect(s.phase).toBe("live");
    expect(s.sequence).toBe(102);
    expect(s.freshness).toBe("OK");
  });

  it("round-trips a resume token and refuses a malformed one", () => {
    expect(parseResumeToken("ep_1:100")).toEqual({ epoch: "ep_1", sequence: 100 });
    expect(parseResumeToken("ep_1")).toBeNull();
    expect(parseResumeToken("ep_1:abc")).toBeNull();
  });
});

describe("M3 — a gap is a state, not a retry", () => {
  it("marks the surface stale on a sequence discontinuity and names what was lost", () => {
    const s = feed([
      { type: "SUBSCRIBE" },
      SNAP,
      { type: "DELTA", epoch: "ep_1", sequence: 104, asOf: null },
    ]);
    expect(s.phase).toBe("gap");
    expect(s.freshness).toBe("STALE");
    expect(s.note).toContain("101–103");
    // Nothing on screen may be presented as current.
    expect(isLive(s)).toBe(false);
  });

  it("voids the resume token on a gap, so a reconnect cannot skip the hole", () => {
    const s = feed([
      { type: "SUBSCRIBE" },
      SNAP,
      { type: "PROJECTION_GAP", reason: "source cursor discontinuity" },
    ]);
    expect(s.resumeToken).toBeNull();
  });
});

describe("M3 — an epoch cutover is a rebuild, not a gap", () => {
  it("treats a delta from another epoch as a rebuild rather than a discontinuity", () => {
    // Resuming across an epoch boundary would use a cursor with no meaning in
    // the new epoch, which skips silently.
    const s = feed([
      { type: "SUBSCRIBE" },
      SNAP,
      { type: "DELTA", epoch: "ep_2", sequence: 1, asOf: null },
    ]);
    expect(s.phase).toBe("epoch_changed");
    expect(s.resumeToken).toBeNull();
  });

  it("keeps the old snapshot visibly ageing until the server's deadline", () => {
    // Review F-5: if every client resnapshots at once they hit a projection
    // whose caches are cold because it has just been rebuilt.
    const s = feed([
      { type: "SUBSCRIBE" },
      SNAP,
      { type: "EPOCH_CHANGED", epoch: "ep_2", resnapshotNotBefore: "2026-08-21T10:45:00Z" },
    ]);
    expect(s.phase).toBe("epoch_changed");
    expect(s.freshness).toBe("STALE");
    expect(s.lastGoodAsOf).toBe("2026-08-21T10:42:01Z");
    expect(mayResnapshot(s, "2026-08-21T10:44:59Z")).toBe(false);
    expect(mayResnapshot(s, "2026-08-21T10:45:00Z")).toBe(true);
  });

  it("proceeds immediately when the server assigned no deadline", () => {
    // The client never invents a delay of its own: uncoordinated client jitter
    // is the same herd with extra steps.
    const s = feed([{ type: "SUBSCRIBE" }, SNAP, { type: "EPOCH_CHANGED", epoch: "ep_2" }]);
    expect(mayResnapshot(s, "2026-08-21T10:42:02Z")).toBe(true);
  });
});

describe("M3 — disconnect keeps the last good data, marked", () => {
  it("holds the last good as_of rather than blanking the screen", () => {
    const s = feed([{ type: "SUBSCRIBE" }, SNAP, { type: "DISCONNECTED" }]);
    expect(s.phase).toBe("reconnecting");
    expect(s.lastGoodAsOf).toBe("2026-08-21T10:42:01Z");
    expect(s.freshness).toBe("STALE");
    expect(isLive(s)).toBe(false);
  });

  it("keeps the resume token, because a reconnect within the epoch may use it", () => {
    const s = feed([{ type: "SUBSCRIBE" }, SNAP, { type: "DISCONNECTED" }]);
    expect(s.resumeToken).toBe("ep_1:100");
  });

  it("clears the resume token when the snapshot itself failed", () => {
    const s = feed([{ type: "SUBSCRIBE" }, { type: "SNAPSHOT_FAILED", reason: "edge unreachable" }]);
    expect(s.phase).toBe("failed");
    expect(s.freshness).toBe("UNKNOWN");
    expect(s.resumeToken).toBeNull();
  });

  it("never reports live in any phase but live", () => {
    const phases: SubscriptionState["phase"][] = [
      "idle",
      "snapshotting",
      "gap",
      "epoch_changed",
      "reconnecting",
      "failed",
    ];
    for (const phase of phases) {
      expect(isLive({ ...INITIAL_SUBSCRIPTION, phase }), phase).toBe(false);
    }
  });
});

describe("Gate R2 — Deny follows the same rule", () => {
  it("lets the plan author deny their own plan", () => {
    render(r2({ actor: "Stan" }));
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("lets a reviewer deny an R2 whose R1 lapsed", () => {
    // An invalid R1 is the clearest possible reason to refuse. Blocking the
    // refusal would leave the request stuck with nobody able to clear it.
    render(r2({ r1State: "EXPIRED" }));
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("lets a reviewer deny a plan that breaches a capital ceiling", () => {
    render(
      r2({
        capital: [{ label: "concentration", before: "44.0%", after: "61.0%", breach: true }],
      }),
    );
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("locks Deny on an expired request", () => {
    render(r2({ locks: ["EXPIRED"] }));
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/nothing live to refuse/)).toBeTruthy();
  });
});

/* ===========================================================================
 * Governance adapters and the plan → apply → poll flow
 * ======================================================================== */

describe("approval row mapping", () => {
  const wire = {
    approval_id: "AP-352",
    gate: "R2",
    subject: "Carry v3.2 → PF-MAIN",
    target: "paper · BINANCE",
    blocker_count: 1,
    blocker_summary: "broker sync stale",
    sla: { age_minutes: 1560, budget_minutes: 1440 },
    quorum_met: 0,
    quorum_required: 2,
    inert: "SELF",
    needs_you: false,
  };

  it("maps the shape the endpoint will send", () => {
    const { row, gaps } = readApprovalRow(wire);
    expect(row?.id).toBe("AP-352");
    expect(row?.gate).toBe("R2");
    expect(row?.inert).toBe("SELF");
    expect(row?.sla).toEqual({ ageMinutes: 1560, budgetMinutes: 1440 });
    expect(gaps).toEqual([]);
  });

  it("refuses to compute SLA age from a due time and the browser clock", () => {
    // Sorting by due_at is right; rendering "26h / 24h · OVERDUE" from it needs
    // a clock, and the only one this build may use belongs to the server.
    const { gaps } = readApprovalRow({ ...wire, sla: { due_at: "2026-08-21T09:00:00Z" } });
    expect(gaps.join(" ")).toContain("only due_at sent");
    // Codex closed this in EX-BE-05a §5 by adding both fields to the row; the
    // guard stays because a future endpoint could drop one again.
  });

  it("drops a row whose gate this build cannot route", () => {
    // An un-routable row rendered as an un-openable one is worse than a visible
    // count mismatch, which at least says something is wrong.
    const { row, gaps } = readApprovalRow({ ...wire, gate: "R7" });
    expect(row).toBeNull();
    expect(gaps.join(" ")).toContain("R7");
  });

  it("does not turn an absent blocker count into a cleared gate", () => {
    // Zero blockers is a claim. Absence is not the same claim.
    const { row } = readApprovalRow({ ...wire, blocker_count: undefined });
    expect(row?.blockerCount).toBe(-1);
  });
});

describe("gate R1 detail mapping", () => {
  it("keeps an unverified passport claim unverified rather than blank", () => {
    const d = readGateR1Detail({
      approval_id: "AP-201",
      passport: [{ label: "entrypoint", value: "rsi_pkg:RsiAlpha" }],
      checklist: [],
    });
    expect(d?.passport[0].verification).toBeNull();
  });

  it("treats a lock it cannot name as the most restrictive one", () => {
    // A lock this build does not recognise is not a reason to ignore it.
    const d = readGateR1Detail({ approval_id: "AP-201", locks: ["QUORUM_FROZEN"] });
    expect(d?.locks).toContain("NOT_ELIGIBLE");
    expect(d?.gaps.join(" ")).toContain("QUORUM_FROZEN");
  });

  it("downgrades an unreadable checklist outcome to insufficient and keeps the token", () => {
    const d = readGateR1Detail({
      approval_id: "AP-201",
      checklist: [{ label: "capacity", outcome: "MOSTLY_OK" }],
    });
    expect(d?.checklist[0].outcome).toBe("insufficient");
    expect(d?.checklist[0].label).toContain("MOSTLY_OK");
  });

  it("carries the optimistic-concurrency token through", () => {
    const d = readGateR1Detail({ approval_id: "AP-201", expected_version: "v7" });
    expect(d?.expectedVersion).toBe("v7");
  });
});

describe("the fixture API exercises the real mapping path", () => {
  it("returns rows that went through readApprovalRow", async () => {
    const api = createFixtureApi();
    const result = await api.listApprovals({ filter: "INBOX" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.page.rows.map((r) => r.id)).toContain("AP-352");
    // Server counts, not row counts.
    expect(result.value.page.totalCount).toBe(5);
    expect(result.value.counts?.pending).toBe(5);
  });

  it("refuses a page requested in both directions at once", async () => {
    // BR-EX-17 made them mutually exclusive. A page whose direction the client
    // did not choose is a page it cannot place.
    const api = createFixtureApi();
    const result = await api.listApprovals({ filter: "INBOX", after: "c_1", before: "c_0" });
    expect(result.ok).toBe(false);
  });

  it("reports an endpoint that is not wired as unavailable, not as empty", async () => {
    const api = createFixtureApi({ unavailableEndpoints: ["getGateR1"] });
    const result = await api.getGateR1("AP-201");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe("unavailable");
    expect(result.reason).toContain("not wired");
  });
});

describe("the HTTP API refuses before it calls, when the registry says no", () => {
  const off = screenDeliveryPolicy({
    delivery_policy: { policy_revision: 1, query_enabled: false, paper_commands_enabled: false },
  });

  it("does not make a request the registry has already refused", async () => {
    // A 403 arriving thirty seconds later is a worse explanation than the one
    // the registry can give immediately.
    let called = false;
    const original = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const api = createHttpApi({ policy: off });
      const result = await api.listApprovals({ filter: "INBOX" });
      expect(called).toBe(false);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toContain("Query are disabled");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("refuses every command path under a policy with no grants", async () => {
    const api = createHttpApi({ policy: null });
    const plan = await api.planDecision({
      approvalId: "AP-201",
      decision: "APPROVE",
      reason: "looks good",
      expectedVersion: "v7",
      requestKey: "rk_1",
    });
    expect(plan.ok).toBe(false);
  });
});

describe("plan → apply → poll: 202 is never the end", () => {
  const start = () => initialDecision("rk_test");

  it("lands a 202 in accepted, never in settled", () => {
    const s = [
      { type: "PLAN_REQUESTED" } as const,
      { type: "PLANNED", planId: "cmd_1" } as const,
      { type: "APPLY_REQUESTED" } as const,
      { type: "APPLY_ACCEPTED", operationId: "op_1", receipt: "rcpt_1" } as const,
    ].reduce(decisionReducer, start());
    expect(s.phase).toBe("accepted");
    expect(s.verification).toBe("PENDING");
    expect(succeeded(s)).toBe(false);
    expect(outstanding(s)).toBe(true);
    expect(s.note).toContain("a receipt, not a result");
  });

  it("keeps polling until a settled value arrives", () => {
    let s = [
      { type: "APPLY_ACCEPTED", operationId: "op_1", receipt: null } as const,
    ].reduce(decisionReducer, start());
    expect(shouldPoll(s)).toBe(true);

    s = decisionReducer(s, { type: "POLLED", status: null, verification: { known: true, value: "ACKNOWLEDGED" } });
    expect(s.phase).toBe("verifying");
    expect(succeeded(s)).toBe(false);
    expect(shouldPoll(s)).toBe(true);

    s = decisionReducer(s, { type: "POLLED", status: "VERIFIED", verification: { known: true, value: "SUCCEEDED" } });
    expect(s.phase).toBe("settled");
    expect(succeeded(s)).toBe(true);
    expect(shouldPoll(s)).toBe(false);
  });

  it("never reports success for any verification but SUCCEEDED", () => {
    for (const value of ["ACKNOWLEDGED", "PARTIAL", "FAILED", "DENIED", "EXPIRED"] as const) {
      const s = decisionReducer(
        { ...start(), phase: "verifying", operationId: "op_1" },
        { type: "POLLED", status: null, verification: { known: true, value } },
      );
      expect(succeeded(s), value).toBe(false);
    }
  });

  it("stops the retry loop on UNCERTAIN without calling it settled", () => {
    const s = decisionReducer(
      { ...start(), phase: "verifying", operationId: "op_1" },
      { type: "POLLED", status: null, verification: { known: true, value: "UNCERTAIN" } },
    );
    expect(s.phase).toBe("uncertain");
    expect(shouldPoll(s)).toBe(false);
    // Not settled, and still owed an answer.
    expect(succeeded(s)).toBe(false);
    expect(outstanding(s)).toBe(true);
    expect(s.note).toContain("will not resolve itself");
  });

  it("keeps polling on a verification token it cannot read", () => {
    // Naming an outcome we cannot read is worse than continuing to watch.
    const s = decisionReducer(
      { ...start(), phase: "verifying", operationId: "op_1" },
      { type: "POLLED", status: null, verification: { known: false, raw: "MOSTLY_DONE" } },
    );
    expect(s.phase).toBe("verifying");
    expect(shouldPoll(s)).toBe(true);
    expect(s.note).toContain("MOSTLY_DONE");
  });

  it("treats a failed apply with an operation id as uncertain, not as failure", () => {
    // Apply may have reached the server and the response may have been lost.
    // Calling that "did not happen" is how a duplicate command gets sent.
    const s = decisionReducer(
      { ...start(), phase: "applying", operationId: "op_1" },
      { type: "APPLY_FAILED", error: "network" },
    );
    expect(s.phase).toBe("uncertain");
  });

  it("treats a failed apply with no operation as safe to retry", () => {
    const s = decisionReducer(
      { ...start(), phase: "applying" },
      { type: "APPLY_FAILED", error: "network" },
    );
    expect(s.phase).toBe("failed");
    expect(s.note).toContain("No operation was created");
  });

  it("does not regress the phase when a poll fails", () => {
    // Losing sight of an operation is not the same as it having failed.
    const s = decisionReducer(
      { ...start(), phase: "verifying", operationId: "op_1" },
      { type: "POLL_FAILED", error: "timeout" },
    );
    expect(s.phase).toBe("verifying");
    expect(s.note).toContain("has not been cancelled");
  });

  it("records a 409 as a conflict that needs a new intent", () => {
    const s = decisionReducer({ ...start(), phase: "planning" }, { type: "PLAN_CONFLICT" });
    expect(s.conflict).toBe(true);
    expect(s.note).toContain("Start a new command");
  });

  it("walks the full fixture flow without ever passing through success early", async () => {
    const api = createFixtureApi();
    let s = start();
    const plan = await api.planDecision({
      approvalId: "AP-201",
      decision: "APPROVE",
      reason: "evidence is sound",
      expectedVersion: "v7",
      requestKey: s.requestKey,
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    s = decisionReducer(s, { type: "PLANNED", planId: plan.value.planId });

    const applied = await api.applyPlan(plan.value.planId, s.requestKey);
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    s = decisionReducer(s, { type: "APPLY_ACCEPTED", ...applied.value });
    expect(succeeded(s)).toBe(false);

    // Three polls, and success only on the last one.
    const seen: boolean[] = [];
    for (let i = 0; i < 3; i += 1) {
      const polled = await api.pollOperation(applied.value.operationId);
      if (!polled.ok) break;
      s = decisionReducer(s, {
        type: "POLLED",
        status: null,
        verification: polled.value.verificationRaw
          ? { known: true, value: polled.value.verificationRaw as never }
          : null,
      });
      seen.push(succeeded(s));
    }
    expect(seen).toEqual([false, false, true]);
  });

  it("ends UNCERTAIN when the operation does, and stays outstanding", async () => {
    const api = createFixtureApi({ uncertain: true });
    const applied = await api.applyPlan("cmd_x", "rk_test");
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    let s = decisionReducer(start(), { type: "APPLY_ACCEPTED", ...applied.value });
    for (let i = 0; i < 3; i += 1) {
      const polled = await api.pollOperation(applied.value.operationId);
      if (!polled.ok) break;
      s = decisionReducer(s, {
        type: "POLLED",
        status: null,
        verification: { known: true, value: polled.value.verificationRaw as never },
      });
    }
    expect(s.phase).toBe("uncertain");
    expect(outstanding(s)).toBe(true);
  });
});

describe("containers — the port meets the screens", () => {
  it("loads the inbox through the port and renders real mapped rows", async () => {
    const { container } = render(<ApprovalInboxContainer api={createFixtureApi()} />);
    expect(await screen.findByText("AP-352")).toBeTruthy();
    // Four rows are on screen and five are pending. The header describes the
    // queue, the rows describe the page, and both are the server's numbers.
    expect(container.querySelector(".exec-inbox-counts")?.textContent).toContain("5 PENDING");
    // Three rows in the INBOX view and five in the queue: the header describes
    // the queue, the view describes what is mine. The container asks for a full
    // page (100), so the view is not truncated here.
    const pending = container.querySelector('table[aria-label="Pending approvals"]');
    expect(pending?.querySelectorAll("tbody tr").length).toBe(3);
  });

  it("renders a loading skeleton before the first answer, not an empty queue", () => {
    const { container } = render(<ApprovalInboxContainer api={createFixtureApi()} />);
    expect(container.querySelectorAll(".exec-skeleton-block").length).toBeGreaterThan(0);
    expect(screen.queryByText(/Inbox zero/)).toBeNull();
  });

  it("shows an unwired endpoint as unavailable with the reason attached", async () => {
    const api = createFixtureApi({ unavailableEndpoints: ["listApprovals"] });
    const { container } = render(<ApprovalInboxContainer api={api} />);
    await screen.findByText(/not wired to a real endpoint/);
    expect(container.querySelector('.exec-state[data-status="unavailable"]')).not.toBeNull();
    // Not an empty list. The two look identical and mean opposite things.
    expect(screen.queryByText(/Inbox zero/)).toBeNull();
  });

  it("renders a denied read as denied rather than as an error", async () => {
    const api = createHttpApi({
      policy: screenDeliveryPolicy({ delivery_policy: { policy_revision: 1, query_enabled: false } }),
    });
    const { container } = render(<ApprovalInboxContainer api={api} />);
    await screen.findByText(/Query are disabled/);
    expect(container.querySelector(".exec-state")).not.toBeNull();
  });

  it("loads a gate review through the port", async () => {
    render(<GateR1ReviewContainer api={createFixtureApi()} approvalId="AP-201" />);
    expect(await screen.findByText(/Artifact passport/)).toBeTruthy();
    expect(screen.getByText(/creator \(Minh\) ≠ you \(Lan\)/)).toBeTruthy();
  });

  it("shows an unwired review as unavailable and keeps the gate identifiable", async () => {
    const api = createFixtureApi({ unavailableEndpoints: ["getGateR1"] });
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    expect(await screen.findByText(/not wired to a real endpoint/)).toBeTruthy();
    expect(screen.getByText(/GATE R1/)).toBeTruthy();
  });

  it("leaves the command unconfirmed after apply returns 202", async () => {
    // The whole point. The trail stays on screen saying so.
    render(<GateR1ReviewContainer api={createFixtureApi()} approvalId="AP-201" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    approve.click();
    expect(await screen.findByText(/This command has not been confirmed/)).toBeTruthy();
    expect(screen.getByText(/a receipt, not a result/)).toBeTruthy();
  });

  it("reports a blocked plan instead of pretending the decision landed", async () => {
    const api = createFixtureApi({ unavailableEndpoints: ["planDecision"] });
    render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    approve.click();
    expect(await screen.findByText(/No operation was created/)).toBeTruthy();
  });

  it("records a request-key conflict as a conflict, not as a generic failure", async () => {
    const api = createFixtureApi({ conflict: true });
    const { container } = render(<GateR1ReviewContainer api={api} approvalId="AP-201" />);
    const approve = await screen.findByRole("button", { name: "Approve" });
    approve.click();
    await screen.findByText(/Start a new command/);
    expect(container.querySelector(".exec-decision-trail")).not.toBeNull();
  });
});

describe("EX-BE-05a field map — reconciled against what codex published", () => {
  const wire = {
    data: {
      approval: {
        approval_id: "AP-201",
        subject_label: "RSI v1.7",
        release_candidate: "RC-41",
        quorum_met: 1,
        quorum_required: 2,
        policy_version: "approval.v3",
        creator: "Minh",
        expected_version: "v7",
        sla: { age_minutes: 120, budget_minutes: 1440 },
      },
      actor: "Lan",
      eligibility: { can_approve: true, can_approve_with_condition: true, can_deny: true, locks: [] },
      evidence_manifest: {
        entries: [{ label: "artifact digest", value: "sha256:9f3c…", verification: "✓ verified" }],
      },
      checklist: [{ label: "replay reproducible", outcome: "pass" }],
      decisions: [
        { outcome: "APPROVED", by: "Minh", at: "2026-08-20T09:00:00Z" },
        { outcome: "DENIED", by: "Lan", at: "2026-08-21T09:12:00Z" },
      ],
    },
  };

  it("reads the detail from data.approval, not from the top level", () => {
    const d = readGateR1Detail(wire);
    expect(d?.alphaLabel).toBe("RSI v1.7");
    expect(d?.releaseCandidate).toBe("RC-41");
    expect(d?.expectedVersion).toBe("v7");
    expect(d?.sla).toEqual({ ageMinutes: 120, budgetMinutes: 1440 });
  });

  it("reads the passport from evidence_manifest.entries", () => {
    expect(readGateR1Detail(wire)?.passport[0].label).toBe("artifact digest");
  });

  it("takes the decision in force from the LAST entry of decisions[]", () => {
    // Earlier entries are the quorum's history. Taking the first would show a
    // denied request as approved.
    expect(readGateR1Detail(wire)?.decided?.outcome).toBe("DENIED");
    expect(readGateR1Detail(wire)?.decided?.by).toBe("Lan");
  });

  it("reads the three eligibility booleans separately", () => {
    const d = readGateR1Detail({
      data: {
        ...wire.data,
        eligibility: { can_approve: false, can_approve_with_condition: false, can_deny: true },
      },
    });
    expect(d?.eligibility).toEqual({
      canApprove: false,
      canApproveWithCondition: false,
      canDeny: true,
    });
  });

  it("treats absent eligibility as no permission at all", () => {
    const d = readGateR1Detail({ data: { approval: { approval_id: "AP-201" } } });
    expect(d?.eligibility).toEqual({
      canApprove: false,
      canApproveWithCondition: false,
      canDeny: false,
    });
  });
});

describe("server eligibility composes with the local floor", () => {
  it("lets the server withhold a control the screen would have allowed", () => {
    render(
      gate({
        eligibility: { canApprove: false, canApproveWithCondition: true, canDeny: true },
      }),
    );
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/server did not grant it for this actor/)).toBeTruthy();
  });

  it("does not let the server unlock a control the screen refuses", () => {
    // Defence in depth. The local check is a floor: it can only make things
    // stricter, and a client whose safety rules could be overridden from the
    // wire would have advisory safety rules.
    render(
      gate({
        actor: "Minh",
        eligibility: { canApprove: true, canApproveWithCondition: true, canDeny: true },
      }),
    );
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/self-approval prohibited/)).toBeTruthy();
  });

  it("gates approve-with-condition on its own boolean", () => {
    render(
      gate({
        eligibility: { canApprove: true, canApproveWithCondition: false, canDeny: true },
      }),
    );
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Approve with condition" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("lets the server withhold Deny even where the screen would allow it", () => {
    render(
      gate({
        eligibility: { canApprove: true, canApproveWithCondition: true, canDeny: false },
      }),
    );
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", true);
  });

  it("behaves as before when the server sends no eligibility", () => {
    render(gate());
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false);
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });
});

/* ===========================================================================
 * Phase 1 — the parts IMPLEMENTATION_PHASES §1 and the scale refine ask for
 * ======================================================================== */

describe("Approval Inbox — row treatments copied from the hi-fi", () => {
  const counts = { pending: 5, overdue: 1, dueSoon: 1 };

  it("marks an overdue row with a border as well as a tint", () => {
    // A tint alone would put an SLA breach behind one hue.
    const { container } = render(
      <ApprovalInbox page={inboxPage([inboxRow()])} counts={counts} filter="INBOX" />,
    );
    expect(container.querySelector('tbody tr[data-emphasis="overdue"]')).not.toBeNull();
  });

  it("marks an inert row dimmed and never as overdue", () => {
    const { container } = render(
      <ApprovalInbox
        page={inboxPage([inboxRow({ inert: "SELF", sla: { ageMinutes: 60, budgetMinutes: 1440 } })])}
        counts={counts}
        filter="INBOX"
      />,
    );
    expect(container.querySelector('tbody tr[data-emphasis="inert"]')).not.toBeNull();
  });

  it("renders blockers red only when there are any", () => {
    const { container, rerender } = render(
      <ApprovalInbox page={inboxPage([inboxRow({ blockerCount: 2 })])} counts={counts} filter="INBOX" />,
    );
    expect(container.querySelector('[data-blocking="true"]')).not.toBeNull();
    rerender(
      <ApprovalInbox
        page={inboxPage([inboxRow({ blockerCount: 0, blockerSummary: "observation gate met" })])}
        counts={counts}
        filter="INBOX"
      />,
    );
    expect(container.querySelector('[data-blocking="true"]')).toBeNull();
  });

  it("states an unpublished blocker count instead of showing zero", () => {
    render(
      <ApprovalInbox page={inboxPage([inboxRow({ blockerCount: -1 })])} counts={counts} filter="INBOX" />,
    );
    expect(screen.getByText(/blocker count not published/)).toBeTruthy();
  });
});

describe("Approval Inbox — the footer strip explains the dimmed rows", () => {
  it("prints visibility ≠ authority", () => {
    // Without this sentence the dimming reads as a rendering bug.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText("visibility ≠ authority")).toBeTruthy();
    expect(screen.getByText(/1 overdue · 1 due soon/)).toBeTruthy();
  });

  it("counts the rows the actor cannot act on, over the whole filter", () => {
    // The count and the rows would disagree if a server-side filter dropped
    // separation-of-duty rows, which is the one filtering bug this screen must
    // not be able to hide.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={{ pending: 5, overdue: 1, dueSoon: 0 }}
        inertCount={2}
        filter="INBOX"
      />,
    );
    expect(screen.getByText("2 not yours")).toBeTruthy();
  });

  it("states the window the decided list covers", () => {
    // Decided history is unbounded; a list with no window silently claims to be
    // all of it.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        decided={inboxPage([inboxRow({ id: "AP-201" })])}
        counts={{ pending: 1, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText(/last 30 days/)).toBeTruthy();
  });
});

describe("Approval Inbox — the pending queue is never virtualized", () => {
  const many = Array.from({ length: 260 }, (_, i) => inboxRow({ id: `AP-${900 + i}` }));

  it("renders every pending row, however many there are", () => {
    // A work queue past 200 rows is an operational problem, not a rendering
    // one. Paginating it away hides exactly the thing somebody must act on.
    const { container } = render(
      <ApprovalInbox page={inboxPage(many)} counts={{ pending: 260, overdue: 5, dueSoon: 3 }} filter="INBOX" />,
    );
    expect(container.querySelector(".exec-table")?.getAttribute("data-virtualized")).toBe("false");
    expect(container.querySelectorAll("tbody tr:not(.exec-table-pad)").length).toBe(260);
  });

  it("says the queue is over its threshold rather than hiding it", () => {
    render(
      <ApprovalInbox page={inboxPage(many)} counts={{ pending: 260, overdue: 5, dueSoon: 3 }} filter="INBOX" />,
    );
    expect(screen.getByText(/operational condition, not a display limit/)).toBeTruthy();
  });
});

describe("Approval Inbox — a row opens the review its gate owns", () => {
  it("routes by gate, not by identifier", () => {
    // Deriving the route from the id would work for the cast and fail on the
    // first real approval.
    expect(reviewRouteFor({ id: "AP-201", gate: "R1" })).toBe("/governance/approvals/AP-201/r1");
    expect(reviewRouteFor({ id: "AP-352", gate: "R2" })).toBe("/governance/approvals/AP-352/r2");
    expect(reviewRouteFor({ id: "EX-771", gate: "PAPER_EXIT" })).toBe("/governance/exit-reviews/EX-771");
    expect(reviewRouteFor({ id: "EX-780", gate: "SANDBOX_EXIT" })).toBe("/governance/exit-reviews/EX-780");
  });

  it("gives every gate in the vocabulary a destination", () => {
    // A gate with no route is a row that looks clickable and goes nowhere.
    for (const gate of ["R1", "R2", "PAPER_EXIT", "SANDBOX_EXIT", "LIVE_GATE"] as const) {
      expect(reviewRouteFor({ id: "X", gate }), gate).toMatch(/^\/governance\//);
    }
  });
});

describe("the fixture API pages, so the container's paging is exercised", () => {
  it("moves forward on a cursor rather than returning the same page", async () => {
    const api = createFixtureApi();
    // INBOX is "mine" — the three rows flagged needs_you, not the whole queue.
    const first = await api.listApprovals({ filter: "INBOX", limit: 2 });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.page.filteredCount).toBe(3);
    expect(first.value.page.totalCount).toBe(5);
    expect(first.value.page.rows.map((r) => r.id)).toEqual(["AP-352", "AP-201"]);
    expect(first.value.page.hasPrevious).toBe(false);
    expect(first.value.page.hasMore).toBe(true);

    const second = await api.listApprovals({
      filter: "INBOX",
      limit: 2,
      after: first.value.page.nextCursor ?? undefined,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // AP-360 is not "mine", so the INBOX view ends after EX-771.
    expect(second.value.page.rows.map((r) => r.id)).toEqual(["EX-771"]);
    expect(second.value.page.hasPrevious).toBe(true);
  });

  it("moves back on a prev cursor", async () => {
    const api = createFixtureApi();
    const second = await api.listApprovals({ filter: "INBOX", limit: 2, after: "c_AP-201" });
    if (!second.ok) return;
    const back = await api.listApprovals({
      filter: "INBOX",
      limit: 2,
      before: second.value.page.prevCursor ?? undefined,
    });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.value.page.rows.map((r) => r.id)).toEqual(["AP-352", "AP-201"]);
  });

  it("echoes the view it applied and the sort it used", async () => {
    const api = createFixtureApi();
    const r = await api.listApprovals({ filter: "OVERDUE" });
    if (!r.ok) return;
    expect(r.value.page.appliedFilters?.[0]).toEqual({ field: "view", op: "eq", value: "OVERDUE" });
    // Overdue sort order has to survive paging, so it is echoed on every page.
    expect(r.value.page.appliedSort?.map((s) => s.field)).toEqual(["sla_state", "approval_id"]);
  });

  it("counts inert rows over the whole filter, not the page", async () => {
    const api = createFixtureApi();
    // Over ALL, both inert rows are in view: AP-360 blocked before review and
    // AP-311 separation of duty. Neither is "mine", so INBOX has none.
    const all = await api.listApprovals({ filter: "ALL", limit: 2 });
    if (!all.ok) return;
    expect(all.value.page.rows.length).toBe(2);
    expect(all.value.inertCount).toBe(2);

    const mine = await api.listApprovals({ filter: "INBOX", limit: 2 });
    if (!mine.ok) return;
    expect(mine.value.inertCount).toBe(0);
  });
});

/* ===========================================================================
 * Phase 3 and 5 — read back against IMPLEMENTATION_PHASES §3/§5 and the
 * scale-refine cells, the same way Phase 1 was
 * ======================================================================== */

describe("Gate R2 — the capital preview names its currency", () => {
  it("prints a currency for every row", () => {
    // Scale-refine note I-4: the diff is per currency. A strip that implies one
    // number is wrong the moment a portfolio holds two, and nothing about a
    // stacked layout says otherwise.
    render(
      r2({
        capital: [
          { label: "allocated capital", currency: "USDT", before: "0.00", after: "50,000.00" },
          { label: "portfolio weight", currency: "%", before: "0.0", after: "12.0" },
        ],
      }),
    );
    expect(screen.getByText("USDT")).toBeTruthy();
    expect(screen.getByText("%")).toBeTruthy();
  });

  it("states a missing currency instead of implying one", () => {
    const { container } = render(
      r2({ capital: [{ label: "allocated capital", before: "0.00", after: "50,000.00" }] }),
    );
    const cells = [...container.querySelectorAll(".exec-gate-capital tbody td")].map(
      (c) => c.textContent,
    );
    expect(cells).toContain("not stated");
  });

  it("reports unnamed currencies as a mapping gap", () => {
    const d = readGateR2Detail({
      data: {
        approval: { approval_id: "AP-207" },
        capital: [
          { label: "a", before: "1", after: "2" },
          { label: "b", currency: "USDT", before: "1", after: "2" },
        ],
      },
    });
    expect(d?.gaps.join(" ")).toContain("1 capital rows did not state a currency");
  });
});

describe("Gate R2 — the R1 reference is openable", () => {
  it("links to the R1 decision when a link was published", () => {
    // Two links now: the meta chip and the R1 reference panel. Both point at
    // the same decision, which is the point.
    render(r2({ r1Href: "/governance/approvals/AP-101/r1" }));
    const links = screen.getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.getAttribute("href")).toBe("/governance/approvals/AP-101/r1");
    }
  });

  it("says so when no link was published rather than rendering a dead reference", () => {
    const { container } = render(r2());
    expect(container.querySelector("a")).toBeNull();
    expect(screen.getByTitle(/No link to the R1 decision/)).toBeTruthy();
  });

  it("renders the R1 reference as a panel with decision, digest and expiry", () => {
    // §3 names three fields. A chip carries the decision and drops the two a
    // reviewer needs to judge how much the R1 is still worth.
    render(r2({ r1Digest: "sha256:c81f…", r1Expiry: "2026-11-01", r1DecidedBy: "Minh" }));
    expect(screen.getByText("R1 reference")).toBeTruthy();
    expect(screen.getByText("sha256:c81f…")).toBeTruthy();
    expect(screen.getByText("2026-11-01")).toBeTruthy();
  });

  it("states a missing digest or expiry rather than leaving the field blank", () => {
    // An R1 whose evidence cannot be identified is an R1 nobody can re-check,
    // which is most of what a reference is for.
    const { container } = render(r2());
    const unpublished = [...container.querySelectorAll(".exec-gate-unverified")].map(
      (n) => n.textContent,
    );
    expect(unpublished.filter((t) => t === "not published").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Gate R2 — the blocked banner tells a reviewer what to do", () => {
  it("names the expiry date, so 'expired' is checkable rather than asserted", () => {
    render(r2({ r1State: "EXPIRED", r1Expiry: "2026-08-18", r1Id: "AP-101" }));
    expect(screen.getByText(/AP-101 expired 2026-08-18/)).toBeTruthy();
  });

  it("names the remedy, because a blocker with no way forward becomes a ticket", () => {
    render(r2({ r1State: "EXPIRED", r1Expiry: "2026-08-18" }));
    expect(screen.getByText(/re-run Gate R1 or extend its waiver/)).toBeTruthy();
  });

  it("says Approve is disabled rather than implying the whole bar is", () => {
    // §3's prose says the whole decision bar; the hi-fi's own banner says
    // Approve, and the backend allows denying a request whose evidence lapsed.
    render(r2({ r1State: "EXPIRED", r1Expiry: "2026-08-18" }));
    expect(screen.getByText(/Approve is disabled/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("gives every invalid R1 state its own reason and remedy", () => {
    for (const state of ["DENIED", "PENDING", "MISSING"] as const) {
      const { container } = render(r2({ r1State: state }));
      const banner = container.querySelector(".exec-gate-blocking");
      expect(banner?.textContent, state).toContain("Approve is disabled");
      expect(banner?.textContent?.length ?? 0, state).toBeGreaterThan(60);
      cleanup();
    }
  });

  it("explains its own conditions model so nobody asks for a free-text box", () => {
    render(r2({ artifactDigest: "sha256:9f3c…" }));
    expect(screen.getByText(/typed objects with owner, deadline and expiry, never free text/)).toBeTruthy();
    expect(screen.getByText(/recorded against policy approval\.v3/)).toBeTruthy();
  });

  it("treats an unreadable R1 state as MISSING, which blocks", () => {
    const d = readGateR2Detail({
      data: { approval: { approval_id: "AP-207" }, r1_reference: { state: "PROBABLY_FINE" } },
    });
    expect(d?.r1State).toBe("MISSING");
    expect(d?.gaps.join(" ")).toContain("PROBABLY_FINE");
  });
});

describe("Paper Exit — evidence links its source", () => {
  const linked = [
    {
      title: "Observation coverage",
      findings: [
        { label: "30 / 30 days", outcome: "pass" as const, href: "/deployments/paper/dep_94#sessions", sourceLabel: "sessions" },
      ],
    },
  ];

  it("renders a link for a number that has a source", () => {
    // §5's "Must work": every evidence number links its source. This screen
    // decides a promotion, and a figure with nowhere to check it is an
    // assertion rather than evidence. The link is EvidencePanel's own slot.
    render(exitReview({ panels: linked }));
    expect(screen.getByRole("link", { name: /sessions/ }).getAttribute("href")).toBe(
      "/deployments/paper/dep_94#sessions",
    );
  });

  it("states the absence of a source rather than leaving it blank", () => {
    // Counted per panel now: EvidencePanel keeps the link slot empty, and the
    // screen says how many slots are empty rather than repeating it per row.
    render(exitReview({ panels: [{ title: "Limits", findings: [{ label: "max DD ok", outcome: "pass" as const }] }] }));
    expect(screen.getByText(/1 finding has no source link/)).toBeTruthy();
  });

  it("counts unlinked findings as a mapping gap", () => {
    const d = readPaperExitDetail({
      data: {
        review: { review_id: "EX-771" },
        gate_met: true,
        panels: [{ title: "x", findings: [{ label: "a", outcome: "pass" }, { label: "b", outcome: "pass", href: "/x" }] }],
      },
    });
    expect(d?.gaps.join(" ")).toContain("1 evidence findings carry no source link");
  });
});

describe("Paper Exit — lineage and consequence labels", () => {
  it("shows what the promotion rests on", () => {
    // Without it the reviewer is asked to trust four earlier decisions they
    // cannot see.
    render(
      exitReview({
        lineage: [
          { label: "R1", value: "AP-118", href: "/governance/approvals/AP-118/r1" },
          { label: "evidence pack", value: "ep_4471" },
        ],
      }),
    );
    expect(screen.getByRole("link", { name: "AP-118" })).toBeTruthy();
    expect(screen.getByText("ep_4471")).toBeTruthy();
  });

  it("labels the branches with their consequence, not their verb", () => {
    // "Reject" alone does not tell a reviewer the deployment stops trading.
    render(exitReview());
    expect(screen.getByRole("button", { name: "Extend observation +14d" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reject — back to Paper HELD" })).toBeTruthy();
  });

  it("treats an unpublished gate verdict as unmet", () => {
    // Absent is not met. Inferring it from the coverage numbers is the exact
    // thing this screen must not do.
    const d = readPaperExitDetail({ data: { review: { review_id: "EX-771" } } });
    expect(d?.gateMet).toBe(false);
    expect(d?.gaps.join(" ")).toContain("gate_met was not published");
  });
});

describe("Gate R2 and Paper Exit on the port", () => {
  it("loads an R2 review through the port with its currencies named", async () => {
    const { container } = render(<GateR2ReviewContainer api={createFixtureApi()} approvalId="AP-207" />);
    expect(await screen.findByText(/Capital change preview/)).toBeTruthy();
    const cells = [...container.querySelectorAll(".exec-gate-capital tbody td")].map((c) => c.textContent);
    expect(cells).toContain("USDT");
    expect(cells).not.toContain("not stated");
  });

  it("loads an exit review through the port with every number linked", async () => {
    const { container } = render(<PaperExitReviewContainer api={createFixtureApi()} reviewId="EX-771" />);
    expect(await screen.findByText(/Observation coverage/)).toBeTruthy();
    expect(container.querySelector(".exec-exit-unlinked")).toBeNull();
    expect(container.querySelectorAll("a.exec-evidence-link").length).toBeGreaterThan(4);
  });

  it("blocks an R2 whose review could not be read, rather than rendering a blank gate", async () => {
    const api = createFixtureApi({ unavailableEndpoints: ["getGateR2"] });
    render(<GateR2ReviewContainer api={api} approvalId="AP-207" />);
    expect(await screen.findByText(/not wired to a real endpoint/)).toBeTruthy();
    expect(screen.getByText(/GATE R2/)).toBeTruthy();
  });

  it("runs an exit decision through the same 202 discipline", async () => {
    render(<PaperExitReviewContainer api={createFixtureApi()} reviewId="EX-771" />);
    const promote = await screen.findByRole("button", { name: "Approve promotion" });
    promote.click();
    expect(await screen.findByText(/This command has not been confirmed/)).toBeTruthy();
  });
});

describe("typed conditions composer (§2 — conditions attach to the decision)", () => {
  it("refuses a condition with no text and no owner, and says which", () => {
    // An unowned condition is a wish; an unstated one is nothing at all.
    expect(draftBlockers(EMPTY_DRAFT)).toEqual([
      "a condition needs text",
      "a condition needs an owner",
    ]);
  });

  it("does not demand a deadline", () => {
    // A standing constraint has no date, and demanding one makes reviewers
    // invent them.
    expect(draftBlockers({ ...EMPTY_DRAFT, text: "cap capacity at 50,000", owner: "Lan" })).toEqual([]);
  });

  it("refuses an expiry that falls before the deadline", () => {
    // Such a condition can never be met and nobody would notice: it would
    // simply expire unmet and unremarked.
    expect(
      draftBlockers({
        text: "cap",
        owner: "Lan",
        deadline: "2026-10-01",
        expiry: "2026-09-01",
        blocking: true,
      }),
    ).toContain("the expiry falls before the deadline");
  });

  it("produces a typed record, not a sentence", () => {
    expect(
      toCondition({
        text: "  capacity cap 50,000  ",
        owner: " Lan ",
        deadline: "2026-09-15",
        expiry: "2026-11-01",
        blocking: true,
      }),
    ).toEqual({
      text: "capacity cap 50,000",
      owner: "Lan",
      deadline: "2026-09-15",
      expiry: "2026-11-01",
      blocking: true,
    });
  });

  it("attaches a condition from Gate R1 and clears the draft", () => {
    const attached: unknown[] = [];
    const { container } = render(gate({ onAttachCondition: (c: unknown) => attached.push(c) }));
    const text = container.querySelector<HTMLInputElement>(".exec-composer-wide input")!;
    const owner = container.querySelectorAll<HTMLInputElement>(".exec-composer-field input")[1];

    fireEvent.change(text, { target: { value: "extend slippage evidence past 30 fills" } });
    fireEvent.change(owner, { target: { value: "Lan" } });
    fireEvent.click(screen.getByRole("button", { name: "Attach condition" }));

    expect(attached).toHaveLength(1);
    expect(attached[0]).toMatchObject({ owner: "Lan", blocking: false });
    // Draft cleared, so the next condition starts empty rather than inheriting.
    expect(text.value).toBe("");
  });

  it("blocks Attach until the draft is valid", () => {
    render(gate({ onAttachCondition: () => {} }));
    expect(screen.getByRole("button", { name: "Attach condition" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/a condition needs text/)).toBeTruthy();
  });

  it("locks the composer for a reviewer who cannot make the decision", () => {
    // A composer for a decision you cannot make is a form that wastes your
    // time, so it follows the condition control exactly.
    render(gate({ actor: "Minh", onAttachCondition: () => {} }));
    expect(screen.getByRole("button", { name: "Attach condition" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/cannot attach a condition/)).toBeTruthy();
  });

  it("counts which attached conditions block", () => {
    expect(
      blockingCount([
        { text: "a", owner: "Lan", blocking: true },
        { text: "b", owner: "Minh", blocking: false },
        { text: "c", owner: "Lan", blocking: true },
      ]),
    ).toBe(2);
  });

  it("states an unowned condition rather than rendering it blank", () => {
    render(<ConditionRow condition={{ text: "cap capacity", owner: null, blocking: false }} />);
    expect(screen.getByText("unassigned")).toBeTruthy();
  });
});

/* ===========================================================================
 * Making M3 visible — gap, epoch cutover, completeness
 * ======================================================================== */

const liveState = (over: Partial<SubscriptionState> = {}): SubscriptionState => ({
  ...INITIAL_SUBSCRIPTION,
  phase: "live",
  epoch: "ep_7f21",
  sequence: 8810,
  resumeToken: "ep_7f21:8810",
  lastGoodAsOf: "2026-08-21T10:42:01Z",
  freshness: "OK",
  ...over,
});

describe("subscription banner — anything that is not live must look like it", () => {
  it("renders nothing while live, so the banner stays worth reading", () => {
    const { container } = render(<SubscriptionBanner state={liveState()} />);
    expect(container.querySelector(".exec-stream")).toBeNull();
  });

  it("says a gap happened and keeps the last good as_of on screen", () => {
    // A blank would be worse than a stale number: an operator can act on a
    // value they know is old.
    const { container } = render(
      <SubscriptionBanner
        state={liveState({ phase: "gap", freshness: "STALE", note: "Events 8811–8813 were not delivered." })}
      />,
    );
    expect(container.querySelector('.exec-stream[data-phase="gap"]')).not.toBeNull();
    expect(screen.getByText(/8811–8813/)).toBeTruthy();
    expect(screen.getByText(/values as of 2026-08-21T10:42:01Z/)).toBeTruthy();
  });

  it("shows the server's re-snapshot window and does not invent one", () => {
    // A hundred clients re-snapshotting at once would hit a projection whose
    // caches are cold because it has just been rebuilt.
    render(
      <SubscriptionBanner
        state={liveState({
          phase: "epoch_changed",
          resnapshotNotBefore: "2026-08-21T10:45:00Z",
          freshness: "STALE",
        })}
        now="2026-08-21T10:44:00Z"
      />,
    );
    expect(screen.getByText(/on the server's schedule/)).toBeTruthy();
    expect(screen.getByText(/2026-08-21T10:45:00Z/)).toBeTruthy();
  });

  it("stops showing the wait once the window opens", () => {
    render(
      <SubscriptionBanner
        state={liveState({ phase: "epoch_changed", resnapshotNotBefore: "2026-08-21T10:45:00Z" })}
        now="2026-08-21T10:45:01Z"
      />,
    );
    expect(screen.queryByText(/on the server's schedule/)).toBeNull();
  });

  it("says plainly when nothing has ever arrived", () => {
    const { container } = render(
      <SubscriptionBanner state={{ ...INITIAL_SUBSCRIPTION, phase: "snapshotting" }} />,
    );
    expect(container.textContent).toContain("no values have been received");
  });

  it("tones a failed subscription worse than a gap", () => {
    const gap = render(<SubscriptionBanner state={liveState({ phase: "gap" })} />).container;
    expect(gap.querySelector('[data-tone="warn"]')).not.toBeNull();
    cleanup();
    const failed = render(<SubscriptionBanner state={liveState({ phase: "failed" })} />).container;
    expect(failed.querySelector('[data-tone="bad"]')).not.toBeNull();
  });
});

describe("source completeness is not freshness", () => {
  it("says what a polled source cannot see", () => {
    render(<CompletenessNote completeness="POLL_BOUNDED" pollIntervalMs={5000} />);
    expect(screen.getByText(/changed and changed back between polls/)).toBeTruthy();
    expect(screen.getByText(/every 5s/)).toBeTruthy();
  });

  it("refuses a continuity claim for anything but an event-sourced class", () => {
    // A timeline built from polled facts looks exactly like one built from
    // events, and the difference only shows when somebody asks about a gap.
    const base: Envelope = { authority: "EXECUTION", asOf: null, freshness: "OK" };
    expect(canClaimContinuity({ ...base, sourceCompleteness: "EVENT_SOURCED" })).toBe(true);
    expect(canClaimContinuity({ ...base, sourceCompleteness: "POLL_BOUNDED" })).toBe(false);
    expect(canClaimContinuity({ ...base, sourceCompleteness: "UNKNOWN" })).toBe(false);
    // Absent is not event-sourced either.
    expect(canClaimContinuity(base)).toBe(false);
  });

  it("gives a polled panel a caveat that names the interval", () => {
    const caveat = continuityCaveat({
      authority: "EXECUTION",
      asOf: null,
      freshness: "OK",
      sourceCompleteness: "POLL_BOUNDED",
      pollIntervalMs: 30_000,
    });
    expect(caveat).toContain("unproven rather than absent");
    expect(caveat).toContain("every 30s");
  });

  it("gives an event-sourced panel no caveat at all", () => {
    expect(
      continuityCaveat({
        authority: "EXECUTION",
        asOf: null,
        freshness: "OK",
        sourceCompleteness: "EVENT_SOURCED",
      }),
    ).toBeNull();
  });

  it("tones UNKNOWN worse than POLL_BOUNDED", () => {
    const poll = render(<CompletenessNote completeness="POLL_BOUNDED" />).container;
    expect(poll.querySelector('[data-tone="warn"]')).not.toBeNull();
    cleanup();
    const unknown = render(<CompletenessNote completeness="UNKNOWN" />).container;
    expect(unknown.querySelector('[data-tone="bad"]')).not.toBeNull();
  });
});

describe("the subscription walk drives the real reducer", () => {
  it("reaches live, then goes stale on the dropped events", () => {
    const { container } = render(<SubscriptionWalk />);
    // Step 2 is the snapshot: live, so no banner.
    fireEvent.click(screen.getByRole("button", { name: "snapshot" }));
    expect(container.querySelector(".exec-stream")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /three missed/ }));
    expect(container.querySelector('.exec-stream[data-phase="gap"]')).not.toBeNull();
    expect(container.textContent).toContain("voided");
  });

  it("blocks the re-snapshot until the server's window opens", () => {
    const { container } = render(<SubscriptionWalk />);
    fireEvent.click(screen.getByRole("button", { name: "projection rebuilt" }));
    expect(container.textContent).toContain("not before 2026-08-21T10:45:00Z");
  });

  it("keeps the last good values through a disconnect", () => {
    const { container } = render(<SubscriptionWalk />);
    fireEvent.click(screen.getByRole("button", { name: "disconnect" }));
    expect(container.querySelector('.exec-stream[data-phase="reconnecting"]')).not.toBeNull();
    expect(container.textContent).toContain("values as of");
  });
});

/* ===========================================================================
 * Audit follow-up: the filter actually filters, and retention is not empty
 * ======================================================================== */

describe("the filter chips filter (EX-BE-05a §3's eight views)", () => {
  it("narrows INBOX to what this actor is expected to act on", async () => {
    // "Mine" is not "everything I can see" — that is ALL, and conflating them
    // is how a triage queue stops being one.
    const api = createFixtureApi();
    const mine = await api.listApprovals({ filter: "INBOX", limit: 20 });
    const all = await api.listApprovals({ filter: "ALL", limit: 20 });
    if (!mine.ok || !all.ok) return;
    expect(mine.value.page.rows.length).toBeLessThan(all.value.page.rows.length);
    expect(mine.value.page.rows.every((r) => r.needsYou)).toBe(true);
  });

  it("gives each view a different result rather than echoing the same rows", async () => {
    // The fixture used to echo the view back and return the same rows, which
    // is worse than an unwired chip: indistinguishable from a working one.
    const api = createFixtureApi();
    const seen = new Map<string, string>();
    for (const view of ["ALL", "INBOX", "R1", "SANDBOX", "LIVE_GATES", "EXIT_REVIEWS", "OVERDUE"]) {
      const r = await api.listApprovals({ filter: view, limit: 20 });
      if (!r.ok) continue;
      seen.set(view, r.value.page.rows.map((x) => x.id).join(","));
    }
    // At least five distinct row sets across seven views.
    expect(new Set(seen.values()).size).toBeGreaterThanOrEqual(5);
    expect(seen.get("R1")).toBe("AP-201,AP-360");
    expect(seen.get("EXIT_REVIEWS")).toBe("EX-771");
    expect(seen.get("OVERDUE")).toBe("AP-352");
  });

  it("returns nothing for a view it does not recognise, rather than everything", async () => {
    // Falling back to ALL would show a full queue under a filter that was never
    // applied — the same lie in the other direction.
    const api = createFixtureApi();
    const r = await api.listApprovals({ filter: "NOT_A_VIEW", limit: 20 });
    if (!r.ok) return;
    expect(r.value.page.rows).toEqual([]);
    expect(r.value.page.filteredCount).toBe(0);
  });

  it("keeps the queue total while the view count follows the filter", async () => {
    const api = createFixtureApi();
    const r = await api.listApprovals({ filter: "OVERDUE", limit: 20 });
    if (!r.ok) return;
    expect(r.value.page.filteredCount).toBe(1);
    expect(r.value.page.totalCount).toBe(5);
  });

  it("does not announce inbox zero when a filter emptied the view", () => {
    // Selecting Overdue with five pending requests would otherwise say the
    // queue is clear.
    render(
      <ApprovalInbox
        page={{ rows: [], totalCount: 5, filteredCount: 0 }}
        counts={{ pending: 5, overdue: 1, dueSoon: 1 }}
        filter="OVERDUE"
      />,
    );
    expect(screen.getByText(/Nothing in Overdue/)).toBeTruthy();
    expect(screen.getByText(/5 still pending in the queue/)).toBeTruthy();
    expect(screen.queryByText(/Inbox zero/)).toBeNull();
  });

  it("still says inbox zero when the queue really is clear", () => {
    render(
      <ApprovalInbox
        page={{ rows: [], totalCount: 0, filteredCount: 0 }}
        counts={{ pending: 0, overdue: 0, dueSoon: 0 }}
        filter="INBOX"
      />,
    );
    expect(screen.getByText(/Inbox zero/)).toBeTruthy();
  });
});

describe("a failing checklist item locks Approve without being told to", () => {
  it("derives the lock from the checklist rather than from a prop", () => {
    // §2 "Must work": decision buttons enabled only when the checklist is
    // complete. The count was computed, printed in the tally, and never used.
    render(
      gate({
        checklist: [
          { label: "engine pinned by digest", outcome: "pass" as const },
          { label: "holdout untouched by selection", outcome: "fail" as const },
        ],
      }),
    );
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", true);
    expect(screen.getByText(/checklist has blocking findings/)).toBeTruthy();
  });

  it("still lets a reviewer deny precisely because of the failure", () => {
    render(gate({ checklist: [{ label: "holdout untouched", outcome: "fail" as const }] }));
    expect(screen.getByRole("button", { name: "Deny" })).toHaveProperty("disabled", false);
  });

  it("does not lock on a watch item", () => {
    render(gate({ checklist: [{ label: "capacity evidence", outcome: "watch" as const }] }));
    expect(screen.getByRole("button", { name: "Approve" })).toHaveProperty("disabled", false);
  });
});

describe("retention — an empty range is not an empty result", () => {
  const cols: readonly Column<{ id: string }>[] = [
    { key: "id", header: "id", render: (r) => r.id },
  ];

  it("treats a cold range as unavailable, not as no rows", () => {
    // EX-BE-04b §3: COLD_REQUESTABLE, PURGED and UNKNOWN "may have no points,
    // but are not semantically an ordinary empty hot series".
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={cols}
        rowKey={(r) => r.id}
        page={{
          rows: [],
          totalCount: 0,
          retention: { outcome: "COLD_REQUESTABLE", hotFrom: "2026-02-21T00:00:00Z" },
        }}
      />,
    );
    expect(container.querySelector('.exec-state[data-status="unavailable"]')).not.toBeNull();
    expect(screen.getByText(/archived rather than missing/)).toBeTruthy();
    expect(screen.getByText(/Online history begins/)).toBeTruthy();
  });

  it("keeps the rows and warns when only part of the range is online", () => {
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={cols}
        rowKey={(r) => r.id}
        page={{ rows: [{ id: "ord_1" }], totalCount: 1, retention: { outcome: "PARTIAL_HOT" } }}
      />,
    );
    expect(container.querySelector("tbody tr")).not.toBeNull();
    expect(screen.getByText(/real and incomplete/)).toBeTruthy();
  });

  it("says an ordinary empty is empty only when the range is hot", () => {
    const { container } = render(
      <KeysetTable
        label="Orders"
        columns={cols}
        rowKey={(r) => r.id}
        page={{ rows: [], totalCount: 0, retention: { outcome: "HOT" } }}
      />,
    );
    expect(container.querySelector('.exec-state[data-status="empty"]')).not.toBeNull();
  });

  it("treats an absent retention state as unproven, not as everything online", () => {
    expect(emptyMeansEmpty(null)).toBe(false);
    expect(emptyMeansEmpty({ outcome: "HOT" })).toBe(true);
    expect(retentionReason(null)).toContain("cannot be read as complete");
  });

  it("maps each outcome to the panel state that matches its claim", () => {
    expect(panelStatusForRetention("HOT")).toBe("ok");
    expect(panelStatusForRetention("PARTIAL_HOT")).toBe("partial");
    for (const o of ["COLD_REQUESTABLE", "PURGED", "UNKNOWN"] as const) {
      expect(panelStatusForRetention(o), o).toBe("unavailable");
    }
  });

  it("offers a restore only where a restore is possible", () => {
    const { container, rerender } = render(
      <RetentionNotice retention={{ outcome: "COLD_REQUESTABLE" }} onRequestRestore={() => {}} />,
    );
    expect(screen.getByRole("button", { name: /Request a restore/ })).toBeTruthy();
    // Purged is terminal. Offering a restore would be offering a lie.
    rerender(<RetentionNotice retention={{ outcome: "PURGED" }} onRequestRestore={() => {}} />);
    expect(container.querySelector("button")).toBeNull();
  });

  it("separates a too-wide question from a missing answer", () => {
    render(<RangeTooWideNotice requestedDays={7300} />);
    expect(screen.getByText(/7,300 days/)).toBeTruthy();
    expect(screen.getByText(/The data is not missing/)).toBeTruthy();
  });
});

describe("series validation follows the EX-BE-04b vocabulary", () => {
  const base: ChartEnvelope = {
    window: "30d",
    interval: "15m",
    asOf: "2026-08-21T10:42:01Z",
    authority: "DERIVED",
    returnedRows: 2880,
    sourceRows: 100_000,
  };

  it("accepts canonical pre-aggregation as a declared method", () => {
    const w = validateSeries({ ...base, downsampleMethod: "canonical_preaggregated" }, 30 * 86_400);
    expect(w.join(" ")).not.toContain("no downsample method");
  });

  it("flags a method outside the canonical set as possibly lossy", () => {
    const w = validateSeries({ ...base, downsampleMethod: "stride" }, 30 * 86_400);
    expect(w.join(" ")).toContain("outside the canonical set");
  });

  it("refuses `none` on anything coarser than a minute", () => {
    // Only a 1m series can claim it did not aggregate.
    const w = validateSeries({ ...base, downsampleMethod: "none" }, 30 * 86_400);
    expect(w.join(" ")).toContain("only a 1m series can claim that");
  });

  it("accepts `none` on a 1m series", () => {
    const w = validateSeries(
      { ...base, interval: "1m", returnedRows: 4320, sourceRows: 4320, downsampleMethod: "none" },
      3 * 86_400,
    );
    expect(w).toEqual([]);
  });
});

/* ===========================================================================
 * Goal: cursor scope, and zoom that re-queries
 * ======================================================================== */

describe("a cursor is only valid inside the query that issued it", () => {
  const scope = {
    filter: "INBOX",
    sort: "sla_state:desc",
    limit: 100,
    resource: "governance.approvals",
  };

  it("survives an identical query", () => {
    expect(cursorStillValid(scope, { ...scope })).toBe(true);
  });

  it("dies on every field EX-BE-04b names", () => {
    // "Changing filter, sort, limit, epoch, scope, resource or cursor direction
    // makes an old cursor fail closed."
    expect(cursorStillValid(scope, { ...scope, filter: "OVERDUE" })).toBe(false);
    expect(cursorStillValid(scope, { ...scope, sort: "age:asc" })).toBe(false);
    expect(cursorStillValid(scope, { ...scope, limit: 250 })).toBe(false);
    expect(cursorStillValid(scope, { ...scope, resource: "execution.operations" })).toBe(false);
    expect(cursorStillValid({ ...scope, epoch: "ep_1" }, { ...scope, epoch: "ep_2" })).toBe(false);
  });

  it("treats no prior scope as no valid cursor", () => {
    // The first page has nothing to resume from, and guessing that it does is
    // how a cursor gets sent into a query that never issued it.
    expect(cursorStillValid(null, scope)).toBe(false);
  });

  it("announces a reset rather than silently jumping to page one", () => {
    // From the reader's side the list jumps back to the start; a reader who
    // does not know that happened assumes their rows were deleted.
    render(
      <ApprovalInbox
        page={inboxPage([inboxRow()])}
        counts={{ pending: 5, overdue: 1, dueSoon: 0 }}
        filter="INBOX"
        cursorNotice="The list changed, so the page reference no longer applies — showing the first page."
      />,
    );
    expect(screen.getByRole("status").textContent).toContain("no longer applies");
  });
});

describe("M2 zoom asks the server again rather than magnifying", () => {
  const day = 86_400;

  it("re-queries when a finer rung actually fits", () => {
    // 40 days at 15m is 3,840 points, comfortably under the cap — so an hourly
    // series is coarser than the range deserves.
    const v = zoomVerdict("1h", { label: "40d", seconds: 40 * day });
    expect(v.kind).toBe("requery");
    if (v.kind === "requery") {
      expect(v.to).toBe("15m");
      expect(v.reason).toContain("rather than magnifying");
    }
  });

  it("does not re-query a zoom that stays inside one rung", () => {
    // 100 days still resolves to 1h, so the server would return this same
    // series and the round-trip would buy nothing.
    const v = zoomVerdict("1h", { label: "100d", seconds: 100 * day });
    expect(v.kind).toBe("same-rung");
    expect(v.reason).toContain("would return this same series");
  });

  it("says when the finest rung has been reached", () => {
    // Zooming past 1m shows the same measurements larger, not more of them.
    const v = zoomVerdict("1m", { label: "1h", seconds: 3_600 });
    expect(v.kind).toBe("finest");
    expect(v.reason).toContain("finest bucket the projection stores");
  });

  it("names a range and never an interval, because the server chooses", () => {
    // EX-BE-04b §3: the query selects the rung from the requested range.
    const v = zoomVerdict("1d", { label: "3d", seconds: 3 * day });
    expect(v.kind).toBe("requery");
    if (v.kind === "requery") expect(v.to).toBe("1m");
  });

  it("captions the interval the server served, not the one requested", () => {
    // A caption showing a requested interval would say the opposite of the
    // truth while a request was in flight.
    const { container } = render(
      <ZoomableChart
        title="Equity"
        envelope={{
          window: "180d",
          interval: "1h",
          asOf: "2026-08-21T10:42:01Z",
          authority: "DERIVED",
        }}
        ranges={[{ label: "180d", seconds: 180 * day }, { label: "40d", seconds: 40 * day }]}
        activeRange={{ label: "180d", seconds: 180 * day }}
        onRangeChange={() => {}}
      />,
    );
    expect(container.querySelector(".exec-zoom-caption")?.textContent).toContain("1h");
    fireEvent.click(screen.getByRole("button", { name: "40d" }));
    // Still 1h: the envelope has not been replaced, because no fetch happened.
    expect(container.querySelector(".exec-zoom-caption")?.textContent).toContain("1h");
  });

  it("tells the reader when a zoom changed nothing", () => {
    // Silently doing nothing reads as a broken control.
    render(
      <ZoomableChart
        title="Equity"
        envelope={{ window: "180d", interval: "1h", asOf: "2026-08-21T10:42:01Z", authority: "DERIVED" }}
        ranges={[{ label: "100d", seconds: 100 * day }]}
        activeRange={{ label: "180d", seconds: 180 * day }}
        onRangeChange={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "100d" }));
    expect(screen.getByText(/would return this same series/)).toBeTruthy();
  });

  it("reports the verdict to the caller so the screen decides whether to fetch", () => {
    const seen: string[] = [];
    render(
      <ZoomableChart
        title="Equity"
        envelope={{ window: "180d", interval: "1h", asOf: "2026-08-21T10:42:01Z", authority: "DERIVED" }}
        ranges={[{ label: "40d", seconds: 40 * day }, { label: "100d", seconds: 100 * day }]}
        activeRange={{ label: "180d", seconds: 180 * day }}
        onRangeChange={(_r, v) => seen.push(v.kind)}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "40d" }));
    fireEvent.click(screen.getByRole("button", { name: "100d" }));
    expect(seen).toEqual(["requery", "same-rung"]);
  });
});
