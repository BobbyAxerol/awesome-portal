/**
 * L3 negative (Rules 9.8.3) for the Paper workbench: payloads the readers and
 * the model must refuse or map to "unavailable" without throwing, without a
 * success state from an unknown word, and without letting the bad value reach
 * the page. Generated from the testkit, then a few rendered through the screen.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readDeploymentQuality } from "../../../api/derivations";
import { readProfileEnvelope } from "../../../api/profileRead";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import { getPath, type Path } from "../../testkit/matrix";
import {
  POLLUTION_MARKER, arrayCases, decimalCases, enumCases, integerCases, leaked, pollutionCases, prototypeIsClean, requiredCases, rootCases,
  schemaVersionCases, stringCases, type NegativeCase,
} from "../../testkit/negative";
import PaperWorkbenchScreen from "./index";
import { buildWorkbench, readQuality } from "./model";
import { DEP, fakeApi, envelopeOf, paperWire, qualityOf, qualityWire, sessionOf, type Wire } from "./workbench.harness.fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));
beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => cleanup());

const BASE = paperWire({ orders: 3, fills: 2, positions: 2, equity: 6, history: true });
const QBASE = qualityWire();

/** The product chain a body goes through: the profile reader, then the model. `null` = the reader refused the body. */
function run(value: unknown) {
  const envelope = readProfileEnvelope(value);
  return envelope === null ? null : buildWorkbench(envelope, qualityOf());
}

/** A case with a value that is itself a published word is not a negative one. */
const invalidOnly = (cases: NegativeCase[], path: Path, valid: readonly string[]) => cases.filter((c) => !valid.includes(getPath(c.value, path) as string));

function sweep(cases: readonly NegativeCase[], check: (model: ReturnType<typeof run>, c: NegativeCase) => void) {
  it.each(cases.map((c) => [c.name, c] as const))("%s", (_name, c) => {
    let model: ReturnType<typeof run> = null;
    expect(() => { model = run(c.value); }, "must not throw").not.toThrow();
    expect(leaked(model, c.probe), "the bad value reached the model").toBe(false);
    expect(prototypeIsClean()).toBe(true);
    check(model, c);
  });
}

const ordersAt = (n: number): Path => ["data", "orders", n];
const order0 = (m: ReturnType<typeof run>) => m?.orders.rows.find((r) => r.orderId === "ord_00000");
const BIDI = String.fromCharCode(0x202e);
/** Control characters and bidi overrides: none may come out of a text field. */
const UNSAFE = new RegExp(`[\\u0000-\\u001f${String.fromCharCode(0x202a)}-${BIDI}]`);
const MONEY_VALUE = /^-?\d{1,3}(,\d{3})*(\.\d+)?$/;

describe("a decimal field never becomes a number on the page", () => {
  describe("orders[0].quantity", () => {
    sweep(decimalCases(BASE, [...ordersAt(0), "quantity"]), (m, c) => {
      const row = order0(m);
      if (row === undefined) return expect(m === null || m.orders.rows.length > 0).toBe(true);
      expect(row.quantity.kind === "value" ? row.quantity.decimal.display : "").toMatch(row.quantity.kind === "value" ? /^\d/ : /^$/);
      // Anything the boundary refuses is "unreadable", never "value" and never absent-as-zero.
      if (c.category !== "null-vs-absent") expect(row.quantity.kind).not.toBe("value");
    });
  });

  describe("orders[0].price", () => {
    sweep(decimalCases(BASE, [...ordersAt(0), "price"]), (m) => {
      const row = order0(m);
      expect(row?.price.kind).toBe("unreadable");
    });
  });

  describe("the head snapshot's equity, net pnl, fees and cash", () => {
    for (const field of ["equity", "net_pnl", "fee_total", "cash_free"]) {
      describe(field, () => {
        sweep(decimalCases(BASE, ["data", "account_equity", 5, field]), (m) => {
          const a = m?.equity.accounting;
          const figure = field === "equity" ? a?.equity : field === "net_pnl" ? a?.netPnl : field === "fee_total" ? a?.fees : a?.cashFree;
          expect(figure?.kind).toBe("unreadable");
          if (field === "equity") {
            // The chart gets a gap, not a zero, and the page says so.
            expect(m?.equity.points[5].v).toBeNull();
            expect(m?.equity.state.kind).toBe("partial");
          }
        });
      });
    }
  });

  describe("fills[0].commission and positions[0].unrealized_pnl", () => {
    sweep(decimalCases(BASE, ["data", "fills", 0, "commission"]), (m) => {
      expect(m?.fills.rows.every((r) => r.fee.kind !== "value" || MONEY_VALUE.test(r.fee.decimal.display))).toBe(true);
      expect(m?.fills.rows.find((r) => r.fee.kind === "value" && r.fee.decimal.full !== "12.40")).toBeUndefined();
    });
    sweep(decimalCases(BASE, ["data", "positions", 0, "unrealized_pnl"]), (m) => {
      expect(m?.positions.table.rows.find((r) => r.unrealized.kind === "value" && r.unrealized.decimal.full !== "9.54")).toBeUndefined();
    });
  });
});

describe("a count field", () => {
  describe("observation_gate.observed_days", () => {
    sweep(integerCases(BASE, ["data", "observation_gate", "observed_days"]), (m) => {
      const days = m?.gate.observedDays;
      expect(days === null || (Number.isSafeInteger(days) && (days as number) >= 0)).toBe(true);
    });
  });

  describe("the quality read's counts are digits or they are unreadable (a fraction is never rounded into a count)", () => {
    for (const field of ["order_population", "submitted_count", "rejected_count", "execution_session_population"]) {
      describe(field, () => {
        for (const c of [...decimalCases(QBASE, ["data", field]), ...integerCases(QBASE, ["data", field])]) {
          it(c.name, () => {
            let facts: ReturnType<typeof readQuality> | null = null;
            expect(() => {
              const read = readDeploymentQuality(c.value);
              facts = read === null ? null : readQuality(read);
            }).not.toThrow();
            expect(leaked(facts, c.probe)).toBe(false);
            if (facts === null) return;
            const f = facts as ReturnType<typeof readQuality>;
            for (const figure of [f.orders, f.submitted, f.rejected, f.sessions]) {
              if (figure.kind === "value") expect(figure.decimal.display).toMatch(/^\d{1,3}(,\d{3})*$/);
            }
          });
        }
      });
    }
  });
});

describe("a status word the build does not know is Unknown and is not kept", () => {
  describe("orders[0].status", () => {
    const valid = ["FILLED", "PARTIALLY_FILLED", "REJECTED", "DENIED", "CANCELED", "CANCELLED", "EXPIRED", "INITIALIZED", "SUBMITTED", "ACCEPTED", "PENDING_UPDATE", "PENDING_CANCEL", "TRIGGERED", "UNKNOWN"];
    sweep(invalidOnly(enumCases(BASE, [...ordersAt(0), "status"], ["FILLED"]), [...ordersAt(0), "status"], valid), (m) => {
      expect(order0(m)?.state).toEqual({ kind: "unknown", label: "Unknown" });
    });
  });

  describe("observation_gate.state never reads as met", () => {
    const valid = ["MET", "AVAILABLE", "PARTIAL", "BLOCKED", "NOT_MET"];
    sweep(invalidOnly(enumCases(BASE, ["data", "observation_gate", "state"], ["MET"]), ["data", "observation_gate", "state"], valid), (m) => {
      expect(m?.gate.verdict).toBe("unknown");
    });
  });

  describe("freshness never reads as Fresh from a variant", () => {
    const valid = ["FRESH", "AGING", "STALE", "UNKNOWN", "PAUSED"];
    sweep(invalidOnly(enumCases(BASE, ["freshness"], ["FRESH"]), ["freshness"], valid), (m) => {
      expect(["unknown", "not-published"]).toContain(m?.freshness.kind);
    });
  });

  describe("the profile state never reads as ok from a variant", () => {
    const valid = ["ready", "ok", "partial", "stale", "empty", "unavailable", "denied"];
    sweep(invalidOnly(enumCases(BASE, ["state"], ["ready"]), ["state"], valid), (m) => {
      // Either the reader refused the body (null) or the page says the state is not known.
      if (m !== null) expect(m.page.replace?.status).toBe("unavailable");
    });
  });

  describe("positions[0].side", () => {
    sweep(invalidOnly(enumCases(BASE, ["data", "positions", 0, "side"], ["LONG"]), ["data", "positions", 0, "side"], ["LONG", "SHORT", "FLAT"]), (m) => {
      expect(m?.positions.open).toBe(1);
      expect(m?.positions.unreadableSide).toBe(1);
    });
  });
});

describe("a body that is another schema is refused whole", () => {
  sweep(schemaVersionCases(BASE, ["schema_version"], "execution.paper-workbench.v1", ["execution.paper-workbench-vnm.v1", "execution.portfolio-resource.v1", "execution.alpha-resource.v1", "execution.sandbox-certification.v1"]), (m, c) => {
    const version = getPath(c.value, ["schema_version"]);
    if (m === null) return;
    if (version === "execution.paper-workbench-vnm.v1") expect(m.page.replace).toBeNull();
    else expect(m.page.replace?.status).toBe("terminal");
  });
});

describe("missing and null required fields", () => {
  sweep(requiredCases(BASE, [["data", "deployment", "deployment_id"], ["data", "deployment", "strategy_id"], ["data", "observation_gate", "state"], ["data", "account_equity", 5, "ts"], ["data", "orders", 0, "client_order_id"], ["data", "fills", 0, "trade_time"]]), (m, c) => {
    if (m === null) return;
    // A missing id is an absent id, never the string "null" or "undefined".
    expect(JSON.stringify(m.deployment)).not.toMatch(/"(null|undefined)"/);
    if (c.name.includes("observation_gate.state")) expect(m.gate.verdict).toBe("unknown");
  });
});

describe("a text field", () => {
  describe("deployment_id", () => {
    sweep(stringCases(BASE, ["data", "deployment", "deployment_id"]), (m) => {
      const id = m?.deployment?.deploymentId;
      expect(id === null || id === undefined || (id.length <= 256 && !UNSAFE.test(id))).toBe(true);
    });
  });
  describe("orders[0].client_order_id", () => {
    sweep(stringCases(BASE, [...ordersAt(0), "client_order_id"]), (m) => {
      const id = order0(m)?.clientOrderId;
      expect(id === null || id === undefined || (id.length <= 256 && !UNSAFE.test(id))).toBe(true);
    });
  });
});

describe("an array branch", () => {
  for (const branch of ["orders", "fills", "positions", "account_equity"]) {
    describe(branch, () => {
      sweep(arrayCases(BASE, ["data", branch], { idKey: branch === "orders" ? "order_id" : branch === "fills" ? "fill_id" : "instrument_id" }), (m) => {
        if (m === null) return;
        for (const table of [m.orders, m.fills, m.positions.table]) {
          expect(new Set(table.rows.map((r) => r.key)).size).toBe(table.rows.length);
          expect(table.rows.length).toBeLessThanOrEqual(200);
        }
      });
    });
  }
});

describe("prototype pollution", () => {
  sweep(pollutionCases(BASE, [[], ["data"], ["data", "deployment"], ["data", "observation_gate"], ["data", "orders", 0], ["data", "account_equity", 5]]), (m) => {
    expect(JSON.stringify(m)).not.toContain(POLLUTION_MARKER);
  });
});

describe("a root that is not an object", () => {
  it.each(rootCases().map((c) => [c.name, c] as const))("%s", (_name, c) => {
    expect(() => readProfileEnvelope(c.value)).not.toThrow();
    expect(readProfileEnvelope(c.value)).toBeNull();
  });
});

describe("hostile payloads through the screen", () => {
  const hostile: [string, (wire: Wire) => void, RegExp][] = [
    ["a bidi-override order id", (w) => { w.data.orders[0].client_order_id = `${BIDI}EVIL-ID`; w.data.orders[0].order_id = `${BIDI}EVIL-ID`; }, /EVIL-ID/],
    ["a 70,000-character strategy id", (w) => { w.data.deployment.strategy_id = "S".repeat(70_000); }, /S{300}/],
    ["a control-character symbol", (w) => { w.data.positions[0].instrument_id = "BTC\u0000USDT"; }, /BTC\u0000USDT/],
    ["an order status that would be a script", (w) => { w.data.orders[0].status = "<img src=x onerror=alert(1)>"; }, /onerror/],
    ["a state word that is html", (w) => { w.freshness = "<b>FRESH</b>"; }, /<b>/],
  ];
  it.each(hostile)("%s never reaches the page", async (_name, mutate, banned) => {
    const wire = paperWire({ orders: 2 });
    mutate(wire);
    const served = fakeApi({ profile: { ok: true, value: envelopeOf(wire) } });
    render(
      <MemoryRouter initialEntries={[`/deployments/paper/${DEP}?tab=orders`]}>
        <PaperWorkbenchScreen api={served.api} deploymentId={DEP} />
      </MemoryRouter>,
    );
    await screen.findByRole("heading", { level: 1 });
    await screen.findByRole("table", { name: "Orders" });
    expect(document.body.innerHTML).not.toMatch(banned);
    expect(document.body.querySelector("img[onerror]")).toBeNull();
  });
});
