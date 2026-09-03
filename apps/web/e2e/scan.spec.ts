import { expect, test, type Page } from "@playwright/test";

// Runs the real scanner: OpenCV.js loads as a static asset, the synthetic "photo" (a white sheet at an
// angle on a dark table, with text strokes) is detected and flattened, and the demo Gmail path reports
// success. Proves the asset pipeline and the browser glue that unit tests cannot reach.

/** Draw the photo in the browser so no binary fixture lives in the repo. */
async function photoPng(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 1200;
    c.height = 900;
    const g = c.getContext("2d")!;
    g.fillStyle = "#3a3c40";
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = "#f4f2ec";
    g.beginPath();
    g.moveTo(230, 150);
    g.lineTo(980, 110);
    g.lineTo(1050, 790);
    g.lineTo(170, 750);
    g.closePath();
    g.fill();
    g.strokeStyle = "#151515";
    g.lineWidth = 8;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      g.moveTo(320, 250 + i * 60);
      g.lineTo(880, 235 + i * 60);
      g.stroke();
    }
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

test("a photographed form becomes a cropped scan and sends as a PDF", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/s/robin/scan?to=ana_rivera%40example-isd.org");
  await expect(page.getByRole("heading", { level: 1, name: "Scan & send" })).toBeVisible();
  await expect(page.getByRole("button", { name: "To", exact: true })).toHaveText("Ana Rivera"); // deep link preselected the teacher

  const png = await photoPng(page);
  await page.getByTestId("scan-library-input").setInputFiles([{ name: "form.png", mimeType: "image/png", buffer: png }]);

  const thumb = page.getByTestId("scan-page").first();
  await expect(thumb).toBeVisible();
  // The thumbnail gets a JPEG src once OpenCV has loaded (13 MB) and the page has been flattened.
  await expect(thumb.locator("img")).toHaveAttribute("src", /^data:image\/jpeg/, { timeout: 60_000 });
  await expect(page.getByText("whole photo")).toHaveCount(0); // the outline was found, so it was cropped

  await thumb.getByRole("button", { name: /open/i }).click(); // the thumbnail is a group: open button + remove button
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("heading", { name: "Page 1" })).toBeVisible();
  await expect(sheet.getByRole("radio", { name: "Scan" })).toBeChecked();
  const preview = sheet.getByRole("img", { name: /Page 1, scan/ });
  await expect(preview).toBeVisible();
  // A flattened page is much closer to the sheet's own aspect (750×640 source px) than the 4:3 photo.
  const box = (await preview.boundingBox())!;
  expect(box.width / box.height).toBeGreaterThan(1.05);
  expect(box.width / box.height).toBeLessThan(1.3);
  await sheet.getByRole("radio", { name: "Photo" }).click();
  await expect(sheet.getByRole("img", { name: /Page 1, photo/ })).toBeVisible();
  await page.keyboard.press("Escape");

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Save PDF" }).click();
  expect((await download).suggestedFilename()).toMatch(/^Robin-Rivers-\d{4}-\d{2}-\d{2}\.pdf$/);

  await page.getByRole("button", { name: "Send with Gmail" }).click();
  await expect(page.getByText(/Sent 1 page to ana_rivera@example-isd\.org/)).toBeVisible();
  expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("an unknown recipient is typed in and must be an address", async ({ page }) => {
  await page.goto("/s/robin/scan?to=grandma%40example.org");
  const field = page.getByLabel("Email address");
  await expect(field).toHaveValue("grandma@example.org");
  await field.fill("not-an-address");
  await expect(page.getByText("That does not look like an email address").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Send with Gmail" })).toBeDisabled();
});
