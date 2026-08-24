/**
 * Properties of the rendered Execution Loop surface, checked on the DOM.
 *
 * The screenshot suite next door proves a screen has not *changed*. It cannot
 * say whether the thing it froze was right in the first place, and a defect
 * present when the baseline was written is a defect the baseline defends. This
 * file asks the other question — is what is on screen legible and reachable —
 * against all 116 fixture cases at once.
 *
 * Everything here failed when it was written:
 *  - the page scrolled sideways at BOTH breakpoints (1295>1280, 1762>1728);
 *  - a capital-preview table clipped 187px of a money table with no scroller,
 *    so the columns were painted outside the panel and could not be reached;
 *  - `SANDBOX_STEP_RECONCILIATION_UNAVAILABLE` in a 172px grid track pushed the
 *    certification strip past its own surface;
 *  - 22 duplicate DOM ids, because three screens hardcoded their tab ids: with
 *    five copies of Paper Workbench on this page, `aria-controls` resolved to
 *    the first match, so every copy's tabs pointed at the first copy's panel.
 *
 * None of that is visible to a unit test — the text content was correct in
 * every case — and none of it changes a screenshot enough to matter, because a
 * clipped column and a wrapped one differ by pixels a 0.2% budget forgives.
 */
import { expect, test, type Page } from "@playwright/test";

import { BREAKPOINTS, freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

const SHOT_BREAKPOINTS = BREAKPOINTS.filter((b) => b.name === "laptop" || b.name === "workstation");

async function openFixtures(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await freezeClock(page);
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await page.goto("/execution/_fixtures");
  await page.getByRole("heading", { level: 1, name: /Execution Loop/ }).waitFor({ state: "visible" });
  await settle(page);
}

for (const bp of SHOT_BREAKPOINTS) {
  test.describe(`execution surface @ ${bp.name}`, () => {
    test("renders enough to be worth checking", async ({ page }) => {
      // Every assertion below is a "no offenders" test, and an empty page has
      // no offenders. This is what stops the rest passing on a blank screen.
      await openFixtures(page, bp.width, bp.height);
      expect(await page.locator("[data-group]").count()).toBe(40);
      expect(await page.locator("[data-group] *").count()).toBeGreaterThan(2000);
    });

    test("the page never scrolls sideways", async ({ page }) => {
      await openFixtures(page, bp.width, bp.height);
      const { width, client, groups } = await page.evaluate(() => {
        const de = document.documentElement;
        return {
          width: de.scrollWidth,
          client: de.clientWidth,
          groups: [...document.querySelectorAll<HTMLElement>("[data-group]")]
            .filter((g) => g.scrollWidth > g.clientWidth + 1)
            .map((g) => `${g.getAttribute("data-group")} ${g.scrollWidth}>${g.clientWidth}`),
        };
      });
      // A horizontal scrollbar is not a cosmetic complaint: it appears at the
      // bottom of the window and shifts every screen above it.
      expect(groups, "these groups are wider than the surface they sit on").toEqual([]);
      expect(width).toBeLessThanOrEqual(client + 1);
    });

    test("nothing is clipped without a way to reach it", async ({ page }) => {
      await openFixtures(page, bp.width, bp.height);
      const clipped = await page.evaluate(() => {
        const out: string[] = [];
        for (const n of document.querySelectorAll<HTMLElement>("[data-group] *")) {
          const wider = n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0;
          if (!wider || getComputedStyle(n).overflowX !== "visible") continue;
          // Overflow is fine when an ancestor scrolls — that is the documented
          // answer for wide content. It is a defect when the content is simply
          // painted out of reach.
          let cur = n.parentElement;
          let reachable = false;
          while (cur) {
            const os = getComputedStyle(cur).overflowX;
            if (os === "auto" || os === "scroll") { reachable = true; break; }
            if (os === "hidden") break;
            cur = cur.parentElement;
          }
          if (!reachable) {
            out.push(
              `${n.closest("[data-group]")?.getAttribute("data-group")} | ${n.tagName} ${n.scrollWidth}>${n.clientWidth} | "${(n.textContent ?? "").trim().slice(0, 40)}"`,
            );
          }
        }
        return [...new Set(out)];
      });
      expect(clipped, "wrap it, or give it an overflow-x: auto box").toEqual([]);
    });

    test("a truncated cell is prose, and it carries its full text", async ({ page }) => {
      await openFixtures(page, bp.width, bp.height);
      const bad = await page.evaluate(() => {
        const out: string[] = [];
        for (const td of document.querySelectorAll<HTMLElement>("td")) {
          if (td.scrollWidth <= td.clientWidth + 1) continue;
          const numeric = td.getAttribute("data-numeric") === "true";
          const titled = Boolean(td.getAttribute("title"));
          // The stylesheet's own rule, made executable: "Prose may truncate,
          // and only with a title attribute supplied by the caller." M6 is the
          // other half — an ellipsised amount or ID is a different amount or
          // ID, so a numeric cell may never be the one that is cut.
          if (numeric || !titled) {
            out.push(`${td.closest("[data-group]")?.getAttribute("data-group")} | numeric=${numeric} titled=${titled} | "${(td.textContent ?? "").trim().slice(0, 30)}"`);
          }
        }
        return out;
      });
      expect(bad).toEqual([]);
    });

    test("no id is used twice", async ({ page }) => {
      await openFixtures(page, bp.width, bp.height);
      const dupes = await page.evaluate(() => {
        const seen = new Map<string, number>();
        for (const n of document.querySelectorAll("[id]")) seen.set(n.id, (seen.get(n.id) ?? 0) + 1);
        return [...seen].filter(([, c]) => c > 1).map(([id, c]) => `${id} ×${c}`);
      });
      // `aria-controls` and `aria-labelledby` resolve to the FIRST match, so a
      // duplicated id does not merely offend a validator — it silently wires a
      // control to the wrong panel. `useId` is the fix, not a longer literal.
      expect(dupes).toEqual([]);
    });

    test("every control says what it is", async ({ page }) => {
      await openFixtures(page, bp.width, bp.height);
      const unnamed = await page.evaluate(() =>
        [...document.querySelectorAll<HTMLElement>("[data-group] button, [data-group] a[href], [data-group] [role='button'], [data-group] [role='tab'], [data-group] input, [data-group] select")]
          .filter((n) => {
            const named =
              (n.getAttribute("aria-label") ?? n.textContent ?? "").trim() ||
              n.getAttribute("title") ||
              n.getAttribute("aria-labelledby") ||
              n.getAttribute("placeholder") ||
              (n as HTMLInputElement).labels?.length ||
              n.closest("label");
            return !named;
          })
          .map((n) => `${n.closest("[data-group]")?.getAttribute("data-group")} | ${n.tagName}.${String(n.className).slice(0, 30)}`),
      );
      expect(unnamed).toEqual([]);
    });

    test("text meets WCAG AA against what is actually behind it", async ({ page }) => {
      await openFixtures(page, bp.width, bp.height);
      const failures = await page.evaluate(() => {
        const lum = (c: string) => {
          const [r, g, b] = (c.match(/[\d.]+/g) ?? ["0", "0", "0"]).map(Number);
          const f = (v: number) => {
            const x = v / 255;
            return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        // Walked up rather than read off the element: almost every token here
        // paints on a transparent background, and scoring against `transparent`
        // would compare text to nothing and pass everything.
        const bgOf = (n: HTMLElement): string => {
          let cur: HTMLElement | null = n;
          while (cur) {
            const bg = getComputedStyle(cur).backgroundColor;
            if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) return bg;
            cur = cur.parentElement;
          }
          return "rgb(0,0,0)";
        };
        const out: string[] = [];
        for (const n of document.querySelectorAll<HTMLElement>("[data-group] *")) {
          if (n.children.length > 0) continue;
          const text = (n.textContent ?? "").trim();
          if (text.length < 2) continue;
          const s = getComputedStyle(n);
          if (s.visibility === "hidden" || s.display === "none" || Number(s.opacity) < 0.9) continue;
          const l1 = lum(s.color);
          const l2 = lum(bgOf(n));
          const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
          const px = parseFloat(s.fontSize);
          const large = px >= 24 || (px >= 18.66 && Number(s.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) {
            out.push(`${n.closest("[data-group]")?.getAttribute("data-group")} | ${ratio.toFixed(2)}:1 @${px}px | "${text.slice(0, 30)}"`);
          }
        }
        return [...new Set(out)];
      });
      expect(failures).toEqual([]);
    });
  });
}
