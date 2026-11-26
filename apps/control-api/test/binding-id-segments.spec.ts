import { describe, expect, it } from "vitest";

import { AnalyticsProxyError, bindingExposureResource, parseBindingId } from "../src/execution/analytics.proxy";
import { isDelegatableResource } from "../src/execution/delegation";

/** Pure (no database): the binding-id grammar for the virtual-account ids the Edge publishes today. */
const VA = "va@v1@paper@okx@dynamic-grid-v1@68818a23705148a48e14495487dbc10f";

describe("binding id with several @ segments (va@v1@paper@okx@<name>@<hash>)", () => {
  it("accepts the published virtual-account ids and the older <local>@<VENUE> ones, and the delegation layer issues both", () => {
    for (const id of [VA, "va@v1@paper@okx@v220-w60-m5@ad3a3813ff434e92b5f433cd63b64f49", "paper-binance-x_1h@BINANCE"]) {
      expect(parseBindingId(id), id).toBe(id);
      expect(isDelegatableResource(bindingExposureResource(parseBindingId(id))), id).toBe(true);
    }
  });

  it("still refuses everything that could change what a path or a resource means", () => {
    const hostile = [
      "", "plain", "@", "a@", "@a", "a@@b", `${VA}@`, "va@v1@paper@okx@a/b", "va@v1@paper@okx@a\\b", "va@v1@..@okx@x", "va@v1@a..b@okx@x",
      "va@v1@pa%40per@okx@x", "va@v1@paper@okx@x y", "va@v1@paper@okx@x\ny", "va@v1@-x@okx@y", "va@v1@paper@okx@x?y=1", "va@v1@paper@okx@x#y",
      "va@v1@paper@okx@x;rm", "a@b@c@d@e@f@g@h@i", `va@${"x".repeat(130)}`,
    ];
    for (const id of hostile) {
      expect(() => parseBindingId(id), JSON.stringify(id)).toThrowError(AnalyticsProxyError);
    }
    for (const resource of ["execution:screen:account-broker-360:va@v1@paper@okx@a/b", "execution:screen:account-broker-360:va@@x",
      "execution:screen:account-broker-360:va@v1@x y", "execution:screen:alpha-360:va@v1@paper@okx@x", "execution:screen:portfolio-360:va@v1@paper"]) {
      expect(isDelegatableResource(resource), resource).toBe(false);
    }
  });
});
