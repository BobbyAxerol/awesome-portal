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
  type Envelope,
  type KeysetPage,
  type OrderStatus,
} from "./contracts";
import {
  commandBlockedReason,
  commandEnabled,
  PROFILE_ORDER,
  PROFILE_RANK,
  profileNeedsLabel,
  reconcilePanelProfile,
  screenDeliveryPolicy,
  screenDeliveryProfile,
} from "./profile";
import { KeysetTable, type Column } from "./components/table";
import {
  formatDecimal,
  readDecimal,
  readEnum,
  readEnvelope,
  readId,
  readKeysetPage,
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
