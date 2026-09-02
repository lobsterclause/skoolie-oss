/** Load every Apptegy staff directory page in a real browser and print name|title|email|links (non-mailto hrefs inside the card). */
import "../boot.js";
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
// Point SKOOLIE_CAMPUS_STAFF_URL at your campus's Apptegy staff directory, e.g. https://example-ms.example-isd.org/staff
const staffUrl = process.env.SKOOLIE_CAMPUS_STAFF_URL;
if (!staffUrl) throw new Error("set SKOOLIE_CAMPUS_STAFF_URL to your campus staff directory URL");
const browser = await localBrowser.launch({ headless: true, viewport: { width: 1280, height: 900 } });
const stagehand = await Stagehand.create({ browser, model: { modelName: "google/gemini-3-flash-preview", apiKey: "unused" }, logging: { level: "error" } });
try {
  const page = (await browser.context.pages())[0]!;
  for (let p = 1; p <= 8; p++) {
    await page.goto(`${staffUrl}?page_no=${p}`, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(Math.round(2500 + Math.random() * 1500));
    const rows = (await page.evaluate(`(() => [...document.querySelectorAll('[data-testid="staff-card"]')].map(c => {
      const t = s => (c.querySelector(s)?.textContent || '').trim();
      const links = [...c.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => h && !h.startsWith('mailto:'));
      return [t('.name'), t('.title'), t('.email'), links.join(' '), c.innerHTML.length];
    }))()`)) as Array<[string, string, string, string, number]>;
    console.error(`page ${p}: ${rows.length} cards`);
    if (rows.length === 0) break;
    for (const r of rows) console.log(r.join(" | "));
  }
} finally {
  await stagehand.close();
}
