/**
 * F0 §4 test 13 — "keyboard/focus/reduced-motion and narrow drawer states
 * remain covered".
 *
 * "Remain" is the operative word, and it was accurate: the behaviour is
 * already right. Clickable rows carry `role="button"`, `tabIndex={0}` and a
 * keydown handler for Enter and Space; nothing on this surface animates; the
 * drawer holds together at phone width. What did not exist was any test that
 * would notice if one of those stopped being true — a grep for
 * `prefers-reduced-motion`, `focus`, `keyboard` or a narrow viewport across
 * every execution test file returned zero files.
 *
 * The keyboard half is covered in `execution.test.tsx` (a row activates on
 * Enter and on Space). The other three need a real browser: a computed focus
 * style, an emulated motion preference, and a viewport. They are here.
 *
 * Deliberately NOT asserted: dialog semantics. `.exec-drawer` is a
 * `<section aria-label>` in normal flow with `max-width: 490px` — an inline
 * panel, not an overlay. It has no backdrop and does not trap the page, so a
 * focus trap, `aria-modal` or Escape-to-close would be inventing a contract
 * the component does not have, and testing for them would push someone into
 * implementing them.
 */
import { expect, test, type Page } from "@playwright/test";

import { freezeClock, settle, stubPortalApi, usePreferences } from "./fixtures";

async function openFixtures(page: Page, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await freezeClock(page);
  await usePreferences(page, "operations");
  await stubPortalApi(page, "healthy");
  await page.goto("/execution/_fixtures");
  await page.getByRole("heading", { level: 1, name: /Execution Loop/ }).waitFor({ state: "visible" });
  await settle(page);
}

/** Drawer widths the requirement calls narrow. Phone and tablet. */
const NARROW = [390, 834];

for (const width of NARROW) {
  test(`the drawer survives ${width}px`, async ({ page }) => {
    await openFixtures(page, width);
    const drawers = await page.evaluate(() => {
      const out: {
        id: string;
        widerThanViewport: number;
        widerThanParent: number;
        overflow: number;
        clippedInside: number;
      }[] = [];
      for (const d of document.querySelectorAll<HTMLElement>(".exec-drawer")) {
        const clippedInside = [...d.querySelectorAll<HTMLElement>("*")].filter((n) => {
          if (!(n.scrollWidth > n.clientWidth + 1 && n.clientWidth > 0)) return false;
          // Content inside its own scroller is reachable, so it is not clipped.
          let cur: HTMLElement | null = n;
          while (cur && cur !== d) {
            const os = getComputedStyle(cur).overflowX;
            if (os === "auto" || os === "scroll") return false;
            cur = cur.parentElement;
          }
          return getComputedStyle(n).overflowX === "visible";
        }).length;
        // Three different questions, and the first draft of this test only
        // asked the third. A drawer pinned to 520px inside a 390px viewport has
        // no INTERNAL overflow at all — its content fits the 520 happily — so
        // `scrollWidth - clientWidth` reads zero while the panel hangs off the
        // side of the screen. That mutation passed until this was added.
        const parent = d.parentElement;
        out.push({
          id: d.closest("[data-group]")?.getAttribute("data-group") ?? "(none)",
          widerThanViewport: Math.round(d.getBoundingClientRect().width - document.documentElement.clientWidth),
          widerThanParent: parent ? Math.round(d.getBoundingClientRect().width - parent.getBoundingClientRect().width) : 0,
          overflow: d.scrollWidth - d.clientWidth,
          clippedInside,
        });
      }
      return out;
    });
    // Guards the two assertions below against a page that rendered no drawer.
    expect(drawers.length).toBeGreaterThan(0);
    expect(drawers.filter((d) => d.widerThanViewport > 1), "wider than the screen").toEqual([]);
    expect(drawers.filter((d) => d.widerThanParent > 1), "wider than the box it sits in").toEqual([]);
    expect(drawers.filter((d) => d.overflow > 1), "its own content does not fit").toEqual([]);
    expect(drawers.filter((d) => d.clippedInside > 0), "something inside is cut off").toEqual([]);
  });
}

test("nothing on the surface moves when motion is declined", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openFixtures(page, 1280);
  const moving = await page.evaluate(() => {
    // Not `> 0`. The reduced-motion reset in `base.css` sets every duration to
    // `0.01ms !important` rather than `none`, so a naive positive test reports
    // 1,161 "animated" elements and would have to be silenced — which is how a
    // check ends up deleted instead of fixed. 50ms is well under anything a
    // reader perceives as motion and well over the reset's floor.
    const longest = (v: string) =>
      Math.max(0, ...v.split(",").map((x) => (x.trim().endsWith("ms") ? parseFloat(x) : parseFloat(x) * 1000)));
    const out: string[] = [];
    for (const n of document.querySelectorAll<HTMLElement>("[data-group] *")) {
      const s = getComputedStyle(n);
      const ms = Math.max(longest(s.transitionDuration), longest(s.animationDuration));
      if (ms > 50) {
        out.push(`${n.closest("[data-group]")?.getAttribute("data-group")} | ${n.tagName}.${String(n.className).slice(0, 30)} ${ms}ms`);
      }
    }
    return [...new Set(out)];
  });
  expect(moving).toEqual([]);
});

test("every control shows where the keyboard is", async ({ page }) => {
  await openFixtures(page, 1280);
  const result = await page.evaluate(() => {
    const controls = [
      ...document.querySelectorAll<HTMLElement>(
        "[data-group] button:not([disabled]), [data-group] [role='button'], [data-group] [role='tab'], [data-group] input:not([disabled]), [data-group] select:not([disabled]), [data-group] a[href]",
      ),
    ];
    const style = (n: HTMLElement) => {
      const s = getComputedStyle(n);
      return `${s.outlineWidth}|${s.outlineStyle}|${s.outlineColor}|${s.boxShadow}|${s.backgroundColor}|${s.borderColor}|${s.color}`;
    };
    const invisible: string[] = [];
    for (const n of controls) {
      const before = style(n);
      n.focus();
      // Compared against the element's own resting style rather than looking
      // for a particular property: the surface marks focus with an outline in
      // some places and a border or background elsewhere, and asserting one
      // mechanism would fail the others for being different rather than wrong.
      if (style(n) === before) {
        invisible.push(`${n.closest("[data-group]")?.getAttribute("data-group")} | ${n.tagName}.${String(n.className).slice(0, 30)}`);
      }
      n.blur();
    }
    return { count: controls.length, invisible: [...new Set(invisible)] };
  });
  // An empty control list would make the assertion below vacuous.
  expect(result.count).toBeGreaterThan(200);
  expect(result.invisible).toEqual([]);
});
