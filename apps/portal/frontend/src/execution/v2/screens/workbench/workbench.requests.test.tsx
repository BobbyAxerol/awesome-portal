/**
 * DEBT-UXM07-044 · the requests the Paper workbench makes, as a set and in an order a test can hold.
 *
 * M-1 saw this route at 12 reads on one worker and 11 on two: the twelfth is `GET /governance/stage-action-eligibility`, which the exit
 * control starts when it MOUNTS, i.e. after the profile has answered and the body has rendered. The count never depended on a
 * race between reads; the moment of the read depends on how long that render takes, and a harness that judged "idle" before the body
 * mounted missed it. The product side of that is pinned here: one read per mount, none before the body, and by the time the root
 * says `ready` every read it will make has been made.
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ExecutionApi } from "../../../api/ports";
import { V2_ROLE_PRESETS } from "../../shell/roleNav";
import PaperWorkbenchScreen from "./index";
import { DEP, deferred, envelopeOf, fakeApi, paperWire, sessionOf } from "./workbench.harness.fixtures";

const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("../../../../auth/session", () => ({ useSession: () => session.current }));

beforeEach(() => {
  session.current = sessionOf(V2_ROLE_PRESETS.manager);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ELIGIBILITY = "eligibility";

function mount(entry: string, profile?: ReturnType<typeof deferred<{ ok: true; value: ReturnType<typeof envelopeOf> }>>) {
  const served = fakeApi(profile === undefined ? {} : { profile: () => profile.promise });
  const api = {
    ...served.api,
    getStageActionEligibility: vi.fn(async (workspaceId?: string) => {
      served.calls.push(`${ELIGIBILITY}:${workspaceId ?? ""}`);
      return { ok: false as const, status: "unavailable" as const, reason: "fixture" };
    }),
  } as unknown as ExecutionApi;
  render(
    <MemoryRouter initialEntries={[entry]}>
      <PaperWorkbenchScreen api={api} deploymentId={DEP} />
    </MemoryRouter>,
  );
  return served.calls;
}

const root = () => document.querySelector<HTMLElement>('[data-screen="workbench-v2"]')!;
const sorted = (calls: readonly string[]) => [...calls].sort();

describe("the workbench's requests (DEBT-UXM07-044)", () => {
  it("Overview: the profile and the quality are asked on open, the eligibility only once the body is mounted, and the root is `ready` only then", async () => {
    const answer = deferred<{ ok: true; value: ReturnType<typeof envelopeOf> }>();
    const calls = mount(`/deployments/paper/${DEP}`, answer);
    expect(root().getAttribute("data-state")).toBe("loading");
    await waitFor(() => expect(calls).toContain(`quality:${DEP}`));
    expect(sorted(calls)).toEqual([`profile:${DEP}:paper`, `quality:${DEP}`]);

    answer.resolve({ ok: true, value: envelopeOf(paperWire()) });
    await waitFor(() => expect(root().getAttribute("data-state")).toBe("ready"));
    // No waiting between "ready" and the count: the read that renders with the body has already been made.
    expect(calls).toEqual([expect.stringMatching(/^(profile|quality):/), expect.stringMatching(/^(profile|quality):/), `${ELIGIBILITY}:`]);
    expect(sorted(calls)).toEqual([`${ELIGIBILITY}:`, `profile:${DEP}:paper`, `quality:${DEP}`]);

    // Nothing else follows: no second eligibility, no re-read of the profile.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sorted(calls)).toEqual([`${ELIGIBILITY}:`, `profile:${DEP}:paper`, `quality:${DEP}`]);
  });

  it("Fills: two reads and no eligibility, because the exit control is not mounted; opening Overview asks for it once", async () => {
    const calls = mount(`/deployments/paper/${DEP}?tab=fills`);
    await waitFor(() => expect(root().getAttribute("data-state")).toBe("ready"));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sorted(calls)).toEqual([`profile:${DEP}:paper`, `quality:${DEP}`]);

    fireEvent.click(within(screen.getByRole("tablist", { name: "Paper deployment sections" })).getByRole("tab", { name: "Overview" }));
    await waitFor(() => expect(calls.filter((c) => c.startsWith(ELIGIBILITY))).toEqual([`${ELIGIBILITY}:`]));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(sorted(calls)).toEqual([`${ELIGIBILITY}:`, `profile:${DEP}:paper`, `quality:${DEP}`]);
  });
});
