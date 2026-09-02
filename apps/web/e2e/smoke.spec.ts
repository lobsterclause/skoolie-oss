import { expect, test } from "@playwright/test";

// Proves the e2e harness: the demo build boots, renders real data, and logs no console errors.
// The role and row contracts get their own specs in the shards that create those behaviours.
test("the demo build renders the overview without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/?all");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
