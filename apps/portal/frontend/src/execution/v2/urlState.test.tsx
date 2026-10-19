import { act, renderHook } from "@testing-library/react";
import { MemoryRouter, useLocation, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";

import {
  CONTEXT_KEYS,
  ENV_LABEL,
  RAIL_CONTEXT_KEYS,
  isInternalPath,
  parseUrlParams,
  serializeUrlParams,
  useExecUrlState,
  withContext,
  withoutParams,
  type ExecUrlParams,
} from "./urlState";

const parse = (search: string) => parseUrlParams(search);
const write = (patch: Partial<ExecUrlParams>, base = "") => serializeUrlParams(patch, base).toString();

describe("parseUrlParams defaults", () => {
  it("reads an empty query as all defaults with nothing invalid", () => {
    const { value, invalid } = parse("");
    expect(value).toEqual({
      env: "live",
      window: "90D",
      ccy: null,
      stage: [],
      q: null,
      sort: null,
      group: null,
      sel: null,
      tab: null,
      view: null,
      ctx: null,
      from: null,
      workspace_id: null,
      compose: null,
    });
    expect(invalid).toEqual([]);
  });

  it("treats an empty value as absent, not invalid", () => {
    expect(parse("q=&env=&window=%20").invalid).toEqual([]);
  });

  it("labels the live environment Real-funded while the URL keeps live", () => {
    expect(ENV_LABEL).toEqual({ live: "Real-funded", paper: "Paper", sandbox: "Sandbox" });
    expect(write({ env: "paper" })).toBe("env=paper");
    expect(write({ env: "live" }, "env=paper")).toBe("");
  });
});

describe("round trip per param", () => {
  const cases: [string, Partial<ExecUrlParams>, string][] = [
    ["env", { env: "sandbox" }, "env=sandbox"],
    ["window 7D", { window: "7D" }, "window=7d"],
    ["window 30D", { window: "30D" }, "window=30d"],
    ["window ALL", { window: "ALL" }, "window=all"],
    ["ccy", { ccy: "USDT" }, "ccy=USDT"],
    ["stage", { stage: ["canary", "live"] }, "stage=canary%2Clive"],
    ["q", { q: "btc trend" }, "q=btc+trend"],
    ["sort", { sort: "-nav" }, "sort=-nav"],
    ["group", { group: "venue" }, "group=venue"],
    ["sel", { sel: "dep_1" }, "sel=dep_1"],
    ["tab", { tab: "performance" }, "tab=performance"],
    ["view", { view: "board" }, "view=board"],
    ["ctx", { ctx: "portfolio:PF-1" }, "ctx=portfolio%3APF-1"],
    ["from", { from: "alpha_7" }, "from=alpha_7"],
    ["workspace_id", { workspace_id: "ws_1" }, "workspace_id=ws_1"],
    ["compose (D8c)", { compose: "request" }, "compose=request"],
  ];

  it.each(cases)("%s", (_name, patch, query) => {
    expect(write(patch)).toBe(query);
    const { value, invalid } = parse(query);
    expect(invalid).toEqual([]);
    for (const [key, expected] of Object.entries(patch)) expect(value[key as keyof ExecUrlParams]).toEqual(expected);
    expect(write(value)).toBe(query);
  });
});

describe("defaults are omitted", () => {
  it("never writes a default", () => {
    expect(write({ env: "live", window: "90D", ccy: null, stage: [], q: null, sort: null, tab: null })).toBe("");
  });

  it("removes a default over an existing value and keeps unrelated params", () => {
    expect(write({ window: "90D", stage: [] }, "window=7d&stage=paper&cursor=abc&f.venue=x")).toBe("cursor=abc&f.venue=x");
  });

  it("ignores keys missing from the patch", () => {
    expect(write({ q: "x" }, "env=paper")).toBe("env=paper&q=x");
  });

  it("canonicalises case on a round trip", () => {
    expect(write(parse("window=30D&env=PAPER&stage=Live,Canary").value)).toBe("env=paper&window=30d&stage=canary%2Clive");
  });

  it("reads stage all as no filter", () => {
    expect(parse("stage=all").value.stage).toEqual([]);
    expect(parse("stage=all").invalid).toEqual([]);
  });
});

describe("invalid values are defaulted and reported", () => {
  it.each([
    ["env=prod", "env"],
    ["window=1y", "window"],
    ["ccy=U$D", "ccy"],
    ["ccy=1", "ccy"],
    ["stage=paper,moon", "stage"],
    ["stage=all,moon", "stage"],
    [`q=${"x".repeat(201)}`, "q"],
    ["ctx=nocolon", "ctx"],
    ["sel=a%00b", "sel"],
    [`tab=${"t".repeat(65)}`, "tab"],
    ["compose=approval", "compose"],
    ["compose=request,other", "compose"],
  ])("%s", (query, key) => {
    const { value, invalid } = parse(query);
    expect(invalid).toEqual([key]);
    expect(value).toEqual(parse("").value);
  });

  it("reports every bad key and keeps the good ones", () => {
    const { value, invalid } = parse("env=prod&window=30d&ccy=zz9&sel=ok");
    expect(invalid).toEqual(["env", "ccy"]);
    expect(value.window).toBe("30D");
    expect(value.sel).toBe("ok");
  });

  it("does not inject a default currency", () => {
    expect(parse("").value.ccy).toBeNull();
  });
});

describe("withContext", () => {
  const current = "env=paper&window=30d&ccy=usdt&workspace_id=ws_1&from=alpha_7&stage=paper&q=x&sel=a&tab=risk&cursor=c";

  it("carries only context params and from onto a bare path", () => {
    expect(withContext("/deployments/alphas/av_1", current)).toBe(
      "/deployments/alphas/av_1?env=paper&window=30d&ccy=USDT&from=alpha_7&workspace_id=ws_1",
    );
  });

  it("does not carry screen-local params", () => {
    const href = withContext("/x", current);
    for (const local of ["stage", "q", "sel", "tab", "cursor"]) expect(href).not.toContain(`${local}=`);
  });

  it("keeps the link's own params and lets them win", () => {
    const out = new URLSearchParams(withContext("/x?tab=orders&env=sandbox&window=7d", current).split("?")[1]);
    expect(out.getAll("env")).toEqual(["sandbox"]);
    expect(out.getAll("window")).toEqual(["7d"]);
    expect(out.get("tab")).toBe("orders");
    expect(out.get("workspace_id")).toBe("ws_1");
  });

  it("never duplicates a context key", () => {
    const out = new URLSearchParams(withContext("/x?env=paper&env=sandbox&workspace_id=a&workspace_id=b", current).split("?")[1]);
    for (const key of CONTEXT_KEYS) expect(out.getAll(key).length).toBeLessThanOrEqual(1);
    expect(out.get("env")).toBe("paper");
    expect(out.get("workspace_id")).toBe("a");
  });

  it("preserves the hash with and without a query", () => {
    expect(withContext("/x?tab=risk#charts", "workspace_id=ws_1")).toBe("/x?tab=risk&workspace_id=ws_1#charts");
    expect(withContext("/x#ledger", "workspace_id=ws_1")).toBe("/x?workspace_id=ws_1#ledger");
    expect(withContext("/x#ledger", "")).toBe("/x#ledger");
  });

  it("leaves defaults out of the carried context", () => {
    expect(withContext("/x", "env=live&window=90d")).toBe("/x");
    expect(withContext("/x", "")).toBe("/x");
  });

  it("drops invalid context instead of propagating it", () => {
    expect(withContext("/x", "env=prod&workspace_id=ws_1")).toBe("/x?workspace_id=ws_1");
  });

  it("accepts URLSearchParams and returns external hrefs untouched", () => {
    expect(withContext("/x", new URLSearchParams("env=paper"))).toBe("/x?env=paper");
    expect(withContext("https://example.test/a?b=1", current)).toBe("https://example.test/a?b=1");
    expect(withContext("//example.test/a", current)).toBe("//example.test/a");
  });

  // L4: only an internal path (one leading slash) is ever decorated.
  it.each([
    "https://example.test/a",
    "http://example.test/a?b=1#h",
    "//example.test/a",
    "/\\example.test/a",
    "javascript:alert(1)",
    "mailto:ops@example.test",
    "data:text/html,x",
    "tel:+84123",
    "foo/bar",
    "?tab=risk",
    "#ledger",
    "",
    " /x",
  ])("returns %j unchanged, with no context", (href) => {
    expect(withContext(href, current)).toBe(href);
  });

  it("does not change what a same-origin path gets (query, hash and context exactly as before)", () => {
    expect(withContext("/x", current)).toBe("/x?env=paper&window=30d&ccy=USDT&from=alpha_7&workspace_id=ws_1");
    expect(withContext("/x/y?tab=risk#h", "workspace_id=ws_1")).toBe("/x/y?tab=risk&workspace_id=ws_1#h");
    expect(withContext("/", "workspace_id=ws_1")).toBe("/?workspace_id=ws_1");
  });

  it("isInternalPath: one leading slash, not protocol-relative", () => {
    expect(isInternalPath("/a")).toBe(true);
    expect(isInternalPath("/")).toBe(true);
    for (const href of ["//a", "/\\a", "a", "https://a", "?q", "#h", ""]) expect(isInternalPath(href), href).toBe(false);
  });

  it("`keys` narrows what is carried (the rail leaves `from` out); an own value still wins", () => {
    expect(withContext("/x", current, RAIL_CONTEXT_KEYS)).toBe("/x?env=paper&window=30d&ccy=USDT&workspace_id=ws_1");
    expect(RAIL_CONTEXT_KEYS).not.toContain("from");
    expect(withContext("/x?env=sandbox", current, RAIL_CONTEXT_KEYS)).toBe("/x?env=sandbox&window=30d&ccy=USDT&workspace_id=ws_1");
    expect(withContext("/x", current, [])).toBe("/x");
  });
});

describe("withoutParams", () => {
  it("removes the named keys (all repeats) and keeps the rest in order", () => {
    expect(withoutParams("workspace_id=ws_1&sel=a&from=x&sel=b", ["sel"]).toString()).toBe("workspace_id=ws_1&from=x");
    expect(withoutParams(new URLSearchParams("a=1"), ["sel"]).toString()).toBe("a=1");
    expect(withoutParams("sel=a", ["sel"]).toString()).toBe("");
  });
});

describe("compose (D8c: compose=request opens the New request drawer)", () => {
  it("is not a context key, so a link never carries an open drawer to another screen", () => {
    expect((CONTEXT_KEYS as readonly string[]).includes("compose")).toBe(false);
    expect(withContext("/governance/approvals", "env=paper&compose=request")).toBe("/governance/approvals?env=paper");
  });

  it("reads any case, writes lower-case, and an absent value is null (the drawer is closed)", () => {
    expect(parse("compose=REQUEST").value.compose).toBe("request");
    expect(write(parse("compose=Request").value)).toBe("compose=request");
    expect(parse("").value.compose).toBeNull();
  });

  it("keeps `sel` and every other key untouched when it is set or cleared", () => {
    expect(write({ compose: "request" }, "sel=AP-9&tab=overdue&cursor=c")).toBe("sel=AP-9&tab=overdue&cursor=c&compose=request");
    expect(write({ compose: null }, "sel=AP-9&compose=request&cursor=c")).toBe("sel=AP-9&cursor=c");
  });

  it("does not disturb the existing keys' round trip when present", () => {
    const query = "env=paper&window=30d&sel=AP-9&tab=overdue&compose=request&workspace_id=ws_1";
    expect(write(parse(query).value)).toBe("env=paper&window=30d&sel=AP-9&tab=overdue&workspace_id=ws_1&compose=request");
    expect(parse(query).invalid).toEqual([]);
  });

  it("ignores an unknown composer with a report and defaults to closed", () => {
    const { value, invalid } = parse("compose=transfer&sel=a");
    expect(invalid).toEqual(["compose"]);
    expect(value.compose).toBeNull();
    expect(value.sel).toBe("a");
  });
});

describe("useExecUrlState", () => {
  function setup(initial: string, history: string[] = []) {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={[...history, initial]} initialIndex={history.length}>
        {children}
      </MemoryRouter>
    );
    return renderHook(() => ({ state: useExecUrlState(), location: useLocation(), navigate: useNavigate() }), { wrapper });
  }

  it("leaves a canonical URL alone", () => {
    const { result } = setup("/x?env=paper&cursor=c");
    expect(result.current.location.search).toBe("?env=paper&cursor=c");
    expect(result.current.state.value.env).toBe("paper");
    expect(result.current.state.invalid).toEqual([]);
  });

  it("rewrites an explicit default and an upper-case window", () => {
    const { result } = setup("/x?window=90d&env=live&sel=a");
    expect(result.current.location.search).toBe("?sel=a");
    const upper = setup("/x?window=30D").result;
    expect(upper.current.location.search).toBe("?window=30d");
  });

  it("drops an invalid value but keeps reporting it", () => {
    const { result } = setup("/x?env=prod&sel=a");
    expect(result.current.location.search).toBe("?sel=a");
    expect(result.current.state.value.env).toBe("live");
    expect(result.current.state.invalid).toEqual(["env"]);
    act(() => result.current.state.clearInvalid());
    expect(result.current.state.invalid).toEqual([]);
  });

  it("canonicalises with replace, so Back does not return to the bad URL", () => {
    const { result } = setup("/x?env=prod", ["/start"]);
    expect(result.current.location.search).toBe("");
    act(() => result.current.navigate(-1));
    expect(result.current.location.pathname).toBe("/start");
  });

  it("opening the drawer pushes a history entry, so Back closes it and leaves the queue as it was", () => {
    const { result } = setup("/governance/approvals?sel=AP-9&tab=overdue", ["/start"]);
    act(() => result.current.state.set({ compose: "request" }));
    expect(result.current.location.search).toBe("?sel=AP-9&tab=overdue&compose=request");
    expect(result.current.state.value.compose).toBe("request");
    act(() => result.current.navigate(-1));
    expect(result.current.location.search).toBe("?sel=AP-9&tab=overdue");
    expect(result.current.state.value.compose).toBeNull();
  });

  it("closing the drawer removes only compose", () => {
    const { result } = setup("/x?sel=AP-9&compose=request");
    act(() => result.current.state.set({ compose: null }));
    expect(result.current.location.search).toBe("?sel=AP-9");
  });

  it("set writes a patch over the current query and omits defaults", () => {
    const { result } = setup("/x?window=7d&cursor=c");
    act(() => result.current.state.set({ env: "sandbox", window: "90D" }));
    expect(result.current.location.search).toBe("?cursor=c&env=sandbox");
    expect(result.current.state.value.env).toBe("sandbox");
  });
});
