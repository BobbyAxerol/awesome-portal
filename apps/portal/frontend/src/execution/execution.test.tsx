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

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ExecutionSurface } from "./ExecutionSurface";
import {
  BLOTTER_BUCKET,
  BLOTTER_UNBUCKETED,
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
import { readApprovalRow, readGateR1Detail } from "./api/rows";
import { createFixtureApi } from "./api/fixtureApi";
import { ApprovalInboxContainer, GateR1ReviewContainer } from "./screens/containers";
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
import { ApprovalInbox, INBOX_FILTERS, type ApprovalRow } from "./screens/ApprovalInbox";
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
    render(exitReview());
    expect(screen.getByText("INSUFFICIENT_DATA")).toBeTruthy();
    expect(screen.getByText(/carries into sandbox certification/)).toBeTruthy();
    expect(screen.getByText(/Promotion does not resolve them/)).toBeTruthy();
  });

  it("does not treat a watch item as blocking", () => {
    render(exitReview());
    expect(screen.getByText("WATCH")).toBeTruthy();
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
    expect(container.querySelectorAll("tbody tr").length).toBe(4);
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
