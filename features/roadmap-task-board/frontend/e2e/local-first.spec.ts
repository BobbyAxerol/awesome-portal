import { expect, test } from "@playwright/test";

test.describe("Roadmap & Task Board local-first release flow", () => {
  test("creates a task and preserves it after a browser reload", async ({ page }) => {
    const title = "Phase 5 browser task";
    await page.goto("/#view=board");
    await expect(page.getByTestId("task-board-feature")).toBeVisible();

    await page.getByRole("button", { name: "+ Add task" }).first().click();
    await page.getByLabel("Task title").fill(title);
    await page.getByRole("button", { name: "Save task" }).click();
    await expect(page.getByText(title, { exact: true })).toBeVisible();

    await page.reload();
    await expect(page.getByTestId("task-board-feature")).toBeVisible();
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  });

  test("creates a roadmap phase and preserves it after a browser reload", async ({ page }) => {
    const name = "Phase 5 browser roadmap";
    await page.goto("/#view=roadmap");
    await expect(page.getByTestId("roadmap-feature")).toBeVisible();

    await page.getByRole("button", { name: "+ Add phase" }).click();
    await page.getByLabel("Phase name").fill(name);
    await page.getByRole("button", { name: "Save phase" }).click();
    // The seed carries P0–P5, so the new phase is P6. Addressed by test id
    // because the timeline renders the code and the name as separate elements.
    await expect(page.getByTestId("roadmap-phase-P6")).toContainText(name);

    await page.reload();
    await expect(page.getByTestId("roadmap-feature")).toBeVisible();
    await expect(page.getByTestId("roadmap-phase-P6")).toContainText(name);
  });
});
