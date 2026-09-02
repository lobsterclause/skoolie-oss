/** Stagehand local browser, no LLM: walk the Apptegy staff directory pages and print role|name|email|phone. */
import "../boot.js";
import { localBrowser, Stagehand } from "@browserbasehq/stagehand";
// Point SKOOLIE_CAMPUS_STAFF_URL at your campus's Apptegy staff directory, e.g. https://example-ms.example-isd.org/staff
const base = process.env.SKOOLIE_CAMPUS_STAFF_URL;
if (!base) throw new Error("set SKOOLIE_CAMPUS_STAFF_URL to your campus staff directory URL");
const domain = process.env.SKOOLIE_SCHOOL_DOMAINS?.split(",")[0]?.trim();
if (!domain) throw new Error("set SKOOLIE_SCHOOL_DOMAINS to your district's mail domain");
const browser = await localBrowser.launch({ headless: true, viewport: { width: 1280, height: 900 } });
const stagehand = await Stagehand.create({ browser, model: { modelName: "google/gemini-3-flash-preview", apiKey: process.env.GOOGLE_API_KEY ?? "unused" }, logging: { level: "error" } });
const seen = new Map<string, string>();
try {
  const page = (await browser.context.pages())[0]!;
  await page.goto(base, { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(3500);
  const harvest = () => page.evaluate(`(() => {
    const lines = document.body.innerText.split("\\n").map(l => l.trim()).filter(Boolean);
    const out = [];
    lines.forEach((l, i) => { if (/^[\\w.+-]+@${domain.replace(/\./g, "\\\\.")}$/i.test(l)) out.push([lines.slice(Math.max(0, i - 4), i).filter(x => !x.includes("@")).join(" | "), l, (lines.slice(i + 1, i + 3).find(x => /\\d{3}-\\d{3}-\\d{4}/.test(x)) || "")]); });
    return out;
  })()`) as Promise<Array<[string, string, string]>>;
  for (let round = 0; round < 12; round++) {
    for (const [ctx, email, phone] of await harvest()) if (!seen.has(email.toLowerCase())) seen.set(email.toLowerCase(), `${ctx} | ${email} | ${phone}`);
    const before = seen.size;
    let acted = "";
    try {
      const r = await stagehand.act("Go to the next page of the staff directory: click the pagination 'Next' arrow or the next page number at the bottom of the list", { page });
      acted = JSON.stringify(r).slice(0, 120);
    } catch (e) { acted = "act failed: " + (e as Error).message.slice(0, 80); }
    await page.waitForTimeout(3000);
    for (const [ctx, email, phone] of await harvest()) if (!seen.has(email.toLowerCase())) seen.set(email.toLowerCase(), `${ctx} | ${email} | ${phone}`);
    console.error(`round ${round}: total=${seen.size} ${acted}`);
    if (seen.size === before) break;
  }
} finally {
  await stagehand.close();
}
for (const v of seen.values()) console.log(v);
