/**
 * R3-3 · a masthead names the authority the CONTRACT published.
 *
 * Four product screens printed a constant instead. Alpha Fleet and Portfolios
 * printed `EXECUTION`; the bindings register and Binding Detail printed
 * `BROKER`. Meanwhile `execution.bindings-list.v1`,
 * `execution.alpha-fleet-list.v2`, `execution.portfolio-list.v1` and
 * `execution.binding-detail.v1` all REQUIRE `record_authority` and publish
 * `source_authority`, and the readers asserted the first then dropped both.
 *
 * `BROKER` was not a harmless placeholder. These rows are a Portal projection
 * of a Trading System read; no broker certified them. R3-3 forbids a screen
 * implying broker/Trading-System certification, and §3.3 forbids rendering a
 * fact the source did not state. A hard-coded authority is both at once.
 *
 * Guard order matters here: the source scan below is the one that closes the
 * class. A render test proves this screen, today; the scan proves the next
 * screen cannot reintroduce it, which is the failure mode that actually
 * repeats.
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import BINDING_DETAIL from "../../../../../packages/contracts/fixtures/execution-binding-detail.valid.json";
import { readBindingDetail } from "./api/profileRead";
import { authorityLabel } from "./components/SourceFreshness";
import { BindingDetail } from "./screens/BindingDetail";

describe("authorityLabel", () => {
  it("maps the contract vocabulary to the screen vocabulary", () => {
    expect(authorityLabel("TRADING_SYSTEM", "PORTAL_PROJECTION")).toBe("EXECUTION");
    expect(authorityLabel(null, "PORTAL_PROJECTION")).toBe("PORTAL");
  });

  it("prefers the source authority, because that is where the facts came from", () => {
    expect(authorityLabel("BROKER", "PORTAL_PROJECTION")).toBe("BROKER");
  });

  it("passes an unrecognised word through rather than calling it PORTAL", () => {
    // A new contract vocabulary must be visible as itself. Silently rendering
    // it as PORTAL would hide the arrival of a new authority.
    expect(authorityLabel("SOME_NEW_AUTHORITY", null)).toBe("SOME_NEW_AUTHORITY");
  });

  it("says nothing was stated rather than choosing a reassuring default", () => {
    expect(authorityLabel(null, null)).toBe("authority not stated");
    expect(authorityLabel(undefined, undefined)).toBe("authority not stated");
  });
});

describe("Binding Detail renders the published envelope, not a constant", () => {
  // §7.8: the canonical fixture is LOADED, never copied into the test.
  const detail = readBindingDetail(BINDING_DETAIL);

  it("decodes all nine published fields", () => {
    expect(detail).not.toBeNull();
    expect(detail?.sourceAuthority).toBe("TRADING_SYSTEM");
    expect(detail?.recordAuthority).toBe("PORTAL_PROJECTION");
  });

  it("names EXECUTION, and never claims a broker certified the row", () => {
    render(
      <MemoryRouter>
        <BindingDetail bindingId="acc_a@BINANCE" detail={detail} nowMs={Date.parse("2026-08-31T10:00:31Z")} />
      </MemoryRouter>,
    );
    expect(screen.getByText("EXECUTION")).toBeTruthy();
    expect(screen.queryByText("BROKER")).toBeNull();
  });

  it("shows the freshness tier and both instants the age is checked against", () => {
    render(
      <MemoryRouter>
        <BindingDetail bindingId="acc_a@BINANCE" detail={detail} nowMs={Date.parse("2026-08-31T10:00:31Z")} />
      </MemoryRouter>,
    );
    expect(screen.getByText("FRESH")).toBeTruthy();
    // `source_as_of` and `read_at` are one second apart in the fixture; both
    // are on screen, because a tier the reader cannot check is worse than none.
    // Each instant appears twice by design — once in the masthead header and
    // once in the sync panel — so this asserts presence, not uniqueness.
    expect(screen.getAllByText(/2026-08-31 10:00:00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/2026-08-31 10:00:01/).length).toBeGreaterThan(0);
  });

  it("states the environment, because PAPER never borrows LIVE's facts", () => {
    render(
      <MemoryRouter>
        <BindingDetail bindingId="acc_a@BINANCE" detail={detail} nowMs={Date.parse("2026-08-31T10:00:31Z")} />
      </MemoryRouter>,
    );
    expect(screen.getByText("PAPER")).toBeTruthy();
    expect(screen.getByText("PAPER_BINANCE_USDM")).toBeTruthy();
  });

  it("reports the sync state the contract publishes instead of claiming absence", () => {
    render(
      <MemoryRouter>
        <BindingDetail bindingId="acc_a@BINANCE" detail={detail} nowMs={Date.parse("2026-08-31T10:00:31Z")} />
      </MemoryRouter>,
    );
    expect(screen.getByText("SYNC_SYNCED")).toBeTruthy();
    // The panel used to say broker sync ages were "not published" while
    // `credential_state` published exactly that. Only the policy half is absent.
    expect(screen.getByText(/Per-venue policy verdicts are not published/)).toBeTruthy();
  });

  it("refuses a response without the required authority rather than guessing it", () => {
    expect(readBindingDetail({ ...BINDING_DETAIL, record_authority: undefined })).toBeNull();
  });
});

describe("no product screen hard-codes its source authority", () => {
  const SCREENS = join(__dirname, "screens");

  /** A literal authority word where the masthead states its authority. */
  const LITERAL = /label="(EXECUTION|BROKER|PORTAL|RESEARCH|DERIVED|TRADING_SYSTEM|PORTAL_PROJECTION)"|<b>(EXECUTION|BROKER|PORTAL_PROJECTION|TRADING_SYSTEM)<\/b>/;

  /**
   * Published data on the same line — this is what makes it a defect.
   *
   * The reviewed hi-fi `demo`/`smoke` branches also hard-code an authority,
   * and they are NOT defects: they render a frozen reviewed cast against a
   * demo clock, not a source read, and the lab is where the hi-fi is proved.
   * Discriminating on "is this line reading a published envelope" is what
   * separates the two without an allowlist — and an allowlist keyed by file or
   * line is exactly the guard that decayed on me before, so it is not used
   * here. A demo branch reads `smoke.`/`now`/`clockOf`; a product masthead
   * reads an envelope.
   */
  const PUBLISHED = /envelope|list\?\.|detail\?\.|Envelope|Panel\?\./;

  it("finds no product masthead stating an authority the source did not", () => {
    const offenders: string[] = [];
    for (const file of readdirSync(SCREENS)) {
      if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
      const source = readFileSync(join(SCREENS, file), "utf8");
      for (const line of source.split("\n")) {
        if (LITERAL.test(line) && PUBLISHED.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("still rejects a bare label= literal, which no demo branch uses", () => {
    // The shared header takes its authority as a prop, so a literal there is
    // unambiguous wherever it appears.
    const bare = /label="(EXECUTION|BROKER|PORTAL|RESEARCH|DERIVED)"/;
    const offenders: string[] = [];
    for (const file of readdirSync(SCREENS)) {
      if (!file.endsWith(".tsx") || file.includes(".test.")) continue;
      const source = readFileSync(join(SCREENS, file), "utf8");
      if (bare.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
